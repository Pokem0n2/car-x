#!/usr/bin/env python3
# build-v5.py — assemble single-file car-x with carved ammo + surgical app.
# Payloads: ammo = /tmp/ammo-carved2.js (coverage-carved, toy-verified)
#           app  = /tmp/e3d-test/app-tts2.js (enable3d patched, tree-shaken)
import lzma, re, sys

def lzma_alone(data):
    f = [{'id': lzma.FILTER_LZMA1, 'preset': 9 | lzma.PRESET_EXTREME, 'dict_size': 1 << 22}]
    return lzma.compress(data, format=lzma.FORMAT_ALONE, filters=f)

B85 = b'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%()*+,-.:;=?@[]^_`{|'
def b85(buf):
    u = bytes(buf)
    pad = (4 - len(u) % 4) % 4
    u = u + b'\x00' * pad
    out = []
    for i in range(0, len(u), 4):
        n = int.from_bytes(u[i:i+4], 'big')
        c = bytearray(5)
        for k in range(4, -1, -1):
            c[k] = B85[n % 85]; n //= 85
        out.append(bytes(c))
    return b''.join(out).decode('ascii')

ammo = open(sys.argv[1], 'rb').read()
app = open(sys.argv[2], 'rb').read()
base = open(sys.argv[3], encoding='utf-8').read()  # existing car-x.html as shell

pa = b85(lzma_alone(ammo))
pp = b85(lzma_alone(app))
print(f'ammo: {len(ammo)} -> b85 {len(pa)}')
print(f'app:  {len(app)} -> b85 {len(pp)}')

out = base
for tag, payload in (('p-ammo', pa), ('p-app', pp)):
    m = re.search(r'(<script type="text/plain" id="' + tag + r'">)([\s\S]*?)(</script>)', out)
    assert m, f'{tag} block missing'
    out = out[:m.start(2)] + payload + out[m.end(2):]
open(sys.argv[4], 'w', encoding='utf-8').write(out)
print(f'{sys.argv[4]}: total {len(out)} bytes')
