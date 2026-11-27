import { describe, expect, it } from 'vitest';
import { PARTS_CATALOG } from '../../catalog/partsCatalog';
import { EXTRA_PARTS } from '../../catalog/partsCatalogExtra';
import { createPresetProject } from '../../catalog/presets';
import { ComponentKindSchema, type ComponentKind, type StudioProject } from '../../schema/projectSchema';
import { PART_BUILDERS } from '../../viewport/parts';
import { analyzeCircuit } from '../circuit';
import { pinCapacity } from '../pinCapacity';

type End = readonly [string, string];

/** A bench with the given parts and wires (wires as [componentId, pinId] pairs). */
function bench(parts: ReadonlyArray<readonly [string, ComponentKind]>, wires: ReadonlyArray<readonly [End, End]>): StudioProject {
  const project = createPresetProject('blank_bench');
  project.components = parts.map(([id, kind], i) => ({ id, kind, label: id, position: [i * 12, 0, 0], rotationY: 0 }));
  project.wires = wires.map(([a, b], i) => ({
    id: `w${i}`,
    from: { componentId: a[0], pinId: a[1] },
    to: { componentId: b[0], pinId: b[1] },
    color: '#3b82f6',
    style: 'routed',
  }));
  return project;
}

describe('extended parts library', () => {
  it('has a catalog entry and a 3D builder for every part kind', () => {
    for (const kind of ComponentKindSchema.options) {
      expect(PARTS_CATALOG[kind], kind).toBeDefined();
      expect(typeof PART_BUILDERS[kind], kind).toBe('function');
    }
    expect(Object.keys(EXTRA_PARTS).length).toBeGreaterThanOrEqual(35);
  });

  it('gives every part unique pins with labels, inside (or just outside) its footprint', () => {
    for (const [kind, spec] of Object.entries(PARTS_CATALOG)) {
      const ids = spec.pins.map((p) => p.id);
      expect(new Set(ids).size, `${kind} pin ids`).toBe(ids.length);
      const [sx, sy, sz] = spec.sizeCm;
      for (const pin of spec.pins) {
        expect(pin.label.length, `${kind}.${pin.id} label`).toBeGreaterThan(0);
        const [x, y, z] = pin.localPos;
        expect([x, y, z].every(Number.isFinite), `${kind}.${pin.id} position`).toBe(true);
        // new parts: leads and adapters may stick out of the body a little, nothing far away (the older battery
        // packs have long leads on purpose)
        if (!(kind in EXTRA_PARTS)) continue;
        expect(Math.abs(x), `${kind}.${pin.id} x`).toBeLessThanOrEqual(sx / 2 + 2.5);
        expect(Math.abs(z), `${kind}.${pin.id} z`).toBeLessThanOrEqual(sz / 2 + 2.5);
        expect(y, `${kind}.${pin.id} y`).toBeGreaterThanOrEqual(0);
        expect(y, `${kind}.${pin.id} y`).toBeLessThanOrEqual(sy + 1.5);
      }
      for (const group of spec.internal ?? []) for (const id of group) expect(ids, `${kind} internal link ${id}`).toContain(id);
    }
  });

  it('treats module header pins as one-jumper pins and soldered pads and leads as multi-wire points', () => {
    expect(pinCapacity('arduino_nano', 'D13')).toBe(1);
    expect(pinCapacity('l298n', 'IN1')).toBe(1);
    expect(pinCapacity('l298n', 'OUT1')).toBe(Number.POSITIVE_INFINITY);
    expect(pinCapacity('tp4056_charger', 'B_POS')).toBe(Number.POSITIVE_INFINITY);
    expect(pinCapacity('servo_sg90', 'SIG')).toBe(1);
  });

  it('flags 4.8 V on a 3.3 V-only sensor, also through the power switch, and not behind the 3.3 V regulator', () => {
    const direct = bench(
      [
        ['bat', 'battery_4aa'],
        ['bme', 'bme280'],
      ],
      [
        [['bat', 'BAT_POS'], ['bme', 'VIN']],
        [['bat', 'GND'], ['bme', 'GND']],
      ],
    );
    expect(analyzeCircuit(direct).diagnostics.some((d) => d.id === 'overvolt-bme-VIN' && d.severity === 'critical')).toBe(true);

    const switched = bench(
      [
        ['bat', 'battery_4aa'],
        ['sw', 'rocker_switch'],
        ['bme', 'bme280'],
      ],
      [
        [['bat', 'BAT_POS'], ['sw', 'IN']],
        [['sw', 'OUT'], ['bme', 'VIN']],
        [['bat', 'GND'], ['bme', 'GND']],
      ],
    );
    expect(analyzeCircuit(switched).diagnostics.some((d) => d.id === 'overvolt-bme-VIN')).toBe(true);

    const regulated = bench(
      [
        ['bat', 'battery_4aa'],
        ['reg', 'ams1117_3v3'],
        ['bme', 'bme280'],
      ],
      [
        [['bat', 'BAT_POS'], ['reg', 'VIN']],
        [['bat', 'GND'], ['reg', 'GND']],
        [['reg', 'VOUT'], ['bme', 'VIN']],
        [['reg', 'GND'], ['bme', 'GND']],
      ],
    );
    expect(analyzeCircuit(regulated).diagnostics.filter((d) => d.id.startsWith('overvolt'))).toEqual([]);
  });

  it('counts the AA pack in the run-time estimate and does not count a regulator as a load', () => {
    const project = bench(
      [
        ['bat', 'battery_4aa'],
        ['reg', 'ams1117_3v3'],
        ['gps', 'gps_neo6m'],
      ],
      [
        [['bat', 'BAT_POS'], ['reg', 'VIN']],
        [['bat', 'GND'], ['reg', 'GND']],
        [['reg', 'VOUT'], ['gps', 'VCC']],
        [['reg', 'GND'], ['gps', 'GND']],
      ],
    );
    const { budget } = analyzeCircuit(project);
    expect(budget.estimatedRuntimeMin).not.toBeNull();
    // 2000 mAh at 85 % over the GPS alone (45-67 mA): roughly 25-40 hours, not cut short by the regulator's 800 mA
    expect(budget.estimatedRuntimeMin!).toBeGreaterThan(20 * 60);
  });
});
