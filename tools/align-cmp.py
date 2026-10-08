#!/usr/bin/env python3
# align-cmp.py — frame-aligned trajectory comparison (v7 vs baseline) with ±1 frame tolerance
import json, statistics

def load(p):
    return {t['f']: t for t in json.load(open(p))['trace']}

a, c = load('/tmp/tf-base1.json'), load('/tmp/tf-v7.json')
frames_a = sorted(a)
i0 = 0
for i in range(5, len(frames_a)):
    f0, f1 = frames_a[i-5], frames_a[i]
    if abs(a[f1]['x']-a[f0]['x']) + abs(a[f1]['z']-a[f0]['z']) > 0.02:
        i0 = i - 5
        break

d2 = []
for fa in frames_a[i0:]:
    best = None
    for off in (0, 1, -1):
        if fa+off in c:
            dd = max(abs(a[fa]['x']-c[fa+off]['x']), abs(a[fa]['z']-c[fa+off]['z']))
            if best is None or dd < best[0]:
                best = (dd, off)
    if best:
        d2.append(best[0])
print(f'aligned: n={len(d2)} max {max(d2):.4f} median {statistics.median(d2):.4f}')
