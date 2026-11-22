import { describe, expect, it } from 'vitest';
import { createPresetProject } from '../../catalog/presets';
import { analyzeCircuit, resolveMotorDrives } from '../circuit';
import { buildRoboForgeBridgeSpec } from '../roboforgeExport';
import { parseStudioProject, serializeStudioProject } from '../../schema/projectSchema';

describe('Circuit analyzer & presets', () => {
  it('validates the full RoboForge 2WD Rover preset with zero critical, error, or warning faults', () => {
    const project = createPresetProject('roboforge_rover');
    const roundTripped = parseStudioProject(JSON.parse(serializeStudioProject(project)));
    const analysis = analyzeCircuit(roundTripped);

    expect(analysis.hasCriticalFault).toBe(false);
    expect(analysis.hasError).toBe(false);
    expect(analysis.diagnostics).toHaveLength(0);
    expect(analysis.sensors.esp32Powered).toBe(true);
    expect(analysis.sensors.driverPowered).toBe(true);
    expect(analysis.sensors.mpu6050Ready).toBe(true);
    expect(analysis.sensors.mpuSdaGpio).toBe(32);
    expect(analysis.sensors.mpuSclGpio).toBe(33);
    expect(analysis.sensors.hcsr04Ready).toBe(true);
    expect(analysis.sensors.hcsr04TrigGpio).toBe(13);
    expect(analysis.sensors.hcsr04EchoGpio).toBe(35);
    expect(analysis.sensors.hcsr04HasDivider).toBe(true);
    expect(analysis.sensors.camPowered).toBe(true);
    expect(analysis.budget.totalMassGrams).toBeGreaterThan(250);
    expect(analysis.budget.estimatedRuntimeMin).toBeGreaterThan(30);
  });

  it('maps GPIO PWM values through DRV8833 to left and right motors accurately', () => {
    const project = createPresetProject('roboforge_rover');
    const analysis = analyzeCircuit(project);
    const pwm = new Map<number, number>([
      [25, 200],
      [26, 0],
      [27, 0],
      [14, 150],
    ]);
    const drives = resolveMotorDrives(analysis, pwm);
    const left = drives.find((d) => d.side === 'left');
    const right = drives.find((d) => d.side === 'right');

    expect(left?.command).toBeCloseTo(200 / 255, 3);
    expect(right?.command).toBeCloseTo(-150 / 255, 3);
  });

  it('catches intentional faults in the Fault Diagnostics Lab preset including swapped right motor polarity', () => {
    const project = createPresetProject('fault_lab');
    const analysis = analyzeCircuit(project);

    const ids = analysis.diagnostics.map((d) => d.id);
    expect(ids.some((id) => id.startsWith('us-echo-5v'))).toBe(true);
    expect(ids.some((id) => id.startsWith('led-no-res'))).toBe(true);
    expect(ids.some((id) => id.startsWith('missing-cap'))).toBe(true);

    const pwm = new Map<number, number>([
      [25, 200],
      [27, 200],
    ]);
    const drives = resolveMotorDrives(analysis, pwm);
    const left = drives.find((d) => d.side === 'left');
    const right = drives.find((d) => d.side === 'right');
    expect(left?.command).toBeGreaterThan(0);
    expect(right?.command).toBeLessThan(0);
  });

  it('flags critical overvoltage when 7.4V battery is wired directly into ESP32 VIN', () => {
    const project = createPresetProject('blank_bench');
    project.wires.push(
      { id: 'bad_v', from: { componentId: 'bat_1', pinId: 'BAT_POS' }, to: { componentId: 'esp32_1', pinId: 'VIN' }, color: '#ef4444' },
      { id: 'gnd', from: { componentId: 'bat_1', pinId: 'GND' }, to: { componentId: 'esp32_1', pinId: 'GND_R' }, color: '#000' },
    );
    const analysis = analyzeCircuit(project);
    expect(analysis.hasCriticalFault).toBe(true);
    expect(analysis.faultyComponentIds.has('esp32_1')).toBe(true);
    expect(analysis.diagnostics.some((d) => d.severity === 'critical' && d.title.includes('Overvoltage'))).toBe(true);
  });

  it('flags direct power-to-ground short as critical', () => {
    const project = createPresetProject('blank_bench');
    project.wires.push({
      id: 'short',
      from: { componentId: 'bat_1', pinId: 'BAT_POS' },
      to: { componentId: 'bat_1', pinId: 'GND' },
      color: '#ef4444',
    });
    const analysis = analyzeCircuit(project);
    expect(analysis.hasCriticalFault).toBe(true);
    expect(analysis.diagnostics.some((d) => d.title.includes('short'))).toBe(true);
  });

  it('flags input-only GPIO35 wired to HC-SR04 TRIG as an error', () => {
    const project = createPresetProject('roboforge_rover');
    const trigWire = project.wires.find((w) => w.id === 'w26');
    expect(trigWire).toBeDefined();
    if (trigWire) {
      trigWire.from.pinId = 'GPIO35';
    }
    const analysis = analyzeCircuit(project);
    expect(analysis.hasError).toBe(true);
    expect(analysis.diagnostics.some((d) => d.id.startsWith('us-trig-input-only'))).toBe(true);
  });

  it('exports a RoboForge bridge specification matching the wired pinout', () => {
    const project = createPresetProject('roboforge_rover');
    const analysis = analyzeCircuit(project);
    const spec = buildRoboForgeBridgeSpec(project, analysis);

    expect(spec.schema).toBe('roboforge-studio-bridge/v1');
    expect(spec.pinMap.leftMotor).toEqual([25, 26]);
    expect(spec.pinMap.rightMotor).toEqual([27, 14]);
    expect(spec.pinMap.mpu6050Sda).toBe(32);
    expect(spec.pinMap.mpu6050Scl).toBe(33);
    expect(spec.pinMap.hcsr04Trig).toBe(13);
    expect(spec.pinMap.hcsr04Echo).toBe(35);
    expect(spec.pinMap.hcsr04HasDivider).toBe(true);
    expect(analysis.sensors.oledReady).toBe(true);
    expect(analysis.budget.totalCostUsd).toBeGreaterThan(30);
    expect(analysis.checklist.every((t) => t.done)).toBe(true);
  });

  it('validates the 5-Inch Freestyle Quadcopter preset with 4 brushless motors, wire cut-lengths, and CoM', () => {
    const quad = createPresetProject('quad_5in');
    const analysis = analyzeCircuit(quad);

    expect(analysis.hasCriticalFault).toBe(false);
    expect(analysis.diagnostics).toHaveLength(0);
    expect(analysis.sensors.fcPowered).toBe(true);
    expect(analysis.motors.filter((m) => m.kind === 'brushless')).toHaveLength(4);
    expect(analysis.checklist.every((t) => t.done)).toBe(true);

    const pwm = new Map<number, number>([
      [25, 140],
      [26, 140],
      [27, 140],
      [14, 140],
    ]);
    const drives = resolveMotorDrives(analysis, pwm);
    expect(drives.every((d) => Math.abs(d.command) > 0.5)).toBe(true);

    const firstWire = quad.wires[0]!;
    const metric = analysis.wireMetrics.get(firstWire.id);
    expect(metric).toBeDefined();
    expect(metric!.routedMm).toBeGreaterThan(15);
    expect(metric!.cutMm).toBeGreaterThanOrEqual(metric!.routedMm + 30);
  });
});
