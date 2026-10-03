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
  #info-text { position: fixed; top: 10px; left: 10px; color: #fff; font: 14px/1.5 monospace;
               text-shadow: 0 1px 2px #000; pointer-events: none; user-select: none; }
</style>
</head>
<body>
<div id="info-text">Car using only physics<br />(Feel free to improve this example)<br />WASD drive</div>
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
