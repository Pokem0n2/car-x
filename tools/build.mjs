// Builds car-x.html — a single-file, double-clickable offline HTML.
// Inlines: the esbuild bundle of src/entry.js (enable3d framework + scene code,
// grass texture as data URL) and src/ammo.js (asm.js Bullet physics).
// Run: npm run build   (or: node tools/build.mjs)
import esbuild from 'esbuild'
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const root = join(__dirname, '..')

async function main() {
  const bundle = await esbuild.build({
    entryPoints: [join(root, 'src', 'entry.js')],
    bundle: true,
    minify: true,
    format: 'iife',
    loader: { '.jpg': 'dataurl' },
    write: false,
    logLevel: 'info'
  })

  // The only way "</script" can appear inside JS is within a string/regex;
  // escaping the slash keeps the string identical while ending the HTML tag early.
  const escape = s => s.replace(/<\/script/gi, '<\\/script')

  const ammo = readFileSync(join(root, 'src', 'ammo.js'), 'utf8')
  const app = bundle.outputFiles[0].text

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
<title>car-x — Car using Physics Constraints</title>
<!--
  car-x — Car using only physics constraints (single-file offline build)
  Based on the enable3d example "car-using-physics-constraints":
  https://github.com/enable3d/enable3d.github.io/blob/master/src/examples/car-using-physics-constraints.html
  enable3d (MIT) by yandeu · ammo.js (zlib) · rebuild with: npm run build
-->
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #000; }
  canvas { display: block; }
  #hud { position: fixed; top: 10px; right: 10px; z-index: 10; display: flex; flex-direction: column;
         gap: 6px; align-items: flex-end; font: 13px/1.4 system-ui, sans-serif; user-select: none; }
  #hud button { background: rgba(20,20,20,.72); color: #fff; border: 1px solid #555;
                border-radius: 4px; padding: 4px 10px; cursor: pointer; }
  #hud button:hover { background: rgba(60,60,60,.8); }
  #speed-row { display: flex; align-items: center; gap: 6px; background: rgba(20,20,20,.72);
               border: 1px solid #555; border-radius: 4px; padding: 4px 8px; color: #fff; }
  #speed-row.disabled { opacity: .45; }
  #speed-slider { width: 130px; }
  #speed-input { width: 54px; background: #111; color: #fff; border: 1px solid #555;
                 border-radius: 3px; padding: 2px 4px; font: inherit; }
</style>
</head>
<body>
<div id="hud">
  <button id="btn-view">视角:俯视锁定</button>
  <button id="btn-throttle">油门:未锁定</button>
  <div id="speed-row" class="disabled">
    <span>速度</span>
    <input id="speed-slider" type="range" min="0" max="1" step="0.01" value="0.3" disabled />
    <input id="speed-input" type="number" min="0" max="1" step="0.01" value="0.3" disabled />
    <span>m/s</span>
  </div>
</div>
<script>
/* ammo.js — Bullet Physics compiled to JavaScript (asm.js), zlib licensed.
   Built by @yandeu (https://github.com/yandeu/ammo.js), based on Bullet 2.89. */
${escape(ammo)}
</script>
<script>
${escape(app)}
</script>
</body>
</html>
`
  writeFileSync(join(root, 'car-x.html'), html)
  console.log('car-x.html written:', html.length, 'bytes')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
