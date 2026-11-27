// Quick review shots of several parts: each one alone on the bench, Iso and Top views plus a close-up, light theme,
// and any console errors. Usage: node scripts/checks/part_sheet.cjs <kind> [kind ...]
// Writes part_shots/sheet/<kind>_{iso,top,close}.png. Needs the dev server on http://127.0.0.1:8070.
// For the full set of views the parts guide asks for, use part_shots.cjs on one part.
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(process.env.APPDATA, 'npm/node_modules/@playwright/mcp/node_modules/playwright'));

const kinds = process.argv.slice(2);
if (!kinds.length) {
  console.log('usage: node scripts/checks/part_sheet.cjs <kind> [kind ...]');
  process.exit(2);
}
const OUT = path.join('part_shots', 'sheet');
const wait = (page, ms) => page.waitForTimeout(ms);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, deviceScaleFactor: 1.25 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
  page.on('dialog', (d) => d.accept());
  // a saved session to start from: open the app once so it writes one
  await page.goto('http://127.0.0.1:8070/#app', { waitUntil: 'networkidle' });
  await wait(page, 2000);
  const base = await page.evaluate(() => localStorage.getItem('roboforge.studio.session.v1'));
  if (!base) throw new Error('the app did not save a session');

  const btn = (n) => page.getByRole('button', { name: n, exact: true }).first();
  for (const kind of kinds) {
    // set the bench from the landing page so the app's autosave cannot overwrite it, then open the app
    await page.goto('http://127.0.0.1:8070/', { waitUntil: 'networkidle' });
    await page.evaluate(([b, k]) => {
      const s = JSON.parse(b);
      s.project.components = [{ id: 'part_1', kind: k, label: k, position: [0, 0, 0], rotationY: 0 }];
      s.project.wires = [];
      localStorage.setItem('roboforge.studio.session.v1', JSON.stringify(s));
    }, [base, kind]);
    await page.goto('http://127.0.0.1:8070/#app', { waitUntil: 'networkidle' });
    await wait(page, 2200);
    const canvas = page.locator('canvas').first();
    const shoot = async (name) => { await wait(page, 700); await canvas.screenshot({ path: path.join(OUT, `${kind}_${name}.png`) }); };
    const view = async (v) => { await btn(v).click(); await wait(page, 250); await btn('Fit').click(); await wait(page, 1000); };
    await view('Iso');
    await shoot('iso');
    await view('Top');
    await shoot('top');
    await view('Iso');
    const b = await canvas.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    for (let i = 0; i < 4; i += 1) { await page.mouse.wheel(0, -300); await wait(page, 40); }
    await shoot('close');
    console.log('ok', kind);
  }
  await browser.close();
  console.log(errors.length ? `console problems:\n  ${errors.join('\n  ')}` : 'console: clean');
})().catch((e) => { console.error(e); process.exit(1); });
