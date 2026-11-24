import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { getPinSpec } from '../catalog/partsCatalog';
import type { CircuitAnalysis, MotorDriveOutput } from '../engine/circuit';
import { pinKey } from '../engine/circuit';
import { pinRefusal } from '../engine/pinCapacity';
import type { ComponentInstance, StudioProject, Vec3, WireConnection, WirePinRef } from '../schema/projectSchema';
import { buildComponentGroup, setPinHaloVisible, type ComponentVisualHandle } from './componentMeshes';
import { disposeObject } from './kit/pbr';
import type { PlacedDisplaySurface } from './displayPainter';
import { getCuttingMatTexture } from './materials';
import { wireLengthCm } from '../engine/wireLength';
import { buildWireGroup, DEFAULT_END, wireExit, wireRadius, type WireEnd } from './wireGeometry';
import { NeighborField, ObstacleGrid, solveRope, type RopeObstacle, type V3 } from './wireRope';
import { densify, makeDeckGrid, routeDeck, separateWires, shapeBridge, shapeDrop, type DeckRoute } from './wireDeckRouter';
import { arcLengths3, planWire, pointAlong } from './wireRouting';

export type WorkbenchTool = 'select' | 'wire' | 'move' | 'lift' | 'rotate' | 'measure';
export type BenchCameraView = 'iso' | 'top' | 'front' | 'right' | 'fit';

export interface PinHoverInfo {
  screenX: number;
  screenY: number;
  componentLabel: string;
  pinLabel: string;
  voltageText: string;
  pwmValue: number | null;
  /** Set when the pin cannot take another wire (a header pin that already has its jumper). */
  fullNote?: string;
}

export interface MeasureResult {
  distanceMm: number;
  dxMm: number;
  dyMm: number;
  dzMm: number;
}

export interface WorkbenchCallbacks {
  onSelectComponent: (id: string | null) => void;
  onSelectWire: (id: string | null) => void;
  onConnectPins: (from: WirePinRef, to: WirePinRef) => void;
  onTransformComponent: (id: string, position: Vec3, rotationY: number) => void;
  onHoverPin: (info: PinHoverInfo | null) => void;
  onPendingWireChange: (from: WirePinRef | null) => void;
  onCursorBenchMm: (xMm: number, yMm: number) => void;
  onMeasureUpdate: (res: MeasureResult | null) => void;
  onCameraAzimuthChange: (azimuthRad: number, polarRad: number) => void;
  onButtonPress: (componentId: string, pressed: boolean) => void;
  /** A wire was not started or finished because the pin is full; `text` says why and what to do. */
  onWireRefused?: (text: string) => void;
  onAddWireWaypoint: (wireId: string, point: Vec3) => void;
}

/** A copy of a bench build for the arena (see `WorkbenchScene.snapshotModel`). */
export interface VehicleSnapshot {
  group: THREE.Group;
  /** What it is, by its parts: a ground rover, a quad, or neither. */
  vehicle: 'rover' | 'drone' | null;
  /** Its screens: the copy shares their textures, so painting them updates the arena too. */
  displays: PlacedDisplaySurface[];
}

/**
 * Manages the interactive 3D CAD Electronics Workbench scene:
 * bright/dark precision studio mat, high-detail components, routed cables,
 * Move/Lift/Rotate gizmos, 3D Tape Measure, Center-of-Mass marker, live OLED & prop/wheel spin.
 */
export class WorkbenchScene {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly orbit: OrbitControls;
  private readonly transform: TransformControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly benchPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.35);

  private readonly componentRoot = new THREE.Group();
  private readonly wireRoot = new THREE.Group();
  private readonly measureRoot = new THREE.Group();
  private readonly comGroup = new THREE.Group();
  private readonly handles = new Map<string, ComponentVisualHandle>();

  private matMesh!: THREE.Mesh;
  private hemiLight!: THREE.HemisphereLight;
  private envRenderTarget: THREE.WebGLRenderTarget | null = null;
  private previewWireGroup: THREE.Group | null = null;
  private activeButtonId: string | null = null;

  private project: StudioProject;
  private analysis: CircuitAnalysis;
  private theme: 'light' | 'dark' = 'light';
  private showMat = true;
  private showCom = false;
  private snapMm = 1;
  private tool: WorkbenchTool = 'select';
  private wireColor = '#0284c7';
  private selectedComponentId: string | null = null;
  private selectedWireId: string | null = null;
  private routingWireId: string | null = null;
  /** Solved wire paths, reused until a wire's ends, style or the parts around it change. */
  private wireCache = new Map<string, { key: string; points: V3[]; quality: 'full' | 'fast' }>();
  private previewGrid: { pinKey: string; grid: ObstacleGrid } | null = null;
  private deckCache: { key: string; routes: Map<string, DeckRoute> } | null = null;
  private finalCache: { key: string; quality: 'full' | 'fast'; paths: Map<string, V3[]>; tips: Map<string, [THREE.Vector3, THREE.Vector3]> } | null = null;
  private pendingPin: WirePinRef | null = null;
  private measureStart: THREE.Vector3 | null = null;
  private callbacks: WorkbenchCallbacks;

  private livePinPwm: ReadonlyMap<number, number> = new Map();
  private liveMotors: MotorDriveOutput[] = [];
  private built = false;
  private hoverPin: THREE.Mesh | null = null;
  /** Camera glide target for "Fit" and double-click focus: orbit target and camera position to ease towards. */
  private glide: { target: THREE.Vector3; position: THREE.Vector3 } | null = null;
  private isDraggingGizmo = false;
  private animTime = 0;
  private lastCamReport = 0;

  constructor(
    container: HTMLElement,
    project: StudioProject,
    analysis: CircuitAnalysis,
    theme: 'light' | 'dark',
    callbacks: WorkbenchCallbacks,
  ) {
    this.container = container;
    this.project = project;
    this.analysis = analysis;
    this.theme = theme;
    this.callbacks = callbacks;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(theme === 'light' ? 0xeef2f6 : 0x0b1120);

    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    // Near plane small enough to inspect a 0603 resistor from a few millimetres away.
    this.camera = new THREE.PerspectiveCamera(38, w / h, 0.03, 260);
    this.camera.position.set(16, 22, 22);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);

    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.08;
    this.orbit.maxPolarAngle = Math.PI / 2 - 0.03;
    this.orbit.minDistance = 1.2;
    this.orbit.maxDistance = 70;
    this.orbit.zoomToCursor = true;
    this.orbit.addEventListener('start', () => {
      this.glide = null;
    });

    this.transform = new TransformControls(this.camera, this.renderer.domElement);
    this.transform.setSize(0.72);
    this.transform.addEventListener('dragging-changed', (ev) => {
      const dragging = Boolean(ev.value);
      this.isDraggingGizmo = dragging;
      this.orbit.enabled = !dragging;
      if (!dragging) this.commitActiveTransform();
    });
    this.transform.addEventListener('objectChange', () => {
      this.clampDraggedObject();
      // quick pass while dragging; the full pass runs when the part is dropped
      this.rebuildWires('fast');
    });
    this.scene.add(this.transform.getHelper());

    this.buildStudioEnvironment();
    this.buildComMarker();
    this.scene.add(this.componentRoot);
    this.scene.add(this.wireRoot);
    this.scene.add(this.measureRoot);
    this.scene.add(this.comGroup);

    this.syncProject(project, analysis);
    this.bindEvents();
  }

  /**
   * Synchronizes 3D components, wires, and Center-of-Mass marker to reflect an updated project.
   */
  public syncProject(project: StudioProject, analysis: CircuitAnalysis): void {
    // Only rebuild what changed: typing in the code editor or a new circuit analysis must not tear down and rebuild
    // every 3D part (that made typing lag and leaked GPU memory on each keystroke).
    const componentsChanged = !this.built || project.components !== this.project.components;
    const wiresChanged = componentsChanged || project.wires !== this.project.wires;
    this.project = project;
    this.analysis = analysis;
    if (componentsChanged) this.rebuildComponents();
    if (wiresChanged) this.rebuildWires();
    this.built = true;
    this.updateComMarker();
    if (componentsChanged) this.syncTransformAttachment();
  }

  /**
   * Switches the 3D viewport lighting, backdrop, and precision cutting mat between Light and Dark studio themes.
   */
  public setTheme(theme: 'light' | 'dark'): void {
    this.theme = theme;
    this.scene.background = new THREE.Color(theme === 'light' ? 0xeef2f6 : 0x0b1120);
    const mat = this.matMesh.material as THREE.MeshStandardMaterial;
    mat.map = getCuttingMatTexture(theme);
    mat.needsUpdate = true;
    this.hemiLight.intensity = theme === 'light' ? 0.32 : 0.22;
    this.scene.environmentIntensity = theme === 'light' ? 0.62 : 0.5;
  }

  /**
   * Shows or hides the precision drafting cutting mat beneath the build.
   */
  public setShowMat(show: boolean): void {
    this.showMat = show;
    this.matMesh.visible = show;
  }

  /**
   * Shows or hides the 3D Center-of-Mass balance indicator.
   */
  public setShowCom(show: boolean): void {
    this.showCom = show;
    this.comGroup.visible = show;
  }

  /**
   * Updates the positional grid snap increment in millimeters.
   */
  public setSnapMm(snapMm: number): void {
    this.snapMm = Math.max(1, snapMm);
  }

  /**
   * Sets the active workbench CAD tool and updates gizmo attachment.
   */
  public setTool(tool: WorkbenchTool): void {
    this.tool = tool;
    if (tool !== 'wire') this.clearPendingWire();
    if (tool !== 'measure') this.clearMeasurement();
    this.syncTransformAttachment();
    this.updatePinHalos();
  }

  /** Pin halos (the role-coloured ring at each pin tip) show while wiring, or for the pin under the cursor. */
  private updatePinHalos(): void {
    const wiring = this.tool === 'wire' || this.pendingPin !== null;
    for (const h of this.handles.values()) {
      for (const m of h.pinMeshes.values()) setPinHaloVisible(m, wiring || m === this.hoverPin, m === this.hoverPin);
    }
  }

  /**
   * Sets the cable jacket color used for newly routed wires.
   */
  public setWireColor(color: string): void {
    this.wireColor = color;
  }

  /**
   * Updates which component or wire is highlighted in the 3D workbench.
   */
  public setSelection(componentId: string | null, wireId: string | null): void {
    this.selectedComponentId = componentId;
    this.selectedWireId = wireId;
    this.rebuildWires();
    this.syncTransformAttachment();
  }

  /**
   * Enables or disables manual tie-point placement ("Route by hand") for a selected wire.
   */
  public setRoutingWireId(wireId: string | null): void {
    this.routingWireId = wireId;
  }

  /**
   * Cancels an in-progress pin-to-pin wire route.
   */
  public clearPendingWire(): void {
    this.pendingPin = null;
    this.updatePinHalos();
    this.callbacks.onPendingWireChange(null);
    if (this.previewWireGroup) {
      this.scene.remove(this.previewWireGroup);
      disposeObject(this.previewWireGroup);
      this.previewWireGroup = null;
    }
  }

  /**
   * Clears the active 3D Tape Measure graphic and readout.
   */
  public clearMeasurement(): void {
    this.measureStart = null;
    while (this.measureRoot.children.length > 0) {
      const c = this.measureRoot.children[0];
      if (c) this.measureRoot.remove(c);
    }
    this.callbacks.onMeasureUpdate(null);
  }

  /**
   * Updates live electrical telemetry (GPIO PWM map and resolved motor outputs) for 3D animations.
   */
  public updateLiveState(pinPwm: ReadonlyMap<number, number>, motors: MotorDriveOutput[]): void {
    this.livePinPwm = pinPwm;
    this.liveMotors = motors;
  }

  /** The screens of the display parts on the bench (OLED, LCD), for the display painter. */
  public displaySurfaces(): PlacedDisplaySurface[] {
    const out: PlacedDisplaySurface[] = [];
    for (const handle of this.handles.values()) if (handle.display) out.push({ componentId: handle.componentId, surface: handle.display });
    return out;
  }

  /**
   * Moves the camera cleanly to standard CAD preset views (`iso`, `top`, `front`, `right`, `fit`).
   */
  public setCameraView(view: BenchCameraView): void {
    if (view === 'fit') {
      this.frameObject(this.selectedComponentId ? this.handles.get(this.selectedComponentId)?.group ?? this.componentRoot : this.componentRoot);
      return;
    }
    this.glide = null;
    this.orbit.target.set(0, 1.0, 0);
    switch (view) {
      case 'iso':
        this.camera.position.set(16, 20, 21);
        break;
      case 'top':
        this.camera.position.set(0, 32, 0.01);
        break;
      case 'front':
        this.camera.position.set(0, 7.5, 28);
        break;
      case 'right':
        this.camera.position.set(28, 7.5, 0);
        break;
    }
    this.orbit.update();
  }

  /** Glides the camera so `obj` fills the view, keeping the current viewing direction. */
  public frameObject(obj: THREE.Object3D): void {
    const box = new THREE.Box3();
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      // skip invisible pick targets, halos and fault rings: they would make the box larger than what you see
      if (!m.isMesh || o.userData.pickType === 'pin' || o.userData.noFrame) return;
      box.expandByObject(o, true);
    });
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dir = this.camera.position.clone().sub(this.orbit.target).normalize();
    if (dir.lengthSq() < 0.5) dir.set(0.55, 0.62, 0.56).normalize();
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const dist = Math.max(this.orbit.minDistance, (sphere.radius / Math.sin(fov / 2)) * 1.08);
    this.glide = { target: sphere.center.clone(), position: sphere.center.clone().addScaledVector(dir, dist) };
  }

  /**
   * Zooms the camera inward or outward smoothly by a multiplier factor.
   */
  public zoomBy(factor: number): void {
    this.glide = null;
    const offset = this.camera.position.clone().sub(this.orbit.target);
    const len = Math.max(this.orbit.minDistance, Math.min(this.orbit.maxDistance, offset.length() * factor));
    offset.setLength(len);
    this.camera.position.copy(this.orbit.target).add(offset);
    this.orbit.update();
  }

  /**
   * Advances animations by `dt` seconds and renders one frame.
   */
  public render(dt: number): void {
    this.animTime += dt;
    if (this.glide) {
      const k = 1 - Math.exp(-dt * 9);
      this.orbit.target.lerp(this.glide.target, k);
      this.camera.position.lerp(this.glide.position, k);
      if (this.camera.position.distanceTo(this.glide.position) < 0.01 && this.orbit.target.distanceTo(this.glide.target) < 0.01) {
        this.glide = null;
      }
    }
    this.orbit.update();

    // Emit camera orientation to the top-right 3D Axis Gizmo at ~15 Hz
    if (this.animTime - this.lastCamReport > 0.06) {
      this.lastCamReport = this.animTime;
      this.callbacks.onCameraAzimuthChange(this.orbit.getAzimuthalAngle(), this.orbit.getPolarAngle());
    }

    // Animate DC wheels and Brushless drone propellers!
    for (const m of this.liveMotors) {
      const handle = this.handles.get(m.motorComponentId);
      if (!handle) continue;
      if (handle.wheelMesh && Math.abs(m.command) > 0.01) {
        handle.wheelMesh.rotation.x -= m.command * dt * 11;
      }
      if (handle.propMesh && Math.abs(m.command) > 0.01) {
        handle.propMesh.rotation.y += m.command * dt * 42;
      }
    }

    // Animate LEDs
    for (const ledInfo of this.analysis.sensors.ledPins) {
      const handle = this.handles.get(ledInfo.componentId);
      if (!handle?.ledMaterial) continue;
      const pwm =
        this.analysis.sensors.esp32Powered && ledInfo.gpio !== null
          ? (this.livePinPwm.get(ledInfo.gpio) ?? 0)
          : 0;
      handle.ledMaterial.emissiveIntensity = 0.12 + (pwm / 255) * 2.4;
    }

    for (const comp of this.project.components) {
      if (comp.kind === 'esp32_devkit') {
        const handle = this.handles.get(comp.id);
        if (handle?.ledMaterial) {
          const pwm2 = this.analysis.sensors.esp32Powered ? (this.livePinPwm.get(2) ?? 40) : 0;
          handle.ledMaterial.emissiveIntensity = 0.1 + (pwm2 / 255) * 1.8;
        }
      }
    }

    // Selection & fault rings
    const pulse = 0.45 + 0.45 * Math.sin(this.animTime * 8);
    for (const [id, handle] of this.handles) {
      const mat = handle.faultRing.material as THREE.MeshBasicMaterial;
      if (this.analysis.faultyComponentIds.has(id)) {
        mat.color.setHex(0xef4444);
        mat.opacity = 0.35 + pulse * 0.55;
      } else if (id === this.selectedComponentId) {
        mat.color.setHex(0x0d9488);
        mat.opacity = 0.72;
      } else {
        mat.opacity = 0;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Resizes the WebGL viewport to fit its container cleanly.
   */
  public resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /**
   * Disposes all listeners, controls, and WebGL resources cleanly.
   */
  /**
   * A copy of the build as it stands on the bench, every part and every laid wire, for the arena to drive around
   * (bench units, cm). Wheels, propellers and LEDs are tagged so the arena can spin and light them; pin targets and
   * fault rings are left out, and no wire is drawn as selected.
   */
  public snapshotModel(): VehicleSnapshot {
    const selected = this.selectedWireId;
    if (selected) {
      this.selectedWireId = null;
      this.rebuildWires();
    }
    for (const handle of this.handles.values()) {
      const comp = this.project.components.find((c) => c.id === handle.componentId);
      if (handle.wheelMesh) handle.wheelMesh.userData.arenaRole = comp?.side === 'right' ? 'wheelR' : 'wheelL';
      if (handle.propMesh) handle.propMesh.userData.arenaRole = 'prop';
      handle.faultRing.userData.arenaDrop = true;
    }
    const leds = new Set<THREE.Material>();
    for (const handle of this.handles.values()) if (handle.ledMaterial) leds.add(handle.ledMaterial);
    const group = new THREE.Group();
    for (const root of [this.componentRoot, this.wireRoot]) for (const child of root.children) group.add(child.clone(true));
    const drop: THREE.Object3D[] = [];
    group.traverse((obj) => {
      if (obj.userData.pickType === 'pin' || obj.userData.arenaDrop) drop.push(obj);
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        // each status LED gets its own material, so the arena can light it from the sketch
        if (!Array.isArray(mesh.material) && leds.has(mesh.material)) {
          mesh.material = mesh.material.clone();
          mesh.userData.arenaRole = 'led';
        }
      }
    });
    for (const obj of drop) obj.removeFromParent();
    if (selected) {
      this.selectedWireId = selected;
      this.rebuildWires();
    }
    const kinds = new Set(this.project.components.map((c) => c.kind));
    const vehicle = kinds.has('frame_quad_5in') || kinds.has('brushless_2207') ? 'drone' : kinds.has('chassis_2wd') || kinds.has('dc_motor') ? 'rover' : null;
    return { group, vehicle, displays: this.displaySurfaces() };
  }

  public dispose(): void {
    this.unbindEvents();
    this.transform.dispose();
    this.orbit.dispose();
    this.envRenderTarget?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  private buildStudioEnvironment(): void {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    // Image-based lighting does most of the work (reflections on metal, soft fill); the lights add shape.
    this.envRenderTarget = pmrem.fromScene(new RoomEnvironment(), 0.035);
    this.scene.environment = this.envRenderTarget.texture;
    this.scene.environmentIntensity = this.theme === 'light' ? 0.62 : 0.5;
    pmrem.dispose();

    this.hemiLight = new THREE.HemisphereLight(0xf8fafc, 0x9aa4b2, this.theme === 'light' ? 0.32 : 0.22);
    this.scene.add(this.hemiLight);

    // Warm key light from the upper front-right: soft, short shadows that ground every part on the mat.
    const keyLight = new THREE.DirectionalLight(0xfff4e5, 2.15);
    keyLight.position.set(14, 30, 16);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(4096, 4096);
    keyLight.shadow.bias = -0.00025;
    keyLight.shadow.normalBias = 0.012;
    keyLight.shadow.radius = 3;
    keyLight.shadow.camera.near = 5;
    keyLight.shadow.camera.far = 80;
    keyLight.shadow.camera.left = -19;
    keyLight.shadow.camera.right = 19;
    keyLight.shadow.camera.top = 19;
    keyLight.shadow.camera.bottom = -19;
    this.scene.add(keyLight);

    // Cool rim light from behind-left: separates dark boards and plastics from the mat and edges metal.
    const rimLight = new THREE.DirectionalLight(0xdbe7ff, 0.9);
    rimLight.position.set(-16, 12, -20);
    this.scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xe8eef7, 0.35);
    fillLight.position.set(-18, 10, 16);
    this.scene.add(fillLight);

    // Precision engineering cutting mat (34 cm x 30 cm)
    const matGeo = new THREE.BoxGeometry(34, 0.24, 30);
    const matMaterial = new THREE.MeshStandardMaterial({
      map: getCuttingMatTexture(this.theme),
      roughness: 0.86,
      metalness: 0.04,
    });
    this.matMesh = new THREE.Mesh(matGeo, matMaterial);
    this.matMesh.position.y = -0.13;
    this.matMesh.receiveShadow = true;
    this.matMesh.visible = this.showMat;
    this.scene.add(this.matMesh);
  }

  private buildComMarker(): void {
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3 }),
    );
    const ringA = new THREE.Mesh(
      new THREE.TorusGeometry(0.44, 0.06, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0x0f172a }),
    );
    const ringB = ringA.clone();
    ringB.rotation.x = Math.PI / 2;
    const drop = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -6, 0)]),
      new THREE.LineBasicMaterial({ color: 0xeab308 }),
    );
    this.comGroup.add(sphere, ringA, ringB, drop);
    this.comGroup.visible = this.showCom;
  }

  private updateComMarker(): void {
    const [cx, cy, cz] = this.analysis.budget.comCm;
    this.comGroup.position.set(cx, Math.max(0.8, cy + 0.5), cz);
  }

  private rebuildComponents(): void {
    this.transform.detach();
    if (this.hoverPin) {
      // the hovered pin's part is about to be replaced: drop its tooltip too, or it lingers over the new build
      this.hoverPin = null;
      this.callbacks.onHoverPin(null);
    }
    while (this.componentRoot.children.length > 0) {
      const child = this.componentRoot.children[0];
      if (child) {
        this.componentRoot.remove(child);
        disposeObject(child);
      }
    }
    this.handles.clear();

    for (const comp of this.project.components) {
      const handle = buildComponentGroup(comp);
      this.handles.set(comp.id, handle);
      this.componentRoot.add(handle.group);
    }
  }

  private getWorldPinPos(ref: WirePinRef): THREE.Vector3 | null {
    const handle = this.handles.get(ref.componentId);
    const pinMesh = handle?.pinMeshes.get(ref.pinId);
    if (!pinMesh) return null;
    handle?.group.updateMatrixWorld(true);
    const pos = new THREE.Vector3();
    pinMesh.getWorldPosition(pos);
    return pos;
  }

  /**
   * Oriented boxes of the parts' meshes for wires to rest on and go around. Thin leads, decorations, pin targets and
   * parts smaller than 2.5 mm (chip resistors and the like) are left out: a wire simply lies over them.
   */
  private collectWireObstacles(): RopeObstacle[] {
    const out: RopeObstacle[] = [];
    const world = new THREE.Box3();
    const size = new THREE.Vector3();
    const inv = new THREE.Matrix4();
    for (const handle of this.handles.values()) {
      handle.group.updateMatrixWorld(true);
      handle.group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh || !mesh.visible) return;
        if (obj.userData.noPick || obj.userData.noFrame || obj.userData.pickType === 'pin') return;
        const geo = mesh.geometry;
        if (!geo || geo.type === 'TubeGeometry') return;
        let local: THREE.Box3 | null;
        if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
          const im = mesh as THREE.InstancedMesh;
          if (!im.boundingBox) im.computeBoundingBox();
          local = im.boundingBox;
        } else {
          if (!geo.boundingBox) geo.computeBoundingBox();
          local = geo.boundingBox;
        }
        if (!local || local.isEmpty()) return;
        world.copy(local).applyMatrix4(mesh.matrixWorld);
        world.getSize(size);
        if (Math.max(size.x, size.y, size.z) < 0.25) return;
        inv.copy(mesh.matrixWorld).invert();
        out.push({
          min: [local.min.x, local.min.y, local.min.z],
          max: [local.max.x, local.max.y, local.max.z],
          m: mesh.matrixWorld.elements.slice(),
          inv: inv.elements.slice(),
          worldMin: [world.min.x, world.min.y, world.min.z],
          worldMax: [world.max.x, world.max.y, world.max.z],
        });
      });
    }
    return out;
  }

  /**
   * Lays every wire. "Natural" wires are dressed on the deck like a hand-wired board (wireDeckRouter.ts): straight
   * runs along the chassis axes with rounded corners, side by side in bundles, never sharing a lane and hopping over
   * a wire they cross, and at each end a formed piece rising out of the socket and coming down onto the run. A jumper
   * between two pins of one part is a small bridge. Tight and arched wires, hand-routed wires, ESC looms and natural
   * wires that cannot lie on the deck hang as they are (wireRope.ts). A last check lifts or eases aside any wire that
   * still touches another. Results are cached until a wire's ends, style or the parts around it change.
   */
  private rebuildWires(quality: 'full' | 'fast' = 'full'): void {
    while (this.wireRoot.children.length > 0) {
      const child = this.wireRoot.children[0];
      if (child) {
        this.wireRoot.remove(child);
        disposeObject(child);
      }
    }

    const grid = new ObstacleGrid(this.collectWireObstacles(), 0);
    const field = new NeighborField();
    const compById = new Map(this.project.components.map((c) => [c.id, c]));
    const steps = quality === 'full' ? 180 : 60;
    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    /** Fingerprint of the parts in the space a wire can hang into, so moving a nearby part re-lays it. */
    const regionHash = (chain: readonly V3[], reach: number) => {
      const lo = [0, 1, 2].map((k) => Math.min(...chain.map((pt) => pt[k]!)) - reach);
      const hi = [0, 1, 2].map((k) => Math.max(...chain.map((pt) => pt[k]!)) + reach);
      let h = 0;
      for (const o of grid.inRegion([lo[0]!, -1, lo[2]!], [hi[0]!, hi[1]! + 20, hi[2]!])) for (const v of [...o.worldMin, ...o.worldMax]) h = (Math.imul(h, 31) + Math.round(v * 100)) | 0;
      return h;
    };
    const live = new Set<string>();
    /** Solves through the cache: an entry is reused when its key matches (a fast entry is redone on a full pass). */
    const cachedSolve = (id: string, key: string, input: Omit<Parameters<typeof solveRope>[0], 'grid' | 'floorY' | 'steps'>): V3[] => {
      live.add(id);
      const hit = this.wireCache.get(id);
      if (hit && hit.key === key && (hit.quality === 'full' || quality === 'fast')) return hit.points;
      const points = solveRope({ ...input, grid, floorY: 0, steps });
      this.wireCache.set(id, { key, points, quality });
      return points;
    };

    interface WireInfo {
      wire: WireConnection;
      a: THREE.Vector3;
      b: THREE.Vector3;
      endA: WireEnd;
      endB: WireEnd;
      exitA: V3;
      exitB: V3;
      radius: number;
      isPower: boolean;
      isEscPhase: boolean;
      pins: V3[];
    }
    const infos: WireInfo[] = [];
    for (const wire of this.project.wires) {
      const a = this.getWorldPinPos(wire.from);
      const b = this.getWorldPinPos(wire.to);
      if (!a || !b) continue;
      const cA = compById.get(wire.from.componentId);
      const cB = compById.get(wire.to.componentId);
      const pinA = cA ? getPinSpec(cA.kind, wire.from.pinId) : undefined;
      const pinB = cB ? getPinSpec(cB.kind, wire.to.pinId) : undefined;
      const powerRoles = ['power_out', 'power_in', 'gnd'];
      const isPower = powerRoles.includes(pinA?.role ?? '') || powerRoles.includes(pinB?.role ?? '');
      const isEscPhase = pinA?.role === 'esc_phase' || pinB?.role === 'esc_phase';
      const endA = this.getWireEnd(wire.from);
      const endB = this.getWireEnd(wire.to);
      infos.push({
        wire,
        a,
        b,
        endA,
        endB,
        exitA: wireExit(a, endA).toArray() as V3,
        exitB: wireExit(b, endB).toArray() as V3,
        radius: wireRadius(isPower, isEscPhase),
        isPower,
        isEscPhase,
        pins: (wire.waypoints ?? []).map((w) => [w[0], w[1], w[2]] as V3),
      });
    }

    // Wires sharing a pin sit side by side (two wires crimped in one socket, or soldered next to each other on a
    // pad) instead of on top of each other, ordered by where they go so they do not cross on the way out.
    interface PinUse {
      w: WireInfo;
      atA: boolean;
    }
    const atPin = new Map<string, PinUse[]>();
    for (const w of infos) {
      for (const use of [
        { ref: w.wire.from, atA: true },
        { ref: w.wire.to, atA: false },
      ]) {
        const k = `${use.ref.componentId}/${use.ref.pinId}`;
        const list = atPin.get(k);
        if (list) list.push({ w, atA: use.atA });
        else atPin.set(k, [{ w, atA: use.atA }]);
      }
    }
    const exitOf = (u: PinUse) => (u.atA ? u.w.exitA : u.w.exitB);
    const farOf = (u: PinUse) => (u.atA ? u.w.exitB : u.w.exitA);
    const shared: { list: PinUse[]; centre: V3; dir: THREE.Vector3 }[] = [];
    /** Places the wires of one pin side by side along `side`, in the order given. */
    const spread = (sorted: PinUse[], centre: V3, side: THREE.Vector3) => {
      const step = 2 * Math.max(...sorted.map((u) => u.w.radius)) + 0.012;
      sorted.forEach((u, i) => {
        const off = side.clone().multiplyScalar((i - (sorted.length - 1) / 2) * step);
        const exit = exitOf(u);
        const end = u.atA ? u.w.endA : u.w.endB;
        const tip = u.atA ? u.w.a : u.w.b;
        const prev = new THREE.Vector3(exit[0] - centre[0], exit[1] - centre[1], exit[2] - centre[2]);
        for (let k = 0; k < 3; k += 1) exit[k] = centre[k]! + off.getComponent(k);
        if (end.contact === 'lead') tip.add(off.clone().sub(prev));
      });
    };
    for (const list of atPin.values()) {
      if (list.length < 2) continue;
      const head = list[0]!;
      const exit0 = exitOf(head);
      const dir = (head.atA ? head.w.endA : head.w.endB).dir;
      const toward = new THREE.Vector3();
      for (const u of list) toward.add(new THREE.Vector3(farOf(u)[0] - exit0[0], 0, farOf(u)[2] - exit0[2]));
      const side = new THREE.Vector3().crossVectors(dir, toward.lengthSq() > 1e-6 ? toward : new THREE.Vector3(1, 0, 0));
      if (side.lengthSq() < 1e-8) side.crossVectors(dir, new THREE.Vector3(0, 0, 1));
      side.normalize();
      const along = (u: PinUse) => (farOf(u)[0] - exit0[0]) * side.x + (farOf(u)[1] - exit0[1]) * side.y + (farOf(u)[2] - exit0[2]) * side.z;
      const centre: V3 = [exit0[0], exit0[1], exit0[2]];
      shared.push({ list, centre, dir });
      spread([...list].sort((p, q) => along(p) - along(q)), centre, side);
    }

    // "Natural" wires lie on the deck where they can; a jumper between two pins of one part is a small bridge, and the
    // rest hang as they are (wireRope.ts)
    const natural = (w: WireInfo) => (w.wire.style ?? 'routed') === 'routed' && w.pins.length === 0 && !w.isEscPhase;
    const deckWires = infos.filter((w) => natural(w) && Math.hypot(w.exitB[0] - w.exitA[0], w.exitB[2] - w.exitA[2]) >= 1.5 && w.wire.from.componentId !== w.wire.to.componentId);
    let partsHash = 0;
    for (const o of grid.all) for (const v of [...o.worldMin, ...o.worldMax]) partsHash = (Math.imul(partsHash, 31) + Math.round(v * 100)) | 0;
    // the finished paths are kept: with the same wires and parts (selecting, hovering) the wires are only redrawn
    const finalKey = JSON.stringify([infos.map((w) => [w.wire.id, w.exitA.map(r3), w.exitB.map(r3), w.endA.dir.toArray().map(r3), w.endB.dir.toArray().map(r3), w.radius, w.wire.style ?? 'routed', w.wire.clearanceCm ?? 0.45, w.pins]), partsHash]);
    const kept = this.finalCache && this.finalCache.key === finalKey && (this.finalCache.quality === 'full' || quality === 'fast') ? this.finalCache : null;
    const layAll = (): Map<string, V3[]> => {
      let routes = new Map<string, DeckRoute>();
      if (deckWires.length > 0) {
        const key = JSON.stringify([deckWires.map((w) => w.wire.id), infos.map((w) => [w.exitA.map(r3), w.exitB.map(r3), w.radius, w.pins]), partsHash]);
        if (this.deckCache?.key === key) routes = this.deckCache.routes;
        else {
          const pitch = 0.254; // one lane per 2.54 mm, like the header pins the wires come from
          const ends = deckWires.flatMap((w) => [w.exitA, w.exitB]);
          const x0 = Math.min(...ends.map((p) => p[0])) - 2.5;
          const z0 = Math.min(...ends.map((p) => p[2])) - 2.5;
          const nx = Math.min(400, Math.ceil((Math.max(...ends.map((p) => p[0])) + 2.5 - x0) / pitch) + 1);
          const nz = Math.min(400, Math.ceil((Math.max(...ends.map((p) => p[2])) + 2.5 - z0) / pitch) + 1);
          const deck = makeDeckGrid(x0, z0, nx, nz, pitch, (dx, dz) => grid.heightField(x0 + dx, z0 + dz, nx, nz, pitch, 0), ends);
          // a wire attached far above the deck (a battery lead on top of a quad) does not dive down to it and back
          const routable = deckWires.filter((w) => Math.max(w.exitA[1], w.exitB[1]) - deck.deckY <= 3);
          routes = routeDeck(
            deck,
            routable.map((w) => ({
              id: w.wire.id,
              a: w.exitA,
              b: w.exitB,
              aDir: w.endA.dir.toArray() as V3,
              bDir: w.endB.dir.toArray() as V3,
              radius: w.radius,
              group: [w.wire.from.componentId, w.wire.to.componentId].sort().join('|'),
            })),
            { attempts: quality === 'full' ? 4 : 1, keepOut: infos.filter((w) => !deckWires.includes(w)).flatMap((w) => [w.exitA, w.exitB, ...w.pins]) },
          );
          this.deckCache = { key, routes };
        }
      }

      // Natural wires are laid as a dressed board would be: the runs on the deck first, then the pieces that come down
      // from each socket onto its run, and short jumpers as small bridges between their sockets. Pieces go down shortest
      // first, each at the lowest height that keeps it clear of every wire already laid, so a longer one passes over.
      const solved = new Map<string, V3[]>();
      const runs = new Set<string>();
      const NEXT = 0.3;
      const surface = (x: number, z: number) => grid.surfaceY(x, z, 0);
      const laid: { w: WireInfo; run: V3[]; s: number[]; total: number; middle: V3[] }[] = [];
      for (const w of infos) {
        const route = routes.get(w.wire.id);
        if (!route) continue;
        const s = arcLengths3(route.run);
        const total = s[s.length - 1]!;
        if (total < 2 * NEXT + 0.2) continue;
        laid.push({ w, run: route.run, s, total, middle: route.run.filter((_, k) => s[k]! > NEXT + 0.02 && s[k]! < total - NEXT - 0.02) });
        runs.add(w.wire.id);
      }
      // Wires sharing a pin now know where they come down: they sit one behind the other along that way, the one landing
      // nearest in front, and each one behind bends over a little higher, so it passes over the one in front of it.
      const landingOf = (u: PinUse): V3 => {
        const l = laid.find((x) => x.w === u.w);
        if (!l) return farOf(u);
        return u.atA ? l.run[0]! : l.run[l.run.length - 1]!;
      };
      const baseLift = new Map<string, number>();
      for (const { list, centre } of shared) {
        const down = new THREE.Vector3();
        for (const u of list) down.add(new THREE.Vector3(landingOf(u)[0] - centre[0], 0, landingOf(u)[2] - centre[2]).normalize());
        if (down.lengthSq() < 1e-6) continue;
        down.normalize();
        const reach = (u: PinUse) => Math.hypot(landingOf(u)[0] - centre[0], landingOf(u)[2] - centre[2]);
        const nearFirst = [...list].sort((p, q) => reach(p) - reach(q));
        spread([...nearFirst].reverse(), centre, down);
        nearFirst.forEach((u, rank) => baseLift.set(`${u.w.wire.id}:${u.atA ? 'a' : 'b'}`, rank * 0.2));
      }

      interface Piece {
        w: WireInfo;
        span: number;
        base: number;
        shape: (lift: number) => V3[];
        /** Points that may touch other wires' ends (the tail lying on the wire's own run) are left out of the check. */
        checked: (pts: V3[]) => V3[];
        done: (pts: V3[]) => void;
      }
      const pieces: Piece[] = [];
      const ends = new Map<string, { a?: V3[]; b?: V3[] }>();
      const hspan = (p: V3, q: V3) => Math.hypot(q[0] - p[0], q[2] - p[2]);
      for (const { w, run, s, total } of laid) {
        for (const atA of [true, false]) {
          const exit = atA ? w.exitA : w.exitB;
          const dir = (atA ? w.endA : w.endB).dir.toArray() as V3;
          const land = atA ? run[0]! : run[run.length - 1]!;
          const next = pointAlong(run, s, atA ? NEXT : total - NEXT).p;
          const nearLand = (p: V3) => p[1] > land[1] + 0.25 || hspan(p, land) > 0.45;
          pieces.push({
            w,
            span: hspan(exit, land),
            base: baseLift.get(`${w.wire.id}:${atA ? 'a' : 'b'}`) ?? 0,
            shape: (lift) => shapeDrop(exit, dir, land, next, w.radius, surface, lift),
            checked: (pts) => pts.slice(2).filter(nearLand),
            done: (pts) => {
              const e = ends.get(w.wire.id) ?? {};
              if (atA) e.a = pts;
              else e.b = pts;
              ends.set(w.wire.id, e);
            },
          });
        }
      }
      for (const w of infos) {
        if (runs.has(w.wire.id) || !natural(w) || w.wire.from.componentId !== w.wire.to.componentId) continue;
        const aDir = w.endA.dir.toArray() as V3;
        const bDir = w.endB.dir.toArray() as V3;
        pieces.push({
          w,
          span: hspan(w.exitA, w.exitB),
          base: Math.max(baseLift.get(`${w.wire.id}:a`) ?? 0, baseLift.get(`${w.wire.id}:b`) ?? 0),
          shape: (lift) => shapeBridge(w.exitA, aDir, w.exitB, bDir, w.radius, surface, lift),
          checked: (pts) => pts.slice(2, -2),
          done: (pts) => solved.set(w.wire.id, pts),
        });
      }
      // A piece whose straight rise out of its socket would pass through one laid before it cannot be cleared by going
      // higher; then it goes first in later rounds and the other one passes over it. The best round is kept.
      const LIFTS = [0, 0.16, 0.32, 0.48, 0.66, 0.86, 1.1, 1.4];
      const bySpan = [...pieces].sort((p, q) => p.span - q.span);
      let order = bySpan;
      const promoted: Piece[] = [];
      let best: { field: NeighborField; shapes: Map<Piece, V3[]>; stuck: Piece[] } | null = null;
      for (let round = 0; round < 6; round += 1) {
        const f = new NeighborField();
        for (const l of laid) f.add(l.middle, l.w.radius);
        const shapes = new Map<Piece, V3[]>();
        const stuck: Piece[] = [];
        for (const piece of order) {
          let pts: V3[] = [];
          let clear = false;
          for (const lift of LIFTS) {
            pts = piece.shape(piece.base + lift);
            if (!f.overlaps(piece.checked(pts), piece.w.radius)) {
              clear = true;
              break;
            }
          }
          if (!clear) {
            pts = piece.shape(piece.base);
            stuck.push(piece);
          }
          f.add(pts, piece.w.radius);
          shapes.set(piece, pts);
        }
        if (!best || stuck.length < best.stuck.length) best = { field: f, shapes, stuck };
        if (stuck.length === 0) break;
        for (const p of stuck) if (!promoted.includes(p)) promoted.push(p);
        const first = new Set(promoted);
        order = [...promoted, ...bySpan.filter((p) => !first.has(p))];
      }
      for (const [piece, pts] of best!.shapes) piece.done(pts);
      field.merge(best!.field);
      for (const { w, middle } of laid) {
        const e = ends.get(w.wire.id)!;
        solved.set(w.wire.id, [...e.a!, ...middle, ...[...e.b!].reverse()]);
      }

      // Tight and arched wires, wires routed by hand, ESC looms and natural wires that could not lie on the deck hang
      // on their own, resting on what is under them
      for (const w of infos) {
        if (solved.has(w.wire.id)) continue;
        const arched = w.wire.style === 'arched';
        const chain = [w.exitA, ...w.pins, w.exitB];
        const plan = planWire(chain, w.wire.style ?? 'routed', w.wire.clearanceCm ?? 0.45, grid);
        const key = JSON.stringify([chain.map((pt) => pt.map(r3)), w.endA.dir.toArray().map(r3), w.endB.dir.toArray().map(r3), r3(plan.length), w.radius, w.wire.style ?? 'routed', regionHash(chain, plan.length / 4 + 1)]);
        const points = cachedSolve(w.wire.id, key, {
          start: w.exitA,
          startDir: w.endA.dir.toArray() as V3,
          end: w.exitB,
          endDir: w.endB.dir.toArray() as V3,
          length: plan.length,
          legSlack: plan.legSlack,
          radius: w.radius,
          gravity: arched ? 0.15 : 1,
          stiffness: arched ? 0.97 : 0.88,
          pins: w.pins,
          neighbors: field,
        });
        solved.set(w.wire.id, points);
        field.add(points, w.radius);
      }
      // last check: wherever two wires still touch, the more level one is lifted over the other
      const ordered = infos.filter((w) => solved.has(w.wire.id));
      const dense = ordered.map((w) => densify(solved.get(w.wire.id)!));
      separateWires(dense, ordered.map((w) => w.radius));
      ordered.forEach((w, k) => solved.set(w.wire.id, dense[k]!));
      for (const id of [...this.wireCache.keys()]) if (!live.has(id)) this.wireCache.delete(id);
      return solved;
    };
    let solved: Map<string, V3[]>;
    if (kept) {
      solved = kept.paths;
      for (const w of infos) {
        const tips = kept.tips.get(w.wire.id);
        if (tips) {
          w.a.copy(tips[0]);
          w.b.copy(tips[1]);
        }
      }
    } else {
      solved = layAll();
      this.finalCache = { key: finalKey, quality, paths: solved, tips: new Map(infos.map((w) => [w.wire.id, [w.a.clone(), w.b.clone()] as [THREE.Vector3, THREE.Vector3]])) };
    }

    if (import.meta.env.DEV) {
      // dev only: the browser checks in scripts/checks read the finished wire paths from here
      (window as unknown as { __roboforgeWires?: unknown }).__roboforgeWires = infos.map((w) => ({
        id: w.wire.id,
        radius: w.radius,
        from: w.wire.from,
        to: w.wire.to,
        points: solved.get(w.wire.id) ?? [],
      }));
    }
    for (const w of infos) {
      this.wireRoot.add(
        buildWireGroup(solved.get(w.wire.id) ?? [], w.a, w.b, {
          wireId: w.wire.id,
          fromEnd: w.endA,
          toEnd: w.endB,
          color: w.wire.color,
          selected: w.wire.id === this.selectedWireId,
          isPower: w.isPower,
          isEscPhase: w.isEscPhase,
          waypoints: w.wire.waypoints,
        }),
      );
    }
  }

  private syncTransformAttachment(): void {
    if ((this.tool === 'move' || this.tool === 'lift' || this.tool === 'rotate') && this.selectedComponentId) {
      const handle = this.handles.get(this.selectedComponentId);
      if (handle) {
        this.transform.attach(handle.group);
        this.transform.setMode(this.tool === 'rotate' ? 'rotate' : 'translate');
        this.transform.showX = this.tool === 'move';
        this.transform.showY = this.tool === 'lift' || this.tool === 'rotate';
        this.transform.showZ = this.tool === 'move';
        return;
      }
    }
    this.transform.detach();
  }

  private clampDraggedObject(): void {
    const obj = this.transform.object;
    if (!obj) return;
    const stepCm = this.snapMm / 10;
    const snap = (v: number) => Math.round(v / stepCm) * stepCm;
    obj.position.x = Math.max(-16, Math.min(16, snap(obj.position.x)));
    obj.position.y = Math.max(0, Math.min(12, snap(obj.position.y)));
    obj.position.z = Math.max(-14, Math.min(14, snap(obj.position.z)));
  }

  private commitActiveTransform(): void {
    const obj = this.transform.object;
    if (!obj || !this.selectedComponentId) return;
    this.callbacks.onTransformComponent(
      this.selectedComponentId,
      [
        Number(obj.position.x.toFixed(2)),
        Number(obj.position.y.toFixed(2)),
        Number(obj.position.z.toFixed(2)),
      ],
      Number(obj.rotation.y.toFixed(3)),
    );
  }

  private updatePointer(ev: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private getAllPinMeshes(): THREE.Mesh[] {
    const all: THREE.Mesh[] = [];
    for (const h of this.handles.values()) {
      for (const m of h.pinMeshes.values()) all.push(m);
    }
    return all;
  }

  private drawMeasureGraphic(a: THREE.Vector3, b: THREE.Vector3): void {
    while (this.measureRoot.children.length > 0) {
      const c = this.measureRoot.children[0];
      if (c) this.measureRoot.remove(c);
    }
    const mat = new THREE.LineBasicMaterial({ color: 0x0d9488 });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), mat);
    const dotGeo = new THREE.SphereGeometry(0.22, 12, 12);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x0d9488 });
    const dA = new THREE.Mesh(dotGeo, dotMat);
    dA.position.copy(a);
    const dB = new THREE.Mesh(dotGeo, dotMat);
    dB.position.copy(b);
    this.measureRoot.add(line, dA, dB);

    this.callbacks.onMeasureUpdate({
      distanceMm: Number((a.distanceTo(b) * 10).toFixed(1)),
      dxMm: Number((Math.abs(b.x - a.x) * 10).toFixed(1)),
      dyMm: Number((Math.abs(b.y - a.y) * 10).toFixed(1)),
      dzMm: Number((Math.abs(b.z - a.z) * 10).toFixed(1)),
    });
  }

  private handlePointerMove = (ev: PointerEvent): void => {
    if (this.isDraggingGizmo) return;
    this.updatePointer(ev);
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const floorPt = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.benchPlane, floorPt)) {
      this.callbacks.onCursorBenchMm(Number((floorPt.x * 10).toFixed(1)), Number((floorPt.z * 10).toFixed(1)));
      if (this.tool === 'measure' && this.measureStart) {
        this.drawMeasureGraphic(this.measureStart, floorPt);
      }
    }

    const pinHits = this.raycaster.intersectObjects(this.getAllPinMeshes(), false);
    const firstPin = pinHits[0];
    const nextHover = firstPin ? (firstPin.object as THREE.Mesh) : null;
    if (nextHover !== this.hoverPin) {
      this.hoverPin = nextHover;
      this.updatePinHalos();
    }
    if (firstPin) {
      const ud = firstPin.object.userData as { componentId: string; pinId: string; label: string };
      const comp: ComponentInstance | undefined = this.project.components.find((c) => c.id === ud.componentId);
      const net = this.analysis.pinToNet.get(pinKey({ componentId: ud.componentId, pinId: ud.pinId }));
      const gpio = net?.gpioNumbers[0];
      const pwmValue = gpio !== undefined ? (this.livePinPwm.get(gpio) ?? 0) : null;
      const voltageText =
        net?.voltage !== null && net?.voltage !== undefined
          ? net.isGround
            ? '0.0 V (GND)'
            : `${net.voltage.toFixed(1)} V`
          : pwmValue !== null
            ? `${((pwmValue / 255) * 3.3).toFixed(2)} V (PWM ${pwmValue})`
            : 'Floating';

      const full = pinRefusal(this.project, { componentId: ud.componentId, pinId: ud.pinId });
      this.renderer.domElement.style.cursor = full && (this.tool === 'wire' || this.pendingPin) ? 'not-allowed' : 'crosshair';
      this.callbacks.onHoverPin({
        screenX: ev.clientX,
        screenY: ev.clientY,
        componentLabel: comp?.label ?? ud.componentId,
        pinLabel: ud.label,
        voltageText,
        pwmValue,
        fullNote: full ? 'Has its jumper (one per header pin)' : undefined,
      });

      if (this.pendingPin) {
        const startPos = this.getWorldPinPos(this.pendingPin);
        const endPos = new THREE.Vector3();
        firstPin.object.getWorldPosition(endPos);
        if (startPos) this.updatePreviewWire(startPos, endPos);
      }
      return;
    }

    this.callbacks.onHoverPin(null);
    this.renderer.domElement.style.cursor =
      this.tool === 'wire' || this.tool === 'measure' || this.routingWireId ? 'crosshair' : 'default';

    if (this.pendingPin && floorPt.lengthSq() > 0) {
      const startPos = this.getWorldPinPos(this.pendingPin);
      if (startPos) this.updatePreviewWire(startPos, floorPt);
    }
  };

  /** Contact type and world direction of a pin, so the wire end is a DuPont socket or a solder joint facing the right way. */
  private getWireEnd(ref: WirePinRef): WireEnd {
    const comp = this.project.components.find((c) => c.id === ref.componentId);
    const pin = comp ? getPinSpec(comp.kind, ref.pinId) : undefined;
    const d = pin?.dir ?? [0, 1, 0];
    const dir = new THREE.Vector3(d[0], d[1], d[2]);
    const handle = this.handles.get(ref.componentId);
    if (handle) dir.applyQuaternion(handle.group.getWorldQuaternion(new THREE.Quaternion()));
    return { contact: pin?.contact ?? 'header', dir: dir.normalize() };
  }

  private updatePreviewWire(startPos: THREE.Vector3, endPos: THREE.Vector3): void {
    if (this.previewWireGroup) {
      this.scene.remove(this.previewWireGroup);
      disposeObject(this.previewWireGroup);
    }
    const pinKey = this.pendingPin ? `${this.pendingPin.componentId}:${this.pendingPin.pinId}` : '';
    if (!this.previewGrid || this.previewGrid.pinKey !== pinKey) {
      this.previewGrid = { pinKey, grid: new ObstacleGrid(this.collectWireObstacles(), 0) };
    }
    const fromEnd = this.pendingPin ? this.getWireEnd(this.pendingPin) : DEFAULT_END;
    const exitA = wireExit(startPos, fromEnd);
    const exitB = wireExit(endPos, DEFAULT_END);
    const span = exitA.distanceTo(exitB);
    const points = solveRope({
      start: exitA.toArray() as V3,
      startDir: fromEnd.dir.toArray() as V3,
      end: exitB.toArray() as V3,
      endDir: [0, 1, 0],
      length: wireLengthCm(span, 'routed'),
      radius: wireRadius(false, false),
      grid: this.previewGrid.grid,
      floorY: 0,
      gravity: 1,
      stiffness: 0.88,
      steps: 50,
    });
    this.previewWireGroup = buildWireGroup(points, startPos, endPos, {
      wireId: '__preview__',
      fromEnd,
      color: this.wireColor,
      selected: true,
      isPower: false,
      isEscPhase: false,
    });
    this.scene.add(this.previewWireGroup);
  }

  private handlePointerDown = (ev: PointerEvent): void => {
    if (ev.button !== 0 || this.isDraggingGizmo) return;
    this.updatePointer(ev);
    this.raycaster.setFromCamera(this.pointer, this.camera);

    // 0a. Manual Wire Tie-Point placement ("Route by hand")
    if (this.routingWireId) {
      // the clip sticks to whatever is under the cursor (a part, the deck or the bench) and the wire runs through it
      const surface = this.raycaster
        .intersectObjects(this.componentRoot.children, true)
        .find((h) => h.object.userData.pickType !== 'pin' && !h.object.userData.noPick);
      const pt = new THREE.Vector3();
      const onBench = this.raycaster.ray.intersectPlane(this.benchPlane, pt);
      if (surface) pt.copy(surface.point);
      if (surface || onBench) {
        const step = this.snapMm / 10;
        const sx = Number((Math.round(pt.x / step) * step).toFixed(2));
        const sz = Number((Math.round(pt.z / step) * step).toFixed(2));
        this.callbacks.onAddWireWaypoint(this.routingWireId, [sx, Number((Math.max(0, pt.y) + 0.14).toFixed(2)), sz]);
      }
      return;
    }

    // 0b. Measure tool click-to-measure between any pin, component surface, or bench point
    if (this.tool === 'measure') {
      const pinHits = this.raycaster.intersectObjects(this.getAllPinMeshes(), false);
      const compHits = this.raycaster.intersectObjects(this.componentRoot.children, true);
      const pt = new THREE.Vector3();
      if (pinHits[0]) {
        pinHits[0].object.getWorldPosition(pt);
      } else if (compHits[0]) {
        pt.copy(compHits[0].point);
      } else if (!this.raycaster.ray.intersectPlane(this.benchPlane, pt)) {
        return;
      }
      if (!this.measureStart) {
        this.measureStart = pt.clone();
        this.drawMeasureGraphic(pt, pt);
      } else {
        this.drawMeasureGraphic(this.measureStart, pt);
        this.measureStart = null;
      }
      return;
    }

    // 1. Tactile button press interaction in 3D
    const btnMeshes = [...this.handles.values()].map((h) => h.buttonCap).filter((m): m is THREE.Mesh => m !== null);
    const btnHit = this.raycaster.intersectObjects(btnMeshes, false)[0];
    if (btnHit && this.tool === 'select') {
      const cid = String(btnHit.object.userData.componentId ?? '');
      if (cid) {
        this.activeButtonId = cid;
        const cap = btnHit.object;
        cap.position.y = Number(cap.userData.restY ?? cap.position.y) - Number(cap.userData.travel ?? 0.025);
        this.callbacks.onButtonPress(cid, true);
        return;
      }
    }

    // 2. Pin clicks for routing wires
    const pinHits = this.raycaster.intersectObjects(this.getAllPinMeshes(), false);
    if (pinHits[0]) {
      const ud = pinHits[0].object.userData as { componentId: string; pinId: string };
      const ref: WirePinRef = { componentId: ud.componentId, pinId: ud.pinId };
      const samePin = this.pendingPin && this.pendingPin.componentId === ref.componentId && this.pendingPin.pinId === ref.pinId;
      const refusal = samePin ? null : pinRefusal(this.project, ref);
      if (refusal) {
        // a header pin holds one DuPont socket: neither start nor finish a second jumper on it
        this.callbacks.onWireRefused?.(refusal);
        return;
      }
      if (!this.pendingPin) {
        this.pendingPin = ref;
        this.updatePinHalos();
        this.callbacks.onPendingWireChange(ref);
      } else if (this.pendingPin.componentId !== ref.componentId || this.pendingPin.pinId !== ref.pinId) {
        const from = this.pendingPin;
        this.clearPendingWire();
        this.callbacks.onConnectPins(from, ref);
      } else {
        this.clearPendingWire();
      }
      return;
    }

    if (this.pendingPin) {
      this.clearPendingWire();
      return;
    }

    // 3. Wire click
    const wireHits = this.raycaster.intersectObjects(this.wireRoot.children, true);
    if (wireHits[0]) {
      const wireId = String(wireHits[0].object.userData.wireId ?? '');
      this.callbacks.onSelectComponent(null);
      this.callbacks.onSelectWire(wireId || null);
      return;
    }

    // 4. Component click
    const compHits = this.raycaster.intersectObjects(this.componentRoot.children, true);
    if (compHits[0]) {
      const compId = String(compHits[0].object.userData.componentId ?? '');
      this.callbacks.onSelectWire(null);
      this.callbacks.onSelectComponent(compId || null);
      return;
    }

    this.callbacks.onSelectComponent(null);
    this.callbacks.onSelectWire(null);
  };

  private handlePointerUp = (): void => {
    if (this.activeButtonId) {
      const handle = this.handles.get(this.activeButtonId);
      const cap = handle?.buttonCap;
      if (cap) cap.position.y = Number(cap.userData.restY ?? cap.position.y);
      this.callbacks.onButtonPress(this.activeButtonId, false);
      this.activeButtonId = null;
    }
  };

  /** Double-click a part to glide the camera in on it (double-click empty bench to frame the whole build). */
  private handleDoubleClick = (ev: MouseEvent): void => {
    this.updatePointer(ev as PointerEvent);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.componentRoot.children, true).find((h) => h.object.userData.pickType === 'component');
    const id = hit ? String(hit.object.userData.componentId ?? '') : '';
    const group = id ? this.handles.get(id)?.group : undefined;
    this.frameObject(group ?? this.componentRoot);
  };

  private bindEvents(): void {
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('dblclick', this.handleDoubleClick);
    window.addEventListener('pointerup', this.handlePointerUp);
  }

  private unbindEvents(): void {
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('dblclick', this.handleDoubleClick);
    window.removeEventListener('pointerup', this.handlePointerUp);
  }
}
