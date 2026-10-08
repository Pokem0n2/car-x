#!/usr/bin/env python3
# shader-drop.py — compute keep-set for shader programs/chunks, write keep/drop JSON.
import re, json

s = open('/tmp/e3d-test/app-carved-raw.js', encoding='utf-8').read()

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

def read_str(s, i):
    q = s[i]; j = i + 1; buf = []
    while j < len(s):
        c = s[j]
        if c == '\\': buf.append(s[j:j+2]); j += 2; continue
        if c == q: return ''.join(buf), j + 1
        buf.append(c); j += 1
    return None, -1

m0 = re.search(r'[A-Za-z_$][\w$]*=\{alphahash_fragment:', s)
i = m0.start()
j2 = bmatch(s, s.index('{', i))
seg = s[i:j2]
pairs = dict(re.findall(r'([A-Za-z_0-9]+):([A-Za-z_$][\w$]*)', seg))

def var_string(v):
    for m in re.finditer(r'[,;{`]' + re.escape(v) + r'\s*=\s*[`"\']', s):
        txt, e = read_str(s, m.end()-1)
        if txt is not None:
            return txt, m.start()+1, e
    return None, -1, -1

import json as _json, os as _os
_p = '/tmp/shader-keep.json'
if _os.path.exists(_p):
    needed = set(_json.load(open(_p)))
else:
    needed = {'meshbasic_vert','meshbasic_frag','meshlambert_vert','meshlambert_frag',
              'linedashed_vert','linedashed_frag','depth_vert','depth_frag',
              'distanceRGBA_vert','distanceRGBA_frag','shadow_vert','shadow_frag',
              'sprite_vert','sprite_frag','background_vert','background_frag',
              'cube_vert','cube_frag','equirect_vert','equirect_frag'}
inc = re.compile(r'#include\s*<\s*([\w]+)\s*>')
chunks = set()
for p in needed & set(pairs):
    t, _, _ = var_string(pairs[p])
    if t: chunks.update(inc.findall(t))
frontier = set(chunks)
while frontier:
    nxt = set()
    for c in frontier:
        if c not in pairs: continue
        t, _, _ = var_string(pairs[c])
        if t:
            for x in inc.findall(t):
                if x not in chunks: nxt.add(x)
    chunks |= nxt
    frontier = nxt
keep = needed | chunks
drop = set(pairs) - keep
print('keep:', len(keep), 'drop:', len(drop))
tot = 0
for k in drop:
    t, ds, de = var_string(pairs[k])
    if t is not None: tot += len(t)
print('droppable GLSL bytes:', tot)
json.dump(sorted(keep), open('/tmp/shader-keep.json', 'w'))
json.dump({k: pairs[k] for k in drop}, open('/tmp/shader-drop.json', 'w'))
