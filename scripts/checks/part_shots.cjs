// Photographs one part alone on the bench from every view the parts guide requires, in light and dark theme, and
// lists console errors. Usage: node scripts/checks/part_shots.cjs <kind> [outDir]
// Needs the dev server on http://127.0.0.1:8070 (bun run dev -- --port 8070). CHROME_PATH overrides Chrome's path.
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(process.env.APPDATA, 'npm/node_modules/@playwright/mcp/node_modules/playwright'));

const kind = process.argv[2];
const OUT = process.argv[3] || path.join('part_shots', kind || 'unknown');
if (!kind) {
  console.log('usage: node scripts/checks/part_shots.cjs <kind> [outDir]');
  process.exit(2);
}
const wait = (page, ms) => page.waitForTimeout(ms);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1.5 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
  page.on('dialog', (d) => d.accept());
  await page.goto('http://127.0.0.1:8070/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await wait(page, 1500);
  await page.getByLabel('Starter Preset').selectOption('blank_bench');
  await wait(page, 400);
  if (await page.getByRole('alertdialog').isVisible().catch(() => false)) await page.getByRole('button', { name: 'Replace my build' }).click();
  await wait(page, 1500);
  // the saved session, with the bench holding only this part at the origin
  const ok = await page.evaluate((k) => {
    const key = 'roboforge.studio.session.v1';
    const s = JSON.parse(localStorage.getItem(key) || 'null');
    if (!s) return false;
    s.project.components = [{ id: 'part_1', kind: k, label: k, position: [0, 0, 0], rotationY: 0 }];
    s.project.wires = [];
    localStorage.setItem(key, JSON.stringify(s));
    return true;
  }, kind);
  if (!ok) throw new Error('no saved session to edit (did the app load?)');
  await page.reload({ waitUntil: 'networkidle' });
  await wait(page, 2500);

  const btn = (n) => page.getByRole('button', { name: n, exact: true }).first();
  const canvas = page.locator('canvas').first();
  const shoot = async (name) => { await wait(page, 900); await canvas.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log('ok', name); };
  const view = async (v) => { await btn(v).click(); await wait(page, 300); await btn('Fit').click(); await wait(page, 1200); };

  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') { await page.getByLabel('Toggle Light or Dark Theme').click(); await wait(page, 800); }
    for (const v of ['Iso', 'Top', 'Front', 'Right']) {
      await view(v);
      await shoot(`${theme}_${v.toLowerCase()}`);
    }
    // close-up: iso, then zoom toward the centre until details fill the frame
    await view('Iso');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 5; i += 1) { await page.mouse.wheel(0, -300); await wait(page, 40); }
    await shoot(`${theme}_close`);
  }
  // underside: the Front view tilted down below the bench is not offered, so a low orbit from the side stands in
  await page.getByLabel('Toggle Light or Dark Theme').click();
  await view('Front');
  const b2 = await canvas.boundingBox();
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
  await page.mouse.down();
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2 - 120, { steps: 10 });
  await page.mouse.up();
  await shoot('light_low_side');

  await browser.close();
  console.log(errors.length ? `console problems:\n  ${errors.join('\n  ')}` : 'console: clean');
})();
