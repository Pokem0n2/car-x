// glframe.js — real WebGL frame comparison: render then readPixels inside RAF (same frame),
// hash the pixel grid for baseline vs candidate.
const puppeteer = require('puppeteer-core');

async function frameHash(file) {
  const browser = await puppeteer.launch({
    executablePath: '/tmp/chrome-libs/chrome-headless-shell/linux_arm-155.0.8059.39/chrome-headless-shell-linux-arm64/chrome-headless-shell',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 480, height: 300 });
  await page.goto('file://' + file, { waitUntil: 'load', timeout: 60000 });
  for (let i = 0; i < 60; i++) {
    const up = await page.evaluate(() => !!(window.carx && window.carx.plate)).catch(() => false);
    if (up) break;
    await new Promise(r => setTimeout(r, 500));
  }
  await new Promise(r => setTimeout(r, 3000));
  const hash = await page.evaluate(() => new Promise(resolve => {
    // park the car first for a deterministic frame
    window.carx.parkCar();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const c = document.querySelector('canvas');
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        // three.js used this context already; readPixels AFTER render in same frame
        const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        // grid hash: sample 48x30 cells
        let nonblack = 0, cells = [];
        for (let gy = 0; gy < 30; gy++) {
          for (let gx = 0; gx < 48; gx++) {
            const x = Math.floor((gx + 0.5) * w / 48), y = Math.floor((gy + 0.5) * h / 30);
            const idx = (y * w + x) * 4;
            const r = px[idx], g = px[idx+1], b = px[idx+2];
            if (r + g + b > 24) nonblack++;
            cells.push(((r>>4)<<8)|((g>>4)<<4)|(b>>4));
          }
        }
        // simple checksum
        let sum = 0;
        for (const v of cells) sum = (sum * 31 + v) >>> 0;
        resolve({ nonblack, sum, w, h });
      });
    });
  }));
  await browser.close();
  return hash;
}

(async () => {
  const a = await frameHash(process.argv[2]);
  const b = await frameHash(process.argv[3]);
  console.log('base:', JSON.stringify(a));
  console.log('cand:', JSON.stringify(b));
  const cells = 48 * 30;
  console.log('nonblack base/cand %:', (a.nonblack/cells*100).toFixed(1), (b.nonblack/cells*100).toFixed(1));
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
