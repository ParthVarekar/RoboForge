import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Code2,
  Map as MapIcon,
  SlidersHorizontal,
  Terminal,
  Wrench,
} from 'lucide-react';
import { createArenaObstacle, getArenaTemplate } from './catalog/arenaPresets';
import { getPartSpec } from './catalog/partsCatalog';
import { createPresetProject, DEFAULT_ARENA_OBSTACLES, ROOM_MAPPING_SKETCH } from './catalog/presets';
import { ArenaBuilderStrip } from './components/ArenaBuilderStrip';
import { ArenaControlsPanel } from './components/ArenaControlsPanel';
import { CadToolStrip } from './components/CadToolStrip';
import { CodePanel } from './components/CodePanel';
import { ConfirmDialog, type ConfirmRequest } from './components/ConfirmDialog';
import { ExportModal } from './components/ExportModal';
import { InspectorPanel } from './components/InspectorPanel';
import { LogicPlotterPanel } from './components/LogicPlotterPanel';
import { MapPanel } from './components/MapPanel';
import { PartsPanel } from './components/PartsPanel';
import { SerialPanel } from './components/SerialPanel';
import { Toolbar, type StudioViewMode } from './components/Toolbar';
import { Viewport3D } from './components/Viewport3D';
import {
  ArenaPhysicsEngine,
  type ArenaVehicleMode,
  type DroneFlightInput,
} from './engine/arenaPhysics';
import { analyzeCircuit, resolveMotorDrives, type MotorDriveOutput } from './engine/circuit';
import { DisplayBench } from './engine/displays/panels';
import { pinRefusal } from './engine/pinCapacity';
import { VirtualEsp32Runtime, type SerialEntry } from './engine/runtime';
import type { SketchProblem } from './engine/sketchTranspiler';
import {
  parseStudioProject,
  resolveArenaConfig,
  type ArenaConfig,
  type ArenaEnvironment,
  type ArenaObstacle,
  type ArenaObstacleKind,
  type ComponentInstance,
  type ComponentKind,
  type StudioProject,
  type TwinFaultConfig,
  type Vec3,
  type WireConnection,
  type WirePinRef,
} from './schema/projectSchema';
import type { ArenaEditTool } from './viewport/ArenaScene';
import type { WorkbenchTool } from './viewport/WorkbenchScene';

type RightTab = 'inspect' | 'code' | 'serial' | 'scope' | 'map' | 'arena';

/** The build and sketch are kept in this browser so a reload or a closed tab never loses work. */
const SESSION_KEY = 'roboforge.studio.session.v1';

interface SavedSession {
  presetId: string;
  project: StudioProject;
  savedAt: number;
}

function loadSession(): SavedSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { presetId?: unknown; project?: unknown; savedAt?: unknown };
    return {
      presetId: typeof data.presetId === 'string' ? data.presetId : 'roboforge_rover',
      project: parseStudioProject(data.project),
      savedAt: typeof data.savedAt === 'number' ? data.savedAt : Date.now(),
    };
  } catch {
    // missing, unreadable or from an older format: start from the preset
    return null;
  }
}

/** A project's content without the generated obstacle ids, to tell whether the user changed a preset. */
function projectFingerprint(p: StudioProject): string {
  return JSON.stringify({ ...p, obstacles: p.obstacles.map(({ id: _id, ...rest }) => rest) });
}

interface ProjectHistoryState {
  past: StudioProject[];
  present: StudioProject;
  future: StudioProject[];
}

/**
 * Root RoboForge Studio Trial application integrating the precision Light/Dark 3D CAD Workbench,
 * high-detail components, orthogonal harness wire routing & tie-points, offline Monaco IDE,
 * live 4-ch oscilloscope, 2D SLAM occupancy map, and customizable 3D Physics Arena & Environment Builder.
 */
export function App(): React.ReactElement {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [restored] = useState<SavedSession | null>(() => loadSession());
  const [presetId, setPresetId] = useState(restored?.presetId ?? 'roboforge_rover');
  const [history, setHistory] = useState<ProjectHistoryState>(() => ({
    past: [],
    present: restored?.project ?? createPresetProject('roboforge_rover'),
    future: [],
  }));
  const project = history.present;

  const [mode, setMode] = useState<StudioViewMode>('workbench');
  const [tool, setTool] = useState<WorkbenchTool>('select');
  const [showMat, setShowMat] = useState(true);
  const [showCom, setShowCom] = useState(false);
  const [snapMm] = useState(1);

  const [rightTab, setRightTab] = useState<RightTab>('inspect');
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);
  const [routingWireId, setRoutingWireId] = useState<string | null>(null);
  const [arenaEditTool, setArenaEditTool] = useState<ArenaEditTool>('select');
  const [selectedObstacleId, setSelectedObstacleId] = useState<string | null>(null);
  const [vehicleOverride, setVehicleOverride] = useState<ArenaVehicleMode | null>(null);
  const [cursorMm, setCursorMm] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [isRunning, setIsRunning] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [serialLog, setSerialLog] = useState<SerialEntry[]>([]);
  const [benchDistanceCm, setBenchDistanceCm] = useState(85);
  const [exportOpen, setExportOpen] = useState(false);
  const [runtimeProblem, setRuntimeProblem] = useState<SketchProblem | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(restored?.savedAt ?? null);
  const [codeWide, setCodeWide] = useState(false);
  const [verifyRequest, setVerifyRequest] = useState(0);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const closeConfirm = useCallback(() => setConfirmRequest(null), []);

  const arenaConfig = resolveArenaConfig(project);
  const hasQuadHardware = useMemo(
    () => project.components.some((c) => c.kind === 'frame_quad_5in' || c.kind === 'fc_esc_stack'),
    [project.components],
  );
  const vehicleMode: ArenaVehicleMode = vehicleOverride ?? (hasQuadHardware ? 'drone' : 'rover');

  const analysis = useMemo(() => analyzeCircuit(project), [project]);
  const analysisRef = useRef(analysis);
  analysisRef.current = analysis;

  // the display modules on the bench: powered from the circuit, driven by the sketch, painted by the 3D view
  const displayBenchRef = useRef<DisplayBench | null>(null);
  if (!displayBenchRef.current) displayBenchRef.current = new DisplayBench();
  const displayBench = displayBenchRef.current;
  useEffect(() => {
    displayBench.sync(analysis.sensors.i2cDevices);
  }, [analysis, displayBench]);

  const modeRef = useRef(mode);
  modeRef.current = mode;

  const projectRef = useRef(project);
  projectRef.current = project;
  const presetIdRef = useRef(presetId);
  presetIdRef.current = presetId;
  const runRef = useRef<() => void>(() => undefined);

  const vehicleModeRef = useRef(vehicleMode);
  vehicleModeRef.current = vehicleMode;

  const benchDistRef = useRef(benchDistanceCm);
  benchDistRef.current = benchDistanceCm;

  const pressedButtonsRef = useRef<Set<string>>(new Set());

  const physicsRef = useRef<ArenaPhysicsEngine>(
    new ArenaPhysicsEngine(analysis.budget.totalMassGrams, project.obstacles, project.faults, arenaConfig),
  );
  const liveMotorsRef = useRef<MotorDriveOutput[]>([]);
  const livePinPwmRef = useRef<ReadonlyMap<number, number>>(new Map());
  const manualDriveRef = useRef<{ left: number; right: number }>({ left: 0, right: 0 });
  const droneInputRef = useRef<DroneFlightInput>({ forward: 0, strafe: 0, climb: 0, yaw: 0, throttle: 0 });
  const keysDownRef = useRef<Set<string>>(new Set());

  // Pure single-state updates compatible with React 18 StrictMode
  const commitProject = useCallback((updater: (prev: StudioProject) => StudioProject) => {
    setHistory((h) => ({
      past: [...h.past.slice(-29), h.present],
      present: updater(h.present),
      future: [],
    }));
  }, []);

  const updateProjectInPlace = useCallback((updater: (prev: StudioProject) => StudioProject) => {
    setHistory((h) => ({
      ...h,
      present: updater(h.present),
    }));
  }, []);

  const replaceProjectResetHistory = useCallback((next: StudioProject) => {
    setHistory({ past: [], present: next, future: [] });
  }, []);

  const handleUndo = useCallback(() => {
    setHistory((h) => {
      if (h.past.length === 0) return h;
      const previous = h.past[h.past.length - 1]!;
      return {
        past: h.past.slice(0, -1),
        present: previous,
        future: [h.present, ...h.future.slice(0, 29)],
      };
    });
  }, []);

  const handleRedo = useCallback(() => {
    setHistory((h) => {
      if (h.future.length === 0) return h;
      const next = h.future[0]!;
      return {
        past: [...h.past.slice(-29), h.present],
        present: next,
        future: h.future.slice(1),
      };
    });
  }, []);

  const appendSerial = useCallback((entry: SerialEntry) => {
    setSerialLog((prev) => (prev.length > 250 ? [...prev.slice(-220), entry] : [...prev, entry]));
  }, []);

  const runtimeRef = useRef<VirtualEsp32Runtime | null>(null);
  if (!runtimeRef.current) {
    runtimeRef.current = new VirtualEsp32Runtime({
      isEsp32Powered: () => analysisRef.current.sensors.controllerPowered,
      isMpuReady: () => analysisRef.current.sensors.mpu6050Ready,
      isOledReady: () => analysisRef.current.sensors.oledReady,
      isUltrasonicReady: (trig, echo) => {
        const s = analysisRef.current.sensors;
        if (!s.hcsr04Ready) return false;
        const trigOk = trig < 0 || s.hcsr04TrigGpio === trig;
        const echoOk = s.hcsr04EchoGpio === echo;
        return trigOk && echoOk;
      },
      readUltrasonicCm: () =>
        modeRef.current === 'arena'
          ? physicsRef.current.getTelemetry().ultrasonicCm
          : benchDistRef.current,
      readYawDeg: () => (modeRef.current === 'arena' ? physicsRef.current.getTelemetry().yawDeg : 0),
      readYawRateDegPerSec: () =>
        modeRef.current === 'arena' ? physicsRef.current.getTelemetry().yawRateDegPerSec : 0,
      zeroYaw: () => physicsRef.current.zeroGyro(),
      readExternalPinHigh: (pin) =>
        analysisRef.current.sensors.buttonPins.some(
          (b) => b.gpio === pin && pressedButtonsRef.current.has(b.componentId),
        ),
      displays: () => displayBenchRef.current,
      onSerial: appendSerial,
      onRuntimeError: (msg, line) => {
        setCompileError(line ? `Line ${line}: ${msg}` : msg);
        setRuntimeProblem(line ? { line, column: 1, message: msg, severity: 'error' } : null);
        setIsRunning(false);
      },
      onRunningChange: (running) => setIsRunning(running),
    });
  }

  useEffect(() => {
    physicsRef.current.setFaults(project.faults);
  }, [project.faults]);

  useEffect(() => {
    physicsRef.current.setArenaConfig(arenaConfig);
  }, [arenaConfig]);

  useEffect(() => {
    physicsRef.current.setVehicleMode(vehicleMode);
  }, [vehicleMode]);

  useEffect(() => {
    physicsRef.current.setObstacles(project.obstacles);
  }, [project.obstacles]);

  useEffect(() => {
    return () => runtimeRef.current?.stop();
  }, []);

  const saveSession = useCallback((proj: StudioProject, pid: string) => {
    try {
      const now = Date.now();
      window.localStorage.setItem(SESSION_KEY, JSON.stringify({ presetId: pid, project: proj, savedAt: now }));
      setSavedAt(now);
    } catch {
      // storage full or blocked (private window): keep working, just without the saved copy
    }
  }, []);

  // autosave shortly after every change
  useEffect(() => {
    const t = window.setTimeout(() => saveSession(project, presetId), 600);
    return () => window.clearTimeout(t);
  }, [project, presetId, saveSession]);

  useEffect(() => {
    if (restored) {
      appendSerial({
        id: Date.now(),
        timeMs: 0,
        text: `Restored your last session (saved ${new Date(restored.savedAt).toLocaleString()}). Choose a preset to start fresh.`,
        level: 'info',
      });
    }
    // once, on first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global keyboard shortcuts: Undo/Redo, Delete (Workbench & Arena), Arena WASD+Q/E & Space E-STOP
  useEffect(() => {
    const isTypingTarget = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        el.isContentEditable ||
        Boolean(el.closest('.monaco-editor'))
      );
    };

    const recomputeManualKeys = () => {
      const k = keysDownRef.current;
      let fwd = 0;
      let turn = 0;
      let climb = 0;
      if (k.has('w')) fwd += 0.85;
      if (k.has('s')) fwd -= 0.85;
      if (k.has('a')) turn += 0.75;
      if (k.has('d')) turn -= 0.75;
      if (k.has('q')) climb += 1.0;
      if (k.has('e')) climb -= 1.0;

      if (vehicleModeRef.current === 'drone') {
        droneInputRef.current = {
          forward: fwd,
          strafe: 0,
          climb,
          yaw: turn,
          throttle: Math.abs(fwd) > 0.01 || Math.abs(turn) > 0.01 || Math.abs(climb) > 0.01 ? 0.7 : 0,
        };
      } else {
        manualDriveRef.current = {
          left: Math.max(-1, Math.min(1, fwd - turn * 0.85)),
          right: Math.max(-1, Math.min(1, fwd + turn * 0.85)),
        };
      }
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      // a confirm dialog owns the keyboard; the editor handles its own Ctrl+S / Ctrl+Enter
      if (ev.defaultPrevented || document.querySelector('[role="alertdialog"]')) return;
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
        ev.preventDefault();
        saveSession(projectRef.current, presetIdRef.current);
        setVerifyRequest((n) => n + 1);
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter' && !isTypingTarget(ev.target)) {
        ev.preventDefault();
        runRef.current();
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z' && !isTypingTarget(ev.target)) {
        ev.preventDefault();
        handleUndo();
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y' && !isTypingTarget(ev.target)) {
        ev.preventDefault();
        handleRedo();
        return;
      }
      if (isTypingTarget(ev.target)) return;

      const lower = ev.key.toLowerCase();
      if (modeRef.current === 'arena' && ['w', 'a', 's', 'd', 'q', 'e'].includes(lower)) {
        keysDownRef.current.add(lower);
        recomputeManualKeys();
      } else if (ev.key === ' ' && modeRef.current === 'arena') {
        ev.preventDefault();
        runtimeRef.current?.stop();
        manualDriveRef.current = { left: 0, right: 0 };
        droneInputRef.current = { forward: 0, strafe: 0, climb: 0, yaw: 0, throttle: 0 };
      } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
        if (modeRef.current === 'workbench') {
          if (selectedWireId) {
            commitProject((p) => ({ ...p, wires: p.wires.filter((w) => w.id !== selectedWireId) }));
            setSelectedWireId(null);
            setRoutingWireId(null);
          } else if (selectedComponentId) {
            commitProject((p) => ({
              ...p,
              components: p.components.filter((c) => c.id !== selectedComponentId),
              wires: p.wires.filter(
                (w) => w.from.componentId !== selectedComponentId && w.to.componentId !== selectedComponentId,
              ),
            }));
            setSelectedComponentId(null);
          }
        } else if (modeRef.current === 'arena' && selectedObstacleId) {
          commitProject((p) => ({
            ...p,
            obstacles: p.obstacles.filter((o) => o.id !== selectedObstacleId),
          }));
          setSelectedObstacleId(null);
        }
      }
    };

    const onKeyUp = (ev: KeyboardEvent) => {
      const lower = ev.key.toLowerCase();
      if (keysDownRef.current.has(lower)) {
        keysDownRef.current.delete(lower);
        recomputeManualKeys();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [selectedComponentId, selectedWireId, selectedObstacleId, commitProject, handleUndo, handleRedo, saveSession]);

  const handleSyncLiveFrame = useCallback(() => {
    const rt = runtimeRef.current;
    if (rt) {
      rt.recordSignalSample();
      const pwmMap = rt.getPinPwmMap();
      livePinPwmRef.current = pwmMap;
      liveMotorsRef.current = resolveMotorDrives(analysisRef.current, pwmMap);
    }
  }, []);

  const startSketch = useCallback(
    (codeToRun: string) => {
      setCompileError(null);
      setRuntimeProblem(null);
      if (project.circuitProtection && analysis.hasCriticalFault) {
        const crit = analysis.diagnostics.find((d) => d.severity === 'critical');
        const msg = `Blocked by Circuit Check: ${crit?.title ?? 'Critical electrical fault'}`;
        setCompileError(msg);
        setRightTab('inspect');
        appendSerial({ id: Date.now(), timeMs: 0, text: msg, level: 'error' });
        return;
      }
      const res = runtimeRef.current?.start(codeToRun);
      if (res && !res.ok) {
        setCompileError(res.error);
        setRightTab('code');
      }
    },
    [project.circuitProtection, analysis, appendSerial],
  );

  const handleRun = () => startSketch(project.code);
  runRef.current = handleRun;

  const handleStop = () => {
    runtimeRef.current?.stop();
    manualDriveRef.current = { left: 0, right: 0 };
    droneInputRef.current = { forward: 0, strafe: 0, climb: 0, yaw: 0, throttle: 0 };
  };

  const handleEstop = () => {
    runtimeRef.current?.stop();
    manualDriveRef.current = { left: 0, right: 0 };
    droneInputRef.current = { forward: 0, strafe: 0, climb: 0, yaw: 0, throttle: 0 };
    appendSerial({ id: Date.now(), timeMs: 0, text: 'E-STOP activated — all outputs zeroed.', level: 'error' });
  };

  /** Asks first when the current build differs from its preset, since loading replaces it. */
  const confirmReplace = (title: string, apply: () => void) => {
    if (projectFingerprint(project) === projectFingerprint(createPresetProject(presetId))) {
      apply();
      return;
    }
    setConfirmRequest({
      title,
      message: 'This replaces your current build and sketch. Your changes are not kept; use Export first if you want a copy.',
      confirmLabel: 'Replace my build',
      onConfirm: apply,
    });
  };

  const handleSelectPreset = (nextPresetId: string) => confirmReplace('Load a different preset?', () => loadPreset(nextPresetId));

  const loadPreset = (nextPresetId: string) => {
    handleStop();
    setRuntimeProblem(null);
    setPresetId(nextPresetId);
    const next = createPresetProject(nextPresetId);
    replaceProjectResetHistory(next);
    setSelectedComponentId(null);
    setSelectedWireId(null);
    setRoutingWireId(null);
    setSelectedObstacleId(null);
    setArenaEditTool('select');
    setVehicleOverride(null);
    setCompileError(null);
    setSerialLog([]);
    physicsRef.current.setArenaConfig(resolveArenaConfig(next));
    physicsRef.current.resetRover();
  };

  const handleLoadAndRunRoomMapper = () => confirmReplace('Load the room mapper?', loadAndRunRoomMapper);

  const loadAndRunRoomMapper = () => {
    handleStop();
    setRuntimeProblem(null);
    setPresetId('room_mapper');
    const next = createPresetProject('room_mapper');
    next.code = ROOM_MAPPING_SKETCH;
    replaceProjectResetHistory(next);
    setSelectedComponentId(null);
    setSelectedWireId(null);
    setRoutingWireId(null);
    setSelectedObstacleId(null);
    setArenaEditTool('select');
    setVehicleOverride('rover');
    setCompileError(null);
    setSerialLog([]);
    physicsRef.current.setVehicleMode('rover');
    physicsRef.current.setArenaConfig(resolveArenaConfig(next));
    physicsRef.current.resetRover();
    setMode('arena');
    setRightTab('map');
    setTimeout(() => {
      runtimeRef.current?.start(ROOM_MAPPING_SKETCH);
    }, 30);
  };

  const handleAddPart = (kind: ComponentKind) => {
    const spec = getPartSpec(kind);
    const count = project.components.filter((c) => c.kind === kind).length + 1;
    const id = `${kind}_${Date.now().toString(36).slice(-4)}`;
    const offset = ((project.components.length % 5) - 2) * 2.5;
    const nextComp: ComponentInstance = {
      id,
      kind,
      label: `${spec.shortName} ${count}`,
      position: [
        offset,
        kind.startsWith('cad_') || kind === 'chassis_2wd' || kind === 'dc_motor' ? 0 : 0.45,
        -2.0 + (count % 3) * 2.5,
      ],
      rotationY: 0,
      side: kind === 'dc_motor' || kind === 'brushless_2207' ? (count % 2 === 1 ? 'left' : 'right') : undefined,
    };
    commitProject((p) => ({ ...p, components: [...p.components, nextComp] }));
    setSelectedComponentId(id);
    setSelectedWireId(null);
    setRoutingWireId(null);
    setRightTab('inspect');
  };

  const handleConnectPins = (from: WirePinRef, to: WirePinRef) => {
    // the bench refuses these already; this keeps any other caller to the same rule
    if (pinRefusal(project, from) || pinRefusal(project, to)) return;
    const id = `w_${Date.now().toString(36).slice(-5)}`;
    const color =
      from.pinId.includes('GND') || to.pinId.includes('GND')
        ? '#18181b'
        : from.pinId.includes('POS') || from.pinId === 'VIN' || from.pinId === 'VM' || from.pinId === '3V3'
          ? '#ef4444'
          : '#0284c7';
    commitProject((p) => ({ ...p, wires: [...p.wires, { id, from, to, color, style: 'routed' }] }));
    setSelectedWireId(id);
    setSelectedComponentId(null);
    setRightTab('inspect');
  };

  const handleAddWireWaypoint = (wireId: string, point: Vec3) => {
    commitProject((p) => ({
      ...p,
      wires: p.wires.map((w) =>
        w.id === wireId ? { ...w, waypoints: [...(w.waypoints ?? []), point] } : w,
      ),
    }));
  };

  const handleUpdateComponent = (id: string, patch: Partial<ComponentInstance>) => {
    commitProject((p) => ({
      ...p,
      components: p.components.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  };

  const handleDuplicateComponent = (id: string) => {
    const src = project.components.find((c) => c.id === id);
    if (!src) return;
    const copyId = `${src.kind}_${Date.now().toString(36).slice(-4)}`;
    const copy: ComponentInstance = {
      ...structuredClone(src),
      id: copyId,
      label: `${src.label} Copy`,
      position: [
        Number((src.position[0] + 2.5).toFixed(2)),
        src.position[1],
        Number((src.position[2] + 1.5).toFixed(2)),
      ],
    };
    commitProject((p) => ({ ...p, components: [...p.components, copy] }));
    setSelectedComponentId(copyId);
    setSelectedWireId(null);
  };

  const handleUpdateWire = (id: string, patch: Partial<WireConnection>) => {
    commitProject((p) => ({
      ...p,
      wires: p.wires.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    }));
  };

  const handleDeleteSelected = () => {
    if (selectedWireId) {
      commitProject((p) => ({ ...p, wires: p.wires.filter((w) => w.id !== selectedWireId) }));
      setSelectedWireId(null);
      setRoutingWireId(null);
    } else if (selectedComponentId) {
      commitProject((p) => ({
        ...p,
        components: p.components.filter((c) => c.id !== selectedComponentId),
        wires: p.wires.filter(
          (w) => w.from.componentId !== selectedComponentId && w.to.componentId !== selectedComponentId,
        ),
      }));
      setSelectedComponentId(null);
    }
  };

  const handleImportJson = (jsonText: string) => {
    try {
      const parsed = parseStudioProject(JSON.parse(jsonText));
      handleStop();
      setRuntimeProblem(null);
      replaceProjectResetHistory(parsed);
      setSelectedComponentId(null);
      setSelectedWireId(null);
      setRoutingWireId(null);
      setSelectedObstacleId(null);
      setCompileError(null);
      physicsRef.current.setArenaConfig(resolveArenaConfig(parsed));
      physicsRef.current.resetRover();
      appendSerial({ id: Date.now(), timeMs: 0, text: `Imported project "${parsed.name}".`, level: 'info' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCompileError(`Import failed: ${msg}`);
      setRightTab('code');
    }
  };

  // Customizable Arena & Obstacle Handlers
  const handleApplyArenaTemplate = (env: ArenaEnvironment) => {
    const tpl = getArenaTemplate(env);
    commitProject((p) => ({ ...p, arena: tpl.config, obstacles: tpl.obstacles }));
    setSelectedObstacleId(null);
    setArenaEditTool('select');
    physicsRef.current.setArenaConfig(tpl.config);
    physicsRef.current.resetRover();
  };

  const handleChangeArenaConfig = (nextArena: ArenaConfig) => {
    updateProjectInPlace((p) => ({ ...p, arena: nextArena }));
  };

  const handleAddObstacle = (kind: ArenaObstacleKind) => {
    const idx = project.obstacles.length + 1;
    const maxZ = Math.max(0.8, arenaConfig.lengthM * 0.32);
    const zPos = Math.max(-maxZ, 0.9 - (idx % 6) * 0.65);
    const xPos = idx % 2 === 0 ? 0.55 : -0.55;
    const obs = createArenaObstacle(kind, xPos, zPos, idx);
    commitProject((p) => ({ ...p, obstacles: [...p.obstacles, obs] }));
    setSelectedObstacleId(obs.id);
    setRightTab('arena');
  };

  const handlePlaceObstacleAt = (kind: ArenaObstacleKind, x: number, z: number) => {
    const idx = project.obstacles.length + 1;
    const obs = createArenaObstacle(kind, x, z, idx);
    commitProject((p) => ({ ...p, obstacles: [...p.obstacles, obs] }));
    setSelectedObstacleId(obs.id);
  };

  const handleDrawWall = (cx: number, cz: number, lengthM: number, rotationY: number) => {
    const idx = project.obstacles.length + 1;
    const wallH = Math.max(0.65, arenaConfig.wallHeightM || 0.85);
    const obs = createArenaObstacle('wall', cx, cz, idx, {
      size: [lengthM, wallH, 0.14],
      rotationY,
      label: `Custom Wall ${idx}`,
    });
    commitProject((p) => ({ ...p, obstacles: [...p.obstacles, obs] }));
    setSelectedObstacleId(obs.id);
  };

  const handleUpdateObstacle = (id: string, patch: Partial<ArenaObstacle>) => {
    commitProject((p) => ({
      ...p,
      obstacles: p.obstacles.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    }));
  };

  const handleDuplicateObstacle = (id: string) => {
    const src = project.obstacles.find((o) => o.id === id);
    if (!src) return;
    const copy: ArenaObstacle = {
      ...structuredClone(src),
      id: `${src.kind}_${Date.now().toString(36).slice(-4)}`,
      label: `${src.label} Copy`,
      position: [Number((src.position[0] + 0.6).toFixed(2)), src.position[1], Number((src.position[2] + 0.4).toFixed(2))],
    };
    commitProject((p) => ({ ...p, obstacles: [...p.obstacles, copy] }));
    setSelectedObstacleId(copy.id);
  };

  const handleChangeFaults = (faults: TwinFaultConfig) => {
    updateProjectInPlace((p) => ({ ...p, faults }));
  };

  const diagCount = analysis.diagnostics.length;
  const selectionLabel =
    mode === 'arena' && selectedObstacleId
      ? `${project.obstacles.find((o) => o.id === selectedObstacleId)?.label ?? selectedObstacleId} selected`
      : selectedWireId
        ? `Wire ${selectedWireId} selected`
        : selectedComponentId
          ? `${project.components.find((c) => c.id === selectedComponentId)?.label ?? selectedComponentId} selected`
          : 'Nothing selected';

  return (
    <div className="studio-shell" data-theme={theme}>
      <Toolbar
        mode={mode}
        onModeChange={(nextMode) => {
          setMode(nextMode);
          setRoutingWireId(null);
          if (nextMode === 'arena' && rightTab === 'inspect') setRightTab('arena');
          if (nextMode === 'workbench' && rightTab === 'arena') setRightTab('inspect');
        }}
        presetId={presetId}
        onSelectPreset={handleSelectPreset}
        isRunning={isRunning}
        onRun={handleRun}
        onStop={handleStop}
        onEstop={handleEstop}
        circuitProtection={project.circuitProtection}
        onToggleProtection={() => updateProjectInPlace((p) => ({ ...p, circuitProtection: !p.circuitProtection }))}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        onOpenExport={() => setExportOpen(true)}
        onImportJson={handleImportJson}
      />

      <main className={`workspace-body${codeWide && rightTab === 'code' ? ' code-wide' : ''}`}>
        <PartsPanel analysis={analysis} onAddPart={handleAddPart} />

        <div className="center-column">
          {mode === 'workbench' ? (
            <CadToolStrip
              tool={tool}
              showCom={showCom}
              hasSelection={Boolean(selectedComponentId || selectedWireId)}
              hasComponentSelection={Boolean(selectedComponentId)}
              onSelectTool={(nextTool) => {
                setTool(nextTool);
                setRoutingWireId(null);
              }}
              onAddShape={handleAddPart}
              onRotateStep={() => {
                if (!selectedComponentId) return;
                const c = project.components.find((x) => x.id === selectedComponentId);
                if (c) handleUpdateComponent(c.id, { rotationY: c.rotationY + Math.PI / 12 });
              }}
              onDuplicate={() => {
                if (selectedComponentId) handleDuplicateComponent(selectedComponentId);
              }}
              onDelete={handleDeleteSelected}
              onToggleCom={() => setShowCom((v) => !v)}
            />
          ) : (
            <ArenaBuilderStrip
              activeEnv={arenaConfig.environment}
              editTool={arenaEditTool}
              hasSelection={Boolean(selectedObstacleId)}
              onApplyTemplate={handleApplyArenaTemplate}
              onSelectEditTool={setArenaEditTool}
              onRotateSelected={() => {
                if (!selectedObstacleId) return;
                const o = project.obstacles.find((x) => x.id === selectedObstacleId);
                if (o) {
                  handleUpdateObstacle(o.id, {
                    rotationY: Number((((o.rotationY ?? 0) + Math.PI / 12)).toFixed(3)),
                  });
                }
              }}
              onDuplicateSelected={() => {
                if (selectedObstacleId) handleDuplicateObstacle(selectedObstacleId);
              }}
              onDeleteSelected={() => {
                if (!selectedObstacleId) return;
                commitProject((p) => ({
                  ...p,
                  obstacles: p.obstacles.filter((o) => o.id !== selectedObstacleId),
                }));
                setSelectedObstacleId(null);
              }}
            />
          )}

          <Viewport3D
            mode={mode}
            theme={theme}
            tool={tool}
            showMat={showMat}
            showCom={showCom}
            snapMm={snapMm}
            project={project}
            analysis={analysis}
            selectedComponentId={selectedComponentId}
            selectedWireId={selectedWireId}
            routingWireId={routingWireId}
            arenaEditTool={arenaEditTool}
            selectedObstacleId={selectedObstacleId}
            vehicleMode={vehicleMode}
            displays={displayBench}
            physicsRef={physicsRef}
            liveMotorsRef={liveMotorsRef}
            livePinPwmRef={livePinPwmRef}
            manualDriveRef={manualDriveRef}
            droneInputRef={droneInputRef}
            benchDistanceCm={benchDistanceCm}
            onBenchDistanceChange={setBenchDistanceCm}
            onToggleMat={() => setShowMat((m) => !m)}
            onSelectComponent={(id) => {
              setSelectedComponentId(id);
              setRoutingWireId(null);
              if (id) {
                setSelectedWireId(null);
                setRightTab('inspect');
              }
            }}
            onSelectWire={(id) => {
              setSelectedWireId(id);
              if (!id) setRoutingWireId(null);
              if (id) {
                setSelectedComponentId(null);
                setRightTab('inspect');
              }
            }}
            onConnectPins={handleConnectPins}
            onAddWireWaypoint={handleAddWireWaypoint}
            onCancelWireRouting={() => setRoutingWireId(null)}
            onTransformComponent={(id, position, rotationY) =>
              handleUpdateComponent(id, { position, rotationY })
            }
            onCursorBenchMm={(x, y) => setCursorMm({ x, y })}
            onButtonPress={(cid, pressed) => {
              if (pressed) pressedButtonsRef.current.add(cid);
              else pressedButtonsRef.current.delete(cid);
            }}
            onSelectObstacle={(id) => {
              setSelectedObstacleId(id);
              if (id) setRightTab('arena');
            }}
            onMoveObstacle={(id, position) => handleUpdateObstacle(id, { position })}
            onPlaceObstacle={handlePlaceObstacleAt}
            onDrawWall={handleDrawWall}
            onCancelArenaTool={() => setArenaEditTool('select')}
            onResetRover={() => physicsRef.current.resetRover()}
            onSyncLiveFrame={handleSyncLiveFrame}
          />
        </div>

        <section className="right-panel">
          <div className="tabs-bar">
            <button
              type="button"
              className={`tab-btn ${rightTab === 'inspect' ? 'active' : ''}`}
              onClick={() => setRightTab('inspect')}
            >
              <Wrench size={12} /> Inspect
              {diagCount > 0 && (
                <span className={analysis.hasCriticalFault || analysis.hasError ? 'pill pill-err' : 'pill pill-warn'}>
                  {diagCount}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`tab-btn ${rightTab === 'code' ? 'active' : ''}`}
              onClick={() => setRightTab('code')}
            >
              <Code2 size={12} /> Code
              {(runtimeProblem || compileError) && <span className="tab-dot" aria-label="the sketch has a problem" />}
            </button>
            <button
              type="button"
              className={`tab-btn ${rightTab === 'serial' ? 'active' : ''}`}
              onClick={() => setRightTab('serial')}
            >
              <Terminal size={12} /> Serial
            </button>
            <button
              type="button"
              className={`tab-btn ${rightTab === 'scope' ? 'active' : ''}`}
              onClick={() => setRightTab('scope')}
            >
              <Activity size={12} /> Scope
            </button>
            <button
              type="button"
              className={`tab-btn ${rightTab === 'map' ? 'active' : ''}`}
              onClick={() => setRightTab('map')}
            >
              <MapIcon size={12} /> Map
            </button>
            <button
              type="button"
              className={`tab-btn ${rightTab === 'arena' ? 'active' : ''}`}
              onClick={() => setRightTab('arena')}
            >
              <SlidersHorizontal size={12} /> Twin
            </button>
          </div>

          {rightTab === 'inspect' && (
            <InspectorPanel
              components={project.components}
              wires={project.wires}
              analysis={analysis}
              selectedComponentId={selectedComponentId}
              selectedWireId={selectedWireId}
              routingWireId={routingWireId}
              runtimeNotice={compileError}
              onSelectComponent={(id) => {
                setMode('workbench');
                setSelectedComponentId(id);
                setSelectedWireId(null);
                setRoutingWireId(null);
              }}
              onUpdateComponent={handleUpdateComponent}
              onDuplicateComponent={handleDuplicateComponent}
              onDeleteSelected={handleDeleteSelected}
              onUpdateWire={handleUpdateWire}
              onToggleRouteByHand={(wid) => setRoutingWireId(wid)}
            />
          )}
          <CodePanel
            code={project.code}
            theme={theme}
            hidden={rightTab !== 'code'}
            isRunning={isRunning}
            runtimeProblem={runtimeProblem}
            notice={compileError && !runtimeProblem && !/^Line \d+:/.test(compileError) ? compileError : null}
            savedAt={savedAt}
            wide={codeWide}
            verifyRequest={verifyRequest}
            onChangeCode={(code) => updateProjectInPlace((p) => ({ ...p, code }))}
            onRun={handleRun}
            onStop={handleStop}
            onSave={() => saveSession(project, presetId)}
            onToggleWide={() => setCodeWide((w) => !w)}
            onConfirm={setConfirmRequest}
          />
          {rightTab === 'serial' && (
            <SerialPanel
              entries={serialLog}
              onClear={() => setSerialLog([])}
              onSendInput={(txt) => runtimeRef.current?.pushSerialInput(txt)}
            />
          )}
          {rightTab === 'scope' && (
            <LogicPlotterPanel
              isRunning={isRunning}
              getSamples={() => runtimeRef.current?.getSignalHistory() ?? []}
            />
          )}
          {rightTab === 'map' && (
            <MapPanel
              physicsRef={physicsRef}
              isRunning={isRunning}
              onClearMap={() => physicsRef.current.clearMap()}
              onResetRover={() => physicsRef.current.resetRover()}
              onLoadRoomMapper={handleLoadAndRunRoomMapper}
            />
          )}
          {rightTab === 'arena' && (
            <ArenaControlsPanel
              arenaConfig={arenaConfig}
              vehicleMode={vehicleMode}
              faults={project.faults}
              obstacles={project.obstacles}
              selectedObstacleId={selectedObstacleId}
              onChangeArenaConfig={handleChangeArenaConfig}
              onApplyArenaTemplate={handleApplyArenaTemplate}
              onChangeVehicleMode={(vm) => {
                setVehicleOverride(vm);
                physicsRef.current.setVehicleMode(vm);
              }}
              onChangeFaults={handleChangeFaults}
              onAddObstacle={handleAddObstacle}
              onSelectObstacle={setSelectedObstacleId}
              onUpdateObstacle={handleUpdateObstacle}
              onDuplicateObstacle={handleDuplicateObstacle}
              onRemoveObstacle={(id) => {
                commitProject((p) => ({ ...p, obstacles: p.obstacles.filter((o) => o.id !== id) }));
                if (selectedObstacleId === id) setSelectedObstacleId(null);
              }}
              onResetObstacles={() => {
                commitProject((p) => ({ ...p, obstacles: structuredClone(DEFAULT_ARENA_OBSTACLES) }));
                setSelectedObstacleId(null);
              }}
              onClearObstacles={() => {
                commitProject((p) => ({ ...p, obstacles: [] }));
                setSelectedObstacleId(null);
              }}
              onResetRover={() => physicsRef.current.resetRover()}
              onManualDrive={(left, right) => {
                manualDriveRef.current = { left, right };
              }}
              onManualDroneControl={(patch) => {
                const cur = droneInputRef.current;
                const next: DroneFlightInput = {
                  forward: patch.forward ?? cur.forward,
                  strafe: patch.strafe ?? cur.strafe,
                  climb: patch.climb ?? cur.climb,
                  yaw: patch.yaw ?? cur.yaw,
                  throttle: 0,
                };
                next.throttle =
                  Math.abs(next.forward) > 0.01 ||
                  Math.abs(next.strafe) > 0.01 ||
                  Math.abs(next.climb) > 0.01 ||
                  Math.abs(next.yaw) > 0.01
                    ? 0.72
                    : 0;
                droneInputRef.current = next;
              }}
            />
          )}
        </section>
      </main>

      {/* Bottom Precision CAD Status Bar */}
      <footer className="status-bar">
        <div className="status-group">
          <span>Units <strong>mm</strong></span>
          <span>Snap <strong>{snapMm}</strong></span>
          <span>Turn <strong>15°</strong></span>
          <span>
            X {cursorMm.x.toFixed(1)} · Y {cursorMm.y.toFixed(1)}
          </span>
          <span>Parts <strong>{project.components.length}</strong></span>
          <span>{selectionLabel}</span>
        </div>

        <div className="status-group">
          <span>Mass <strong>{analysis.budget.totalMassGrams} g</strong></span>
          <span>Est. <strong>${analysis.budget.totalCostUsd.toFixed(0)}</strong></span>
          {diagCount === 0 ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--green)', fontWeight: 700 }}>
              <CheckCircle2 size={12} /> No problems
            </span>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--amber)', fontWeight: 700 }}>
              <AlertTriangle size={12} /> {diagCount} issue{diagCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </footer>

      {exportOpen && (
        <ExportModal project={project} analysis={analysis} onClose={() => setExportOpen(false)} />
      )}
      <ConfirmDialog request={confirmRequest} onClose={closeConfirm} />
    </div>
  );
}
