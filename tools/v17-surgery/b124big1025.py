#!/usr/bin/env python3
# b124big1025.py — 124-charset, 1025 chars <-> 891 bytes (6.954 bits/char)
import sys, math
ALPHA = [i for i in range(1, 0x7f) if i not in (0x0d, 0x3c)]
assert len(ALPHA) == 124
NC, NB = 1025, 891
assert 124 ** NC >= 256 ** NB

def enc(data: bytes) -> bytes:
    out = bytearray()
    for off in range(0, len(data), NB):
        chunk = data[off:off + NB]
        v = int.from_bytes(chunk, 'big')
        L = len(chunk)
        nc = NC if L == NB else math.ceil(L * NC / NB)
        cs = []
        for _ in range(nc):
            cs.append(v % 124)
            v //= 124
        assert v == 0, 'overflow'
        cs.reverse()
        out.extend(ALPHA[c] for c in cs)
    return bytes(out)
