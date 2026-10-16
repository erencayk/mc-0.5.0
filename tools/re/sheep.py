exec(open('models.py').read().split("out = {}")[0])
log = []
QA = find('QuadrupedModel::QuadrupedModel')
def on_q(uc, addr, size, user):
    esp = uc.reg_read(UC_X86_REG_ESP); log.append(('Q', u32(esp + 4), struct.unpack('<i', uc.mem_read(esp + 8, 4))[0], len(cubes)))
mu.hook_add(UC_HOOK_CODE, on_q, begin=QA, end=QA)
cubes.clear(); parts.clear()
ctor = find('EntityRenderDispatcher::EntityRenderDispatcher')
obj = alloc(0x1000)
try: call(ctor, obj)
except Exception as e: print('fail', e)
print(log)
pos = {p: (round(f32(p),3), round(f32(p+4),3), round(f32(p+8),3), round(f32(p+0xc),4)) for p in parts}
for i, c in enumerate(cubes):
    print(i, c['u'], c['v'], c['box'], c['g'], c['mirror'], pos.get(c['part']))
