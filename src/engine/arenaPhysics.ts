import * as CANNON from 'cannon-es';
import {
  DEFAULT_ARENA_CONFIG,
  type ArenaConfig,
  type ArenaObstacle,
  type TwinFaultConfig,
  type Vec3,
} from '../schema/projectSchema';

export type ArenaVehicleMode = 'rover' | 'drone';

export interface DroneFlightInput {
  /** Forward/backward pitch command (-1..+1, +1 = forward -Z) */
  forward: number;
  /** Left/right strafe roll command (-1..+1, +1 = right +X) */
  strafe: number;
  /** Vertical climb/descend command (-1..+1, +1 = climb +Y) */
  climb: number;
  /** Yaw turn rate command (-1..+1, +1 = CCW left) */
  yaw: number;
  /** Normalized brushless motor spin speed (0..1) from sketch PWM or manual flight */
  throttle: number;
}

export interface ArenaTelemetry {
  x: number;
  y: number;
  z: number;
  altitudeM: number;
  vehicleMode: ArenaVehicleMode;
  /** Heading in degrees, positive = counter-clockwise (left), matching RoboForge ROVER_API.md */
  yawDeg: number;
  yawRateDegPerSec: number;
  speedMps: number;
  leftWheelCmd: number;
  rightWheelCmd: number;
  propThrottle: number;
  ultrasonicCm: number | null;
  rayOrigin: Vec3;
  rayHit: Vec3 | null;
  collisions: number;
  bagsPassed: number;
  pathLengthM: number;
  trail: Array<[number, number]>;
  exploredPercent: number;
  mappedHitCount: number;
}

export interface OccupancyGridSnapshot {
  cols: number;
  rows: number;
  cellSizeM: number;
  halfW: number;
  halfL: number;
  cells: Uint8Array;
  freeCells: number;
  occupiedCells: number;
  exploredPercent: number;
  mappedPoints: ReadonlyArray<[number, number]>;
}

const ROVER_HALF_EXTENTS = new CANNON.Vec3(0.085, 0.035, 0.105);
const MAX_ULTRASONIC_M = 4.0;
const MAX_WHEEL_SPEED_MPS = 0.55;
const TRACK_WIDTH_M = 0.14;

function normalizeDeg(deg: number): number {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}

/**
 * Deterministic 3D rigid-body physics engine (cannon-es) for the RoboForge Studio Arena.
 * Supports customizable Arena dimensions/walls/environments, 10 obstacle & nature primitives
 * (walls, multi-part trees, fly-through FPV gates, boulders, crates, ramps), 2WD rover dynamics
 * with reality-gap imperfections, 3D quadcopter hover/flight physics, and live 2D SLAM occupancy mapping.
 */
export class ArenaPhysicsEngine {
  private world: CANNON.World;
  private floorBody: CANNON.Body;
  private roverBody: CANNON.Body;
  private groundMaterial: CANNON.Material;
  private roverMaterial: CANNON.Material;
  private contactMat: CANNON.ContactMaterial;
  private perimeterBodies: CANNON.Body[] = [];
  private obstacleBodies = new Map<string, CANNON.Body[]>();
  private obstacles: ArenaObstacle[] = [];
  private arenaConfig: ArenaConfig;
  private faults: TwinFaultConfig;
  private vehicleMode: ArenaVehicleMode = 'rover';

  private halfW = 2.0;
  private halfL = 3.2;
  private gridCellM = 0.1;
  private gridCols = 40;
  private gridRows = 64;

  // Drone 6-DOF flight state (integrated smoothly with cannon-es collision checks)
  private droneYawRad = 0;
  private dronePitchRad = 0;
  private droneRollRad = 0;
  private droneAltTargetM = 0.05;
  private droneThrottle = 0;

  private yawOffsetDeg = 0;
  private accumulatedDriftDeg = 0;
  private lastRawYawDeg = 0;
  private collisions = 0;
  private lastCollisionTime = -1;
  private simTimeSec = 0;
  private pathLengthM = 0;
  private trail: Array<[number, number]> = [];
  private passedBagIds = new Set<string>();

  private gridCells: Uint8Array;
  private mappedPointKeys = new Set<string>();
  private mappedPoints: Array<[number, number]> = [];
  private freeCells = 0;
  private occupiedCells = 0;

  private lastTelemetry: ArenaTelemetry;

  constructor(
    massGrams: number,
    obstacles: ArenaObstacle[],
    faults: TwinFaultConfig,
    arenaConfig: ArenaConfig = DEFAULT_ARENA_CONFIG,
  ) {
    this.faults = { ...faults };
    this.arenaConfig = { ...arenaConfig };
    this.updateGridDimensions();
    this.gridCells = new Uint8Array(this.gridCols * this.gridRows);

    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);

    this.groundMaterial = new CANNON.Material('floor');
    this.roverMaterial = new CANNON.Material('rover');
    this.contactMat = new CANNON.ContactMaterial(this.groundMaterial, this.roverMaterial, {
      friction: 0.0,
      restitution: 0.05,
    });
    this.world.addContactMaterial(this.contactMat);

    this.floorBody = new CANNON.Body({ mass: 0, material: this.groundMaterial });
    this.floorBody.addShape(new CANNON.Plane());
    this.floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(this.floorBody);

    this.rebuildPerimeterWalls();

    const startZ = this.computeStartZ();
    const massKg = Math.max(0.25, Math.min(5.0, massGrams / 1000));
    this.roverBody = new CANNON.Body({
      mass: massKg,
      material: this.roverMaterial,
      position: new CANNON.Vec3(0, 0.04, startZ),
      linearDamping: 0.65,
      angularDamping: 0.85,
    });
    this.roverBody.addShape(new CANNON.Box(ROVER_HALF_EXTENTS));
    this.roverBody.angularFactor.set(0, 1, 0);
    this.roverBody.addEventListener('collide', (ev: { body: CANNON.Body }) => {
      if (ev.body !== this.floorBody && this.simTimeSec - this.lastCollisionTime > 0.45) {
        this.collisions += 1;
        this.lastCollisionTime = this.simTimeSec;
      }
    });
    this.world.addBody(this.roverBody);

    this.setObstacles(obstacles);
    this.trail.push([0, startZ]);
    this.lastTelemetry = this.computeTelemetry(0, 0, false);
  }

  /**
   * Switches physics dynamics between 2WD ground rover mode and 3D hover/flight drone mode.
   */
  public setVehicleMode(mode: ArenaVehicleMode): void {
    if (this.vehicleMode === mode) return;
    this.vehicleMode = mode;
    if (mode === 'drone') {
      this.world.gravity.set(0, 0, 0);
      this.roverBody.linearDamping = 0.72;
      this.roverBody.angularDamping = 0.92;
      this.droneAltTargetM = Math.max(0.08, this.roverBody.position.y);
    } else {
      this.world.gravity.set(0, -9.81, 0);
      this.roverBody.linearDamping = 0.65;
      this.roverBody.angularDamping = 0.85;
      this.roverBody.position.y = 0.04;
      this.dronePitchRad = 0;
      this.droneRollRad = 0;
    }
  }

  /**
   * Updates the Arena dimensions, wall height, and enclosure setting, rebuilding perimeter walls and occupancy grid.
   */
  public setArenaConfig(config: ArenaConfig): void {
    const dimsChanged =
      Math.abs(config.widthM - this.arenaConfig.widthM) > 0.01 ||
      Math.abs(config.lengthM - this.arenaConfig.lengthM) > 0.01;
    const wallsChanged =
      dimsChanged ||
      config.enclosed !== this.arenaConfig.enclosed ||
      Math.abs(config.wallHeightM - this.arenaConfig.wallHeightM) > 0.01;

    this.arenaConfig = { ...config };
    if (dimsChanged) {
      this.updateGridDimensions();
      this.gridCells = new Uint8Array(this.gridCols * this.gridRows);
      this.clearMap();
      // Keep vehicle inside resized bounds
      const maxX = Math.max(0.4, this.halfW - 0.3);
      const maxZ = Math.max(0.4, this.halfL - 0.3);
      this.roverBody.position.x = Math.max(-maxX, Math.min(maxX, this.roverBody.position.x));
      this.roverBody.position.z = Math.max(-maxZ, Math.min(maxZ, this.roverBody.position.z));
    }
    if (wallsChanged) {
      this.rebuildPerimeterWalls();
    }
  }

  /**
   * Returns the active ArenaConfig.
   */
  public getArenaConfig(): ArenaConfig {
    return this.arenaConfig;
  }

  /**
   * Updates the reality-gap fault parameters (motor gain, deadband, drift, friction).
   */
  public setFaults(faults: TwinFaultConfig): void {
    this.faults = { ...faults };
  }

  /**
   * Replaces all obstacles in the physics world (including rotated walls, trees, and open-center FPV gates).
   */
  public setObstacles(obstacles: ArenaObstacle[]): void {
    for (const list of this.obstacleBodies.values()) {
      for (const b of list) this.world.removeBody(b);
    }
    this.obstacleBodies.clear();
    this.obstacles = obstacles;

    for (const obs of obstacles) {
      const [sx, sy, sz] = obs.size;
      const rotY = obs.rotationY ?? 0;
      const bodies: CANNON.Body[] = [];

      if (obs.kind === 'gate') {
        // 3-part open archway frame so drones & rovers pass cleanly through the center!
        const postW = Math.max(0.12, Math.min(0.24, sx * 0.1));
        const halfSpan = Math.max(0.3, sx / 2 - postW / 2);
        const depth = Math.max(0.14, sz);
        const cos = Math.cos(rotY);
        const sin = Math.sin(rotY);

        for (const side of [-1, 1]) {
          const lx = side * halfSpan;
          const b = new CANNON.Body({
            mass: 0,
            position: new CANNON.Vec3(
              obs.position[0] + lx * cos,
              obs.position[1] + sy / 2,
              obs.position[2] - lx * sin,
            ),
          });
          b.addShape(new CANNON.Box(new CANNON.Vec3(postW / 2, sy / 2, depth / 2)));
          b.quaternion.setFromEuler(0, rotY, 0);
          bodies.push(b);
        }
        // Top crossbar
        const topBar = new CANNON.Body({
          mass: 0,
          position: new CANNON.Vec3(obs.position[0], obs.position[1] + sy - postW / 2, obs.position[2]),
        });
        topBar.addShape(new CANNON.Box(new CANNON.Vec3(sx / 2, postW / 2, depth / 2)));
        topBar.quaternion.setFromEuler(0, rotY, 0);
        bodies.push(topBar);
      } else if (obs.kind === 'tree') {
        // Trunk collider + elevated foliage canopy collider
        const trunkR = Math.max(0.12, sx * 0.13);
        const trunkH = sy * 0.48;
        const trunk = new CANNON.Body({
          mass: 0,
          position: new CANNON.Vec3(obs.position[0], obs.position[1] + trunkH / 2, obs.position[2]),
        });
        trunk.addShape(new CANNON.Cylinder(trunkR * 0.85, trunkR, trunkH, 10));
        bodies.push(trunk);

        const crownR = Math.max(0.35, sx * 0.36);
        const crownH = sy * 0.56;
        const crown = new CANNON.Body({
          mass: 0,
          position: new CANNON.Vec3(obs.position[0], obs.position[1] + sy * 0.66, obs.position[2]),
        });
        crown.addShape(new CANNON.Cylinder(crownR * 0.18, crownR, crownH, 10));
        bodies.push(crown);
      } else if (obs.kind === 'sphere') {
        const radius = Math.max(0.14, Math.min(sx, sy, sz) * 0.5);
        const b = new CANNON.Body({
          mass: 0,
          position: new CANNON.Vec3(obs.position[0], obs.position[1] + radius, obs.position[2]),
        });
        b.addShape(new CANNON.Sphere(radius));
        bodies.push(b);
      } else if (obs.kind === 'pillar' || obs.kind === 'cylinder') {
        const r = Math.max(0.1, sx * 0.5);
        const b = new CANNON.Body({
          mass: 0,
          position: new CANNON.Vec3(obs.position[0], obs.position[1] + sy / 2, obs.position[2]),
        });
        b.addShape(new CANNON.Cylinder(r, r, sy, 12));
        bodies.push(b);
      } else {
        const body = new CANNON.Body({
          mass: 0,
          position: new CANNON.Vec3(obs.position[0], obs.position[1] + sy / 2, obs.position[2]),
        });
        body.addShape(new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2)));
        if (obs.kind === 'ramp') {
          body.quaternion.setFromEuler(0.18, rotY, 0);
        } else {
          body.quaternion.setFromEuler(0, rotY, 0);
        }
        bodies.push(body);
      }

      for (const b of bodies) this.world.addBody(b);
      this.obstacleBodies.set(obs.id, bodies);
    }
  }

  /**
   * Clears only the accumulated 2D occupancy map and 3D ultrasonic scan hit points.
   */
  public clearMap(): void {
    this.gridCells.fill(0);
    this.mappedPointKeys.clear();
    this.mappedPoints = [];
    this.freeCells = 0;
    this.occupiedCells = 0;
  }

  /**
   * Resets the rover or drone back to the centerline start pose and clears recorded telemetry & map state.
   */
  public resetRover(): void {
    const startZ = this.computeStartZ();
    this.roverBody.position.set(0, this.vehicleMode === 'drone' ? 0.08 : 0.04, startZ);
    this.roverBody.velocity.set(0, 0, 0);
    this.roverBody.angularVelocity.set(0, 0, 0);
    this.roverBody.quaternion.set(0, 0, 0, 1);
    this.droneYawRad = 0;
    this.dronePitchRad = 0;
    this.droneRollRad = 0;
    this.droneAltTargetM = 0.08;
    this.droneThrottle = 0;
    this.yawOffsetDeg = 0;
    this.accumulatedDriftDeg = 0;
    this.lastRawYawDeg = 0;
    this.collisions = 0;
    this.lastCollisionTime = -1;
    this.simTimeSec = 0;
    this.pathLengthM = 0;
    this.passedBagIds.clear();
    this.trail = [[0, startZ]];
    this.clearMap();
    this.lastTelemetry = this.computeTelemetry(0, 0, false);
  }

  /**
   * Zeroes the simulated MPU6050 gyro yaw reference at the vehicle's current orientation.
   */
  public zeroGyro(): void {
    this.yawOffsetDeg = this.extractTrueYawDeg();
    this.accumulatedDriftDeg = 0;
  }

  /**
   * Steps 2WD rover physics forward by `dt` seconds given normalized left/right motor inputs (-1..+1).
   */
  public step(dt: number, leftCmd: number, rightCmd: number): ArenaTelemetry {
    const safeDt = Math.max(0.001, Math.min(0.05, dt));
    const effLeft = this.applyMotorImperfections(leftCmd, this.faults.leftMotorScale);
    const effRight = this.applyMotorImperfections(rightCmd, this.faults.rightMotorScale);

    const forward = new CANNON.Vec3(0, 0, -1);
    this.roverBody.quaternion.vmult(forward, forward);

    const vTarget = (effLeft + effRight) * 0.5 * MAX_WHEEL_SPEED_MPS;
    const omegaTarget = ((effRight - effLeft) * MAX_WHEEL_SPEED_MPS) / TRACK_WIDTH_M;

    const traction = Math.min(1.2, Math.max(0.15, this.faults.floorFriction / 0.65));
    const gainV = 10 * traction;
    const gainW = 12 * traction;

    const currentForwardV = this.roverBody.velocity.dot(forward);
    const accelF = (vTarget - currentForwardV) * gainV * this.roverBody.mass;
    this.roverBody.force.vadd(forward.scale(accelF), this.roverBody.force);

    const rightVec = new CANNON.Vec3(1, 0, 0);
    this.roverBody.quaternion.vmult(rightVec, rightVec);
    const lateralV = this.roverBody.velocity.dot(rightVec);
    this.roverBody.force.vadd(rightVec.scale(-lateralV * 16 * traction * this.roverBody.mass), this.roverBody.force);

    const inertiaY = Math.max(0.002, this.roverBody.inertia.y);
    const torqueY = (omegaTarget - this.roverBody.angularVelocity.y) * gainW * inertiaY;
    this.roverBody.torque.y += torqueY;

    const prevX = this.roverBody.position.x;
    const prevZ = this.roverBody.position.z;

    this.world.step(safeDt);
    this.clampWithinArenaBounds();
    this.simTimeSec += safeDt;
    this.accumulatedDriftDeg += this.faults.gyroDriftDegPerSec * safeDt;

    this.updatePathAndBags(prevX, prevZ);
    this.lastTelemetry = this.computeTelemetry(effLeft, effRight, true);
    return this.lastTelemetry;
  }

  /**
   * Steps 3D quadcopter hover/flight physics forward by `dt` seconds with smooth attitude banking
   * and rigid-body obstacle collisions against trees, walls, and FPV gates.
   */
  public stepDrone(dt: number, input: DroneFlightInput): ArenaTelemetry {
    const safeDt = Math.max(0.001, Math.min(0.05, dt));
    const hasFlightInput =
      Math.abs(input.forward) > 0.02 ||
      Math.abs(input.strafe) > 0.02 ||
      Math.abs(input.climb) > 0.02 ||
      Math.abs(input.yaw) > 0.02;
    const activeThrottle = Math.max(input.throttle, hasFlightInput ? 0.65 : 0);
    this.droneThrottle = activeThrottle;

    // Auto-lift to hover altitude (1.1 m) when flying forward/strafing or when sketch ESCs spin above 30%
    if (Math.abs(input.climb) > 0.02) {
      this.droneAltTargetM = Math.max(0.08, Math.min(6.5, this.droneAltTargetM + input.climb * 2.2 * safeDt));
    } else if (hasFlightInput && this.droneAltTargetM < 1.0) {
      this.droneAltTargetM = Math.min(1.15, this.droneAltTargetM + 1.8 * safeDt);
    } else if (input.throttle > 0.3 && this.droneAltTargetM < 1.2) {
      this.droneAltTargetM = Math.min(1.3, 0.25 + input.throttle * 1.45);
    } else if (activeThrottle < 0.05) {
      this.droneAltTargetM = Math.max(0.08, this.droneAltTargetM - 1.2 * safeDt);
    }

    const airborne = this.roverBody.position.y > 0.16 || this.droneAltTargetM > 0.16;
    if (airborne) {
      this.droneYawRad += input.yaw * 2.1 * safeDt;
    }

    const sinY = Math.sin(this.droneYawRad);
    const cosY = Math.cos(this.droneYawRad);
    const maxSpeed = 3.2;
    const vxTarget = airborne ? (-sinY * input.forward + cosY * input.strafe) * maxSpeed : 0;
    const vzTarget = airborne ? (-cosY * input.forward - sinY * input.strafe) * maxSpeed : 0;
    const vyTarget = (this.droneAltTargetM - this.roverBody.position.y) * 4.5;

    const kVel = 6.5 * this.roverBody.mass;
    this.roverBody.force.set(
      (vxTarget - this.roverBody.velocity.x) * kVel,
      (vyTarget - this.roverBody.velocity.y) * kVel * 1.2,
      (vzTarget - this.roverBody.velocity.z) * kVel,
    );

    // Smooth visual banking tilt
    const targetPitch = airborne ? -input.forward * 0.26 : 0;
    const targetRoll = airborne ? -input.strafe * 0.26 : 0;
    this.dronePitchRad += (targetPitch - this.dronePitchRad) * Math.min(1, safeDt * 9);
    this.droneRollRad += (targetRoll - this.droneRollRad) * Math.min(1, safeDt * 9);

    const qYaw = new CANNON.Quaternion();
    qYaw.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), this.droneYawRad);
    const qPitch = new CANNON.Quaternion();
    qPitch.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), this.dronePitchRad);
    const qRoll = new CANNON.Quaternion();
    qRoll.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), this.droneRollRad);
    this.roverBody.quaternion.copy(qYaw.mult(qPitch).mult(qRoll));
    this.roverBody.angularVelocity.set(0, 0, 0);

    const prevX = this.roverBody.position.x;
    const prevZ = this.roverBody.position.z;

    this.world.step(safeDt);
    if (this.roverBody.position.y < 0.08) {
      this.roverBody.position.y = 0.08;
      if (this.roverBody.velocity.y < 0) this.roverBody.velocity.y = 0;
    }
    this.clampWithinArenaBounds();
    this.simTimeSec += safeDt;
    this.accumulatedDriftDeg += this.faults.gyroDriftDegPerSec * safeDt;

    this.updatePathAndBags(prevX, prevZ);
    this.lastTelemetry = this.computeTelemetry(activeThrottle, activeThrottle, true);
    return this.lastTelemetry;
  }

  /**
   * Returns the latest telemetry snapshot without advancing simulation time.
   */
  public getTelemetry(): ArenaTelemetry {
    return this.lastTelemetry;
  }

  /**
   * Returns the live 2D occupancy grid built solely from simulated HC-SR04 / rangefinder raycasts.
   */
  public getOccupancyGrid(): OccupancyGridSnapshot {
    const explored = this.freeCells + this.occupiedCells;
    return {
      cols: this.gridCols,
      rows: this.gridRows,
      cellSizeM: this.gridCellM,
      halfW: this.halfW,
      halfL: this.halfL,
      cells: this.gridCells,
      freeCells: this.freeCells,
      occupiedCells: this.occupiedCells,
      exploredPercent: Math.round((explored / Math.max(1, this.gridCols * this.gridRows)) * 100),
      mappedPoints: this.mappedPoints,
    };
  }

  /**
   * Returns the current vehicle rigid-body position and quaternion for 3D rendering.
   */
  public getRoverPose(): { position: Vec3; quaternion: [number, number, number, number] } {
    const p = this.roverBody.position;
    const q = this.roverBody.quaternion;
    return {
      position: [p.x, p.y, p.z],
      quaternion: [q.x, q.y, q.z, q.w],
    };
  }

  private computeStartZ(): number {
    if (Math.abs(this.arenaConfig.lengthM - 6.4) < 0.05 && Math.abs(this.arenaConfig.widthM - 4.0) < 0.05) {
      return 2.2; // Exact classic RoboForge Lab start position
    }
    return Number(Math.min(this.halfL * 0.62, Math.max(0.8, this.halfL - 1.4)).toFixed(2));
  }

  private updateGridDimensions(): void {
    this.halfW = this.arenaConfig.widthM / 2;
    this.halfL = this.arenaConfig.lengthM / 2;
    const maxDim = Math.max(this.arenaConfig.widthM, this.arenaConfig.lengthM);
    this.gridCellM = maxDim <= 8 ? 0.1 : maxDim <= 14 ? 0.2 : 0.3;
    this.gridCols = Math.max(10, Math.round(this.arenaConfig.widthM / this.gridCellM));
    this.gridRows = Math.max(10, Math.round(this.arenaConfig.lengthM / this.gridCellM));
  }

  private clampWithinArenaBounds(): void {
    const margin = 0.22;
    const maxX = Math.max(0.4, this.halfW - margin);
    const maxZ = Math.max(0.4, this.halfL - margin);
    if (this.roverBody.position.x > maxX) {
      this.roverBody.position.x = maxX;
      this.roverBody.velocity.x = Math.min(0, this.roverBody.velocity.x);
    } else if (this.roverBody.position.x < -maxX) {
      this.roverBody.position.x = -maxX;
      this.roverBody.velocity.x = Math.max(0, this.roverBody.velocity.x);
    }
    if (this.roverBody.position.z > maxZ) {
      this.roverBody.position.z = maxZ;
      this.roverBody.velocity.z = Math.min(0, this.roverBody.velocity.z);
    } else if (this.roverBody.position.z < -maxZ) {
      this.roverBody.position.z = -maxZ;
      this.roverBody.velocity.z = Math.max(0, this.roverBody.velocity.z);
    }
  }

  private updatePathAndBags(prevX: number, prevZ: number): void {
    const dx = this.roverBody.position.x - prevX;
    const dz = this.roverBody.position.z - prevZ;
    this.pathLengthM += Math.hypot(dx, dz);

    const lastPt = this.trail[this.trail.length - 1];
    if (!lastPt || Math.hypot(this.roverBody.position.x - lastPt[0], this.roverBody.position.z - lastPt[1]) > 0.04) {
      this.trail.push([this.roverBody.position.x, this.roverBody.position.z]);
      if (this.trail.length > 900) this.trail.shift();
    }

    for (const obs of this.obstacles) {
      if ((obs.kind === 'bag' || obs.kind === 'gate') && this.roverBody.position.z < obs.position[2] - 0.25) {
        this.passedBagIds.add(obs.id);
      }
    }
  }

  private applyMotorImperfections(rawCmd: number, gainScale: number): number {
    const clamped = Math.max(-1, Math.min(1, rawCmd));
    const pwm = Math.abs(clamped) * 255;
    if (pwm < this.faults.minStartPwm) {
      return 0;
    }
    const span = Math.max(1, 255 - this.faults.minStartPwm);
    const activeFrac = (pwm - this.faults.minStartPwm) / span;
    const effective = 0.25 + 0.75 * activeFrac;
    return Math.sign(clamped) * effective * gainScale;
  }

  private extractTrueYawDeg(): number {
    const forward = new CANNON.Vec3(0, 0, -1);
    this.roverBody.quaternion.vmult(forward, forward);
    return (Math.atan2(-forward.x, -forward.z) * 180) / Math.PI;
  }

  private markGridCell(wx: number, wz: number, value: 1 | 2): void {
    const col = Math.floor((wx + this.halfW) / this.gridCellM);
    const row = Math.floor((wz + this.halfL) / this.gridCellM);
    if (col < 0 || col >= this.gridCols || row < 0 || row >= this.gridRows) return;
    const idx = row * this.gridCols + col;
    const prev = this.gridCells[idx] ?? 0;
    if (prev === value) return;
    if (prev === 2 && value === 1) return;
    if (prev === 0 && value === 1) this.freeCells += 1;
    else if (prev === 0 && value === 2) this.occupiedCells += 1;
    else if (prev === 1 && value === 2) {
      this.freeCells -= 1;
      this.occupiedCells += 1;
    }
    this.gridCells[idx] = value;
  }

  private recordRayIntoMap(
    origin: CANNON.Vec3,
    dir: CANNON.Vec3,
    hitDist: number | null,
    hitPt: CANNON.Vec3 | null,
  ): void {
    for (let dx = -this.gridCellM; dx <= this.gridCellM; dx += this.gridCellM) {
      for (let dz = -this.gridCellM; dz <= this.gridCellM; dz += this.gridCellM) {
        this.markGridCell(this.roverBody.position.x + dx, this.roverBody.position.z + dz, 1);
      }
    }

    const freeReach = hitDist !== null ? Math.max(0, hitDist - 0.07) : 2.6;
    const stepM = Math.max(0.07, this.gridCellM * 0.7);
    for (let d = 0; d <= freeReach; d += stepM) {
      this.markGridCell(origin.x + dir.x * d, origin.z + dir.z * d, 1);
    }

    if (hitPt && hitDist !== null && hitDist <= MAX_ULTRASONIC_M) {
      this.markGridCell(hitPt.x, hitPt.z, 2);
      const qx = Number((Math.round(hitPt.x / 0.06) * 0.06).toFixed(2));
      const qz = Number((Math.round(hitPt.z / 0.06) * 0.06).toFixed(2));
      const key = `${qx},${qz}`;
      if (!this.mappedPointKeys.has(key) && this.mappedPoints.length < 1500) {
        this.mappedPointKeys.add(key);
        this.mappedPoints.push([qx, qz]);
      }
    }
  }

  private castUltrasonic(updateMap: boolean): { distanceCm: number | null; origin: Vec3; hit: Vec3 | null } {
    const forward = new CANNON.Vec3(0, 0, -1);
    this.roverBody.quaternion.vmult(forward, forward);
    // Keep horizontal rangefinder beam level even when drone banks
    forward.y = 0;
    if (forward.length() < 0.01) forward.set(0, 0, -1);
    forward.normalize();

    const origin = this.roverBody.position.vadd(forward.scale(0.115));
    origin.y = Math.max(0.09, this.roverBody.position.y + 0.05);

    let bestDist = MAX_ULTRASONIC_M + 1;
    let bestHit: CANNON.Vec3 | null = null;
    let bestDir: CANNON.Vec3 = forward;
    const coneAnglesRad = [0, -0.09, 0.09];

    for (const angle of coneAnglesRad) {
      const dir = forward.clone();
      const rot = new CANNON.Quaternion();
      rot.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), angle);
      rot.vmult(dir, dir);

      const to = origin.vadd(dir.scale(MAX_ULTRASONIC_M));
      const result = new CANNON.RaycastResult();
      const ray = new CANNON.Ray(origin, to);
      ray.intersectWorld(this.world, {
        mode: CANNON.Ray.CLOSEST,
        result,
        skipBackfaces: true,
      });

      const hitDistance = result.hasHit && result.body !== this.roverBody ? result.distance : null;
      const hitPoint = hitDistance !== null ? result.hitPointWorld.clone() : null;

      if (updateMap && angle === 0) {
        this.recordRayIntoMap(origin, dir, hitDistance, hitPoint);
      }

      if (hitDistance !== null && hitPoint && hitDistance < bestDist) {
        bestDist = hitDistance;
        bestHit = hitPoint;
        bestDir = dir;
      }
    }

    if (updateMap && bestHit) {
      this.recordRayIntoMap(origin, bestDir, bestDist, bestHit);
    }

    const originArr: Vec3 = [origin.x, origin.y, origin.z];
    if (!bestHit || bestDist > MAX_ULTRASONIC_M) {
      return { distanceCm: null, origin: originArr, hit: null };
    }
    const noise =
      this.faults.usNoiseCm > 0 ? Math.sin(this.simTimeSec * 29.3) * this.faults.usNoiseCm * 0.5 : 0;
    const cm = Math.max(2, bestDist * 100 + noise);
    return {
      distanceCm: Number(cm.toFixed(1)),
      origin: originArr,
      hit: [bestHit.x, bestHit.y, bestHit.z],
    };
  }

  private computeTelemetry(leftCmd: number, rightCmd: number, updateMap: boolean): ArenaTelemetry {
    const rawYaw = this.extractTrueYawDeg();
    const yawDeg = normalizeDeg(rawYaw - this.yawOffsetDeg + this.accumulatedDriftDeg);
    this.lastRawYawDeg = rawYaw;
    const yawRateDegPerSec = (this.roverBody.angularVelocity.y * 180) / Math.PI + this.faults.gyroDriftDegPerSec;
    const speedMps = Math.hypot(this.roverBody.velocity.x, this.roverBody.velocity.z);
    const us = this.castUltrasonic(updateMap);
    const explored = this.freeCells + this.occupiedCells;

    return {
      x: Number(this.roverBody.position.x.toFixed(3)),
      y: Number(this.roverBody.position.y.toFixed(3)),
      z: Number(this.roverBody.position.z.toFixed(3)),
      altitudeM: Number(Math.max(0, this.roverBody.position.y - 0.04).toFixed(2)),
      vehicleMode: this.vehicleMode,
      yawDeg: Number(yawDeg.toFixed(1)),
      yawRateDegPerSec: Number(yawRateDegPerSec.toFixed(1)),
      speedMps: Number(speedMps.toFixed(2)),
      leftWheelCmd: Number(leftCmd.toFixed(2)),
      rightWheelCmd: Number(rightCmd.toFixed(2)),
      propThrottle: Number(this.droneThrottle.toFixed(2)),
      ultrasonicCm: us.distanceCm,
      rayOrigin: us.origin,
      rayHit: us.hit,
      collisions: this.collisions,
      bagsPassed: this.passedBagIds.size,
      pathLengthM: Number(this.pathLengthM.toFixed(2)),
      trail: this.trail,
      exploredPercent: Math.round((explored / Math.max(1, this.gridCols * this.gridRows)) * 100),
      mappedHitCount: this.mappedPoints.length,
    };
  }

  private rebuildPerimeterWalls(): void {
    for (const b of this.perimeterBodies) {
      this.world.removeBody(b);
    }
    this.perimeterBodies = [];

    if (!this.arenaConfig.enclosed || this.arenaConfig.wallHeightM <= 0.02) {
      return;
    }

    const halfH = Math.max(0.18, this.arenaConfig.wallHeightM / 2);
    const wallSpecs: Array<{ pos: Vec3; half: Vec3 }> = [
      { pos: [0, halfH, -this.halfL], half: [this.halfW, halfH, 0.06] },
      { pos: [0, halfH, this.halfL], half: [this.halfW, halfH, 0.06] },
      { pos: [-this.halfW, halfH, 0], half: [0.06, halfH, this.halfL] },
      { pos: [this.halfW, halfH, 0], half: [0.06, halfH, this.halfL] },
    ];
    for (const w of wallSpecs) {
      const b = new CANNON.Body({ mass: 0, position: new CANNON.Vec3(...w.pos) });
      b.addShape(new CANNON.Box(new CANNON.Vec3(...w.half)));
      this.world.addBody(b);
      this.perimeterBodies.push(b);
    }
  }

  /** Returns the raw world yaw before zero offset (useful for diagnostics). */
  public getRawYawDeg(): number {
    return this.lastRawYawDeg;
  }
}
