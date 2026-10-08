#!/usr/bin/env python3
# carve-app2.py — carve dead functions inside the esbuild IIFE by working on
# var-declaration-list commas at depth 1 (inside the wrapper), plus top-level ';'
# statements. A candidate =  NAME=class{...} | NAME=function(...){...} | NAME=(...)=>{...}
import json, re, sys

src = open(sys.argv[1], encoding='utf-8').read()
cov_files = sys.argv[3:]
out_path = sys.argv[2]

covered = []
for cf in cov_files:
    data = json.load(open(cf))
    fns = data if isinstance(data, list) else data.get('functions', [])
    for f in fns:
        for r in f.get('ranges', []):
            if r['endOffset'] - r['startOffset'] < 20000:
                covered.append((r['startOffset'], r['endOffset']))

covered.sort()
# merge
merged = []
for s, e in covered:
    if merged and s <= merged[-1][1]:
        merged[-1][1] = max(merged[-1][1], e)
    else:
        merged.append([s, e])

import bisect
starts = [m[0] for m in merged]
def is_covered(a, b):
    i = bisect.bisect_right(starts, a) - 1
    if i >= 0 and merged[i][1] > a:
        return True
    j = bisect.bisect_right(starts, b) - 1
    return j >= 0 and merged[j][0] < b and merged[j][1] > a

def scan(code, base=0):
    """yield (decl_name, body_abs_start, body_abs_end) for carve candidates."""
    # walk at depth 0 of `code`, splitting on ';' and ',' at brace/paren depth 0
    segs = []
    depth = 0
    start = 0
    i = 0
    instr = None
    while i < len(code):
        c = code[i]
        if instr:
            if c == '\\': i += 2; continue
            if c == instr: instr = None
            i += 1; continue
        if c in '"\'`':
            instr = c; i += 1; continue
        if c in '([{': depth += 1
        elif c in ')]}':
            depth -= 1
            if depth == 0 and c == '}' and i + 1 < len(code):
                # function/class body just closed: next decl starts a new segment
                segs.append((start, i + 1)); start = i + 1
        elif depth == 0 and c in ';,':
            segs.append((start, i)); start = i + 1
        i += 1
    segs.append((start, len(code)))
    return segs

def bracket_block(s, i):
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

# the IIFE: find first '{' after '()=>'
w = src.index('=>') + 2
iife_start = src.index('{', w)
# matching close is the last '})()' — bracket match:
def match_fwd(s, i):
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
            if depth == 0: return i
        i += 1
    return -1
code_end = src.rfind('})();')
iife_end = code_end - 1  # anchor to last })(); body ends at matching '}'
print('IIFE body:', iife_start, iife_end)

body = src[iife_start+1:iife_end]
segs = scan(body)
print('depth-0 segments in body:', len(segs))

carve_ops = []  # (abs_start, abs_end) to replace with '{}'
candidates = 0
FUNC_RE = re.compile(r'^\s*(?:var\s+|let\s+|const\s+)?[A-Za-z_$][\w$]*\s*=\s*(?:function[\w$]*\s*\([^)]*\)|(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)\s*\{')
CLASS_RE = re.compile(r'^\s*(?:var\s+|let\s+|const\s+)?[A-Za-z_$][\w$.]*\s*=\s*class\s*(?:extends\s+[\w$.]+\s*)?\{')
FUNC2_RE = re.compile(r'^\s*function\s+[\w$]+\s*\([^)]*\)\s*\{')
for (a, b) in segs:
    seg = body[a:b]
    mm = FUNC_RE.match(seg) or CLASS_RE.match(seg) or FUNC2_RE.match(seg)
    if not mm: continue
    body_start_rel = seg.index('{', mm.end() - 1)
    body_end_rel = bracket_block(seg, body_start_rel)
    if body_end_rel < 0: continue
    abs_s = iife_start + 1 + a + body_start_rel
    abs_e = iife_start + 1 + a + body_end_rel
    # only carve if whole body uncovered AND name isn't referenced elsewhere after
    if is_covered(abs_s, abs_e): continue
    carve_ops.append((abs_s, abs_e))
    candidates += 1

print('carve candidates:', candidates)
# ---- second pass: dead methods inside classes ----
# find class bodies: any 'class' keyword followed by '{'
METHOD_RE = re.compile(r'^\s*(?:static\s+)?(?:get\s+|set\s+)?[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{')
class_spans = []
for m in re.finditer(r'\bclass\b[^{]*\{', src[:code_end]):
    cb = m.end() - 1
    ce = bracket_block(src, cb)
    if ce > 0:
        class_spans.append((cb, ce))
print('class bodies found:', len(class_spans))

def method_segs(cbody, base):
    segs = []
    depth = 0; start = 0; i = 0; instr = None
    while i < len(cbody):
        c = cbody[i]
        if instr:
            if c == '\\': i += 2; continue
            if c == instr: instr = None
            i += 1; continue
        if c in '"\'`': instr = c; i += 1; continue
        if c in '([{': depth += 1
        elif c in ')]}':
            depth -= 1
            if depth == 0 and c == '}' and i + 1 < len(cbody):
                segs.append((start, i + 1)); start = i + 1
        elif depth == 0 and c == ';':
            segs.append((start, i)); start = i + 1
        i += 1
    segs.append((start, len(cbody)))
    return segs

# whitelist classes whose methods must never be carved (3D math + core scene graph)
WHITELIST_MARKERS = ['_onChangeCallback', '_x,_y', 'makeRotationFromQuaternion', 'isMatrix4', 'isVector3']
def class_text(cb, ce):
    return src[cb:ce]
whitelisted = 0
wl_spans = []
for (cb, ce) in class_spans:
    ct = class_text(cb, ce)
    if any(mk in ct for mk in WHITELIST_MARKERS) and len(ct) < 12000:
        wl_spans.append((cb, ce))
print('whitelisted classes:', len(wl_spans))
class_spans = [(cb, ce) for (cb, ce) in class_spans if (cb, ce) not in wl_spans]
for (cb, ce) in class_spans:
    cbody = src[cb+1:ce-1]
    for (a, b) in method_segs(cbody, cb+1):
        seg = cbody[a:b]
        mm = METHOD_RE.match(seg)
        if not mm: continue
        bs = seg.index('{', mm.end() - 1)
        be = bracket_block(seg, bs)
        if be < 0: continue
        abs_s = cb + 1 + a + bs
        abs_e = cb + 1 + a + be
        if is_covered(abs_s, abs_e): continue
        carve_ops.append((abs_s, abs_e))

carve_ops.sort()
out = []
last = 0
saved = 0
for (a, b) in carve_ops:
    if a < last: continue
    out.append(src[last:a]); out.append('{}')
    saved += b - a - 2
    last = b
out.append(src[last:])
result = ''.join(out)
print('total carve ops:', len(carve_ops))
open(out_path, 'w', encoding='utf-8').write(result)
print(f'carved {len(carve_ops)} bodies, raw bytes saved: {saved}')
print(f'{len(src)} -> {len(result)}')
