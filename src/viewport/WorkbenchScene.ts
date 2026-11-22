import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { getPinSpec } from '../catalog/partsCatalog';
import type { CircuitAnalysis, MotorDriveOutput } from '../engine/circuit';
import { pinKey } from '../engine/circuit';
import type { ComponentInstance, StudioProject, Vec3, WireConnection, WirePinRef } from '../schema/projectSchema';
import { buildComponentGroup, setPinHaloVisible, type ComponentVisualHandle } from './componentMeshes';
import { disposeObject } from './kit/pbr';
import { getCuttingMatTexture, paintOledCanvas } from './materials';
import { wireLengthCm } from '../engine/wireLength';
import { buildWireGroup, DEFAULT_END, wireExit, wireRadius, type WireEnd } from './wireGeometry';
import { NeighborField, ObstacleGrid, solveRope, type RopeObstacle, type V3 } from './wireRope';

export type WorkbenchTool = 'select' | 'wire' | 'move' | 'lift' | 'rotate' | 'measure';
export type BenchCameraView = 'iso' | 'top' | 'front' | 'right' | 'fit';

export interface PinHoverInfo {
  screenX: number;
  screenY: number;
  componentLabel: string;
  pinLabel: string;
  voltageText: string;
  pwmValue: number | null;
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
  onAddWireWaypoint: (wireId: string, point: Vec3) => void;
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

  /**
   * Updates all placed 0.96" OLED I2C displays with live sketch text lines.
   */
  public updateOledLines(lines: readonly string[]): void {
    const powered = this.analysis.sensors.oledReady;
    for (const handle of this.handles.values()) {
      if (handle.oledCanvas && handle.oledTexture) {
        paintOledCanvas(handle.oledCanvas, lines, powered);
        handle.oledTexture.needsUpdate = true;
      }
    }
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
   * Lays every wire as a hanging jumper (see wireRope.ts). Wires whose ends, style and surroundings are unchanged
   * reuse their cached path; the rest are solved in order, each resting on the wires already laid.
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
    const r3 = (v: number) => Math.round(v * 1000) / 1000;

    interface Job {
      wire: WireConnection;
      a: THREE.Vector3;
      b: THREE.Vector3;
      endA: WireEnd;
      endB: WireEnd;
      exitA: THREE.Vector3;
      exitB: THREE.Vector3;
      pins: V3[];
      length: number;
      radius: number;
      isPower: boolean;
      isEscPhase: boolean;
      key: string;
    }
    const jobs: Job[] = [];
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
      const exitA = wireExit(a, endA);
      const exitB = wireExit(b, endB);
      const pins: V3[] = (wire.waypoints ?? []).map((w) => [w[0], w[1], w[2]]);
      const chain = [exitA.toArray() as V3, ...pins, exitB.toArray() as V3];
      let span = 0;
      for (let i = 0; i < chain.length - 1; i += 1) span += Math.hypot(chain[i + 1]![0] - chain[i]![0], chain[i + 1]![1] - chain[i]![1], chain[i + 1]![2] - chain[i]![2]);
      const length = wireLengthCm(span, wire.style ?? 'routed', wire.clearanceCm ?? 0.45);
      const radius = wireRadius(isPower, isEscPhase);
      // what this wire depends on: its own ends and shape, plus the parts in the space it can hang into
      const reach = (length - span) / 2 + 1;
      const lo = [0, 1, 2].map((k) => Math.min(...chain.map((p) => p[k]!)) - reach);
      const hi = [0, 1, 2].map((k) => Math.max(...chain.map((p) => p[k]!)) + reach);
      const around = grid.inRegion([lo[0]!, -1, lo[2]!], [hi[0]!, hi[1]! + 20, hi[2]!]);
      let h = 0;
      for (const o of around) for (const v of [...o.worldMin, ...o.worldMax]) h = (Math.imul(h, 31) + Math.round(v * 100)) | 0;
      const key = JSON.stringify([chain.map((p) => p.map(r3)), endA.dir.toArray().map(r3), endB.dir.toArray().map(r3), r3(length), radius, wire.style ?? 'routed', h]);
      jobs.push({ wire, a, b, endA, endB, exitA, exitB, pins, length, radius, isPower, isEscPhase, key });
    }

    const solved = new Map<string, V3[]>();
    for (const job of jobs) {
      const cached = this.wireCache.get(job.wire.id);
      if (cached && cached.key === job.key && (cached.quality === 'full' || quality === 'fast')) {
        solved.set(job.wire.id, cached.points);
        field.add(cached.points, job.radius);
      }
    }
    for (const job of jobs) {
      if (solved.has(job.wire.id)) continue;
      const arched = job.wire.style === 'arched';
      const points = solveRope({
        start: job.exitA.toArray() as V3,
        startDir: job.endA.dir.toArray() as V3,
        end: job.exitB.toArray() as V3,
        endDir: job.endB.dir.toArray() as V3,
        length: job.length,
        radius: job.radius,
        grid,
        floorY: 0,
        gravity: arched ? 0.15 : 1,
        stiffness: arched ? 0.97 : 0.88,
        pins: job.pins,
        neighbors: field,
        steps: quality === 'full' ? 180 : 60,
      });
      solved.set(job.wire.id, points);
      field.add(points, job.radius);
      this.wireCache.set(job.wire.id, { key: job.key, points, quality });
    }
    const live = new Set(jobs.map((j) => j.wire.id));
    for (const id of [...this.wireCache.keys()]) if (!live.has(id)) this.wireCache.delete(id);

    for (const job of jobs) {
      this.wireRoot.add(
        buildWireGroup(solved.get(job.wire.id) ?? [], job.a, job.b, {
          wireId: job.wire.id,
          fromEnd: job.endA,
          toEnd: job.endB,
          color: job.wire.color,
          selected: job.wire.id === this.selectedWireId,
          isPower: job.isPower,
          isEscPhase: job.isEscPhase,
          waypoints: job.wire.waypoints,
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

      this.renderer.domElement.style.cursor = 'crosshair';
      this.callbacks.onHoverPin({
        screenX: ev.clientX,
        screenY: ev.clientY,
        componentLabel: comp?.label ?? ud.componentId,
        pinLabel: ud.label,
        voltageText,
        pwmValue,
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
