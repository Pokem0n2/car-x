#!/usr/bin/env python3
# build-v6.py — v1.6.7: combined LZMA stream (lc=2,pb=0) + b94(11c<->9B) single payload
# usage: build-v6.py ammo.js app.js base.html out.html
import lzma, re, sys

A = ''.join(chr(c) for c in range(0x20, 0x7f) if c != 0x3c)
assert len(A) == 94

def b94(data: bytes) -> str:
    out = []
    for i in range(0, len(data), 9):
        g = data[i:i+9]
        v = int.from_bytes(g, 'big')
        L = len(g)
        nchars = 11 if L == 9 else -(-L * 11 // 9)
        s = ''
        for _ in range(nchars):
            s = A[v % 94] + s
            v //= 94
        out.append(s)
    return ''.join(out)

def lz(data):
    f = [{'id': lzma.FILTER_LZMA1, 'preset': 9 | lzma.PRESET_EXTREME, 'dict_size': 1<<22, 'lc': 2, 'lp': 0, 'pb': 0}]
    return lzma.compress(data, format=lzma.FORMAT_ALONE, filters=f)

ammo = open(sys.argv[1], 'rb').read()
app = open(sys.argv[2], 'rb').read()
base = open(sys.argv[3], encoding='utf-8').read()

marker = b'\n//==CARX-SPLIT==\n'
combo = b94(lz(ammo + marker + app))
print(f'combined: raw {len(ammo)+len(app)} -> lzma lc2/pb0 -> b94 {len(combo)} chars')

out = base
# 1) drop the p-ammo block entirely
m = re.search(r'<script type="text/plain" id="p-ammo">[\s\S]*?</script>\n?', out)
assert m, 'p-ammo block missing'
out = out[:m.start()] + out[m.end():]
# 2) swap p-app payload for the combined stream
m = re.search(r'(<script type="text/plain" id="p-app">)([\s\S]*?)(</script>)', out)
assert m, 'p-app block missing'
out = out[:m.start(2)] + combo + out[m.end(2):]
# 3) replace the boot loader with the combined-stream b94 boot
OLD_BOOT = open('/tmp/boot-actual.js').read()  # extracted verbatim from v1.6.6

NEW_BOOT = '''(function(){
var A=" !\\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\\\]^_`abcdefghijklmnopqrstuvwxyz{|}~".replace('<','');
var M={};for(var i=0;i<94;i++)M[A.charCodeAt(i)]=i;
function dec(s){var n=s.length,p=n%11,q=n-p;var u=new Uint8Array(Math.floor(q*9/11)+(p?Math.floor(p*9/11):0));var w=0;
for(var j=0;j<q;j+=11){var v=0n;for(var t=0;t<11;t++)v=v*94n+BigInt(M[s.charCodeAt(j+t)]);
for(var b=8;b>=0;b--){u[w+b]=Number(v&255n);v>>=8n}w+=9}
if(p){var v2=0n;for(var k=0;k<p;k++)v2=v2*94n+BigInt(M[s.charCodeAt(q+k)]);var bytes=Math.floor(p*9/11);
for(var b2=bytes-1;b2>=0;b2--){u[w+b2]=Number(v2&255n);v2>>=8n}}
return u}
function run(id,cb){var u=dec(document.getElementById(id).textContent);
window.LZMA.decompress(Array.from(u),function(r){cb(r)},function(){})}
try{
run('p-app',function(ap){
var i=ap.indexOf('//==CARX-SPLIT==');
if(i<0)throw Error('split marker missing');
var a=ap.slice(0,i);var s2=ap.slice(i+17);
var sc=document.createElement('script');sc.textContent=a;document.body.appendChild(sc);
window.__boot=function(P,M2){Ammo().then(function(){new P({scenes:[M2],maxSubSteps:4,fixedTimeStep:1/120})})};
var s3=document.createElement('script');s3.textContent=s2;document.body.appendChild(s3);
})}
catch(e){document.body.insertAdjacentHTML('beforeend','<pre style=color:#f66>load error: '+e+'</pre>')}
})();'''
assert OLD_BOOT in out, 'boot block not found verbatim'
out = out.replace(OLD_BOOT, NEW_BOOT)
open(sys.argv[4], 'w', encoding='utf-8').write(out)
print(f'{sys.argv[4]}: total {len(out)} bytes')
