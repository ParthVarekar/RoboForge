// One capture run for the docs: bench, editor, arena and map panels. Each shot is independent; a failed shot is
// reported and the run goes on. Usage: node docshots.cjs <outDir>
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(process.env.APPDATA, 'npm/node_modules/@playwright/mcp/node_modules/playwright'));
const OUT = process.argv[2] || './docshots';
const wait = (page, ms) => page.waitForTimeout(ms);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const errors = [];
  const fresh = async (w = 1600, h = 1000, scale = 1.5) => {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('dialog', (d) => d.accept());
    await page.goto('http://127.0.0.1:8070/', { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await wait(page, 2500);
    return page;
  };
  const shot = async (name, fn) => {
    try {
      await fn();
      console.log('ok  ', name);
    } catch (e) {
      console.log('FAIL', name, String(e).split('\n')[0]);
    }
  };
  const btn = (page, name) => page.getByRole('button', { name, exact: true }).first();
  const pickPreset = async (page, id) => {
    await page.getByLabel('Starter Preset').selectOption(id);
    await wait(page, 500);
    if (await page.getByRole('alertdialog').isVisible().catch(() => false)) await page.getByRole('button', { name: 'Replace my build' }).click();
    await wait(page, 2200);
  };

  // ---------- bench, rover ----------
  let page = await fresh();
  const canvas = () => page.locator('canvas').first();
  await shot('bench_rover_iso', async () => {
    await btn(page, 'Iso').click(); await wait(page, 300);
    await btn(page, 'Fit').click(); await wait(page, 1200);
    await canvas().screenshot({ path: path.join(OUT, 'bench_rover_iso.png') });
  });
  await shot('bench_rover_top', async () => {
    await btn(page, 'Top').click(); await wait(page, 300);
    await btn(page, 'Fit').click(); await wait(page, 1200);
    await canvas().screenshot({ path: path.join(OUT, 'bench_rover_top.png') });
  });
  await shot('bench_rover_front', async () => {
    await btn(page, 'Front').click(); await wait(page, 300);
    await btn(page, 'Fit').click(); await wait(page, 1200);
    await canvas().screenshot({ path: path.join(OUT, 'bench_rover_front.png') });
  });
  await shot('bench_rover_close', async () => {
    await btn(page, 'Iso').click(); await wait(page, 300);
    await btn(page, 'Fit').click(); await wait(page, 1000);
    const box = await canvas().boundingBox();
    await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.5);
    for (let i = 0; i < 9; i++) { await page.mouse.wheel(0, -300); await wait(page, 40); }
    await wait(page, 900);
    await canvas().screenshot({ path: path.join(OUT, 'bench_rover_close.png') });
  });
  await shot('app_light_full', async () => {
    await btn(page, 'Fit').click(); await wait(page, 800);
    await page.screenshot({ path: path.join(OUT, 'app_light_full.png') });
  });
  await shot('bench_wire_selected_light', async () => {
    const box = await canvas().boundingBox();
    let got = false;
    for (let fy = 0.45; fy <= 0.8 && !got; fy += 0.03) for (let fx = 0.3; fx <= 0.75 && !got; fx += 0.03) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy); await wait(page, 100);
      got = await page.locator('text=Cable').first().isVisible().catch(() => false);
    }
    if (!got) throw new Error('no wire picked');
    await page.mouse.move(box.x + 4, box.y + 4); await wait(page, 500);
    await page.screenshot({ path: path.join(OUT, 'app_light_wire_selected.png') });
  });

  // ---------- dark theme ----------
  await shot('app_dark_full', async () => {
    await page.getByLabel('Toggle Light or Dark Theme').click(); await wait(page, 700);
    await page.mouse.move(4, 4);
    await page.screenshot({ path: path.join(OUT, 'app_dark_full.png') });
  });
  await shot('bench_rover_dark_iso', async () => {
    await btn(page, 'Iso').click(); await wait(page, 300);
    await btn(page, 'Fit').click(); await wait(page, 1200);
    await canvas().screenshot({ path: path.join(OUT, 'bench_rover_dark_iso.png') });
    await page.getByLabel('Toggle Light or Dark Theme').click(); await wait(page, 500);
  });
  await page.close();

  // ---------- quad and fault lab ----------
  page = await fresh();
  await shot('bench_quad_iso', async () => {
    await pickPreset(page, 'quad_5in');
    await btn(page, 'Iso').click(); await wait(page, 300);
    await btn(page, 'Fit').click(); await wait(page, 1300);
    await page.locator('canvas').first().screenshot({ path: path.join(OUT, 'bench_quad_iso.png') });
  });
  await shot('bench_fault_lab_iso', async () => {
    await pickPreset(page, 'fault_lab');
    await btn(page, 'Iso').click(); await wait(page, 300);
    await btn(page, 'Fit').click(); await wait(page, 1300);
    await page.locator('canvas').first().screenshot({ path: path.join(OUT, 'bench_fault_lab_iso.png') });
  });

  // ---------- editor ----------
  await shot('editor_verified', async () => {
    await pickPreset(page, 'room_mapper');
    await btn(page, 'Code').click(); await wait(page, 700);
    await page.getByLabel('Load example sketch').selectOption('bag_pass'); await wait(page, 700);
    await btn(page, 'Verify').click(); await wait(page, 1200);
    await page.screenshot({ path: path.join(OUT, 'editor_verified.png') });
  });
  await shot('editor_problem', async () => {
    const ed = page.locator('.monaco-editor .view-lines').first();
    await ed.click(); await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter'); await page.keyboard.type('int broken = 5');
    await btn(page, 'Verify').click(); await wait(page, 1200);
    await page.screenshot({ path: path.join(OUT, 'editor_problem.png') });
  });
  await page.close();

  // ---------- arena ----------
  page = await fresh();
  await shot('arena_rover_chase', async () => {
    await btn(page, 'Arena').click(); await wait(page, 2500);
    await page.locator('canvas').first().screenshot({ path: path.join(OUT, 'arena_rover_chase.png') });
  });
  await shot('arena_rover_driving', async () => {
    await btn(page, 'Run').click(); await wait(page, 4500);
    await page.locator('canvas').first().screenshot({ path: path.join(OUT, 'arena_rover_driving.png') });
    await btn(page, 'E-STOP').click().catch(() => {});
    await btn(page, 'Stop').click().catch(() => {});
    await wait(page, 500);
  });
  await shot('arena_drone_chase', async () => {
    await page.getByRole('button', { name: '5" Drone', exact: true }).click(); await wait(page, 1800);
    await page.locator('canvas').first().screenshot({ path: path.join(OUT, 'arena_drone_chase.png') });
  });
  await shot('arena_forest_orbit', async () => {
    await page.getByLabel('Arena Environment Preset').selectOption('forest_park'); await wait(page, 1500);
    await btn(page, 'Orbit').click(); await wait(page, 1800);
    await page.locator('canvas').first().screenshot({ path: path.join(OUT, 'arena_forest_orbit.png') });
  });
  await shot('arena_warehouse_builder_full', async () => {
    await page.getByLabel('Arena Environment Preset').selectOption('warehouse_maze'); await wait(page, 1500);
    await page.getByRole('button', { name: '2WD Rover', exact: true }).click(); await wait(page, 1200);
    await page.screenshot({ path: path.join(OUT, 'arena_warehouse_builder_full.png') });
  });
  await page.close();

  // ---------- room mapper: arena and map panel ----------
  page = await fresh();
  await shot('room_mapper_arena_map', async () => {
    await pickPreset(page, 'room_mapper');
    await btn(page, 'Arena').click(); await wait(page, 1500);
    await btn(page, 'Run').click(); await wait(page, 12000);
    await btn(page, 'Map').click(); await wait(page, 900);
    await page.screenshot({ path: path.join(OUT, 'room_mapper_arena_map.png') });
    await btn(page, 'Stop').click().catch(() => {});
  });
  await page.close();

  await browser.close();
  console.log('errors:', JSON.stringify(errors.slice(0, 5)));
})();
