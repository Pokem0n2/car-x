// cov-app.js — precise coverage of the APP payload (scriptId by length match)
// drives full feature set, then dumps per-function coverage of app-tts2.js
const puppeteer = require('puppeteer-core');
const fs = require('fs');

(async () => {
  const html = process.argv[2];
  const appSrc = fs.readFileSync(process.argv[3], 'utf8');
  const browser = await puppeteer.launch({
    executablePath: '/tmp/chrome-libs/chrome-headless-shell/linux_arm-155.0.8059.39/chrome-headless-shell-linux-arm64/chrome-headless-shell',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  const client = await page.target().createCDPSession();
  await client.send('Debugger.enable');
  await client.send('Profiler.enable');
  await client.send('Profiler.startPreciseCoverage', { callCount: false, detailed: true });

  const scripts = {};
  client.on('Debugger.scriptParsed', ev => {
    scripts[ev.scriptId] = ev.length || 0;
  });

  await page.goto('file://' + html, { waitUntil: 'load', timeout: 60000 });

  // wait for carx
  for (let i = 0; i < 90; i++) {
    const up = await page.evaluate(() => !!(window.carx && window.carx.plate)).catch(() => false);
    if (up) break;
    await new Promise(r => setTimeout(r, 500));
  }

  // full feature drive: drive + steer + reverse + tilt + pinch + view + slider + resize + idle
  await page.evaluate(() => {
    window.__t0 = performance.now();
    const car = window.carx;
    car.keys.w = true;                       // drive
  });
  await new Promise(r => setTimeout(r, 2500));
  await page.evaluate(() => {
    const car = window.carx;
    car.keys.w = false; car.keys.a = true;   // steer left
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.evaluate(() => { window.carx.keys.a = false; window.carx.keys.s = true; }); // reverse
  await new Promise(r => setTimeout(r, 1500));
  await page.evaluate(() => { window.carx.keys.s = false; });
  // tilt
  await page.evaluate(() => {
    const e = new Event('deviceorientation');
    Object.defineProperty(e, 'beta', { value: 0 });
    Object.defineProperty(e, 'gamma', { value: 12 });
    window.dispatchEvent(e);
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.evaluate(() => {
    const e = new Event('deviceorientation');
    Object.defineProperty(e, 'beta', { value: 0 });
    Object.defineProperty(e, 'gamma', { value: 0 });
    window.dispatchEvent(e);
  });
  // free view + orbit
  await page.evaluate(() => document.getElementById('btn-view').click());
  await new Promise(r => setTimeout(r, 800));
  await page.evaluate(() => {
    window.carx.sph.theta = 1.2; window.carx.sph.phi = 1.0;
  });
  await new Promise(r => setTimeout(r, 800));
  // throttle-lock cruise
  await page.evaluate(() => document.getElementById('btn-throttle').click());
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => window.carx.cruiseDir = 1);
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => { window.carx.cruiseDir = -1; });
  await new Promise(r => setTimeout(r, 1500));
  await page.evaluate(() => { window.carx.cruiseDir = 0; document.getElementById('btn-throttle').click(); });
  // resize
  await page.setViewport({ width: 800, height: 600 });
  await new Promise(r => setTimeout(r, 800));
  await page.setViewport({ width: 1280, height: 800 });
  await new Promise(r => setTimeout(r, 800));
  // long idle settle
  await new Promise(r => setTimeout(r, 4000));

  const cov = await client.send('Profiler.takePreciseCoverage');
  // find app scriptId: length matches appSrc
  let appId = null;
  for (const [sid, len] of Object.entries(scripts)) {
    if (len === appSrc.length) { appId = sid; break; }
  }
  if (!appId) {
    console.error('APP SCRIPT NOT FOUND; appSrc.length=' + appSrc.length);
    for (const [sid, len] of Object.entries(scripts)) console.error('  vm script', sid, 'len', len);
    // dump coverage scriptIds too
    for (const r of cov.result) console.error('  cov script', r.scriptId, r.url.slice(0,60), JSON.stringify((r.coverage[0]||{}).textOffset||0));
    process.exit(1);
  }
  const entry = cov.result.find(r => String(r.scriptId) === String(appId));
  for (const r of cov.result) console.error('cov sid', r.scriptId, 'ranges', (r.coverage||[]).length, JSON.stringify((r.url||'').slice(0,40)));
  if (!entry) {
    console.error('no coverage entry for appId', appId);
    for (const r of cov.result.slice(0, 30)) console.error('  cov sid', r.scriptId, JSON.stringify(r.url.slice(0,50)));
    process.exit(1);
  }
  const functions = (entry.functions || []).map(f => ({ functionName: f.functionName, ranges: f.ranges.filter(r => r.count > 0) }));
  fs.writeFileSync(process.argv[4], JSON.stringify({ url: entry.url, scriptId: appId, functions }, null, 0));
  console.log('app coverage dumped, scriptId', appId, 'functions:', functions.length, 'errors:', errors.length);
  errors.slice(0, 5).forEach(e => console.log('ERR', e));
  await browser.close();
})().catch(e => { console.error('FAIL', e.message, e.stack); process.exit(1); });
