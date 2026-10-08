// build-v3.mjs — CSP-safe size-optimized single-file build
// - physics: SAME asm.js ammo as v1.5.x (behavior-identical), gzip+base64
// - execution: script-element injection (CSP 'unsafe-inline' ok, no eval,
//   no WebAssembly, no DecompressionStream) — runs inside Feishu webview
// - decompress: fflate (pure JS) inlined
import esbuild from 'esbuild'
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import zlib from 'zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const VERSION = '1.6.6'

const b64 = buf => Buffer.from(buf).toString('base64')
const gz = buf => zlib.gzipSync(buf, { level: 9 })

async function main() {
  const appBundle = await esbuild.build({
    entryPoints: [join(root, 'src', 'entry.js')],
    bundle: true, minify: true, format: 'iife',
    loader: { '.jpg': 'dataurl' },
    write: false, logLevel: 'warning'
  })
  const app = appBundle.outputFiles[0].text
  if (/\beval\(|new Function\(/.test(app)) throw new Error('app bundle uses eval')

  const fflate = readFileSync('/tmp/fflate-inline.js', 'utf8')
  const ammo = readFileSync(join(root, 'src', 'ammo.js'))
  const ammoGz = b64(gz(ammo))
  const appGz = b64(gz(Buffer.from(app, 'utf8')))

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
'<script>' + fflate + '</' + 'script>',
'<script type="text/plain" id="p-ammo">' + ammoGz + '</' + 'script>',
'<script type="text/plain" id="p-app">' + appGz + '</' + 'script>',
'<script>',
'(function(){',
'var D=function(i){return document.getElementById(i).textContent};',
'var U=function(s){var b=atob(s),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u};',
'var T=function(u){return new TextDecoder().decode(window.__gunzip(u))};',
'var R=function(c){var e=document.createElement("script");e.textContent=c;document.body.appendChild(e)};',
'try{',
'R(T(U(D("p-ammo"))));',
'window.__boot=function(P,M){Ammo().then(function(){new P({scenes:[M],maxSubSteps:4,fixedTimeStep:1/120})})};',
'R(T(U(D("p-app"))));',
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
