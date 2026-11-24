// Checks that no two wires in a preset touch (paths closer than the sum of their radii).
// Needs the dev server running on 8070 (see HANDOFF.md, section 5) and reads window.__roboforgeWires (DEV only).
// Usage: node scripts/checks/wire_overlap.cjs [presetId]     e.g.  node scripts/checks/wire_overlap.cjs quad_5in
const path = require('path');
const { chromium } = require(path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/mcp/node_modules/playwright'));
const BASE = process.env.STUDIO_URL || 'http://127.0.0.1:8070/';
const preset = process.argv[2] || 'roboforge_rover';
const LABEL = { roboforge_rover: 'RoboForge 2WD Rover (Wired)', room_mapper: 'Autonomous 360° Room Mapper', quad_5in: '5-Inch Freestyle Quadcopter', fault_lab: 'Circuit Fault Diagnostics Lab', blank_bench: 'Blank Workbench' };
const TOUCH_MM = 0.04; // a pair closer than this (in cm, below) counts as touching; 0.04 cm = 0.4 mm of overlap

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.getByLabel('Starter Preset').selectOption(preset);
  await page.waitForTimeout(400);
  if (await page.getByRole('alertdialog').isVisible().catch(() => false)) await page.getByRole('button', { name: 'Replace my build' }).click();
  await page.waitForTimeout(2500);
  const wires = await page.evaluate(() => window.__roboforgeWires);
  await browser.close();
  if (!wires) { console.log('no __roboforgeWires: is this a DEV build (bun run dev)?'); process.exit(2); }
  // resample each wire every 0.4 mm and index the samples in a grid
  const cell = 0.3;
  const samples = wires.map((w) => {
    const out = [];
    for (let i = 1; i < w.points.length; i++) {
      const a = w.points[i - 1], b = w.points[i];
      const m = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.04));
      for (let j = 0; j < m; j++) out.push([a[0] + ((b[0] - a[0]) * j) / m, a[1] + ((b[1] - a[1]) * j) / m, a[2] + ((b[2] - a[2]) * j) / m]);
    }
    if (w.points.length) out.push(w.points[w.points.length - 1]);
    return out;
  });
  const hash = new Map();
  samples.forEach((pts, wi) => pts.forEach((p, k) => {
    const key = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)},${Math.floor(p[2] / cell)}`;
    if (!hash.has(key)) hash.set(key, []);
    hash.get(key).push([wi, k]);
  }));
  const worst = new Map();
  samples.forEach((pts, wi) => pts.forEach((p) => {
    const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell), cz = Math.floor(p[2] / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const [wj, k] of hash.get(`${cx + dx},${cy + dy},${cz + dz}`) || []) {
        if (wj <= wi) continue;
        const q = samples[wj][k];
        const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
        const pen = wires[wi].radius + wires[wj].radius - d;
        if (pen > TOUCH_MM) {
          const id = `${wires[wi].id} x ${wires[wj].id}`;
          if (!worst.has(id) || worst.get(id).pen < pen) worst.set(id, { pen, at: p.map((v) => v.toFixed(2)).join(',') });
        }
      }
    }
  }));
  console.log(`${LABEL[preset] || preset}: ${wires.length} wires, ${worst.size} touching pairs`);
  for (const [id, v] of [...worst.entries()].sort((a, b) => b[1].pen - a[1].pen).slice(0, 20)) console.log(`  ${id}  by ${(v.pen * 10).toFixed(2)} mm at (${v.at})`);
  console.log('errors:', JSON.stringify(errors.slice(0, 5)));
})();
