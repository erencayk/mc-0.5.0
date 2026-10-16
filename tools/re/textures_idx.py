exec(open('init.py').read().split("def ptr(a)")[0])
import json
def ptr(a): return struct.unpack('<I', mu.mem_read(a, 4))[0]
T = A('Tile::tiles'); IT = A('Item::items')
tiles = {}
for i in range(256):
    o = ptr(T + 4 * i)
    if not o: continue
    fn = ptr(ptr(o) + 4 * 11)
    tab = []
    for data in range(16):
        row = []
        for face in range(6):
            try: v = call(fn, o, face, data, max_ins=200000)
            except Exception as e: v = -1
            row.append(v - 2**32 if v >= 2**31 else v)
        tab.append(row)
    # compress: drop trailing metas identical to meta 0
    tiles[i] = tab
items = {}
for i in range(256, 512):
    o = ptr(IT + 4 * i)
    if not o: continue
    fn = ptr(ptr(o) + 4 * 5)
    vals = []
    for aux in range(16):
        try: v = call(fn, o, aux, max_ins=200000)
        except Exception: v = -1
        vals.append(v - 2**32 if v >= 2**31 else v)
    items[i] = vals
json.dump({'tiles': tiles, 'items': items}, open('texidx.json', 'w'))
for i in [1, 2, 3, 4, 5, 17, 18, 24, 35, 44, 46, 54, 58, 61, 81, 89, 103, 246, 247]:
    if i in tiles: print(i, tiles[i][0], tiles[i][1] if tiles[i][1] != tiles[i][0] else '')
for i in [256, 263, 280, 351, 355, 324, 456]:
    print(i, items.get(i))
