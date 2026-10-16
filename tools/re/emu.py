#!/usr/bin/env python3
"""Tiny i386 harness: load libminecraftpe.so at base 0 and run single functions with hooked callees."""
import struct, subprocess, re, sys
from unicorn import *
from unicorn.x86_const import *

LIB = sys.argv[1] if len(sys.argv) > 1 else '../apk050/x/lib/x86/libminecraftpe.so'
data = open(LIB, 'rb').read()
syms, byname = {}, {}
for l in subprocess.run(['nm', '-DC', '--defined-only', LIB], capture_output=True, text=True).stdout.splitlines():
    a, t, n = l.split(' ', 2); a = int(a, 16); syms.setdefault(a, n); byname.setdefault(n, a)
def A(name):
    for n, a in byname.items():
        if n == name or n.startswith(name + '('): return a
    raise KeyError(name)

mu = Uc(UC_ARCH_X86, UC_MODE_32)
TOP = 0
for l in subprocess.run(['readelf', '-lW', LIB], capture_output=True, text=True).stdout.splitlines():
    m = re.match(r'\s*LOAD\s+0x([0-9a-f]+)\s+0x([0-9a-f]+)\s+0x[0-9a-f]+\s+0x([0-9a-f]+)\s+0x([0-9a-f]+)', l)
    if m:
        off, va, fsz, msz = (int(m.group(i), 16) for i in range(1, 5))
        lo, hi = va & ~0xfff, (va + msz + 0xfff) & ~0xfff
        try: mu.mem_map(lo, hi - lo)
        except UcError: pass
        mu.mem_write(va, data[off:off + fsz])
        TOP = max(TOP, hi)
# external symbols -> stub page
STUB = 0x10000000; mu.mem_map(STUB, 0x100000)
ext = {}
for l in subprocess.run(['readelf', '-rW', LIB], capture_output=True, text=True).stdout.splitlines():
    m = re.match(r'\s*([0-9a-f]{8})\s+[0-9a-f]+\s+(R_386_(?:GLOB_DAT|JUMP_SLOT|32))\s+([0-9a-f]+)\s+(\S+)', l)
    if not m: continue
    where, val, name = int(m.group(1), 16), int(m.group(3), 16), m.group(4)
    if val == 0:
        if name not in ext: ext[name] = STUB + 16 * len(ext); mu.mem_write(ext[name], b'\xc3')  # ret
        val = ext[name]
    cur = struct.unpack('<I', mu.mem_read(where, 4))[0]
    mu.mem_write(where, struct.pack('<I', val + (cur if m.group(2) == 'R_386_32' else 0)))
HEAP = 0x20000000; mu.mem_map(HEAP, 0x1000000); heap_ptr = [HEAP + 0x1000]
def alloc(n):
    p = heap_ptr[0]; heap_ptr[0] += (n + 15) & ~15; return p
for nm_ in ['malloc', 'operator new(unsigned int)', '_Znwj']:
    pass
STACK = 0x30000000; mu.mem_map(STACK, 0x100000)
MAGIC = 0x40000000; mu.mem_map(MAGIC, 0x1000); mu.mem_write(MAGIC, b'\xf4')  # hlt

hooks = {}
def hook(addr, fn): hooks[addr] = fn
def code_hook(uc, addr, size, user):
    if addr in hooks:
        esp = uc.reg_read(UC_X86_REG_ESP)
        args = struct.unpack('<8I', uc.mem_read(esp + 4, 32))
        ret = hooks[addr](uc, args)
        uc.reg_write(UC_X86_REG_EAX, ret or 0)
        r = struct.unpack('<I', uc.mem_read(esp, 4))[0]
        uc.reg_write(UC_X86_REG_ESP, esp + 4); uc.reg_write(UC_X86_REG_EIP, r)
mu.hook_add(UC_HOOK_CODE, code_hook)
# malloc / new
for name in list(ext):
    if name in ('malloc', '_Znwj', '_Znaj'):
        hook(ext[name], lambda uc, a: alloc(a[0]))
    elif name in ('memset',):
        def ms(uc, a): uc.mem_write(a[0], bytes([a[1] & 0xff]) * a[2]); return a[0]
        hook(ext[name], ms)
    elif name in ('memcpy', 'memmove'):
        def mc(uc, a): uc.mem_write(a[0], bytes(uc.mem_read(a[1], a[2]))); return a[0]
        hook(ext[name], mc)

def default_stubs():
    import ctypes
    for name, adr in ext.items():
        if adr in hooks: continue
        if name in ('isalpha','isupper','islower','isspace','isprint','ispunct','iscntrl','isxdigit','isdigit','isalnum'):
            pyf = {'isalpha': str.isalpha, 'isupper': str.isupper, 'islower': str.islower, 'isspace': str.isspace, 'isprint': str.isprintable,
                   'ispunct': lambda c: (not c.isalnum()) and c.isprintable() and c != ' ', 'iscntrl': lambda c: ord(c) < 32 or ord(c) == 127,
                   'isxdigit': lambda c: c in '0123456789abcdefABCDEF', 'isdigit': str.isdigit, 'isalnum': str.isalnum}[name]
            hook(adr, (lambda f: lambda uc, a: 1 if 0 <= a[0] < 128 and f(chr(a[0])) else 0)(pyf))
        elif name in ('puts', 'printf', 'abort'):
            hook(adr, (lambda n: lambda uc, a: (_ for _ in ()).throw(RuntimeError('called ' + n + ' at ' + hex(struct.unpack('<I', uc.mem_read(uc.reg_read(UC_X86_REG_ESP), 4))[0]))))(name))
        else:
            hook(adr, lambda uc, a: 0)

def call(addr, *args, max_ins=50_000_000):
    esp = STACK + 0x80000
    st = struct.pack('<I', MAGIC) + b''.join(struct.pack('<i', a) for a in args)
    esp -= len(st); mu.mem_write(esp, st)
    mu.reg_write(UC_X86_REG_ESP, esp)
    mu.emu_start(addr, MAGIC, count=max_ins)
    return mu.reg_read(UC_X86_REG_EAX)

def fake_tile(name, tid):
    t = alloc(64); mu.mem_write(t + 8, struct.pack('<i', tid))
    mu.mem_write(A(name), struct.pack('<I', t)); return t
def i32(a): return struct.unpack('<i', mu.mem_read(a, 4))[0]
