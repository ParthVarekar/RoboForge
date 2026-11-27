// Loads the Actuator Lab preset, runs its sketch, moves the DHT22 air sliders, and checks what the bench does:
// servo horn angle, buzzer, relay LED, Serial output. Screenshots go to part_shots/actuator_lab/.
// Needs the dev server on http://127.0.0.1:8070.
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(process.env.APPDATA, 'npm/node_modules/@playwright/mcp/node_modules/playwright'));

const OUT = path.join('part_shots', 'actuator_lab');
const wait = (page, ms) => page.waitForTimeout(ms);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 1.25 });
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
  await wait(page, 2500);
  const btn = (n) => page.getByRole('button', { name: n, exact: true }).first();
  const canvas = page.locator('canvas').first();
  await btn('Iso').click();
  await btn('Fit').click();
  await wait(page, 1200);
  await canvas.screenshot({ path: path.join(OUT, '1_idle.png') });

  const setRange = async (label, value) => {
    await page.getByLabel(label).evaluate((el, v) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
  };
  // cool and dry first: servo near 22 C = 99 degrees, relay off, no beeps
  await setRange('Air temperature for the DHT22 (degrees C)', 22);
  await setRange('Relative humidity for the DHT22 (%)', 40);
  await page.getByRole('button', { name: 'Run', exact: true }).first().click();
  await wait(page, 4500);
  await canvas.screenshot({ path: path.join(OUT, '2_running_cool.png') });

  // hot and humid: servo to 36 C = 162 degrees, relay on (LED lit), buzzer beeps
  await setRange('Air temperature for the DHT22 (degrees C)', 36);
  await setRange('Relative humidity for the DHT22 (%)', 75);
  await wait(page, 3500);
  await canvas.screenshot({ path: path.join(OUT, '3_running_hot.png') });

  await page.getByRole('button', { name: /^Serial/ }).first().click().catch(() => undefined);
  await wait(page, 500);
  const text = await page.evaluate(() => document.body.innerText);
  const lines = text.split('\n').filter((l) => /T=|Actuator Lab|DHT22|relay/.test(l));
  console.log('serial lines:\n  ' + lines.slice(-6).join('\n  '));
  await browser.close();
  console.log(errors.length ? `console problems:\n  ${errors.join('\n  ')}` : 'console: clean');
})().catch((e) => { console.error(e); process.exit(1); });
