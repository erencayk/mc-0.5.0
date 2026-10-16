#!/usr/bin/env python3
"""Annotated i386 PIC disassembly: resolves %ebx-relative GOT loads, GOTOFF data (strings/floats) and calls."""
import re, subprocess, sys, struct
lib = sys.argv[1]; sym = sys.argv[2]
length = int(sys.argv[3], 16) if len(sys.argv) > 3 else None
data = open(lib, 'rb').read()
syms = {}
for l in subprocess.run(['nm', '-DC', '--defined-only', lib], capture_output=True, text=True).stdout.splitlines():
    p = l.split(' ', 2)
    if len(p) == 3: syms.setdefault(int(p[0], 16), p[2])
byname = {}
for a, n in syms.items(): byname.setdefault(n, a)
rel = {}
for l in subprocess.run(['readelf', '-rW', '-C', lib], capture_output=True, text=True).stdout.splitlines():
    m = re.match(r'\s*([0-9a-f]{8})\s+[0-9a-f]+\s+R_386_\w+\s+[0-9a-f]+\s+(.+?)(\s*\+.*)?$', l)
    if m: rel[int(m.group(1), 16)] = m.group(2)
# segments for vaddr->offset
segs = []
for l in subprocess.run(['readelf', '-lW', lib], capture_output=True, text=True).stdout.splitlines():
    m = re.match(r'\s*LOAD\s+0x([0-9a-f]+)\s+0x([0-9a-f]+)\s+0x[0-9a-f]+\s+0x([0-9a-f]+)', l)
    if m: segs.append((int(m.group(2), 16), int(m.group(1), 16), int(m.group(3), 16)))
def rd(va, n):
    for v, o, sz in segs:
        if v <= va < v + sz: return data[o + va - v:o + va - v + n]
    return None
def cstr(va):
    b = rd(va, 80)
    if not b: return None
    s = b.split(b'\0')[0]
    if len(s) >= 2 and all(32 <= c < 127 for c in s): return repr(s.decode())
    return None
if re.match(r'^[0-9a-f]+$', sym): start = int(sym, 16)
else:
    cands = [a for n, a in byname.items() if n.startswith(sym)]
    start = cands[0]
if length is None:
    nxt = sorted(a for a in syms if a > start)
    end = nxt[0] if nxt else start + 0x400
else: end = start + length
dis = subprocess.run(['objdump', '-d', '-C', '--no-show-raw-insn', f'--start-address={start:#x}', f'--stop-address={end:#x}', lib], capture_output=True, text=True).stdout
ebx = None; prev_next = None
lines = [l for l in dis.splitlines() if re.match(r'\s*[0-9a-f]+:', l)]
for i, l in enumerate(lines):
    m = re.match(r'\s*([0-9a-f]+):\s+(.*)', l); a = int(m.group(1), 16); ins = m.group(2).strip()
    note = ''
    if 'get_pc_thunk' in ins or ('call' in ins and i + 1 < len(lines) and re.search(r'add\s+\$0x[0-9a-f]+,%ebx', lines[i+1])):
        prev_next = int(re.match(r'\s*([0-9a-f]+):', lines[i+1]).group(1), 16) if i + 1 < len(lines) else None
    am = re.search(r'add\s+\$(0x[0-9a-f]+),%ebx', ins)
    if am and prev_next is not None: ebx = prev_next + int(am.group(1), 16); note = f'ebx={ebx:#x}'
    g = re.search(r'(-?0x[0-9a-f]+)\(%ebx\)', ins)
    if g and ebx is not None:
        t = (ebx + int(g.group(1), 16)) & 0xffffffff
        b4 = rd(t, 4)
        ptr = struct.unpack('<I', b4)[0] if b4 else None
        if t in rel: note = 'GOT:' + rel[t]
        elif 0x30597c <= t < 0x305980 + 0x1678 and ptr is not None and not ins.startswith('lea'):
            note = '*GOT->' + (syms.get(ptr) or cstr(ptr) or f'{ptr:#x}')
        elif ins.startswith('lea'): note = (cstr(t) or syms.get(t) or f'&{t:#x}')
        else:
            b = rd(t, 4)
            f = struct.unpack('<f', b)[0] if b else None
            note = (syms.get(t) or f'[{t:#x}]') + (f' f={f:g} i={struct.unpack("<i", b)[0]}' if b else '')
    try:
        print(f'{a:x}: {ins[:110]:110s} {("; " + note) if note else ""}')
    except BrokenPipeError:
        sys.exit(0)
