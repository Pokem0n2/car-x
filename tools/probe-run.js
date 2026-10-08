// probe-run.js — run the V164-style full-function probe against any car-x html,
// collect V164 console lines. Usage: node probe-run.js <file.html>
const puppeteer = require('puppeteer-core');

(async () => {
  const file = process.argv[2];
  const browser = await puppeteer.launch({
    executablePath: '/tmp/chrome-libs/chrome-headless-shell/linux_arm-155.0.8059.39/chrome-headless-shell-linux-arm64/chrome-headless-shell',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  const lines = [];
  page.on('console', m => { const t = m.text(); if (t.startsWith('V164')) lines.push(t); });
  page.on('pageerror', e => lines.push('PAGEERR ' + e.message));
  await page.goto('file://' + file, { waitUntil: 'load', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const up = await page.evaluate(() => !!(window.carx && window.carx.plate)).catch(() => false);
    if (up) break;
    await new Promise(r => setTimeout(r, 500));
  }
  await new Promise(r => setTimeout(r, 18000));
  console.log(lines.join('\n'));
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
