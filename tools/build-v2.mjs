// build-v2.mjs — size-optimized single-file build (wasm ammo + gzip payloads)
import esbuild from 'esbuild'
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import zlib from 'zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const VERSION = '1.6.6'

const b64 = buf => Buffer.from(buf).toString('base64')

async function main() {
  const bundle = await esbuild.build({
    entryPoints: [join(root, 'src', 'entry.js')],
    bundle: true, minify: true, format: 'iife',
    loader: { '.jpg': 'dataurl' },
    write: false, logLevel: 'warning'
  })
  const app = bundle.outputFiles[0].text

  const glueGz = b64(zlib.gzipSync(readFileSync(join(root, 'src', 'ammo.wasm.js')), { level: 9 }))
  const wasmGz = b64(zlib.gzipSync(readFileSync(join(root, 'src', 'ammo.wasm.wasm')), { level: 9 }))
  const appGz  = b64(zlib.gzipSync(Buffer.from(app, 'utf8'), { level: 9 }))

  const html = [
'<!doctype html>',
'<html lang="en">',
'<head>',
'<meta charset="UTF-8" />',
'<meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />',
'<title>car-x v' + VERSION + '</title>',
'<style>',
'  html, body { margin: 0; height: 100%; overflow: hidden; background: #000; }',
'  canvas { display: block; }',
'  #hud { position: fixed; top: 10px; right: 10px; z-index: 10; display: flex; flex-direction: row;',
'         gap: 6px; align-items: center; font: 13px/1.4 system-ui, sans-serif; user-select: none; }',
'  #hud button { background: rgba(20,20,20,.72); color: #fff; border: 1px solid #555;',
'                border-radius: 4px; padding: 4px 10px; cursor: pointer; height: 34px; min-width: 66px; }',
'  #hud button:hover { background: rgba(60,60,60,.8); }',
'  #speed-row { display: flex; align-items: center; gap: 6px; background: rgba(20,20,20,.72);',
'               border: 1px solid #555; border-radius: 4px; padding: 4px 8px; color: #fff;',
'               height: 24px; box-sizing: content-box; }',
'  #speed-slider { width: 130px; }',
'  #speed-input { width: 30px; background: #111; color: #fff; border: 1px solid #555;',
'                 border-radius: 3px; padding: 2px 4px; font: inherit; }',
'</style>',
'</head>',
'<body>',
'<div id="hud">',
'  <button id="btn-view">俯视</button>',
'  <div id="speed-row">',
'    <span>速度</span>',
'    <input id="speed-slider" type="range" min="0" max="5" step="0.05" value="0.3" />',
'    <input id="speed-input" type="number" min="0" max="5" step="0.05" value="0.3" />',
'    <span>m/s</span>',
'  </div>',
'  <button id="btn-throttle">油门:M</button>',
'</div>',
'<script id="p-glue" type="text/plain">' + glueGz + '</' + 'script>',
'<script id="p-wasm" type="text/plain">' + wasmGz + '</' + 'script>',
'<script id="p-app" type="text/plain">' + appGz + '</' + 'script>',
'<script>',
'(async()=>{',
'const get=id=>document.getElementById(id).textContent;',
'const u8=async s=>{const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u};',
'const gun=async u=>new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());',
'const evl=async t=>{(0,eval)(new TextDecoder().decode(t))};',
'try{',
'const glue=new TextDecoder().decode(await gun(await u8(get("p-glue"))));',
'(0,eval)(glue);',
'const wasmb=await gun(await u8(get("p-wasm")));',
'window.__boot=(Project,MainScene)=>Ammo({wasmBinary:wasmb}).then(()=>new Project({scenes:[MainScene],maxSubSteps:4,fixedTimeStep:1/120}));',
'await evl(await gun(await u8(get("p-app"))));',
'}catch(e){document.body.insertAdjacentHTML("beforeend","<pre style=color:#f66>load error: "+e+"</pre>")}',
'})();',
'</' + 'script>',
'</body>',
'</html>'
  ].join('\n')
  writeFileSync(join(root, 'car-x.html'), html)
  console.log('car-x.html written:', html.length, 'bytes')
}
main().catch(e => { console.error(e); process.exit(1) })
