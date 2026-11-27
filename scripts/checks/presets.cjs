// Capture every starter preset: iso fit, top fit, and a close-up at the canvas centre.
// usage: node presets.cjs <outDir> [baseUrl] [theme light|dark]
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(process.env.APPDATA, 'npm/node_modules/@playwright/mcp/node_modules/playwright'));
const OUT = process.argv[2];
const BASE = process.argv[3] || 'http://127.0.0.1:8070/#app';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push('PAGE: ' + e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const sel = page.getByLabel('Starter Preset');
  const options = await sel.locator('option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent })));
  const canvas = page.locator('.viewport canvas, canvas').first();
  const btn = (n) => page.getByRole('button', { name: n, exact: true }).first();
  page.on('dialog', (d) => d.accept());
  for (const o of options) {
    await sel.selectOption(o.v);
    await page.waitForTimeout(1500);
    await btn('Iso').click();
    await page.waitForTimeout(200);
    await btn('Fit').click();
    await page.waitForTimeout(1300);
    await canvas.screenshot({ path: path.join(OUT, `${o.v}_iso.png`) });
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(40); }
    await page.waitForTimeout(900);
    await canvas.screenshot({ path: path.join(OUT, `${o.v}_close.png`) });
    await btn('Top').click();
    await page.waitForTimeout(200);
    await btn('Fit').click();
    await page.waitForTimeout(1300);
    await canvas.screenshot({ path: path.join(OUT, `${o.v}_top.png`) });
    console.log('captured', o.v, o.t);
  }
  console.log('errors:', JSON.stringify(errors.slice(0, 20)));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
