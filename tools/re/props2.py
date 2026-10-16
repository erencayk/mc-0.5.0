exec(open('init.py').read().split("def ptr(a)")[0])
import json
def ptr(a): return struct.unpack('<I', mu.mem_read(a, 4))[0]
def f32(a): return struct.unpack('<f', mu.mem_read(a, 4))[0]
def u8(a): return mu.mem_read(a, 1)[0]
def sstr(a):
    fin, st = ptr(a + 0x10), ptr(a + 0x14)
    if not st or fin < st or fin - st > 200: return None
    return bytes(mu.mem_read(st, fin - st)).decode('latin1')
tiles = {}
T = A('Tile::tiles')
for i in range(256):
    p = ptr(T + 4 * i)
    if not p: continue
    tiles[i] = {'desc': sstr(p + 0x58), 'hard': round(f32(p + 0x34), 3), 'res': round(f32(p + 0x38), 2), 'fric': round(f32(p + 0x30), 3),
                'light': u8(A('Tile::lightEmission') + i), 'opacity': u8(A('Tile::lightBlock') + i), 'solid': u8(A('Tile::solid') + i), 'tex': i32(p + 4)}
print('tiles', len(tiles))
for i, t in sorted(tiles.items()): print(i, t)
for n in ['Item::apple', 'Item::bread', 'Item::pickAxe_iron', 'Item::sword_emerald', 'Item::porkChop_cooked', 'Item::mushroomStew', 'Item::melon']:
    p = ptr(A(n))
    print(n, [round(f32(p + o), 3) if 1e-3 < abs(f32(p + o)) < 1e5 else i32(p + o) for o in range(0, 0x60, 4)])
json.dump(tiles, open('tiles.json', 'w'), indent=0)
