// Close-ups of the rover's densest wiring from a few angles.
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(process.env.APPDATA, 'npm/node_modules/@playwright/mcp/node_modules/playwright'));
const OUT = process.argv[2];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
  await page.goto('http://127.0.0.1:8070/#app', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  const btn = (n) => page.getByRole('button', { name: n, exact: true }).first();
  const shots = [
    { view: 'Iso', fx: 0.42, fy: 0.5, wheel: 9, name: 'esp32_area' },
    { view: 'Front', fx: 0.5, fy: 0.55, wheel: 7, name: 'front_low' },
    { view: 'Right', fx: 0.5, fy: 0.55, wheel: 7, name: 'side_low' },
  ];
  for (const s of shots) {
    await btn(s.view).click();
    await page.waitForTimeout(300);
    await btn('Fit').click();
    await page.waitForTimeout(1200);
    await page.mouse.move(box.x + box.width * s.fx, box.y + box.height * s.fy);
    for (let i = 0; i < s.wheel; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(40); }
    await page.waitForTimeout(900);
    await canvas.screenshot({ path: path.join(OUT, `${s.name}.png`) });
  }
  await browser.close();
})();
