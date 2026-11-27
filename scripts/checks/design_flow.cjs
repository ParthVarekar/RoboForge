// The Design tab end to end: describe a build, check the blueprint, press Build, capture the build in progress and the
// finished bench, and list page errors. Usage: node scripts/checks/design_flow.cjs <outDir> ["request text"] [--video]
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(process.env.APPDATA, 'npm/node_modules/@playwright/mcp/node_modules/playwright'));

const OUT = process.argv[2] || './design_flow';
const REQUEST = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'A rover that avoids walls and shows the distance on a screen';
const VIDEO = process.argv.includes('--video');
const wait = (page, ms) => page.waitForTimeout(ms);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, ...(VIDEO ? { recordVideo: { dir: path.join(OUT, 'video'), size: { width: 1600, height: 900 } } } : {}) });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:8070/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.goto('http://127.0.0.1:8070/#app', { waitUntil: 'networkidle' });
  await wait(page, 2500);

  await page.getByRole('button', { name: /Design/ }).first().click();
  await wait(page, 600);
  await page.locator('.design-input textarea').fill(REQUEST);
  await page.locator('.design-input button[type=submit]').click();
  await page.locator('.design-card').waitFor({ timeout: 120000 });
  await wait(page, 800);
  await page.screenshot({ path: path.join(OUT, '1_blueprint.png') });
  const reply = await page.locator('.design-msg.assistant').last().textContent();
  console.log('reply:', reply);
  console.log('parts:', (await page.locator('.design-bom tr').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim()).join(' | '));

  await page.getByRole('button', { name: /Build on the bench/ }).click();
  await wait(page, 500);
  if (await page.getByRole('alertdialog').isVisible().catch(() => false)) {
    await page.getByRole('alertdialog').getByRole('button').last().click();
  }
  await wait(page, 3500);
  await page.screenshot({ path: path.join(OUT, '2_building.png') });
  await page.locator('.design-progress-row', { hasText: 'Built' }).waitFor({ timeout: 120000 });
  await wait(page, 1800);
  await page.screenshot({ path: path.join(OUT, '3_built.png') });
  // run the starter sketch and read what it prints
  await page.getByRole('button', { name: 'Run', exact: true }).first().click();
  await wait(page, 4000);
  await page.getByRole('button', { name: /Serial/ }).first().click();
  await wait(page, 500);
  await page.screenshot({ path: path.join(OUT, '4_running.png') });
  const serial = (await page.locator('.right-panel').first().textContent().catch(() => '')) || '';
  console.log('serial:', serial.replace(/\s+/g, ' ').slice(0, 400));
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click().catch(() => {});
  const status = await page.locator('.status-bar, footer').first().textContent().catch(() => '');
  console.log('status bar:', (status || '').replace(/\s+/g, ' ').slice(0, 160));
  await ctx.close();
  await browser.close();
  console.log('errors:', JSON.stringify(errors.slice(0, 6)));
})();
