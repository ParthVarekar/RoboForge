import { describe, expect, it } from 'vitest';
import { getPartSpec } from '../../catalog/partsCatalog';
import { analyzeCircuit } from '../circuit';
import { assemble, bomCsv, bomMarkdown } from '../design/assemble';
import { offlineTurn } from '../design/offline';
import { parsePlan, type BuildPlan } from '../design/plan';
import { overloadedPins } from '../pinCapacity';
import { transpileArduinoSketch } from '../sketchTranspiler';

const REQUESTS = [
  'a rover that avoids walls and shows the distance on a screen',
  'you pick, a robot car',
  'a rover with a camera, two leds, a button and a gyro, front and back distance',
  'a desk weather station with a 16x2 lcd, two buttons and a light',
  'a bench project with a 20x4 lcd, distance sensor and imu',
  'a bench gadget with two distance sensors, an oled and three leds',
  'fpv drone',
];

function planFor(text: string): BuildPlan {
  const t = offlineTurn(text, null);
  if (!t.plan) throw new Error(`no plan for "${text}": ${t.reply}`);
  return t.plan;
}

describe('design chat without an AI', () => {
  it('asks what kind of build it is when the words do not say', () => {
    const t = offlineTurn('something cool with sensors', null);
    expect(t.plan).toBeNull();
    expect(t.reply).toContain('rover');
  });

  it('reads the platform, the modules and how many', () => {
    const p = planFor('a desk gadget with two buttons, three leds and a 16x2 lcd');
    expect(p.platform).toBe('bench');
    const qty = Object.fromEntries(p.parts.map((x) => [x.kind, x.qty]));
    expect(qty).toMatchObject({ tactile_button: 2, led_5mm: 3, lcd1602_i2c: 1 });
    expect(qty.oled_ssd1306).toBeUndefined();
  });

  it('leaves out what the user rules out, and says what the library does not have', () => {
    const t = offlineTurn('a robot car that measures temperature, without a camera, you pick the rest', null);
    expect(t.plan?.platform).toBe('rover');
    expect(t.plan?.parts.some((p) => p.kind === 'esp32_cam')).toBe(false);
    expect(t.reply).toContain('temperature');
  });

  it('applies edits to a plan in plain words', () => {
    let plan = planFor('a rover with an oled and a distance sensor');
    plan = offlineTurn('add a button', plan).plan!;
    expect(plan.parts.some((p) => p.kind === 'tactile_button')).toBe(true);
    plan = offlineTurn('use a 16x2 lcd instead of the oled', plan).plan!;
    expect(plan.parts.map((p) => p.kind)).toContain('lcd1602_i2c');
    expect(plan.parts.map((p) => p.kind)).not.toContain('oled_ssd1306');
    plan = offlineTurn('remove the distance sensor', plan).plan!;
    expect(plan.parts.some((p) => p.kind === 'hcsr04')).toBe(false);
  });

  it('checks an AI plan: unknown kinds are refused, kinds that do not belong are dropped', () => {
    expect('error' in parsePlan({ title: 'x', platform: 'rover', parts: [{ kind: 'gps_module' }] })).toBe(true);
    const r = parsePlan({ title: 'x', platform: 'rover', parts: [{ kind: 'oled_ssd1306' }, { kind: 'esp32_devkit' }] });
    expect('plan' in r && r.plan.parts.map((p) => p.kind)).toEqual(['oled_ssd1306']);
    expect('dropped' in r && r.dropped[0]?.kind).toBe('esp32_devkit');
  });
});

describe('assembler', () => {
  for (const text of REQUESTS) {
    it(`builds a sound, wired project: "${text}"`, () => {
      const build = assemble(planFor(text));
      const p = build.project;
      const analysis = analyzeCircuit(p);
      expect(analysis.hasCriticalFault).toBe(false);
      expect(analysis.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(overloadedPins(p)).toEqual([]);
      // every id is unique and every wire end is a real pin
      expect(new Set(p.components.map((c) => c.id)).size).toBe(p.components.length);
      for (const w of p.wires) {
        for (const e of [w.from, w.to]) {
          const c = p.components.find((k) => k.id === e.componentId);
          expect(c, `${w.id} -> ${e.componentId}`).toBeDefined();
          expect(getPartSpec(c!.kind).pins.some((pin) => pin.id === e.pinId), `${w.id} ${e.componentId}.${e.pinId}`).toBe(true);
        }
      }
      // the controller is powered and every LED has its resistor; ultrasonic sensors read through a divider
      const s = analysis.sensors;
      expect(s.controllerPowered).toBe(true);
      expect(s.ledPins.every((l) => l.hasSeriesResistor && l.gpio !== null)).toBe(true);
      if (p.components.some((c) => c.kind === 'hcsr04')) expect(s.hcsr04Ready && s.hcsr04HasDivider).toBe(true);
      for (const d of s.i2cDevices) expect(d.powered && d.sdaGpio !== null && d.sclGpio !== null).toBe(true);
      // the starter sketch compiles cleanly
      const tr = transpileArduinoSketch(p.code);
      expect(tr.ok, tr.ok ? '' : tr.message).toBe(true);
      if (tr.ok) expect(tr.warnings).toEqual([]);
      // the parts list counts every part on the bench
      expect(build.bom.reduce((n, b) => n + b.qty, 0)).toBe(p.components.length);
      expect(build.steps.filter((x) => x.type === 'part')).toHaveLength(p.components.length);
      expect(build.steps.filter((x) => x.type === 'wire')).toHaveLength(p.wires.length);
    });
  }

  it('keeps rover parts on the deck and says plainly what did not fit', () => {
    const build = assemble(planFor('a rover with a 16x2 lcd'));
    expect(build.dropped.map((d) => d.kind)).toEqual(['lcd1602_i2c']);
    for (const c of build.project.components) {
      if (c.kind === 'chassis_2wd' || c.kind === 'dc_motor') continue;
      expect(Math.abs(c.position[0]), c.id).toBeLessThanOrEqual(7.2);
      expect(c.position[1]).toBeCloseTo(0.45);
    }
  });

  it('wires the rover like the real one: motors on 25/26/27/14, I2C on 32/33, ECHO on an input-only pin', () => {
    const build = assemble(planFor('a rover with a gyro, an oled and a distance sensor'));
    const s = analyzeCircuit(build.project).sensors;
    expect(s.mpuSdaGpio).toBe(32);
    expect(s.hcsr04EchoGpio).toBe(35);
    expect(s.hcsr04TrigGpio).toBe(13);
    expect(build.project.code).toContain('Wire.begin(32, 33)');
  });

  it('exports the parts list as Markdown and CSV', () => {
    const build = assemble(planFor('a bench project with an oled and a button'));
    expect(bomMarkdown(build)).toContain('| Qty | Part |');
    expect(bomCsv(build).split('\n')[0]).toBe('qty,part,unit_price_usd,mass_g,why');
  });
});
