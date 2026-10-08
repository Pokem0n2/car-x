#!/usr/bin/env python3
# build-v4.py — maximum-compression single-file build (CSP-safe)
# ammo asm.js (v1.5.7-identical physics) + app bundle: LZMA-alone compressed,
# base85-embedded, decoded at boot by inlined pure-JS LZMA decoder (7KB),
# executed via <script> injection. No eval/wasm/DecompressionStream.
import lzma, subprocess, os

ROOT = os.path.expanduser('~/car-x-fix')
VERSION = '1.6.6'

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

# 1) esbuild the app bundle
subprocess.run(['npx', 'esbuild', 'src/entry.js', '--bundle', '--minify', '--format=iife',
                '--loader:.jpg=dataurl', '--outfile=/tmp/app-bundle.js'], cwd=ROOT, check=True)
app = open('/tmp/app-bundle.js', 'rb').read()

# 2) payloads
ammo = open(f'{ROOT}/src/ammo.js', 'rb').read()
ammo_lz = lzma_alone(ammo)
app_lz = lzma_alone(app)
ammo_b85 = b85(ammo_lz)
app_b85 = b85(app_lz)
lzdec = open(f'{ROOT}/tools/lzma-d-min.js', encoding='utf-8').read()

HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
<title>car-x v__VERSION__</title>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #000; }
  canvas { display: block; }
  #hud { position: fixed; top: 10px; right: 10px; z-index: 10; display: flex; flex-direction: row;
         gap: 6px; align-items: center; font: 13px/1.4 system-ui, sans-serif; user-select: none; }
  #hud button { background: rgba(20,20,20,.72); color: #fff; border: 1px solid #555;
                border-radius: 4px; padding: 4px 10px; cursor: pointer; height: 34px; min-width: 66px; }
  #hud button:hover { background: rgba(60,60,60,.8); }
  #speed-row { display: flex; align-items: center; gap: 6px; background: rgba(20,20,20,.72);
               border: 1px solid #555; border-radius: 4px; padding: 4px 8px; color: #fff;
               height: 24px; box-sizing: content-box; }
  #speed-slider { width: 130px; }
  #speed-input { width: 30px; background: #111; color: #fff; border: 1px solid #555;
                 border-radius: 3px; padding: 2px 4px; font: inherit; }
</style>
</head>
<body>
<div id="hud">
  <button id="btn-view">俯视</button>
  <div id="speed-row">
    <span>速度</span>
    <input id="speed-slider" type="range" min="0" max="5" step="0.05" value="0.3" />
    <input id="speed-input" type="number" min="0" max="5" step="0.05" value="0.3" />
    <span>m/s</span>
  </div>
  <button id="btn-throttle">油门:M</button>
</div>
<script>__LZDEC__</script>
<script type="text/plain" id="p-ammo">__AMMO__</script>
<script type="text/plain" id="p-app">__APP__</script>
<script>__BOOT__</script>
</body>
</html>"""

BOOT = """(function(){
var B85='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%()*+,-.:;=?@[]^_`{|';
var M={};for(var i=0;i<85;i++)M[B85.charCodeAt(i)]=i;
function dec(s){var n=s.length,p=n%5,q=n-p;var outLen=Math.floor(n*4/5);if(p)outLen-=(5-p)-Math.floor((5-p)*4/5)*0;var u=new Uint8Array(Math.floor(q*4/5)+(p?Math.floor(p*4/5):0));var w=0;
for(var j=0;j<q;j+=5){var a=M[s.charCodeAt(j)],b=M[s.charCodeAt(j+1)],c=M[s.charCodeAt(j+2)],d=M[s.charCodeAt(j+3)],e=M[s.charCodeAt(j+4)];
var v=((((a*85+b)*85+c)*85+d)*85+e);u[w]=v>>>24&255;u[w+1]=v>>>16&255;u[w+2]=v>>>8&255;u[w+3]=v&255;w+=4}
if(p){var bytes=p-1;var v2=0;for(var k=0;k<p;k++)v2=v2*85+M[s.charCodeAt(q+k)];
v2=Math.floor(v2/Math.pow(85,5-p));var sh=(bytes-1)*8;for(var k2=bytes-1;k2>=0;k2--){u[w+k2]=v2>>>sh&255;sh-=8}}
return u}
function run(id,cb){var u=dec(document.getElementById(id).textContent);
window.LZMA.decompress(Array.from(u),function(r){cb(r)},function(){})}
try{
run('p-ammo',function(a){
var sc=document.createElement('script');sc.textContent=a;document.body.appendChild(sc);
run('p-app',function(ap){
window.__boot=function(P,M2){Ammo().then(function(){new P({scenes:[M2],maxSubSteps:4,fixedTimeStep:1/120})})};
var s2=document.createElement('script');s2.textContent=ap;document.body.appendChild(s2);
})})
}catch(e){document.body.insertAdjacentHTML('beforeend','<pre style=color:#f66>load error: '+e+'</pre>')}
})();
"""

html = (HTML
        .replace('__VERSION__', VERSION)
        .replace('__LZDEC__', lzdec)
        .replace('__AMMO__', ammo_b85)
        .replace('__APP__', app_b85)
        .replace('__BOOT__', BOOT))
out = f'{ROOT}/car-x.html'
open(out, 'w', encoding='utf-8').write(html)
print('car-x.html written:', len(html), 'bytes')
print('  ammo:', len(ammo), '-> lzma', len(ammo_lz), '-> b85', len(ammo_b85))
print('  app :', len(app), '-> lzma', len(app_lz), '-> b85', len(app_b85))
