from emu import *
import emu
missing = {}
def unmapped(uc, access, addr, size, value, user):
    eip = uc.reg_read(UC_X86_REG_EIP)
    print('UNMAPPED', hex(addr), 'at', hex(eip), syms.get(eip, ''))
    return False
mu.hook_add(UC_HOOK_MEM_READ_UNMAPPED | UC_HOOK_MEM_WRITE_UNMAPPED | UC_HOOK_MEM_FETCH_UNMAPPED, unmapped)
names = {v: k for k, v in ext.items()}
def ext_trace(uc, addr, size, user):
    if STUB <= addr < STUB + 0x100000 and addr not in hooks:
        missing[names.get(addr, hex(addr))] = missing.get(names.get(addr, hex(addr)), 0) + 1
mu.hook_add(UC_HOOK_CODE, ext_trace, begin=STUB, end=STUB + 0x100000)
# stdlib string helpers commonly used
def strlen(uc, a):
    n = 0
    while uc.mem_read(a[0] + n, 1)[0]: n += 1
    return n
for k in list(ext):
    if k == 'strlen': hook(ext[k], strlen)
    if k in ('free', '_ZdlPv', '_ZdaPv'): hook(ext[k], lambda uc, a: 0)
default_stubs()
# run static constructors (.init_array) then material init
ia = [struct.unpack('<I', mu.mem_read(0x2f4d0c + 4 * i, 4))[0] for i in range(0x29c // 4)]
ok = 0
for f in ia:
    if f in (0, 0xffffffff): continue
    try: call(f, max_ins=5_000_000); ok += 1
    except Exception as e: print('ctor fail', hex(f), syms.get(f, ''), e)
print('static ctors run', ok, 'of', len(ia))
call(A('Material::initMaterials'))
try:
    call(A('Tile::initTiles'))
    print('initTiles ok')
except Exception as e:
    print('initTiles failed', e)
try:
    call(A('Item::initItems'))
    print('initItems ok')
except Exception as e:
    print('initItems failed', e)
print('unhandled externals:', missing)
def ptr(a): return struct.unpack('<I', mu.mem_read(a, 4))[0]
for n in ['Tile::rock', 'Tile::stoneBrick', 'Tile::netherReactor', 'Tile::glowingObsidian']:
    p = ptr(A(n)); print(n, hex(p), i32(p + 8) if p else None)
for n in ['Item::stick', 'Item::emerald', 'Item::camera', 'Item::sword_wood']:
    p = ptr(A(n)); print(n, hex(p), [i32(p + o) for o in range(0, 24, 4)] if p else None)
