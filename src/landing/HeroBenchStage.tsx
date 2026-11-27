import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { createPresetProject } from '../catalog/presets';
import { analyzeCircuit, type CircuitAnalysis, type MotorDriveOutput } from '../engine/circuit';
import { gfxGlyph } from '../engine/displays/font5x7';
import { DisplayBench, type Hd44780Panel, type Ssd1306Panel } from '../engine/displays/panels';
import { paintDisplays } from '../viewport/displayPainter';
import { WorkbenchScene, type PinHoverInfo } from '../viewport/WorkbenchScene';

export type HeroPresetKey = 'roboforge_rover' | 'quad_5in' | 'display_lab';

export interface HeroBenchStageProps {
  activePreset: HeroPresetKey;
  onSelectPreset: (preset: HeroPresetKey) => void;
}

const HERO_PRESETS: Array<{ id: HeroPresetKey; label: string; summary: string }> = [
  {
    id: 'roboforge_rover',
    label: '2WD ESP32 rover',
    summary: 'Drag to orbit the wired carbon rover. Hover any gold pin to probe live net voltages.',
  },
  {
    id: 'quad_5in',
    label: '5-inch freestyle quad',
    summary: 'Inspect 2207 brushless copper stators, 3-conductor ESC arm looms, and the 6S XT60 pack.',
  },
  {
    id: 'display_lab',
    label: 'OLED and LCD display lab',
    summary: 'Shared I2C wiring driving both an SSD1306 OLED and a 16x2 character LCD in real time.',
  },
];

function drawOledLines(panel: Ssd1306Panel, lines: readonly string[]): void {
  const buf = new Uint8Array(panel.width * panel.height);
  lines.forEach((line, rowIdx) => {
    const y0 = rowIdx === 0 ? 4 : 20 + (rowIdx - 1) * 14;
    for (let i = 0; i < line.length; i += 1) {
      const cols = gfxGlyph(line.charCodeAt(i));
      const x0 = 6 + i * 6;
      for (let cx = 0; cx < 5; cx += 1) {
        const bits = cols[cx] ?? 0;
        for (let cy = 0; cy < 7; cy += 1) {
          if (((bits >> cy) & 1) !== 0 && x0 + cx < panel.width && y0 + cy < panel.height) {
            buf[(y0 + cy) * panel.width + (x0 + cx)] = 1;
          }
        }
      }
    }
  });
  panel.on = true;
  panel.load(buf, panel.width, panel.height);
}

function writeLcdLines(panel: Hd44780Panel, row0: string, row1: string): void {
  panel.functionSet(true);
  panel.displayControl(true, false, false);
  panel.backlight = true;
  panel.setDdram(0x00);
  for (let i = 0; i < row0.length && i < panel.cols; i += 1) panel.writeData(row0.charCodeAt(i));
  panel.setDdram(0x40);
  for (let i = 0; i < row1.length && i < panel.cols; i += 1) panel.writeData(row1.charCodeAt(i));
}

function seedHeroDisplays(analysis: CircuitAnalysis): DisplayBench {
  const displays = new DisplayBench();
  displays.sync(analysis.sensors.i2cDevices);
  for (const panel of displays.allPanels()) {
    if (!panel.powered) continue;
    if (panel.type === 'oled') {
      drawOledLines(panel, ['ROBOFORGE 2WD', 'I2C 0x3C READY', '3D BENCH ACTIVE', 'DRAG TO ORBIT']);
    } else {
      writeLcdLines(panel, 'RoboForge Studio', 'I2C 0x27 Ready');
    }
  }
  return displays;
}

/**
 * Live interactive Three.js 3D hardware showcase mounted directly inside the landing page hero.
 * Reuses the real WorkbenchScene (26-part procedural CAD catalog, deck cable router, RoomEnvironment PBR)
 * with zero editor chrome and gentle animated wheel/propeller motion.
 */
export function HeroBenchStage({ activePreset, onSelectPreset }: HeroBenchStageProps): React.ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<WorkbenchScene | null>(null);
  const idleMotorsRef = useRef<MotorDriveOutput[]>([]);
  const [webglFailed, setWebglFailed] = useState(false);
  const [hoverPin, setHoverPin] = useState<PinHoverInfo | null>(null);

  const project = useMemo(() => createPresetProject(activePreset), [activePreset]);
  const analysis = useMemo(() => analyzeCircuit(project), [project]);

  idleMotorsRef.current = useMemo(
    () =>
      analysis.motors.map((m) => ({
        motorComponentId: m.motorComponentId,
        kind: m.kind,
        side: m.side,
        command: m.kind === 'brushless' ? 0.35 : 0.28,
        pwmMagnitude: 90,
      })),
    [analysis],
  );

  // Mount a single WorkbenchScene WebGL context once and reuse it cleanly across preset switches
  useEffect(() => {
    const container = hostRef.current;
    if (!container) return;

    let bench: WorkbenchScene | null = null;
    try {
      bench = new WorkbenchScene(container, project, analysis, 'light', {
        onSelectComponent: () => undefined,
        onSelectWire: () => undefined,
        onConnectPins: () => undefined,
        onTransformComponent: () => undefined,
        onHoverPin: setHoverPin,
        onPendingWireChange: () => undefined,
        onCursorBenchMm: () => undefined,
        onMeasureUpdate: () => undefined,
        onCameraAzimuthChange: () => undefined,
        onButtonPress: () => undefined,
        onAddWireWaypoint: () => undefined,
      });
      bench.setCameraView('fit');
      sceneRef.current = bench;
    } catch {
      setWebglFailed(true);
      return;
    }

    const idlePwm = new Map<number, number>([
      [2, 160],
      [4, 210],
    ]);

    const ro = new ResizeObserver(() => bench?.resize());
    ro.observe(container);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let isVisible = true;
    let rafId = 0;
    let last = performance.now();

    const tick = (now: number) => {
      rafId = 0;
      if (!isVisible) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      bench?.updateLiveState(idlePwm, reducedMotion ? [] : idleMotorsRef.current);
      bench?.render(dt);
      rafId = requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (rafId === 0 && isVisible) {
        last = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        isVisible = Boolean(entry?.isIntersecting);
        if (isVisible) {
          startLoop();
        } else if (rafId !== 0) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
      },
      { threshold: 0.02 },
    );
    io.observe(container);
    startLoop();

    return () => {
      if (rafId !== 0) cancelAnimationFrame(rafId);
      io.disconnect();
      ro.disconnect();
      setHoverPin(null);
      bench?.dispose();
      sceneRef.current = null;
    };
    // Intentionally initialize WebGL once; project/preset updates sync via the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const bench = sceneRef.current;
    if (!bench) return;
    bench.syncProject(project, analysis);
    bench.setCameraView('fit');
    const displays = seedHeroDisplays(analysis);
    paintDisplays(bench.displaySurfaces(), displays, performance.now());
  }, [project, analysis]);

  const currentMeta = HERO_PRESETS.find((p) => p.id === activePreset) ?? HERO_PRESETS[0]!;

  return (
    <div className="lp-stage-wrap">
      <div className="lp-stage-frame" aria-label="Interactive 3D RoboForge Workbench Preview">
        {webglFailed ? (
          <>
            <img
              className="lp-stage-fallback"
              src="/landing/rover-macro.webp"
              alt="Illustration (generated image) of an ESP32 2WD rover on a cutting mat; the live 3D bench needs WebGL"
            />
            <span className="lp-illustration-tag">Illustration, generated image</span>
          </>
        ) : (
          <div ref={hostRef} className="lp-stage-canvas" />
        )}

        {hoverPin && (
          <div className="lp-stage-probe" style={{ left: hoverPin.screenX + 14, top: hoverPin.screenY + 14 }}>
            <strong>{hoverPin.componentLabel}</strong> {hoverPin.pinLabel} ({hoverPin.voltageText})
          </div>
        )}
      </div>

      <div className="lp-stage-bar">
        <div className="lp-segmented" role="tablist" aria-label="Choose 3D hardware bench">
          {HERO_PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={activePreset === item.id}
              className="lp-seg-tab"
              onClick={() => onSelectPreset(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="lp-stage-hint">{currentMeta.summary}</span>
      </div>
    </div>
  );
}
