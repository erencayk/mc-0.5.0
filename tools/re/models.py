# Emulate the original model constructors + setupAnim(0...) and record every ModelPart and Cube.
exec(open('init.py').read().split("def ptr(a)")[0])
import json
def f32(a): return struct.unpack('<f', mu.mem_read(a, 4))[0]
def u32(a): return struct.unpack('<I', mu.mem_read(a, 4))[0]
cubes = []
parts = []
def on_cube(uc, addr, size, user):
    esp = uc.reg_read(UC_X86_REG_ESP)
    a = uc.mem_read(esp + 4, 44)
    this, part, u, v = struct.unpack('<IIii', a[:16])
    x, y, z = struct.unpack('<fff', a[16:28]); w, h, d = struct.unpack('<iii', a[28:40]); g = struct.unpack('<f', a[40:44])[0]
    cubes.append(dict(part=part, u=u, v=v, box=[x, y, z, w, h, d], g=round(g, 4), mirror=uc.mem_read(part + 0x18, 1)[0]))
CUBE = A('Cube::Cube')
mu.hook_add(UC_HOOK_CODE, on_cube, begin=CUBE, end=CUBE)
for name in ('ModelPart::ModelPart(Model*, int, int)', 'ModelPart::ModelPart(int, int)', 'ModelPart::ModelPart(std::string const&)'):
    adr = byname[name]
    def on_part(uc, addr, size, user):
        esp = uc.reg_read(UC_X86_REG_ESP)
        parts.append(u32(esp + 4))
    mu.hook_add(UC_HOOK_CODE, on_part, begin=adr, end=adr)
def fl(x): return struct.unpack('<i', struct.pack('<f', x))[0]
MODELS = {
    'pig': ('PigModel::PigModel', [fl(0.0)], 'QuadrupedModel::setupAnim'),
    'cow': ('CowModel::CowModel', [], 'QuadrupedModel::setupAnim'),
    'sheep': ('SheepModel::SheepModel', [], None),
    'chicken': ('ChickenModel::ChickenModel', [], 'ChickenModel::setupAnim'),
    'humanoid': ('HumanoidModel::HumanoidModel', [fl(0.0), fl(0.0)], 'HumanoidModel::setupAnim'),
    'creeper': ('CreeperModel::CreeperModel', [fl(0.0)], None),
    'spider': ('SpiderModel::SpiderModel', [], None),
    'skeleton': ('SkeletonModel::SkeletonModel', [], None),
}
def find(n):
    for k, a in byname.items():
        if k.startswith(n + '(') or k == n: return a
    return None
out = {}
for key, (ctor, args, anim) in MODELS.items():
    adr = find(ctor)
    if adr is None: print('no ctor', ctor); continue
    cubes.clear(); parts.clear()
    obj = alloc(0x2000)
    try: call(adr, obj, *args)
    except Exception as e: print(key, 'ctor fail', e); continue
    # rest pose: setupAnim(0,0,0,0,0,1/16)
    vt = u32(obj)
    an = find(anim) if anim else None
    if an is None:
        # find setupAnim in vtable by name
        for i in range(40):
            f = u32(vt + 4 * i)
            if 'setupAnim' in syms.get(f, ''): an = f; break
    if an:
        try: call(an, obj, fl(0), fl(0), fl(0), fl(0), fl(0), fl(1 / 16)); 
        except Exception as e: print(key, 'anim fail', e)
    plist = []
    for p in parts:
        plist.append(dict(off=p - obj, pos=[round(f32(p + i), 4) for i in (0, 4, 8)], rot=[round(f32(p + i), 5) for i in (0xc, 0x10, 0x14)],
                          tex=[f32(p + 0x4c), f32(p + 0x50)], visible=uc_b if False else 1))
    pid = {p: i for i, p in enumerate(parts)}
    for c in cubes: c['part'] = pid.get(c['part'], -1)
    out[key] = dict(anim=syms.get(an, '') if an else None, parts=plist, cubes=list(cubes))
    print(key, len(plist), 'parts', len(cubes), 'cubes', out[key]['anim'])
json.dump(out, open('models.json', 'w'), indent=0)
