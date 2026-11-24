// End-to-end checks of the sketch editor in real Chrome. usage: node editor.cjs <outDir> [baseUrl]
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(process.env.APPDATA, 'npm/node_modules/@playwright/mcp/node_modules/playwright'));
const OUT = process.argv[2];
const BASE = process.argv[3] || 'http://127.0.0.1:8070/';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.25 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGE: ' + e.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const codeTab = page.locator('.tab-btn', { hasText: 'Code' });
  const editor = page.locator('.code-editor-host');
  const problems = page.locator('.problems-list');
  const editorText = () => page.locator('.code-editor-host .view-lines').innerText();
  const panel = page.locator('.right-panel');
  const paste = async (text) => {
    await page.evaluate((t) => navigator.clipboard.writeText(t), text);
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(700);
  };

  await codeTab.click();
  await page.waitForTimeout(800);
  await panel.screenshot({ path: path.join(OUT, '01_editor_light.png') });
  check('editor opens with no problems for the preset sketch', (await page.locator('.code-status').innerText()).includes('No problems'));

  // a missing semicolon is flagged on its line
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem('roboforge.studio.session.v1') || '{}').project?.code ?? null);
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nint extra = 5\n');
  await page.waitForTimeout(900);
  const p1 = (await problems.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check("missing ';' shows in Problems with its line", /Ln \d+ expected ';' at the end of this line/.test(p1), p1.slice(0, 120));
  await panel.screenshot({ path: path.join(OUT, '02_missing_semicolon.png') });
  const squiggles = await page.locator('.code-editor-host .squiggly-error').count();
  check('error squiggle drawn in the editor', squiggles > 0, `${squiggles} squiggles`);

  // undo removes it again
  let undos = 0;
  let restoredCode = null;
  for (; undos < 12; undos++) {
    await page.keyboard.press('Control+Z');
    await page.waitForTimeout(800);
    restoredCode = await page.evaluate(() => JSON.parse(localStorage.getItem('roboforge.studio.session.v1') || '{}').project?.code ?? null);
    if (restoredCode === original) break;
  }
  check('undo restores the clean sketch exactly', (await page.locator('.code-status').innerText()).includes('No problems') && (original === null || restoredCode === original), `${undos + 1} undo steps`);

  // undeclared call with suggestion, click jumps to the line
  await page.keyboard.press('Control+Home');
  await page.keyboard.type('void blinkOnce() { digitalWrit(2, HIGH); }\n');
  await page.waitForTimeout(900);
  const p2 = (await problems.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check('undeclared function reported with a suggestion', p2.includes("'digitalWrit' was not declared") && p2.includes("did you mean 'digitalWrite'"), p2.slice(0, 140));
  await page.keyboard.press('Control+End');
  await page.locator('.problem-row').first().click();
  await page.waitForTimeout(300);
  check('clicking a problem moves the cursor to its line', (await page.locator('.code-status').innerText()).includes('Ln 1,'));
  await panel.screenshot({ path: path.join(OUT, '03_undeclared.png') });

  // load an example over edited code: confirm appears, then undo brings the edit back
  await page.getByLabel('Load example sketch').selectOption({ index: 2 });
  await page.waitForTimeout(300);
  const dialog = page.getByRole('alertdialog');
  check('loading an example over edited code asks first', await dialog.isVisible());
  await page.screenshot({ path: path.join(OUT, '04_confirm_example.png') });
  await page.getByRole('button', { name: 'Load example' }).click();
  await page.waitForTimeout(600);
  const afterLoad = await editorText();
  check('example replaced the sketch', !afterLoad.includes('blinkOnce'));
  await editor.click();
  await page.keyboard.press('Control+Z');
  await page.waitForTimeout(600);
  check('Ctrl+Z after loading an example brings the edited sketch back', (await editorText()).includes('blinkOnce'));

  // undo history survives switching tabs
  await page.locator('.tab-btn', { hasText: 'Serial' }).click();
  await page.waitForTimeout(300);
  await codeTab.click();
  await page.waitForTimeout(300);
  await editor.click();
  await page.keyboard.press('Control+Y');
  await page.waitForTimeout(500);
  check('redo still works after switching tabs (editor kept mounted)', !(await editorText()).includes('blinkOnce'));

  // persistence across reload
  await paste('// persisted-marker\nvoid setup() {\n  Serial.begin(115200);\n  Serial.println("hello from the saved sketch");\n}\n\nvoid loop() {\n  delay(100);\n}\n');
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await codeTab.click();
  await page.waitForTimeout(600);
  check('the sketch is restored after a reload', (await editorText()).includes('persisted-marker'));
  const serialAfterReload = await page.evaluate(() => document.body.innerText.includes('Restored your last session'));
  await page.locator('.tab-btn', { hasText: 'Serial' }).click();
  await page.waitForTimeout(300);
  check('the serial log says the session was restored', (await page.locator('.right-panel').innerText()).includes('Restored your last session') || serialAfterReload);
  await codeTab.click();

  // run with Ctrl+Enter, stop with Esc
  await editor.click();
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(800);
  check('Ctrl+Enter runs the sketch', (await page.locator('.code-status').innerText()).includes('Running'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  check('Esc in the editor stops it', !(await page.locator('.code-status').innerText()).includes('Running'));

  // runtime fault mapped to its line
  await paste('const int ECHO = 35;\n\nvoid setup() {\n  pinMode(ECHO, OUTPUT);\n}\n\nvoid loop() {\n  delay(10);\n}\n');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(1200);
  const p3 = (await problems.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check('a runtime fault is shown on the sketch line that caused it', p3.includes('Ln 4') && p3.includes('input-only'), p3.slice(0, 140));
  await panel.screenshot({ path: path.join(OUT, '05_runtime_fault.png') });

  // watchdog
  await paste('void setup() {\n}\n\nvoid loop() {\n  while (true) {\n  }\n}\n');
  await page.keyboard.press('Control+Enter');
  const t0 = Date.now();
  let watchdog = '';
  while (Date.now() - t0 < 14000) {
    await page.waitForTimeout(500);
    watchdog = (await problems.innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (watchdog.includes('watchdog')) break;
  }
  check('a loop without delay() is stopped by the watchdog and named by line', watchdog.includes('watchdog') && watchdog.includes('line 5'), watchdog.slice(0, 160));
  const responsive = await page.evaluate(() => new Promise((r) => { const t = performance.now(); setTimeout(() => r(performance.now() - t), 0); }));
  check('the page stayed responsive during the runaway loop', responsive < 200, `${Math.round(responsive)} ms timer delay`);

  // verify button
  await paste('void setup() {\n  pinMode(LED_BUILTIN, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(LED_BUILTIN, HIGH);\n  delay(500);\n  digitalWrite(LED_BUILTIN, LOW);\n  delay(500);\n}\n');
  await page.getByRole('button', { name: 'Verify' }).click();
  await page.waitForTimeout(300);
  check('Verify on a good sketch shows Verified', await page.locator('.pill-ok', { hasText: 'Verified' }).isVisible());

  // autocomplete and hover
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nvoid helper() {\n  Serial.');
  await page.waitForTimeout(700);
  const suggest = await page.locator('.suggest-widget').innerText().catch(() => '');
  check('autocomplete lists Serial members', suggest.includes('println') && suggest.includes('readStringUntil'), suggest.replace(/\s+/g, ' ').slice(0, 120));
  await page.screenshot({ path: path.join(OUT, '06_autocomplete.png') });
  await page.keyboard.press('Escape');
  await page.keyboard.type('println(');
  await page.waitForTimeout(600);
  const hints = await page.locator('.parameter-hints-widget').innerText().catch(() => '');
  check('parameter hints show the signature', hints.includes('Serial.println'), hints.replace(/\s+/g, ' ').slice(0, 120));
  await page.keyboard.press('Escape');
  for (let i = 0; i < 6; i++) await page.keyboard.press('Control+Z');

  // theme and wide mode
  await page.getByLabel('Toggle Light or Dark Theme').click();
  await page.waitForTimeout(600);
  const bg = await page.locator('.code-editor-host .lines-content').evaluate((el) => getComputedStyle(el).backgroundColor);
  check('editor follows the dark theme', bg === 'rgb(13, 20, 36)', bg);
  await page.getByLabel('Widen the editor').click();
  await page.waitForTimeout(600);
  const w = await panel.evaluate((el) => el.getBoundingClientRect().width);
  check('wide mode gives the editor more room', w > 560, `${Math.round(w)} px`);
  await page.screenshot({ path: path.join(OUT, '07_dark_wide.png') });
  await page.getByLabel('Narrow the editor').click();
  await page.getByLabel('Toggle Light or Dark Theme').click();

  // preset change over a modified build asks first; cancel keeps everything
  await page.getByLabel('Starter Preset').selectOption('quad_5in');
  await page.waitForTimeout(300);
  check('changing preset over a modified build asks first', await page.getByRole('alertdialog').isVisible());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('cancel keeps the current build and sketch', (await editorText()).includes('LED_BUILTIN') && (await page.getByLabel('Starter Preset').inputValue()) === 'roboforge_rover');

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
