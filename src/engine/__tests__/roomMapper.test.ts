import { describe, expect, it } from 'vitest';
import { createPresetProject, DEFAULT_ARENA_OBSTACLES } from '../../catalog/presets';
import type { ArenaObstacle } from '../../schema/projectSchema';
import { ArenaPhysicsEngine } from '../arenaPhysics';
import { analyzeCircuit, resolveMotorDrives } from '../circuit';
import { VirtualEsp32Runtime } from '../runtime';

async function runMappedSimulation(
  obstacles: ArenaObstacle[],
  durationMs: number,
  faultsOverride?: ReturnType<typeof createPresetProject>['faults'],
) {
  const project = createPresetProject('room_mapper');
  project.obstacles = obstacles;
  if (faultsOverride) {
    project.faults = faultsOverride;
  }
  const analysis = analyzeCircuit(project);
  const physics = new ArenaPhysicsEngine(analysis.budget.totalMassGrams, obstacles, project.faults);

  let simMs = 0;
  const errors: string[] = [];
  const logs: string[] = [];

  const rt = new VirtualEsp32Runtime({
    isEsp32Powered: () => analysis.sensors.controllerPowered,
    isMpuReady: () => analysis.sensors.mpu6050Ready,
    isOledReady: () => analysis.sensors.oledReady,
    isUltrasonicReady: (t, e) =>
      analysis.sensors.hcsr04Ready &&
      (t < 0 || analysis.sensors.hcsr04TrigGpio === t) &&
      analysis.sensors.hcsr04EchoGpio === e,
    readUltrasonicCm: () => physics.getTelemetry().ultrasonicCm,
    readYawDeg: () => physics.getTelemetry().yawDeg,
    readYawRateDegPerSec: () => physics.getTelemetry().yawRateDegPerSec,
    zeroYaw: () => physics.zeroGyro(),
    onSerial: (entry) => logs.push(entry.text),
    onRuntimeError: (msg) => errors.push(msg),
    clock: {
      nowMs: () => simMs,
      sleep: async (ms, isStopped) => {
        const dtStep = 1000 / 60;
        const steps = Math.max(1, Math.round(ms / dtStep));
        for (let i = 0; i < steps; i += 1) {
          if (isStopped() || simMs >= durationMs) {
            if (simMs >= durationMs) rt.stop();
            return;
          }
          const drives = resolveMotorDrives(analysis, rt.getPinPwmMap());
          const left = drives.find((d) => d.side === 'left')?.command ?? 0;
          const right = drives.find((d) => d.side === 'right')?.command ?? 0;
          physics.step(dtStep / 1000, left, right);
          simMs += dtStep;
          if (i % 4 === 0) await Promise.resolve();
        }
      },
    },
  });

  const started = rt.start(project.code);
  expect(started.ok).toBe(true);
  await rt.waitUntilStopped();

  return {
    telemetry: physics.getTelemetry(),
    grid: physics.getOccupancyGrid(),
    errors,
    logs,
  };
}

describe('Autonomous 360-deg Room Mapper', () => {
  it('explores and maps the default 2-bag 3D Arena with zero collisions', async () => {
    const res = await runMappedSimulation(DEFAULT_ARENA_OBSTACLES, 28_000);
    expect(res.errors).toEqual([]);
    expect(res.telemetry.collisions).toBe(0);
    expect(res.telemetry.pathLengthM).toBeGreaterThan(2.5);
    expect(res.grid.exploredPercent).toBeGreaterThanOrEqual(65);
    expect(res.grid.occupiedCells).toBeGreaterThan(25);
  });

  it('explores and maps a crowded 4-obstacle 3D Arena with zero collisions', async () => {
    const crowded: ArenaObstacle[] = [
      ...DEFAULT_ARENA_OBSTACLES,
      { id: 'crate_1', kind: 'box', label: 'Crate W', position: [-1.05, 0, -0.2], size: [0.35, 0.25, 0.35], color: '#64748b' },
      { id: 'cone_1', kind: 'cone', label: 'Cone E', position: [1.05, 0, 0.3], size: [0.24, 0.34, 0.24], color: '#f97316' },
    ];
    const res = await runMappedSimulation(crowded, 28_000);
    expect(res.errors).toEqual([]);
    expect(res.telemetry.collisions).toBe(0);
    expect(res.telemetry.pathLengthM).toBeGreaterThan(2.0);
    expect(res.grid.exploredPercent).toBeGreaterThanOrEqual(60);
  });

  it('maps >=90% of the 2-bag Arena in 60s even with a 15% weaker right motor and gyro drift with zero collisions', async () => {
    const res = await runMappedSimulation(DEFAULT_ARENA_OBSTACLES, 60_000, {
      leftMotorScale: 1.0,
      rightMotorScale: 0.85,
      minStartPwm: 150,
      gyroDriftDegPerSec: 0.4,
      floorFriction: 0.65,
      usNoiseCm: 0.6,
    });
    expect(res.errors).toEqual([]);
    expect(res.telemetry.collisions).toBe(0);
    expect(res.grid.exploredPercent).toBeGreaterThanOrEqual(90);
  });
});
