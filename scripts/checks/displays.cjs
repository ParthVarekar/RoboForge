// Display check: loads the Display Lab and the rover, runs their sketches and captures the OLED and LCD screens.
// Usage: node scripts/checks/displays.cjs <outDir>   (dev server on 127.0.0.1:8070; CHROME_PATH overrides Chrome)
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(process.env.APPDATA, 'npm/node_modules/@playwright/mcp/node_modules/playwright'));
const OUT = process.argv[2] || './displayshots';
const wait = (page, ms) => page.waitForTimeout(ms);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
  });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('dialog', (d) => d.accept());
  await page.goto('http://127.0.0.1:8070/#app', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await wait(page, 2500);
  const btn = (name) => page.getByRole('button', { name, exact: true }).first();
  const canvas = page.locator('canvas').first();
  const pickPreset = async (id) => {
    await page.getByLabel('Starter Preset').selectOption(id);
    await wait(page, 500);
    if (await page.getByRole('alertdialog').isVisible().catch(() => false)) await page.getByRole('button', { name: 'Replace my build' }).click();
    await wait(page, 2500);
  };
  const zoomAt = async (fx, fy, ticks) => {
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
    for (let i = 0; i < ticks; i++) { await page.mouse.wheel(0, -300); await wait(page, 40); }
    await wait(page, 900);
  };

  // ---- Display Lab: before Run (power-up state), then running
  await pickPreset('display_lab');
  await btn('Top').click(); await wait(page, 300);
  await btn('Fit').click(); await wait(page, 1500);
  await canvas.screenshot({ path: path.join(OUT, 'lab_before_run.png') });
  await btn('Run').click();
  await wait(page, 4500);
  await canvas.screenshot({ path: path.join(OUT, 'lab_running_top.png') });
  await btn('Iso').click(); await wait(page, 300);
  await btn('Fit').click(); await wait(page, 1500);
  await canvas.screenshot({ path: path.join(OUT, 'lab_running_iso.png') });
  const serial = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync(path.join(OUT, 'lab_page_text.txt'), serial);
  await btn('Top').click(); await wait(page, 300);
  await btn('Fit').click(); await wait(page, 1200);
  await zoomAt(0.62, 0.45, 6);
  await canvas.screenshot({ path: path.join(OUT, 'lab_lcd_close.png') });
  await btn('Fit').click(); await wait(page, 1200);
  await zoomAt(0.5, 0.25, 7);
  await canvas.screenshot({ path: path.join(OUT, 'lab_oled_close.png') });
  await btn('Stop').click().catch(() => {});
  await wait(page, 500);

  // ---- rover: bag-pass sketch (oled helper)
  await pickPreset('roboforge_rover');
  await btn('Run').click();
  await wait(page, 3500);
  await btn('Top').click(); await wait(page, 300);
  await btn('Fit').click(); await wait(page, 1200);
  await zoomAt(0.5, 0.3, 7);
  await canvas.screenshot({ path: path.join(OUT, 'rover_oled_close.png') });
  await btn('Stop').click().catch(() => {});

  await browser.close();
  console.log('errors:', JSON.stringify(errors.slice(0, 8)));
})();
