// Selects parts on the Actuator Lab bench and photographs the selection glow at its dim and bright points, in the
// light and dark themes. Writes part_shots/selection_glow/*.png. Needs the dev server on http://127.0.0.1:8070.
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(process.env.APPDATA, 'npm/node_modules/@playwright/mcp/node_modules/playwright'));

const OUT = path.join('part_shots', 'selection_glow');
const wait = (page, ms) => page.waitForTimeout(ms);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1.25 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://127.0.0.1:8070/#app', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await wait(page, 1500);
  await page.getByLabel('Starter Preset').selectOption('actuator_lab');
  await wait(page, 400);
  if (await page.getByRole('alertdialog').isVisible().catch(() => false)) await page.getByRole('button', { name: 'Replace my build' }).click();
  await wait(page, 2000);
  const btn = (n) => page.getByRole('button', { name: n, exact: true }).first();
  const canvas = page.locator('canvas').first();
  await btn('Iso').click();
  await btn('Fit').click();
  await wait(page, 1200);
  await page.getByRole('button', { name: /Browser/ }).first().click();
  await wait(page, 300);

  const select = async (label) => {
    await page.locator('.browser-tree .tree-row', { hasText: label }).first().click();
    await wait(page, 600);
  };
  // the glow breathes with sin(3.1 t): bright and dim are about 1 s apart
  const pair = async (name) => {
    await canvas.screenshot({ path: path.join(OUT, `${name}_a.png`) });
    await wait(page, 1000);
    await canvas.screenshot({ path: path.join(OUT, `${name}_b.png`) });
  };
  await canvas.screenshot({ path: path.join(OUT, 'none.png') });
  await select('Relay 5V');
  await pair('relay_light');
  await select('DHT22');
  await pair('dht_light');
  await page.getByLabel('Toggle Light or Dark Theme').click();
  await wait(page, 800);
  await select('SG90 Servo');
  await pair('servo_dark');
  await select('ESP32 Main');
  await pair('esp32_dark');

  await browser.close();
  console.log(errors.length ? `console problems:\n  ${errors.join('\n  ')}` : 'console: clean');
})().catch((e) => { console.error(e); process.exit(1); });
