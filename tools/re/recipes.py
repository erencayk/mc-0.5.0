exec(open('init.py').read().split("def ptr(a)")[0])
import json
def ptr(a): return struct.unpack('<I', mu.mem_read(a, 4))[0]
# id -> name from statics
names = {}
for a, n in syms.items():
    m = re.match(r'^(Tile|Item)::([A-Za-z0-9_]+)$', n)
    if not m or m.group(2) in ('tiles', 'items', 'random', 'solid', 'translucent', 'lightBlock', 'lightEmission', 'isEntityTile', 'sendTileData', 'shouldTick', 'unbreakable'): continue
    try: p = ptr(a)
    except Exception: continue
    if not (HEAP <= p < HEAP + 0x1000000): continue
    off = 8 if m.group(1) == 'Tile' else 4
    names.setdefault(i32(p + off), m.group(2))
print('named ids', len(names))
furnace = []
def furn(uc, a):
    furnace.append((a[1], i32(a[2] + 4), i32(a[2]), i32(a[2] + 8)))
hook(A('FurnaceRecipes::addFurnaceRecipe'), furn)
inst = call(A('Recipes::getInstance'))
fi = call(A('FurnaceRecipes::getInstance'))
vt_shaped = A('vtable for ShapedRecipe'); vt_shapeless = A('vtable for ShapelessRecipe')
beg, end = ptr(inst), ptr(inst + 4)
out = []
def item(base):
    return {'count': i32(base), 'id': i32(base + 4), 'aux': i32(base + 8), 'name': names.get(i32(base + 4), '?')}
for p in range(beg, end, 4):
    r = ptr(p); vt = ptr(r)
    if vt - 8 == vt_shaped or vt == vt_shaped + 8:
        w, h = i32(r + 0x20), i32(r + 0x24); items = ptr(r + 0x28)
        grid = [item(items + 12 * k) for k in range(w * h)]
        out.append({'type': 'shaped', 'w': w, 'h': h, 'result': item(r + 0x2c), 'grid': [(g['name'], g['aux']) if g['id'] > 0 else None for g in grid], 'gridIds': [g['id'] for g in grid]})
    else:
        vb, ve = ptr(r + 0x28), ptr(r + 0x2c)
        ing = [item(q) for q in range(vb, ve, 12)]
        out.append({'type': 'shapeless', 'result': item(r + 0x1c), 'ing': [(g['name'], g['aux'], g['count']) for g in ing], 'vt': hex(vt)})
print('recipes', len(out), 'vt shaped', hex(vt_shaped), hex(vt_shapeless))
json.dump({'recipes': out, 'furnace': furnace, 'names': names}, open('recipes.json', 'w'), indent=1)
for r in out[:6]: print(r)
print('furnace', [(names.get(a, a), names.get(b, b), c, d) for a, b, c, d in furnace])
