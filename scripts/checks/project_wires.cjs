// Loads saved project JSON files into the app one at a time and checks the finished wiring: touching wire pairs (away
// from a shared soldered end) and wires that fell back to a straight diagonal. Optionally saves a top-view picture.
// Usage: node scripts/checks/project_wires.cjs <outDir> <project.json> [...more]   (dev server on 127.0.0.1:8070)
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(process.env.APPDATA, 'npm/node_modules/@playwright/mcp/node_modules/playwright'));

const [OUT, ...files] = process.argv.slice(2);
const TOUCH_MM = 0.005;

function analyse(wires) {
  const samples = wires.map((w) => {
    const out = [];
    for (let i = 1; i < w.points.length; i++) {
      const a = w.points[i - 1], b = w.points[i];
      const m = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.04));
      for (let j = 0; j < m; j++) out.push([a[0] + ((b[0] - a[0]) * j) / m, a[1] + ((b[1] - a[1]) * j) / m, a[2] + ((b[2] - a[2]) * j) / m]);
    }
    return out;
  });
  const endAt = (w, e) => (e === 'from' ? w.points[0] : w.points[w.points.length - 1]);
  const nearShared = (a, b, p) => {
    for (const ea of ['from', 'to']) for (const eb of ['from', 'to']) {
      if (a[ea].componentId !== b[eb].componentId || a[ea].pinId !== b[eb].pinId) continue;
      const q = endAt(a, ea);
      if (q && Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 0.35) return true;
    }
    return false;
  };
  const cell = 0.3;
  const hash = new Map();
  samples.forEach((pts, wi) => pts.forEach((p, k) => {
    const key = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)},${Math.floor(p[2] / cell)}`;
    if (!hash.has(key)) hash.set(key, []);
    hash.get(key).push([wi, k]);
  }));
  const touching = new Set();
  samples.forEach((pts, wi) => pts.forEach((p) => {
    const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell), cz = Math.floor(p[2] / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const [wj, k] of hash.get(`${cx + dx},${cy + dy},${cz + dz}`) || []) {
        if (wj <= wi) continue;
        const q = samples[wj][k];
        const pen = wires[wi].radius + wires[wj].radius - Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
        if (pen > TOUCH_MM && !nearShared(wires[wi], wires[wj], p)) touching.add(`${wires[wi].id} x ${wires[wj].id}`);
      }
    }
  }));
  const straight = wires.filter((w) => {
    for (let i = 1; i < w.points.length; i++) {
      const a = w.points[i - 1], b = w.points[i];
      const dx = Math.abs(b[0] - a[0]), dz = Math.abs(b[2] - a[2]), h = Math.hypot(dx, dz);
      if (Math.min(dx, dz) > 0.15 * h && h > 0.4) return true;
    }
    return false;
  }).map((w) => w.id);
  return { touching: [...touching], straight };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  let bad = 0;
  for (const file of files) {
    const project = JSON.parse(fs.readFileSync(file, 'utf8'));
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    // the landing page does not autosave, so the saved project cannot be overwritten before the studio opens
    await page.goto('http://127.0.0.1:8070/', { waitUntil: 'networkidle' });
    await page.evaluate((p) => {
      localStorage.clear();
      localStorage.setItem('roboforge.studio.session.v1', JSON.stringify({ presetId: 'blank_bench', project: p, savedAt: Date.now() }));
    }, project);
    await page.goto('http://127.0.0.1:8070/#app', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    const wires = await page.evaluate(() => window.__roboforgeWires || []);
    const r = analyse(wires);
    const name = path.basename(file, '.json');
    await page.getByRole('button', { name: 'Top', exact: true }).first().click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Fit', exact: true }).first().click();
    await page.waitForTimeout(1200);
    await page.locator('canvas').first().screenshot({ path: path.join(OUT, `${name}_top.png`) });
    if (r.touching.length || r.straight.length || errors.length) bad += 1;
    console.log(`${name}: ${wires.length}/${project.wires.length} wires drawn, touching ${r.touching.length} ${r.touching.slice(0, 6).join(', ')} | straight ${r.straight.length} ${r.straight.join(', ')} | errors ${errors.length}`);
    await page.close();
  }
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
