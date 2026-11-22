import { describe, expect, it } from 'vitest';
import { getArenaTemplate } from '../../catalog/arenaPresets';
import { DEFAULT_ARENA_OBSTACLES, DEFAULT_FAULTS } from '../../catalog/presets';
import { ArenaPhysicsEngine } from '../arenaPhysics';

describe('ArenaPhysicsEngine (cannon-es)', () => {
  it('detects the first demo bag with the 3D ultrasonic raycast from the start pose', () => {
    const engine = new ArenaPhysicsEngine(360, DEFAULT_ARENA_OBSTACLES, {
      ...DEFAULT_FAULTS,
      usNoiseCm: 0,
    });
    const tel = engine.getTelemetry();
    // Rover starts at z=2.2 (sensor at z~2.085), Bag 1 centered at z=0.7 with depth 0.24 (front face at z=0.82) -> ~126.5 cm
    expect(tel.ultrasonicCm).not.toBeNull();
    expect(tel.ultrasonicCm!).toBeGreaterThan(110);
    expect(tel.ultrasonicCm!).toBeLessThan(140);
  });

  it('respects motor deadband PWM (nothing moves below minStartPwm)', () => {
    const engine = new ArenaPhysicsEngine(360, [], {
      ...DEFAULT_FAULTS,
      minStartPwm: 150,
    });
    const startZ = engine.getTelemetry().z;
    for (let i = 0; i < 60; i += 1) {
      engine.step(1 / 60, 120 / 255, 120 / 255);
    }
    expect(Math.abs(engine.getTelemetry().z - startZ)).toBeLessThan(0.005);
  });

  it('reproduces right-pull drift when the right motor is weaker than the left motor', () => {
    const engine = new ArenaPhysicsEngine(360, [], {
      leftMotorScale: 1.0,
      rightMotorScale: 0.8,
      minStartPwm: 100,
      gyroDriftDegPerSec: 0,
      floorFriction: 0.7,
      usNoiseCm: 0,
    });
    for (let i = 0; i < 120; i += 1) {
      engine.step(1 / 60, 0.8, 0.8);
    }
    const tel = engine.getTelemetry();
    // Rover drives toward -Z; weaker right wheel means it pulls clockwise (negative yaw, +X)
    expect(tel.z).toBeLessThan(2.0);
    expect(tel.yawDeg).toBeLessThan(-5);
  });

  it('supports custom arena resizing, wall placement, and dynamic occupancy grid bounds', () => {
    const engine = new ArenaPhysicsEngine(360, [], DEFAULT_FAULTS);
    engine.setArenaConfig({
      environment: 'sandbox_open',
      widthM: 12,
      lengthM: 10,
      wallHeightM: 1.2,
      enclosed: true,
    });
    engine.resetRover();
    engine.setObstacles([
      {
        id: 'w_custom',
        kind: 'wall',
        label: 'Divider Wall',
        position: [0, 0, 1.4],
        size: [2.4, 1.0, 0.14],
        color: '#475569',
        rotationY: 0,
      },
    ]);
    const grid = engine.getOccupancyGrid();
    expect(grid.halfW).toBe(6);
    expect(grid.halfL).toBe(5);
    const tel = engine.step(1 / 60, 0, 0);
    expect(tel.ultrasonicCm).not.toBeNull();
    expect(tel.ultrasonicCm!).toBeLessThan(220);
  });

  it('flies a quadcopter cleanly through an open FPV gate center in the Pine Forest arena', () => {
    const forest = getArenaTemplate('forest_park');
    const engine = new ArenaPhysicsEngine(480, forest.obstacles, DEFAULT_FAULTS, forest.config);
    engine.setVehicleMode('drone');
    engine.resetRover();

    // Climb to ~1.2m and fly forward right through Forest Gate 1 (at z=-0.8)
    for (let i = 0; i < 60; i += 1) {
      engine.stepDrone(1 / 60, { forward: 0, strafe: 0, climb: 0.7, yaw: 0, throttle: 0.7 });
    }
    expect(engine.getTelemetry().altitudeM).toBeGreaterThan(0.8);

    for (let i = 0; i < 220; i += 1) {
      engine.stepDrone(1 / 60, { forward: 0.85, strafe: 0, climb: 0, yaw: 0, throttle: 0.75 });
    }
    const tel = engine.getTelemetry();
    expect(tel.z).toBeLessThan(-1.2);
    expect(tel.collisions).toBe(0);
    expect(tel.bagsPassed).toBeGreaterThanOrEqual(1);
  });
});
