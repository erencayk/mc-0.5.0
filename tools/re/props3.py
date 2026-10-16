exec(open('init.py').read().split("def ptr(a)")[0])
import json
def ptr(a): return struct.unpack('<I', mu.mem_read(a, 4))[0]
def f32(a): return struct.unpack('<f', mu.mem_read(a, 4))[0]
def sstr(a):
    fin, st = ptr(a + 0x10), ptr(a + 0x14)
    if not st or fin < st or fin - st > 200: return None
    return bytes(mu.mem_read(st, fin - st)).decode('latin1')
vt = {}
for a, n in syms.items():
    if n.startswith('vtable for '): vt[a + 8] = n[11:]
items = {}
IT = A('Item::items')
for i in range(256, 512):
    p = ptr(IT + 4 * i)
    if not p: continue
    cls = vt.get(ptr(p), hex(ptr(p)))
    e = {'cls': cls, 'desc': sstr(p + 0x20), 'maxDmg': i32(p + 8), 'stack': i32(p + 0x14)}
    if cls == 'FoodItem' or cls == 'BowlFoodItem': e['food'] = i32(p + 0x38)
    if cls in ('PickaxeItem', 'HatchetItem', 'ShovelItem', 'DiggerItem'): e['speed'] = round(f32(p + 0x38), 2); e['dmg'] = i32(p + 0x40)
    if cls == 'WeaponItem': e['dmg'] = i32(p + 0x38)
    items[i] = e
for i, e in sorted(items.items()): print(i, e)
json.dump(items, open('items.json', 'w'), indent=0)
