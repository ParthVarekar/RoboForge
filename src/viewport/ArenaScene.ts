import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { getArenaElementSpec } from '../catalog/arenaPresets';
import type { ArenaTelemetry, ArenaVehicleMode } from '../engine/arenaPhysics';
import {
  DEFAULT_ARENA_CONFIG,
  type ArenaConfig,
  type ArenaObstacle,
  type ArenaObstacleKind,
  type Vec3,
} from '../schema/projectSchema';
import { buildArenaDroneModel, buildArenaObstacleGroup, buildArenaRoverModel } from './arenaMeshes';
import { getConcreteFloorTexture, getGrassGroundTexture } from './materials';

export type ArenaCameraMode = 'orbit' | 'chase' | 'top';
export type ArenaEditTool = 'select' | 'draw_wall' | ArenaObstacleKind;

export interface ArenaSceneCallbacks {
  onSelectObstacle: (id: string | null) => void;
  onMoveObstacle: (id: string, position: Vec3) => void;
  onPlaceObstacle: (kind: ArenaObstacleKind, x: number, z: number) => void;
  onDrawWall: (cx: number, cz: number, lengthM: number, rotationY: number) => void;
}

/**
 * 3D Customizable Physics Arena renderer supporting multiple environments (Indoor Lab,
 * Pine Forest, Warehouse Maze, FPV Drone Airfield, Blank Sandbox), interactive obstacle &
 * wall placement/drawing/dragging, detailed 2WD Rover & 5" Quadcopter models, live ultrasonic
 * beam, path ribbon, 3D SLAM scan points, and an ESP32-CAM First-Person PiP overlay.
 */
export class ArenaScene {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly fpvCamera: THREE.PerspectiveCamera;
  private readonly orbit: OrbitControls;
  private readonly transform: TransformControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private readonly envRoot = new THREE.Group();
  private readonly vehicleRoot = new THREE.Group();
  private readonly obstacleRoot = new THREE.Group();
  private readonly obstacleGroups = new Map<string, THREE.Group>();

  private roverVisual!: ReturnType<typeof buildArenaRoverModel>;
  private droneVisual!: ReturnType<typeof buildArenaDroneModel>;
  private ambientLight!: THREE.AmbientLight;
  private hemiLight!: THREE.HemisphereLight;
  private sunLight!: THREE.DirectionalLight;

  private ultrasonicLine!: THREE.Line;
  private ultrasonicHitDot!: THREE.Mesh;
  private trailLine!: THREE.Line;
  private scanPoints!: THREE.Points;
  private selectionBox: THREE.BoxHelper | null = null;
  private ghostMesh: THREE.Group | null = null;
  private wallDrawStart: THREE.Vector3 | null = null;
  private wallPreviewMesh: THREE.Mesh | null = null;

  private lastPointCount = -1;
  private cameraMode: ArenaCameraMode = 'chase';
  private showCamPip = true;
  private vehicleMode: ArenaVehicleMode = 'rover';
  private arenaConfig: ArenaConfig;
  private editTool: ArenaEditTool = 'select';
  private selectedObstacleId: string | null = null;
  private isDraggingGizmo = false;
  private callbacks: ArenaSceneCallbacks;

  constructor(
    container: HTMLElement,
    obstacles: ArenaObstacle[],
    arenaConfig: ArenaConfig = DEFAULT_ARENA_CONFIG,
    vehicleMode: ArenaVehicleMode = 'rover',
    callbacks?: ArenaSceneCallbacks,
  ) {
    this.container = container;
    this.arenaConfig = { ...arenaConfig };
    this.vehicleMode = vehicleMode;
    this.callbacks = callbacks ?? {
      onSelectObstacle: () => undefined,
      onMoveObstacle: () => undefined,
      onPlaceObstacle: () => undefined,
      onDrawWall: () => undefined,
    };

    this.scene = new THREE.Scene();

    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    this.camera = new THREE.PerspectiveCamera(48, w / h, 0.05, 120);
    this.camera.position.set(2.0, 2.8, 4.4);

    this.fpvCamera = new THREE.PerspectiveCamera(72, 4 / 3, 0.03, 35);
    this.fpvCamera.position.set(0, 0.135, -0.09);
    this.vehicleRoot.add(this.fpvCamera);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.autoClear = false;
    container.appendChild(this.renderer.domElement);

    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enableDamping = true;
    this.orbit.maxPolarAngle = Math.PI / 2 - 0.04;
    this.orbit.target.set(0, 0.2, 0.5);

    this.transform = new TransformControls(this.camera, this.renderer.domElement);
    this.transform.setSize(0.75);
    this.transform.setMode('translate');
    this.transform.showX = true;
    this.transform.showY = false;
    this.transform.showZ = true;
    this.transform.addEventListener('dragging-changed', (ev) => {
      const dragging = Boolean(ev.value);
      this.isDraggingGizmo = dragging;
      this.orbit.enabled = !dragging && this.cameraMode === 'orbit';
      if (!dragging) this.commitDraggedObstacle();
    });
    this.transform.addEventListener('objectChange', () => {
      const obj = this.transform.object;
      if (obj) {
        const hw = this.arenaConfig.widthM / 2 - 0.15;
        const hl = this.arenaConfig.lengthM / 2 - 0.15;
        obj.position.x = Math.max(-hw, Math.min(hw, Math.round(obj.position.x * 20) / 20));
        obj.position.y = 0;
        obj.position.z = Math.max(-hl, Math.min(hl, Math.round(obj.position.z * 20) / 20));
        this.selectionBox?.update();
      }
    });
    this.scene.add(this.transform.getHelper());

    this.setupLighting();
    this.buildVehicles();
    this.buildVisualHelpers();

    this.scene.add(this.envRoot);
    this.scene.add(this.vehicleRoot);
    this.scene.add(this.obstacleRoot);

    this.rebuildEnvironment();
    this.syncObstacles(obstacles);
    this.bindEvents();
  }

  /**
   * Switches between Orbit, Chase, and Top-Down camera views.
   */
  public setCameraMode(mode: ArenaCameraMode): void {
    this.cameraMode = mode;
    this.orbit.enabled = mode === 'orbit';
    if (mode === 'orbit') {
      const span = Math.max(this.arenaConfig.widthM, this.arenaConfig.lengthM);
      this.camera.position.set(span * 0.45, span * 0.55, span * 0.65);
      this.orbit.target.set(0, 0.2, 0);
      this.orbit.update();
    }
  }

  /**
   * Switches between 2WD ground rover and 5" quadcopter drone visual models.
   */
  public setVehicleMode(mode: ArenaVehicleMode): void {
    this.vehicleMode = mode;
    this.roverVisual.group.visible = mode === 'rover';
    this.droneVisual.group.visible = mode === 'drone';
    this.fpvCamera.position.set(0, mode === 'drone' ? 0.06 : 0.135, -0.09);
  }

  /**
   * Updates the Arena dimensions, environment theme, and perimeter walls dynamically.
   */
  public setArenaConfig(config: ArenaConfig): void {
    this.arenaConfig = { ...config };
    this.rebuildEnvironment();
  }

  /**
   * Sets the interactive Arena Builder tool (`select`, `draw_wall`, or an obstacle kind to place).
   */
  public setEditTool(tool: ArenaEditTool): void {
    this.editTool = tool;
    this.clearGhostAndWallPreview();
    if (tool !== 'select') {
      this.transform.detach();
      this.orbit.enableRotate = false;
      this.renderer.domElement.style.cursor = 'crosshair';
    } else {
      this.orbit.enableRotate = true;
      this.renderer.domElement.style.cursor = 'default';
      this.syncTransformAttachment();
    }
  }

  /**
   * Highlights the selected Arena obstacle and attaches the XZ drag gizmo when in Select mode.
   */
  public setSelectedObstacle(id: string | null): void {
    this.selectedObstacleId = id;
    this.syncTransformAttachment();
  }

  /**
   * Cancels any active wall-drawing stroke or ghost placement preview.
   */
  public cancelPlacement(): void {
    this.clearGhostAndWallPreview();
  }

  /**
   * Enables or disables the bottom-left ESP32-CAM First-Person Picture-in-Picture feed.
   */
  public setShowCamPip(enabled: boolean): void {
    this.showCamPip = enabled;
  }

  /**
   * Rebuilds all 3D obstacle, wall, tree, gate, and shape meshes to match the current project list.
   */
  public syncObstacles(obstacles: ArenaObstacle[]): void {
    this.transform.detach();
    if (this.selectionBox) {
      this.scene.remove(this.selectionBox);
      this.selectionBox = null;
    }
    while (this.obstacleRoot.children.length > 0) {
      const c = this.obstacleRoot.children[0];
      if (c) this.obstacleRoot.remove(c);
    }
    this.obstacleGroups.clear();

    for (const obs of obstacles) {
      const group = buildArenaObstacleGroup(obs, false);
      this.obstacleGroups.set(obs.id, group);
      this.obstacleRoot.add(group);
    }
    this.syncTransformAttachment();
  }

  /**
   * Synchronizes vehicle pose, wheels/propellers, LED glow, ultrasonic beam, path ribbon, and SLAM cloud, then renders.
   */
  public render(
    dt: number,
    pose: { position: Vec3; quaternion: [number, number, number, number] },
    telemetry: ArenaTelemetry,
    statusLedPwm: number,
    mappedPoints?: ReadonlyArray<[number, number]>,
  ): void {
    this.vehicleRoot.position.set(pose.position[0], pose.position[1], pose.position[2]);
    this.vehicleRoot.quaternion.set(
      pose.quaternion[0],
      pose.quaternion[1],
      pose.quaternion[2],
      pose.quaternion[3],
    );

    if (this.vehicleMode === 'rover') {
      this.roverVisual.leftWheel.rotation.x -= telemetry.leftWheelCmd * dt * 12;
      this.roverVisual.rightWheel.rotation.x -= telemetry.rightWheelCmd * dt * 12;
      this.roverVisual.statusLedMat.emissiveIntensity = 0.15 + (statusLedPwm / 255) * 2.4;
    } else {
      const spin = (0.18 + telemetry.propThrottle * 1.6) * dt * 44;
      this.droneVisual.props.forEach((p, idx) => {
        p.rotation.y += idx % 2 === 0 ? spin : -spin;
      });
      this.droneVisual.statusLedMat.emissiveIntensity = 0.4 + telemetry.propThrottle * 1.8;
    }

    this.updateUltrasonicVisual(telemetry);
    this.updateTrailVisual(telemetry.trail);
    if (mappedPoints) {
      this.updateMappedPoints(mappedPoints);
    }
    this.updateCamera();

    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    // 1. Main arena pass
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    // 2. ESP32-CAM / FPV First-Person PiP pass (bottom-left inset)
    if (this.showCamPip && w > 420 && h > 280) {
      const pipW = Math.min(220, Math.floor(w * 0.27));
      const pipH = Math.floor(pipW * 0.72);
      const pad = 14;
      this.renderer.setScissorTest(true);
      this.renderer.setScissor(pad, pad, pipW, pipH);
      this.renderer.setViewport(pad, pad, pipW, pipH);
      this.renderer.clearDepth();
      this.ultrasonicLine.visible = false;
      this.renderer.render(this.scene, this.fpvCamera);
      this.ultrasonicLine.visible = true;
      this.renderer.setScissorTest(false);
    }
  }

  /**
   * Resizes the WebGL canvas when the container dimensions change.
   */
  public resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /**
   * Disposes listeners, gizmo, controls, and WebGL resources cleanly.
   */
  public dispose(): void {
    this.unbindEvents();
    this.transform.dispose();
    this.orbit.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  private setupLighting(): void {
    this.ambientLight = new THREE.AmbientLight(0xdbeafe, 0.75);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x334155, 0.65);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfffbeb, 1.35);
    this.sunLight.position.set(8, 14, 10);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);
  }

  private buildVehicles(): void {
    this.roverVisual = buildArenaRoverModel();
    this.droneVisual = buildArenaDroneModel();
    this.roverVisual.group.visible = this.vehicleMode === 'rover';
    this.droneVisual.group.visible = this.vehicleMode === 'drone';
    this.vehicleRoot.add(this.roverVisual.group, this.droneVisual.group);
  }

  private rebuildEnvironment(): void {
    while (this.envRoot.children.length > 0) {
      const c = this.envRoot.children[0];
      if (c) this.envRoot.remove(c);
    }

    const { environment, widthM, lengthM, wallHeightM, enclosed } = this.arenaConfig;
    const isOutdoor = environment === 'forest_park' || environment === 'drone_course';
    const isSandbox = environment === 'sandbox_open';

    // Sky / backdrop + lighting palette matched to environment
    if (isOutdoor) {
      this.scene.background = new THREE.Color(0x93c5fd);
      this.scene.fog = new THREE.Fog(0xbfdbfe, Math.max(18, Math.max(widthM, lengthM) * 1.15), 62);
      this.ambientLight.intensity = 0.65;
      this.hemiLight.color.setHex(0xdbeafe);
      this.hemiLight.groundColor.setHex(0x3f6212);
      this.hemiLight.intensity = 1.05;
      this.sunLight.intensity = 1.65;
    } else if (isSandbox) {
      this.scene.background = new THREE.Color(0xe2e8f0);
      this.scene.fog = new THREE.Fog(0xe2e8f0, 22, 60);
      this.ambientLight.intensity = 0.85;
      this.hemiLight.color.setHex(0xffffff);
      this.hemiLight.groundColor.setHex(0x94a3b8);
      this.hemiLight.intensity = 0.9;
      this.sunLight.intensity = 1.25;
    } else {
      this.scene.background = new THREE.Color(0x0f172a);
      this.scene.fog = new THREE.Fog(0x0f172a, Math.max(11, Math.max(widthM, lengthM) * 1.35), 42);
      this.ambientLight.intensity = 0.8;
      this.hemiLight.color.setHex(0xe2e8f0);
      this.hemiLight.groundColor.setHex(0x1e293b);
      this.hemiLight.intensity = 0.65;
      this.sunLight.intensity = 1.3;
    }

    const shadowHalf = Math.max(5.5, Math.max(widthM, lengthM) * 0.65);
    this.sunLight.shadow.camera.left = -shadowHalf;
    this.sunLight.shadow.camera.right = shadowHalf;
    this.sunLight.shadow.camera.top = shadowHalf;
    this.sunLight.shadow.camera.bottom = -shadowHalf;
    this.sunLight.shadow.camera.updateProjectionMatrix();

    // Extended outdoor meadow surround so forest / drone sky feels vast
    if (isOutdoor) {
      const grassTex = getGrassGroundTexture();
      const outer = new THREE.Mesh(
        new THREE.PlaneGeometry(widthM + 48, lengthM + 48),
        new THREE.MeshStandardMaterial({ map: grassTex, color: 0x86efac, roughness: 0.96 }),
      );
      outer.rotation.x = -Math.PI / 2;
      outer.position.y = -0.015;
      outer.receiveShadow = true;
      this.envRoot.add(outer);
    }

    // Active customizable Arena Floor
    let floorMat: THREE.MeshStandardMaterial;
    if (isOutdoor) {
      const grassTex = getGrassGroundTexture();
      floorMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.94 });
    } else if (environment === 'warehouse_maze') {
      floorMat = new THREE.MeshStandardMaterial({ map: getConcreteFloorTexture(), roughness: 0.88 });
    } else if (isSandbox) {
      floorMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.85 });
    } else {
      floorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
    }

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(widthM, lengthM), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.envRoot.add(floor);

    // Subtle measurement grid overlay on non-forest floors (and crisp boundary outline in outdoor)
    if (!isOutdoor) {
      const gridSize = Math.max(widthM, lengthM);
      const grid = new THREE.GridHelper(
        gridSize,
        Math.max(8, Math.round(gridSize * 2)),
        isSandbox ? 0x64748b : 0x475569,
        isSandbox ? 0xcbd5e1 : 0x334155,
      );
      grid.scale.set(widthM / gridSize, 1, lengthM / gridSize);
      grid.position.y = 0.002;
      this.envRoot.add(grid);
    } else {
      // Crisp white boundary perimeter markings on grass field
      const borderPts = [
        new THREE.Vector3(-widthM / 2, 0.015, -lengthM / 2),
        new THREE.Vector3(widthM / 2, 0.015, -lengthM / 2),
        new THREE.Vector3(widthM / 2, 0.015, lengthM / 2),
        new THREE.Vector3(-widthM / 2, 0.015, lengthM / 2),
        new THREE.Vector3(-widthM / 2, 0.015, -lengthM / 2),
      ];
      const borderLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(borderPts),
        new THREE.LineBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.6 }),
      );
      this.envRoot.add(borderLine);
    }

    // Centerline tape & green Launch / Start Pad
    const tape = new THREE.Mesh(
      new THREE.PlaneGeometry(0.04, Math.max(1.5, lengthM - 1.0)),
      new THREE.MeshBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: isOutdoor ? 0.25 : 0.48 }),
    );
    tape.rotation.x = -Math.PI / 2;
    tape.position.set(0, 0.004, 0);
    this.envRoot.add(tape);

    const startZ =
      Math.abs(lengthM - 6.4) < 0.05 && Math.abs(widthM - 4.0) < 0.05
        ? 2.2
        : Math.min(lengthM * 0.31, Math.max(0.8, lengthM / 2 - 1.4));
    const startPad = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.21, 24),
      new THREE.MeshBasicMaterial({ color: 0x22c55e, side: THREE.DoubleSide }),
    );
    startPad.rotation.x = -Math.PI / 2;
    startPad.position.set(0, 0.006, startZ);
    this.envRoot.add(startPad);

    // Customizable Perimeter Walls (when enclosed && wallHeightM > 0)
    if (enclosed && wallHeightM > 0.02) {
      const hw = widthM / 2;
      const hl = lengthM / 2;
      const wallMat = new THREE.MeshStandardMaterial({
        color: isSandbox ? 0x94a3b8 : 0x475569,
        roughness: 0.72,
      });
      const wallSpecs: Array<[number, number, number, number, number]> = [
        [0, -hl, widthM + 0.12, wallHeightM, 0.1],
        [0, hl, widthM + 0.12, wallHeightM, 0.1],
        [-hw, 0, 0.1, wallHeightM, lengthM],
        [hw, 0, 0.1, wallHeightM, lengthM],
      ];
      for (const [x, z, w, h, d] of wallSpecs) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
        m.position.set(x, h / 2, z);
        m.castShadow = true;
        m.receiveShadow = true;
        this.envRoot.add(m);
      }
    }
  }

  private buildVisualHelpers(): void {
    const beamGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.09, 0),
      new THREE.Vector3(0, 0.09, -1),
    ]);
    this.ultrasonicLine = new THREE.Line(
      beamGeo,
      new THREE.LineBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.85 }),
    );
    this.scene.add(this.ultrasonicLine);

    this.ultrasonicHitDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b }),
    );
    this.ultrasonicHitDot.visible = false;
    this.scene.add(this.ultrasonicHitDot);

    this.trailLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 }),
    );
    this.scene.add(this.trailLine);

    this.scanPoints = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ color: 0xf97316, size: 0.06, sizeAttenuation: true }),
    );
    this.scene.add(this.scanPoints);
  }

  private syncTransformAttachment(): void {
    if (this.selectionBox) {
      this.scene.remove(this.selectionBox);
      this.selectionBox = null;
    }
    if (this.editTool === 'select' && this.selectedObstacleId) {
      const grp = this.obstacleGroups.get(this.selectedObstacleId);
      if (grp) {
        this.transform.attach(grp);
        this.selectionBox = new THREE.BoxHelper(grp, 0x14b8a6);
        this.scene.add(this.selectionBox);
        return;
      }
    }
    this.transform.detach();
  }

  private commitDraggedObstacle(): void {
    const obj = this.transform.object;
    if (!obj || !this.selectedObstacleId) return;
    this.callbacks.onMoveObstacle(this.selectedObstacleId, [
      Number(obj.position.x.toFixed(2)),
      0,
      Number(obj.position.z.toFixed(2)),
    ]);
  }

  private clearGhostAndWallPreview(): void {
    this.wallDrawStart = null;
    if (this.ghostMesh) {
      this.scene.remove(this.ghostMesh);
      this.ghostMesh = null;
    }
    if (this.wallPreviewMesh) {
      this.scene.remove(this.wallPreviewMesh);
      this.wallPreviewMesh = null;
    }
  }

  private updatePointer(ev: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private raycastFloor(ev: PointerEvent): THREE.Vector3 | null {
    this.updatePointer(ev);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const pt = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.floorPlane, pt)) return null;
    const hw = this.arenaConfig.widthM / 2 - 0.1;
    const hl = this.arenaConfig.lengthM / 2 - 0.1;
    pt.x = Math.max(-hw, Math.min(hw, Math.round(pt.x * 10) / 10));
    pt.y = 0;
    pt.z = Math.max(-hl, Math.min(hl, Math.round(pt.z * 10) / 10));
    return pt;
  }

  private handlePointerMove = (ev: PointerEvent): void => {
    if (this.isDraggingGizmo || this.editTool === 'select') return;
    const pt = this.raycastFloor(ev);
    if (!pt) return;

    if (this.editTool === 'draw_wall') {
      if (this.wallDrawStart) {
        const dx = pt.x - this.wallDrawStart.x;
        const dz = pt.z - this.wallDrawStart.z;
        const len = Math.max(0.3, Math.hypot(dx, dz));
        const rotY = -Math.atan2(dz, dx);
        const h = Math.max(0.65, this.arenaConfig.wallHeightM || 0.85);
        if (!this.wallPreviewMesh) {
          this.wallPreviewMesh = new THREE.Mesh(
            new THREE.BoxGeometry(1, h, 0.14),
            new THREE.MeshBasicMaterial({ color: 0x14b8a6, transparent: true, opacity: 0.5 }),
          );
          this.scene.add(this.wallPreviewMesh);
        }
        this.wallPreviewMesh.scale.set(len, 1, 1);
        this.wallPreviewMesh.position.set(
          (this.wallDrawStart.x + pt.x) / 2,
          h / 2,
          (this.wallDrawStart.z + pt.z) / 2,
        );
        this.wallPreviewMesh.rotation.y = rotY;
      }
      return;
    }

    // Live translucent ghost preview for placing any element (tree, gate, wall, box, cone...)
    if (!this.ghostMesh) {
      const spec = getArenaElementSpec(this.editTool);
      this.ghostMesh = buildArenaObstacleGroup(
        {
          id: '__ghost__',
          kind: this.editTool,
          label: spec.label,
          position: [pt.x, 0, pt.z],
          size: [...spec.defaultSize],
          color: spec.defaultColor,
          rotationY: 0,
        },
        true,
      );
      this.scene.add(this.ghostMesh);
    } else {
      this.ghostMesh.position.set(pt.x, 0, pt.z);
    }
  };

  private handlePointerDown = (ev: PointerEvent): void => {
    if (ev.button !== 0 || this.isDraggingGizmo) return;

    // 1. Draw Wall (2-click start -> end)
    if (this.editTool === 'draw_wall') {
      const pt = this.raycastFloor(ev);
      if (!pt) return;
      if (!this.wallDrawStart) {
        this.wallDrawStart = pt.clone();
      } else {
        const dx = pt.x - this.wallDrawStart.x;
        const dz = pt.z - this.wallDrawStart.z;
        const len = Math.max(0.35, Number(Math.hypot(dx, dz).toFixed(2)));
        const rotY = Number((-Math.atan2(dz, dx)).toFixed(3));
        const cx = Number(((this.wallDrawStart.x + pt.x) / 2).toFixed(2));
        const cz = Number(((this.wallDrawStart.z + pt.z) / 2).toFixed(2));
        this.clearGhostAndWallPreview();
        this.callbacks.onDrawWall(cx, cz, len, rotY);
      }
      return;
    }

    // 2. Click-to-place any Arena Element
    if (this.editTool !== 'select') {
      const pt = this.raycastFloor(ev);
      if (!pt) return;
      this.callbacks.onPlaceObstacle(this.editTool, pt.x, pt.z);
      return;
    }

    // 3. Select obstacle in Arena
    this.updatePointer(ev);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.obstacleRoot.children, true);
    if (hits[0]) {
      const oid = String(hits[0].object.userData.obstacleId ?? '');
      this.callbacks.onSelectObstacle(oid || null);
      return;
    }
    this.callbacks.onSelectObstacle(null);
  };

  private bindEvents(): void {
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
  }

  private unbindEvents(): void {
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
  }

  private updateUltrasonicVisual(tel: ArenaTelemetry): void {
    const start = new THREE.Vector3(...tel.rayOrigin);
    let end: THREE.Vector3;
    if (tel.rayHit) {
      end = new THREE.Vector3(...tel.rayHit);
      this.ultrasonicHitDot.position.copy(end);
      this.ultrasonicHitDot.visible = true;
    } else {
      const fwd = new THREE.Vector3(0, 0, -2.5).applyQuaternion(this.vehicleRoot.quaternion);
      fwd.y = 0;
      end = start.clone().add(fwd);
      this.ultrasonicHitDot.visible = false;
    }

    const colorHex =
      tel.ultrasonicCm === null || tel.ultrasonicCm > 45
        ? 0x22c55e
        : tel.ultrasonicCm > 20
          ? 0xf59e0b
          : 0xef4444;
    (this.ultrasonicLine.material as THREE.LineBasicMaterial).color.setHex(colorHex);
    (this.ultrasonicHitDot.material as THREE.MeshBasicMaterial).color.setHex(colorHex);

    this.ultrasonicLine.geometry.dispose();
    this.ultrasonicLine.geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  }

  private updateTrailVisual(trail: Array<[number, number]>): void {
    this.trailLine.geometry.dispose();
    if (trail.length < 2) {
      this.trailLine.geometry = new THREE.BufferGeometry();
      return;
    }
    const pts = trail.map(([x, z]) => new THREE.Vector3(x, 0.02, z));
    this.trailLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  }

  private updateMappedPoints(points: ReadonlyArray<[number, number]>): void {
    if (points.length === this.lastPointCount) return;
    this.lastPointCount = points.length;
    this.scanPoints.geometry.dispose();
    if (points.length === 0) {
      this.scanPoints.geometry = new THREE.BufferGeometry();
      return;
    }
    const positions = new Float32Array(points.length * 3);
    points.forEach(([x, z], i) => {
      positions[i * 3] = x;
      positions[i * 3 + 1] = 0.08;
      positions[i * 3 + 2] = z;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.scanPoints.geometry = geo;
  }

  private updateCamera(): void {
    const pos = this.vehicleRoot.position;
    if (this.cameraMode === 'chase') {
      const distBack = this.vehicleMode === 'drone' ? 1.85 : 1.35;
      const liftY = this.vehicleMode === 'drone' ? 0.95 : 0.85;
      const yawOnly = new THREE.Euler(0, new THREE.Euler().setFromQuaternion(this.vehicleRoot.quaternion, 'YXZ').y, 0);
      const behind = new THREE.Vector3(0, liftY, distBack).applyEuler(yawOnly);
      const desired = pos.clone().add(behind);
      this.camera.position.lerp(desired, 0.09);
      this.camera.lookAt(pos.x, pos.y + 0.1, pos.z - 0.1);
    } else if (this.cameraMode === 'top') {
      const topH = Math.max(4.6, Math.max(this.arenaConfig.widthM, this.arenaConfig.lengthM) * 0.92);
      const desired = new THREE.Vector3(pos.x * 0.35, topH, pos.z * 0.35 + 0.5);
      this.camera.position.lerp(desired, 0.1);
      this.camera.lookAt(pos.x * 0.35, 0, pos.z * 0.35);
    } else {
      this.orbit.update();
    }
  }
}
