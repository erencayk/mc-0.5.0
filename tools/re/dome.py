from emu import *
import json
for n, i in [('Tile::obsidian', 49), ('Tile::glowingObsidian', 246), ('Tile::goldBlock', 41), ('Tile::stoneBrick', 4), ('Tile::netherReactor', 247), ('Tile::lightGem', 89)]:
    fake_tile(n, i)
placed = []
hook(A('Level::setTile'), lambda uc, a: placed.append((a[1] if a[1] < 2**31 else a[1] - 2**32, a[2] if a[2] < 2**31 else a[2] - 2**32, a[3] if a[3] < 2**31 else a[3] - 2**32, a[4])) or 1)
level = alloc(4096)
te = alloc(1024); mu.mem_write(te + 4, struct.pack('<I', level))
call(A('NetherReactorTileEntity::buildDome'), te, 0, 0, 0)
print('dome setTile calls:', len(placed))
ids = {}
for p in placed: ids[p[3]] = ids.get(p[3], 0) + 1
print('ids:', ids)
ys = sorted(set(p[1] for p in placed)); print('y range', ys[0], ys[-1])
for y in ys:
    row = [p for p in placed if p[1] == y]
    xs = [p[0] for p in row]
    print(y, 'count', len(row), 'x', min(xs), max(xs), 'ids', sorted(set(p[3] for p in row)))
json.dump(placed, open('dome.json', 'w'))
# pattern
pat = alloc(512)
call(A('NetherReactorPattern::NetherReactorPattern'), pat)
out = []
for l in range(3):
    layer = []
    for i in range(3):
        layer.append([call(A('NetherReactorPattern::getTileAt'), pat, l, i, j) for j in range(3)])
    out.append(layer)
print('pattern', out)
