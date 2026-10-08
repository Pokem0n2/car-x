// cov-app2.js — second drive: paused toggle, space brake, double-tap pause,
// speed-slider extremes, throttle pulse taps, screen angle, wheel zoom
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
  client.on('Debugger.scriptParsed', ev => { scripts[ev.scriptId] = ev.length || 0; });
  await page.goto('file://' + html, { waitUntil: 'load', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const up = await page.evaluate(() => !!(window.carx && window.carx.plate)).catch(() => false);
    if (up) break;
    await new Promise(r => setTimeout(r, 500));
  }
  // space brake in throttle mode
  await page.evaluate(() => { window.carx.setThrottleLocked(true); window.carx.keys.space = true; });
  await new Promise(r => setTimeout(r, 1200));
  await page.evaluate(() => { window.carx.keys.space = false; window.carx.cruiseDir = 1; });
  await new Promise(r => setTimeout(r, 2000));
  // pause / unpause via setPaused (double-tap path)
  await page.evaluate(() => window.carx.setPaused(true));
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(() => window.carx.setPaused(false));
  await new Promise(r => setTimeout(r, 1000));
  // slider extremes through DOM events
  await page.evaluate(() => {
    const s = document.getElementById('speed-slider');
    s.value = '0'; s.dispatchEvent(new Event('input'));
    s.value = '5'; s.dispatchEvent(new Event('input'));
    s.value = '2.5'; s.dispatchEvent(new Event('input'));
  });
  await new Promise(r => setTimeout(r, 800));
  // throttle pulse (tap = short press)
  await page.evaluate(() => { window.carx.pressThrottle(1); });
  await new Promise(r => setTimeout(r, 400));
  await page.evaluate(() => { window.carx.pressThrottle(-1); });
  await new Promise(r => setTimeout(r, 400));
  // wheel zoom (both views)
  await page.evaluate(() => window.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true })));
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate(() => document.getElementById('btn-view').click());
  await new Promise(r => setTimeout(r, 400));
  await page.evaluate(() => window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true })));
  await new Promise(r => setTimeout(r, 500));
  // orientation change event
  await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
  await new Promise(r => setTimeout(r, 800));
  // settle
  await new Promise(r => setTimeout(r, 3000));

  const cov = await client.send('Profiler.takePreciseCoverage');
  let appId = null;
  for (const [sid, len] of Object.entries(scripts)) if (len === appSrc.length) { appId = sid; break; }
  const entry = cov.result.find(r => String(r.scriptId) === String(appId));
  const functions = (entry.functions || []).map(f => ({ functionName: f.functionName, ranges: f.ranges.filter(r => r.count > 0) }));
  fs.writeFileSync(process.argv[4], JSON.stringify(functions));
  console.log('round2 functions hit:', functions.length, 'errors:', errors.length);
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
