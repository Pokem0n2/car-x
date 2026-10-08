#!/usr/bin/env python3
# shader-carve2.py — stub dropped shader dict entries; delete a var's GLSL def ONLY when
# the located def text is verifiably GLSL (guards against esbuild name reuse across scopes).
import re, json

s = open('/tmp/e3d-test/app-carved-raw.js', encoding='utf-8').read()
drop = json.load(open('/tmp/shader-drop.json'))

def read_str(s, i):
    q = s[i]; j = i + 1; buf = []
    while j < len(s):
        c = s[j]
        if c == '\\': buf.append(s[j:j+2]); j += 2; continue
        if c == q: return ''.join(buf), j + 1
        buf.append(c); j += 1
    return None, -1

GLSL_MARK = re.compile(r'#include|^void |vec[234]\s|gl_Position|gl_FragColor|uniform\s|varying\s|attribute\s|#define|#ifdef|#endif')

defs = []      # (start, end) verified GLSL def spans
unverified = 0
keep = set(json.load(open('/tmp/shader-keep.json')))
# vars still referenced by kept keys must NOT be deleted
m0 = re.search(r'[A-Za-z_$][\w$]*=\{alphahash_fragment:', s)
i0 = m0.start()
# dict segment
seg0 = s[i0:]
d0 = 0; k0 = 0
while k0 < len(seg0):
    c = seg0[k0]
    if c == '{': d0 += 1
    elif c == '}':
        d0 -= 1
        if d0 == 0: break
    k0 += 1
dictseg0 = seg0[:k0+1]
pairs0 = dict(re.findall(r'([A-Za-z_0-9]+):([A-Za-z_$][\w$]*|0)', dictseg0))
kept_vars = {v for kk, v in pairs0.items() if kk in keep and v != '0'}
for k, v in drop.items():
    hit = None
    if v in kept_vars: continue  # shared def — keep it
    for m in re.finditer(r'[,;{`]' + re.escape(v) + r'\s*=\s*[`"\']', s):
        txt, e = read_str(s, m.end()-1)
        if txt is None: continue
        if GLSL_MARK.search(txt):
            hit = (m.start()+1, e)
            break
        # remember first non-GLSL candidate but keep searching
    if hit: defs.append(hit)
    else: unverified += 1
print('verified GLSL defs:', len(defs), 'unverified (kept):', unverified)
defs.sort()

# sanity: no overlaps
for a, b in zip(defs, defs[1:]):
    assert a[1] <= b[0], f'overlap {a} {b}'

# stub dropped keys inside the Gt dict so nothing references deleted vars
m0 = re.search(r'[A-Za-z_$][\w$]*=\{alphahash_fragment:', s)
i = m0.start()
j2 = s.index('}', i) + 1
# bracket match for dict
def bmatch(s, i):
    depth = 0; instr = None
    while i < len(s):
        c = s[i]
        if instr:
            if c == '\\': i += 2; continue
            if c == instr: instr = None
            i += 1; continue
        if c in '"\'`': instr = c
        elif c == '{': depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0: return i + 1
        i += 1
    return -1
j2 = bmatch(s, s.index('{', i))
seg = s[i:j2]
# stub dropped dict values to a minimal valid GLSL program (not 0): vertex passthrough
STUB_V = '\\STUBV__'
for k, v in drop.items():
    seg = re.sub(r'(?<=[,{])' + re.escape(k) + r':' + re.escape(v) + r'(?=[,}])', k + ':0', seg, count=1)

out = []
last = 0
dict_done = False
for (a, b) in defs:
    out.append(s[last:a]); last = b
# splice the rewritten dict into the result at its original position
pre = ''.join(out) + s[last:]
# find the same dict position in `result` coordinates: rebuild by splicing dict span
result = s[:i] + seg + s[j2:]
# re-apply def deletions on this new string (offsets shifted): recompute
def read_str2(s, i):
    q = s[i]; j = i + 1; buf = []
    while j < len(s):
        c = s[j]
        if c == '\\': buf.append(s[j:j+2]); j += 2; continue
        if c == q: return ''.join(buf), j + 1
        buf.append(c); j += 1
    return None, -1
GLSL_MARK2 = re.compile(r'#include|^void |vec[234]\s|gl_Position|gl_FragColor|uniform\s|varying\s|attribute\s|#define|#ifdef|#endif')
defs2 = []
for k, v in drop.items():
    for m in re.finditer(r'[,;{`]' + re.escape(v) + r'\s*=\s*[`"\']', result):
        txt, e = read_str2(result, m.end()-1)
        if txt is not None and GLSL_MARK2.search(txt):
            defs2.append((m.start()+1, e)); break
defs2.sort()
out2 = []
last2 = 0
for (a, b) in defs2:
    if a >= i and b <= j2: continue
    out2.append(result[:0])  # placeholder no-op
    out2 = out2  # keep structure
    break
# simpler: do deletion pass
pieces = []
lastp = 0
for (a, b) in defs2:
    if a >= i and b <= j2: continue
    pieces.append(result[lastp:a]); lastp = b
pieces.append(result[lastp:])
result = ''.join(pieces)
result = re.sub(r',{2,}', ',', result)
import re as _re
result = _re.sub(r',{2,}', ',', result)
print(f'{len(s)} -> {len(result)}')
open('/tmp/e3d-test/app-shader-carved.js', 'w', encoding='utf-8').write(result)
