from emu import *
import json
default_stubs()
for n, i in [('Tile::obsidian', 49), ('Tile::glowingObsidian', 246), ('Tile::goldBlock', 41), ('Tile::stoneBrick', 4), ('Tile::netherReactor', 247)]:
    fake_tile(n, i)
s = lambda v: v - 2**32 if v >= 2**31 else v
world = {}
dome = json.load(open('dome.json'))
log = []
def settile(uc, a):
    k = (s(a[1]), s(a[2]), s(a[3])); world[k] = a[4]; log.append((k, a[4])); return 1
hook(A('Level::setTile'), settile)
hook(A('Level::getTile'), lambda uc, a: world.get((s(a[1]), s(a[2]), s(a[3])), 0))
level = alloc(8192)
te = alloc(4096); mu.mem_write(te + 4, struct.pack('<I', level))
# seed TE random (mt19937 state at +0x7c) by running Random::setSeed if present
try:
    call(A('Random::setSeed'), te + 0x7c, 12345)
except Exception as e: print('seed', e)
log.clear(); call(A('NetherReactorTileEntity::clearDomeSpace'), te, 0, 0, 0)
cl = [k for k, v in log]
xs = [k[0] for k in cl]; ys = [k[1] for k in cl]
print('clear: n', len(cl), 'x', min(xs), max(xs), 'y', min(ys), max(ys), 'ids', set(v for k, v in log))
skipped = [(x, y, z) for x in range(-12, 13) for y in range(min(ys), max(ys) + 1) for z in range(-12, 13) if (x, y, z) not in set(cl)]
print('not cleared', len(skipped), skipped[:30])
for k, v in [(tuple(p[:3]), p[3]) for p in dome]: world[k] = v
before = sum(1 for v in world.values() if v == 49)
log.clear()
try:
    call(A('NetherReactorTileEntity::deterioateDome'), te, 0, 0, 0)
except Exception as e: print('decay err', e)
after = sum(1 for v in world.values() if v == 49)
print('decay: setTile', len(log), 'ids', {v: sum(1 for _, x in log if x == v) for v in set(x for _, x in log)}, 'obsidian before/after', before, after)
json.dump([[*k, v] for k, v in log], open('decay_sample.json', 'w'))
