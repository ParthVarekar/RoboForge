// Opens the arena from the rover build and captures the chase view, then the drone.
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(process.env.APPDATA, 'npm/node_modules/@playwright/mcp/node_modules/playwright'));
const OUT = process.argv[2] || './arena';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://127.0.0.1:8070/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Arena', exact: true }).first().click();
  await page.waitForTimeout(2500);
  const canvas = page.locator('canvas').first();
  await canvas.screenshot({ path: path.join(OUT, 'rover_chase.png') });
  // zoom in on the vehicle a bit
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(60); }
  await page.waitForTimeout(800);
  await canvas.screenshot({ path: path.join(OUT, 'rover_close.png') });
  await page.getByRole('button', { name: '5" Drone' }).first().click();
  await page.waitForTimeout(1500);
  await canvas.screenshot({ path: path.join(OUT, 'drone_chase.png') });
  await browser.close();
  console.log('errors:', JSON.stringify(errors));
})();
