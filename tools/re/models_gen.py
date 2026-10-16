# models.json (from models.py) -> MODELS_050 in game/src/pe050data.js
# Each model: parts [[px,py,pz, xRot,yRot,zRot, [[u,v, x,y,z, w,h,d, grow, mirror], ...]], ...] (rest pose after setupAnim(0))
import json, re
import sys
d = json.load(open(sys.argv[1] if len(sys.argv) > 1 else 'models.json'))
def build(m, last_only=False):
    parts = []
    for i, p in enumerate(m['parts']):
        cs = [c for c in m['cubes'] if c['part'] == i]
        if last_only and len(cs) > 1: cs = cs[len(cs) // 2:]
        if not cs: continue
        parts.append([*p['pos'], *[round(r, 5) for r in p['rot']], [[c['u'], c['v'], *c['box'], c['g'], c['mirror']] for c in cs]])
    return parts
out = {}
for k in ('pig', 'cow', 'chicken', 'spider'): out[k] = build(d[k])
hum = build(d['humanoid']); hum[2][0] = -5.0; hum[3][0] = 5.0; hum[2][5] = 0.0; hum[3][5] = 0.0
out['humanoid'] = hum
sk = build(d['skeleton'], last_only=True); sk[2][0] = -5.0; sk[3][0] = 5.0
for p in sk[2:4]: p[3] = 0.0; p[4] = 0.0; p[5] = 0.0
out['skeleton'] = sk
Q = 1.5708
# inlined constructors, read from the EntityRenderDispatcher emulation (sheep.py)
legs = lambda h, g, x, zf, zb: [[sx, 24 - h, sz, 0, 0, 0, [[0, 16, -2, 0, -2, 4, h, 4, g, 0]]] for sx, sz in ((-x, zb), (x, zb), (-x, zf), (x, zf))]
out['sheep'] = [[0, 6, -8, 0, 0, 0, [[0, 0, -3, -4, -6, 6, 6, 8, 0.0, 0]]], [0, 5, 2, Q, 0, 0, [[28, 8, -4, -10, -7, 8, 16, 6, 0.0, 0]]], *legs(12, 0.0, 3, -5, 7)]
out['sheep_fur'] = [[0, 6, -8, 0, 0, 0, [[0, 0, -3, -4, -6, 6, 6, 8, 0.2, 0]]], [0, 5, 2, Q, 0, 0, [[28, 8, -4, -10, -7, 8, 16, 6, 1.75, 0]]], *legs(12, 0.35, 3, -5, 7)]
out['creeper'] = [[0, 4, 0, 0, 0, 0, [[0, 0, -4, -8, -4, 8, 8, 8, 0.0, 0]]], [0, 4, 0, 0, 0, 0, [[16, 16, -4, 0, -2, 8, 12, 4, 0.0, 0]]],
                  [-2, 16, 4, 0, 0, 0, [[0, 16, -2, 0, -2, 4, 6, 4, 0.0, 0]]], [2, 16, 4, 0, 0, 0, [[0, 16, -2, 0, -2, 4, 6, 4, 0.0, 0]]],
                  [-2, 16, -4, 0, 0, 0, [[0, 16, -2, 0, -2, 4, 6, 4, 0.0, 0]]], [2, 16, -4, 0, 0, 0, [[0, 16, -2, 0, -2, 4, 6, 4, 0.0, 0]]]]
s = json.dumps(out, separators=(',', ':'))
p = '../../game/src/pe050data.js'
src = open(p).read()
src = re.sub(r'\n// Mob models.*?\n', '\n', src, flags=re.S) if False else src
line = '// Mob models measured from the original constructors: parts [px,py,pz,xRot,yRot,zRot,[[u,v,x,y,z,w,h,d,grow,mirror]...]]\nexport const MODELS_050 = ' + s + ';\n'
src = re.sub(r'// Mob models measured.*?\nexport const MODELS_050 = .*?;\n', '', src, flags=re.S)
open(p, 'w').write(src.rstrip('\n') + '\n' + line)
for k, v in out.items(): print(k, len(v), 'parts')
