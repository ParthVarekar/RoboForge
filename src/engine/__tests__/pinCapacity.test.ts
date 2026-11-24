import { describe, expect, it } from 'vitest';
import { STUDIO_PRESETS, createPresetProject } from '../../catalog/presets';
import { analyzeCircuit } from '../circuit';
import { overloadedPins, pinCapacity, pinRefusal } from '../pinCapacity';

describe('one jumper per header pin', () => {
  it('lets a header pin take one wire and a soldered point take several', () => {
    expect(pinCapacity('esp32_devkit', 'GPIO21')).toBe(1);
    expect(pinCapacity('mpu6050', 'SDA')).toBe(1);
    expect(pinCapacity('lcd1602_i2c', 'VCC')).toBe(1);
    expect(pinCapacity('wire_splice', 'J')).toBe(Number.POSITIVE_INFINITY);
    expect(pinCapacity('resistor_10k', 'A')).toBe(Number.POSITIVE_INFINITY);
    expect(pinCapacity('lm2596_buck', 'OUT_POS')).toBe(Number.POSITIVE_INFINITY);
  });

  it('has no preset with two jumpers on one header pin', () => {
    for (const p of STUDIO_PRESETS) expect(overloadedPins(createPresetProject(p.id)), p.id).toEqual([]);
  });

  it('refuses a second jumper on a used header pin, with what to do instead', () => {
    const project = createPresetProject('display_lab');
    const used = pinRefusal(project, { componentId: 'esp32_1', pinId: 'GPIO21' });
    expect(used).toContain('already has a jumper');
    expect(used).toContain('solder splice');
    expect(pinRefusal(project, { componentId: 'esp32_1', pinId: 'GPIO4' })).toBeNull();
    expect(pinRefusal(project, { componentId: 'sp_sda', pinId: 'J' })).toBeNull();
  });

  it('reports an overloaded pin from an older or imported build as an error', () => {
    const project = createPresetProject('display_lab');
    project.wires.push({ id: 'extra', from: { componentId: 'esp32_1', pinId: 'GPIO21' }, to: { componentId: 'lcd_1', pinId: 'SDA' }, color: '#3b82f6', style: 'routed' });
    const analysis = analyzeCircuit(project);
    const bad = analysis.diagnostics.filter((d) => d.id.startsWith('pin-overloaded'));
    expect(bad.map((d) => d.id)).toEqual(['pin-overloaded-esp32_1-GPIO21', 'pin-overloaded-lcd_1-SDA']);
    expect(bad[0]!.severity).toBe('error');
  });

  it('keeps the rover working after the rewiring: sensors, divider, driver, OLED', () => {
    const s = analyzeCircuit(createPresetProject('roboforge_rover')).sensors;
    expect(s.esp32Powered && s.driverPowered && s.mpu6050Ready && s.oledReady && s.hcsr04Ready && s.hcsr04HasDivider).toBe(true);
    expect(s.mpuSdaGpio).toBe(32);
    expect(s.mpuSclGpio).toBe(33);
  });
});
