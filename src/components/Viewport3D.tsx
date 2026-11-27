import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import {
  Camera,
  ChevronDown,
  ChevronRight,
  Focus,
  ListTree,
  Minus,
  Plus,
  RotateCcw,
  Video,
} from 'lucide-react';
import type {
  ArenaPhysicsEngine,
  ArenaTelemetry,
  ArenaVehicleMode,
  DroneFlightInput,
} from '../engine/arenaPhysics';
import type { CircuitAnalysis, MotorDriveOutput } from '../engine/circuit';
import type { DisplayBench } from '../engine/displays/panels';
import { paintDisplays } from '../viewport/displayPainter';
import { PART_DRAG_TYPE } from './PartsPanel';
import {
  resolveArenaConfig,
  type ArenaObstacleKind,
  type ComponentKind,
  type StudioProject,
  type Vec3,
  type WirePinRef,
} from '../schema/projectSchema';
import { ArenaScene, type ArenaCameraMode, type ArenaEditTool } from '../viewport/ArenaScene';
import {
  WorkbenchScene,
  type BenchCameraView,
  type MeasureResult,
  type PinHoverInfo,
  type VehicleSnapshot,
  type WorkbenchTool,
} from '../viewport/WorkbenchScene';
import { AxisGizmo } from './AxisGizmo';
import type { StudioViewMode } from './Toolbar';

export interface Viewport3DProps {
  mode: StudioViewMode;
  theme: 'light' | 'dark';
  tool: WorkbenchTool;
  showMat: boolean;
  showCom: boolean;
  snapMm: number;
  project: StudioProject;
  analysis: CircuitAnalysis;
  selectedComponentId: string | null;
  selectedWireId: string | null;
  routingWireId: string | null;
  arenaEditTool: ArenaEditTool;
  selectedObstacleId: string | null;
  vehicleMode: ArenaVehicleMode;
  /** The display modules (OLED, LCD) whose screens the 3D view paints. */
  displays: DisplayBench;
  /** A design is being built step by step: new parts drop in, and the camera frames the build when it is done. */
  buildFx?: boolean;
  physicsRef: React.MutableRefObject<ArenaPhysicsEngine>;
  liveMotorsRef: React.MutableRefObject<MotorDriveOutput[]>;
  livePinPwmRef: React.MutableRefObject<ReadonlyMap<number, number>>;
  manualDriveRef: React.MutableRefObject<{ left: number; right: number }>;
  droneInputRef: React.MutableRefObject<DroneFlightInput>;
  benchDistanceCm: number;
  onBenchDistanceChange: (cm: number) => void;
  onToggleMat: () => void;
  onSelectComponent: (id: string | null) => void;
  onSelectWire: (id: string | null) => void;
  onConnectPins: (from: WirePinRef, to: WirePinRef) => void;
  onAddWireWaypoint: (wireId: string, point: Vec3) => void;
  onCancelWireRouting: () => void;
  onTransformComponent: (id: string, position: Vec3, rotationY: number) => void;
  onCursorBenchMm: (xMm: number, yMm: number) => void;
  onButtonPress: (componentId: string, pressed: boolean) => void;
  /** A part dragged from the parts list was dropped on the bench at `at` (cm). */
  onDropPart: (kind: ComponentKind, at: Vec3) => void;
  onSelectObstacle: (id: string | null) => void;
  onMoveObstacle: (id: string, position: Vec3) => void;
  onPlaceObstacle: (kind: ArenaObstacleKind, x: number, z: number) => void;
  onDrawWall: (cx: number, cz: number, lengthM: number, rotationY: number) => void;
  onCancelArenaTool: () => void;
  onResetRover: () => void;
  onSyncLiveFrame: () => void;
}

/**
 * Interactive 3D CAD viewport hosting either the Daylight/Dark Electronics Workbench
 * (with Browser tree, 3D Axis Gizmo, Camera View Bar, Tape Measure, manual cable tie-points & Pin Probes)
 * or the Customizable 3D Physics Arena (with interactive wall/tree/shape placement, Chase/Orbit/Top views & live FPV PiP).
 */
export function Viewport3D({
  mode,
  theme,
  tool,
  showMat,
  showCom,
  snapMm,
  project,
  analysis,
  selectedComponentId,
  selectedWireId,
  routingWireId,
  arenaEditTool,
  selectedObstacleId,
  vehicleMode,
  displays,
  buildFx = false,
  physicsRef,
  liveMotorsRef,
  livePinPwmRef,
  manualDriveRef,
  droneInputRef,
  benchDistanceCm,
  onBenchDistanceChange,
  onToggleMat,
  onSelectComponent,
  onSelectWire,
  onConnectPins,
  onAddWireWaypoint,
  onCancelWireRouting,
  onTransformComponent,
  onCursorBenchMm,
  onButtonPress,
  onDropPart,
  onSelectObstacle,
  onMoveObstacle,
  onPlaceObstacle,
  onDrawWall,
  onCancelArenaTool,
  onResetRover,
  onSyncLiveFrame,
}: Viewport3DProps): React.ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const benchSceneRef = useRef<WorkbenchScene | null>(null);
  /** The bench build as it was when the arena opened, so the arena drives the same model. */
  const vehicleSnapshotRef = useRef<VehicleSnapshot | null>(null);
  const arenaSceneRef = useRef<ArenaScene | null>(null);

  const [browserOpen, setBrowserOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<ArenaCameraMode>('chase');
  const [showCamPip, setShowCamPip] = useState(true);
  const [hoverPin, setHoverPin] = useState<PinHoverInfo | null>(null);
  const [wireNotice, setWireNotice] = useState<string | null>(null);
  const wireNoticeTimer = useRef<number | null>(null);
  const showWireNotice = (text: string) => {
    setWireNotice(text);
    if (wireNoticeTimer.current !== null) window.clearTimeout(wireNoticeTimer.current);
    wireNoticeTimer.current = window.setTimeout(() => setWireNotice(null), 5000);
  };
  const showWireNoticeRef = useRef(showWireNotice);
  showWireNoticeRef.current = showWireNotice;
  const [pendingWire, setPendingWire] = useState<WirePinRef | null>(null);
  const [measureRes, setMeasureRes] = useState<MeasureResult | null>(null);
  const [gizmoAngles, setGizmoAngles] = useState({ az: 0.65, pol: 0.85 });
  const [arenaHud, setArenaHud] = useState<ArenaTelemetry>(() => physicsRef.current.getTelemetry());

  const arenaConfig = resolveArenaConfig(project);

  const callbacksRef = useRef({
    onSelectComponent,
    onSelectWire,
    onConnectPins,
    onAddWireWaypoint,
    onCancelWireRouting,
    onTransformComponent,
    onCursorBenchMm,
    onButtonPress,
    onSelectObstacle,
    onMoveObstacle,
    onPlaceObstacle,
    onDrawWall,
    onCancelArenaTool,
    onSyncLiveFrame,
  });
  callbacksRef.current = {
    onSelectComponent,
    onSelectWire,
    onConnectPins,
    onAddWireWaypoint,
    onCancelWireRouting,
    onTransformComponent,
    onCursorBenchMm,
    onButtonPress,
    onSelectObstacle,
    onMoveObstacle,
    onPlaceObstacle,
    onDrawWall,
    onCancelArenaTool,
    onSyncLiveFrame,
  };

  useEffect(() => {
    const container = hostRef.current;
    if (!container) return;

    if (mode === 'workbench') {
      const bench = new WorkbenchScene(container, project, analysis, theme, {
        onSelectComponent: (id) => callbacksRef.current.onSelectComponent(id),
        onSelectWire: (id) => callbacksRef.current.onSelectWire(id),
        onConnectPins: (a, b) => callbacksRef.current.onConnectPins(a, b),
        onAddWireWaypoint: (wid, pt) => callbacksRef.current.onAddWireWaypoint(wid, pt),
        onTransformComponent: (id, pos, rot) => callbacksRef.current.onTransformComponent(id, pos, rot),
        onHoverPin: setHoverPin,
        onPendingWireChange: setPendingWire,
        onCursorBenchMm: (x, y) => callbacksRef.current.onCursorBenchMm(x, y),
        onMeasureUpdate: setMeasureRes,
        onCameraAzimuthChange: (az, pol) => setGizmoAngles({ az, pol }),
        onButtonPress: (cid, pressed) => callbacksRef.current.onButtonPress(cid, pressed),
        onWireRefused: (text) => showWireNoticeRef.current(text),
      });
      bench.setTool(tool);
      bench.setShowMat(showMat);
      bench.setShowCom(showCom);
      bench.setSnapMm(snapMm);
      bench.setSelection(selectedComponentId, selectedWireId);
      bench.setRoutingWireId(routingWireId);
      benchSceneRef.current = bench;

      const ro = new ResizeObserver(() => bench.resize());
      ro.observe(container);
      return () => {
        ro.disconnect();
        setHoverPin(null);
        setPendingWire(null);
        setMeasureRes(null);
        vehicleSnapshotRef.current = bench.snapshotModel();
        bench.dispose();
        benchSceneRef.current = null;
      };
    }

    const arena = new ArenaScene(container, project.obstacles, arenaConfig, vehicleMode, {
      onSelectObstacle: (id) => callbacksRef.current.onSelectObstacle(id),
      onMoveObstacle: (id, pos) => callbacksRef.current.onMoveObstacle(id, pos),
      onPlaceObstacle: (kind, x, z) => callbacksRef.current.onPlaceObstacle(kind, x, z),
      onDrawWall: (cx, cz, len, rot) => callbacksRef.current.onDrawWall(cx, cz, len, rot),
    });
    arena.setVehicleModel(vehicleSnapshotRef.current);
    arena.setCameraMode(cameraMode);
    arena.setEditTool(arenaEditTool);
    arena.setSelectedObstacle(selectedObstacleId);
    arena.setShowCamPip(showCamPip && (analysis.sensors.camPowered || vehicleMode === 'drone'));
    arenaSceneRef.current = arena;

    const ro = new ResizeObserver(() => arena.resize());
    ro.observe(container);
    return () => {
      ro.disconnect();
      arena.dispose();
      arenaSceneRef.current = null;
    };
    // Intentionally recreate WebGL context only on mode change; incremental sync effects run below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    benchSceneRef.current?.syncProject(project, analysis);
  }, [project, analysis]);

  useEffect(() => {
    benchSceneRef.current?.setTheme(theme);
  }, [theme]);

  const buildFxWas = useRef(false);
  useEffect(() => {
    const bench = benchSceneRef.current;
    if (!bench) return;
    bench.setArrivalEffects(buildFx);
    if (buildFx && !buildFxWas.current) bench.setCameraView('iso');
    if (!buildFx && buildFxWas.current) bench.setCameraView('fit');
    buildFxWas.current = buildFx;
  }, [buildFx]);

  useEffect(() => {
    benchSceneRef.current?.setTool(tool);
  }, [tool]);

  useEffect(() => {
    benchSceneRef.current?.setShowMat(showMat);
  }, [showMat]);

  useEffect(() => {
    benchSceneRef.current?.setShowCom(showCom);
  }, [showCom]);

  useEffect(() => {
    benchSceneRef.current?.setSnapMm(snapMm);
  }, [snapMm]);

  useEffect(() => {
    benchSceneRef.current?.setSelection(selectedComponentId, selectedWireId);
  }, [selectedComponentId, selectedWireId]);

  useEffect(() => {
    benchSceneRef.current?.setRoutingWireId(routingWireId);
  }, [routingWireId]);

  useEffect(() => {
    arenaSceneRef.current?.syncObstacles(project.obstacles);
  }, [project.obstacles]);

  useEffect(() => {
    arenaSceneRef.current?.setArenaConfig(arenaConfig);
  }, [arenaConfig]);

  useEffect(() => {
    arenaSceneRef.current?.setVehicleMode(vehicleMode);
  }, [vehicleMode]);

  useEffect(() => {
    arenaSceneRef.current?.setEditTool(arenaEditTool);
    if (arenaEditTool !== 'select' && cameraMode === 'chase') {
      setCameraMode('orbit');
    }
  }, [arenaEditTool, cameraMode]);

  useEffect(() => {
    arenaSceneRef.current?.setSelectedObstacle(selectedObstacleId);
  }, [selectedObstacleId]);

  useEffect(() => {
    arenaSceneRef.current?.setCameraMode(cameraMode);
  }, [cameraMode]);

  useEffect(() => {
    arenaSceneRef.current?.setShowCamPip(showCamPip && (analysis.sensors.camPowered || vehicleMode === 'drone'));
  }, [showCamPip, analysis.sensors.camPowered, vehicleMode]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        benchSceneRef.current?.clearPendingWire();
        benchSceneRef.current?.clearMeasurement();
        callbacksRef.current.onCancelWireRouting();
        arenaSceneRef.current?.cancelPlacement();
        callbacksRef.current.onCancelArenaTool();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Main 60fps animation & physics render loop
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let lastHudUpdate = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      callbacksRef.current.onSyncLiveFrame();

      if (mode === 'workbench' && benchSceneRef.current) {
        benchSceneRef.current.updateLiveState(livePinPwmRef.current, liveMotorsRef.current);
        paintDisplays(benchSceneRef.current.displaySurfaces(), displays, now);
        benchSceneRef.current.render(dt);
      } else if (mode === 'arena' && arenaSceneRef.current) {
        let tel: ArenaTelemetry;
        if (vehicleMode === 'drone') {
          const brushless = liveMotorsRef.current.filter((m) => m.kind === 'brushless');
          const avgEsc =
            brushless.length > 0
              ? brushless.reduce((acc, m) => acc + Math.abs(m.command), 0) / brushless.length
              : 0;
          const din = droneInputRef.current;
          tel = physicsRef.current.stepDrone(dt, {
            forward: din.forward,
            strafe: din.strafe,
            climb: din.climb,
            yaw: din.yaw,
            throttle: Math.max(avgEsc, din.throttle),
          });
        } else {
          const leftMotor = liveMotorsRef.current.find((m) => m.side === 'left')?.command ?? 0;
          const rightMotor = liveMotorsRef.current.find((m) => m.side === 'right')?.command ?? 0;
          const manual = manualDriveRef.current;
          const hasManual = Math.abs(manual.left) > 0.01 || Math.abs(manual.right) > 0.01;
          tel = physicsRef.current.step(
            dt,
            hasManual ? manual.left : leftMotor,
            hasManual ? manual.right : rightMotor,
          );
        }

        const ledPin = analysis.sensors.ledPins[0]?.gpio ?? 4;
        const ledPwm = analysis.sensors.esp32Powered ? (livePinPwmRef.current.get(ledPin) ?? 0) : 0;
        const mappedPoints = physicsRef.current.getOccupancyGrid().mappedPoints;
        paintDisplays(vehicleSnapshotRef.current?.displays ?? [], displays, now);
        arenaSceneRef.current.render(dt, physicsRef.current.getRoverPose(), tel, ledPwm, mappedPoints);

        if (now - lastHudUpdate > 85) {
          lastHudUpdate = now;
          setArenaHud(tel);
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [
    mode,
    vehicleMode,
    analysis.sensors.esp32Powered,
    analysis.sensors.ledPins,
    liveMotorsRef,
    livePinPwmRef,
    manualDriveRef,
    droneInputRef,
    physicsRef,
    displays,
  ]);

  const handleCameraPreset = (v: BenchCameraView) => {
    benchSceneRef.current?.setCameraView(v);
  };

  const hasUltrasonic = project.components.some((c) => c.kind === 'hcsr04');
  const camFeedEnabled = analysis.sensors.camPowered || vehicleMode === 'drone';

  return (
    <div className="viewport-wrap">
      <div
        ref={hostRef}
        className="viewport-canvas"
        onDragOver={(ev) => {
          const bench = benchSceneRef.current;
          if (mode !== 'workbench' || !bench || !ev.dataTransfer.types.includes(PART_DRAG_TYPE)) return;
          ev.preventDefault();
          ev.dataTransfer.dropEffect = 'copy';
          bench.showDropMarker(bench.dropPointAt(ev.clientX, ev.clientY));
        }}
        onDragLeave={() => benchSceneRef.current?.showDropMarker(null)}
        onDrop={(ev) => {
          const bench = benchSceneRef.current;
          const kind = ev.dataTransfer.getData(PART_DRAG_TYPE);
          bench?.showDropMarker(null);
          if (mode !== 'workbench' || !bench || !kind) return;
          ev.preventDefault();
          const at = bench.dropPointAt(ev.clientX, ev.clientY);
          if (at) onDropPart(kind as ComponentKind, at);
        }}
      />

      {/* Top-Left Collapsible Browser Tree + Active Tool Prompts */}
      <div className="hud-top-left">
        {mode === 'workbench' && (
          <div className="float-card">
            <button
              type="button"
              className="cam-btn"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px' }}
              onClick={() => setBrowserOpen((o) => !o)}
            >
              <ListTree size={13} />
              <strong>Browser</strong>
              <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
                {project.components.length} items
              </span>
              {browserOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>

            {browserOpen && (
              <div className="browser-tree" style={{ borderTop: '1px solid var(--border)' }}>
                {project.components.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`tree-row ${selectedComponentId === c.id ? 'active' : ''}`}
                    onClick={() => {
                      onSelectComponent(c.id);
                      onSelectWire(null);
                    }}
                  >
                    <span>{c.label}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {c.id}
                    </span>
                  </button>
                ))}
                {project.wires.length > 0 && (
                  <div
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      padding: '6px 7px 2px',
                    }}
                  >
                    WIRES ({project.wires.length})
                  </div>
                )}
                {project.wires.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    className={`tree-row ${selectedWireId === w.id ? 'active' : ''}`}
                    onClick={() => {
                      onSelectWire(w.id);
                      onSelectComponent(null);
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 2,
                          background: w.color,
                          display: 'inline-block',
                        }}
                      />
                      {w.from.componentId}.{w.from.pinId} → {w.to.pinId}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {mode === 'workbench' && pendingWire && (
          <div
            className="float-card"
            style={{ padding: '6px 10px', borderColor: 'var(--accent)', color: 'var(--accent-strong)', fontSize: 11.5 }}
          >
            Routing from <strong>{pendingWire.componentId}.{pendingWire.pinId}</strong> — click target pin (Esc cancels)
          </div>
        )}

        {mode === 'workbench' && routingWireId && (
          <div
            className="float-card"
            style={{ padding: '6px 10px', borderColor: 'var(--accent)', color: 'var(--accent-strong)', fontSize: 11.5 }}
          >
            <strong>Route by hand:</strong> click the bench to add cable tie points (Esc finishes)
          </div>
        )}

        {mode === 'workbench' && measureRes && (
          <div className="float-card" style={{ padding: '6px 10px', borderColor: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
            <strong>Measure: {measureRes.distanceMm} mm</strong>{' '}
            <span style={{ color: 'var(--text-muted)' }}>
              (ΔX {measureRes.dxMm} · ΔY {measureRes.dzMm} · ΔZ {measureRes.dyMm})
            </span>
          </div>
        )}

        {mode === 'workbench' && hasUltrasonic && (
          <div className="float-card" style={{ padding: '6px 9px', width: 185 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, color: 'var(--accent-strong)' }}>
              <span>HC-SR04 TARGET</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{benchDistanceCm} cm</span>
            </div>
            <input
              type="range"
              min={5}
              max={250}
              value={benchDistanceCm}
              style={{ width: '100%', marginTop: 2 }}
              onChange={(ev) => onBenchDistanceChange(Number(ev.target.value))}
            />
          </div>
        )}

        {mode === 'arena' && arenaEditTool !== 'select' && (
          <div
            className="float-card"
            style={{ padding: '6px 10px', borderColor: 'var(--accent)', color: 'var(--accent-strong)', fontSize: 11.5 }}
          >
            {arenaEditTool === 'draw_wall' ? (
              <>
                <strong>Draw Wall:</strong> click start corner, then end corner on floor (Esc exits)
              </>
            ) : (
              <>
                <strong>Place {arenaEditTool}:</strong> click anywhere on arena floor to drop (Esc exits)
              </>
            )}
          </div>
        )}
      </div>

      {/* Top-Right Live 3D Axis Orientation Gizmo */}
      {mode === 'workbench' && (
        <div className="hud-top-right">
          <AxisGizmo
            azimuthRad={gizmoAngles.az}
            polarRad={gizmoAngles.pol}
            onSelectView={handleCameraPreset}
          />
        </div>
      )}

      {/* Bottom-Center CAD / Arena Camera Controls Bar */}
      <div className="hud-bottom-center">
        {mode === 'workbench' ? (
          <>
            <button type="button" className="cam-btn" onClick={() => handleCameraPreset('iso')}>
              Iso
            </button>
            <button type="button" className="cam-btn" onClick={() => handleCameraPreset('top')}>
              Top
            </button>
            <button type="button" className="cam-btn" onClick={() => handleCameraPreset('front')}>
              Front
            </button>
            <button type="button" className="cam-btn" onClick={() => handleCameraPreset('right')}>
              Right
            </button>
            <button type="button" className="cam-btn" onClick={() => handleCameraPreset('fit')}>
              Fit
            </button>
            <button
              type="button"
              className={`cam-btn ${showMat ? 'active' : ''}`}
              onClick={onToggleMat}
            >
              Mat
            </button>
            <button
              type="button"
              className="cam-btn"
              aria-label="Zoom out"
              onClick={() => benchSceneRef.current?.zoomBy(1.18)}
            >
              <Minus size={12} />
            </button>
            <button
              type="button"
              className="cam-btn"
              aria-label="Zoom in"
              onClick={() => benchSceneRef.current?.zoomBy(0.84)}
            >
              <Plus size={12} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`cam-btn ${cameraMode === 'chase' ? 'active' : ''}`}
              onClick={() => setCameraMode('chase')}
            >
              <Camera size={12} /> Chase
            </button>
            <button
              type="button"
              className={`cam-btn ${cameraMode === 'orbit' ? 'active' : ''}`}
              onClick={() => setCameraMode('orbit')}
            >
              <Focus size={12} /> Orbit
            </button>
            <button
              type="button"
              className={`cam-btn ${cameraMode === 'top' ? 'active' : ''}`}
              onClick={() => setCameraMode('top')}
            >
              Top
            </button>
            <button
              type="button"
              className={`cam-btn ${showCamPip && camFeedEnabled ? 'active' : ''}`}
              disabled={!camFeedEnabled}
              onClick={() => setShowCamPip((v) => !v)}
            >
              <Video size={12} /> ESP32-CAM
            </button>
            <button type="button" className="cam-btn" onClick={onResetRover}>
              <RotateCcw size={12} /> Reset
            </button>
          </>
        )}
      </div>

      {/* ESP32-CAM / FPV PiP Label in Arena */}
      {mode === 'arena' && showCamPip && camFeedEnabled && (
        <div className="hud-pip-label">
          {vehicleMode === 'drone' ? 'FPV CAMERA LIVE · 5.8GHz SIM' : 'ESP32-CAM LIVE · GC2145 SIM'}
        </div>
      )}

      {/* Arena Telemetry HUD */}
      {mode === 'arena' && (
        <div className="hud-top-right float-card" style={{ padding: '8px 10px', minWidth: 192 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '3px 10px',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
            }}
          >
            <span style={{ color: 'var(--text-muted)' }}>WORLD</span>
            <span>
              {arenaConfig.widthM.toFixed(0)}×{arenaConfig.lengthM.toFixed(0)} m
            </span>
            <span style={{ color: 'var(--text-muted)' }}>YAW</span>
            <span>{arenaHud.yawDeg.toFixed(1)}°</span>
            {vehicleMode === 'drone' && (
              <>
                <span style={{ color: 'var(--text-muted)' }}>ALT</span>
                <span style={{ color: 'var(--accent-strong)' }}>{arenaHud.altitudeM.toFixed(2)} m</span>
              </>
            )}
            <span style={{ color: 'var(--text-muted)' }}>DIST</span>
            <span
              style={{
                color:
                  arenaHud.ultrasonicCm !== null && arenaHud.ultrasonicCm < 40
                    ? 'var(--amber)'
                    : 'var(--green)',
              }}
            >
              {arenaHud.ultrasonicCm !== null ? `${arenaHud.ultrasonicCm.toFixed(1)} cm` : 'Clear'}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>SPEED</span>
            <span>{arenaHud.speedMps.toFixed(2)} m/s</span>
            <span style={{ color: 'var(--text-muted)' }}>BAGS</span>
            <span style={{ color: 'var(--accent-strong)' }}>
              {arenaHud.bagsPassed} passed · {arenaHud.collisions} hits
            </span>
            <span style={{ color: 'var(--text-muted)' }}>PATH</span>
            <span>{arenaHud.pathLengthM.toFixed(2)} m</span>
            <span style={{ color: 'var(--text-muted)' }}>MAP</span>
            <span style={{ color: 'var(--accent-strong)' }}>
              {arenaHud.exploredPercent}% ({arenaHud.mappedHitCount} pts)
            </span>
          </div>
        </div>
      )}

      {/* Hover Pin Probe Tooltip */}
      {hoverPin && (
        <div className="pin-tooltip" style={{ left: hoverPin.screenX + 14, top: hoverPin.screenY + 14 }}>
          <div style={{ fontWeight: 700 }}>
            {hoverPin.componentLabel} · <span style={{ color: '#38bdf8' }}>{hoverPin.pinLabel}</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', color: '#fbbf24', marginTop: 2 }}>
            Net: {hoverPin.voltageText}
          </div>
          {hoverPin.fullNote && <div style={{ color: '#f87171', marginTop: 2 }}>{hoverPin.fullNote}</div>}
        </div>
      )}

      {wireNotice && (
        <div className="wire-notice" role="status">
          {wireNotice}
        </div>
      )}
    </div>
  );
}
