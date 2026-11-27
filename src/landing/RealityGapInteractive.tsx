import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { ArrowRight } from 'lucide-react';

export interface RealityGapInteractiveProps {
  onLaunchRoomMapper: () => void;
}

interface SimPathPoint {
  x: number;
  z: number;
}

function simulateCorridorRun(
  rightMotorScale: number,
  gyroDriftDegPerSec: number,
  useHeadingHold: boolean,
): { points: SimPathPoint[]; hitBag: boolean } {
  const dt = 0.05;
  const maxSteps = 260;
  let x = 0;
  let z = -2.45;
  let yawRad = 0;
  let driftDeg = 0;
  let integralErr = 0;
  const points: SimPathPoint[] = [{ x, z }];
  let hitBag = false;

  const bags: Array<{ x: number; z: number; rx: number; rz: number }> = [
    { x: 0.56, z: 0.15, rx: 0.24, rz: 0.22 },
    { x: -0.56, z: 1.45, rx: 0.24, rz: 0.22 },
  ];

  for (let i = 0; i < maxSteps; i += 1) {
    driftDeg += gyroDriftDegPerSec * dt;
    const measuredYawDeg = (yawRad * 180) / Math.PI + driftDeg;

    let cmdL = 0.72;
    let cmdR = 0.72;
    if (useHeadingHold) {
      integralErr = Math.max(-25, Math.min(25, integralErr + measuredYawDeg * dt));
      const steer = Math.max(-0.34, Math.min(0.34, measuredYawDeg * 0.032 + integralErr * 0.018));
      cmdL = Math.max(0.2, Math.min(1, 0.72 - steer));
      cmdR = Math.max(0.2, Math.min(1, 0.72 + steer));
    }

    const effL = cmdL * 1.0;
    const effR = cmdR * rightMotorScale;
    const v = ((effL + effR) * 0.5) * 0.62;
    // Positive omega curves toward +x (downward on canvas) when the right motor is weaker than the left
    const omega = ((effL - effR) * 0.62) / 0.88;

    yawRad += omega * dt;
    x += Math.sin(yawRad) * v * dt;
    z += Math.cos(yawRad) * v * dt;

    if (Math.abs(x) > 1.72 || z > 2.65) {
      points.push({ x: Math.max(-1.72, Math.min(1.72, x)), z: Math.min(2.65, z) });
      break;
    }

    for (const b of bags) {
      if (Math.abs(x - b.x) < b.rx + 0.09 && Math.abs(z - b.z) < b.rz + 0.1) {
        hitBag = true;
      }
    }
    points.push({ x, z });
    if (hitBag) break;
  }

  return { points, hitBag };
}

/**
 * Interactive Reality-Gap trajectory comparison canvas illustrating how RoboForge Studio models
 * weaker DC motors and MPU6050 gyro drift before deploying firmware to real hardware.
 */
export function RealityGapInteractive({ onLaunchRoomMapper }: RealityGapInteractiveProps): React.ReactElement {
  const [rightGainPct, setRightGainPct] = useState(85);
  const [gyroDrift, setGyroDrift] = useState(0.4);
  const [showIdealRef, setShowIdealRef] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const openLoop = simulateCorridorRun(rightGainPct / 100, gyroDrift, false);
  const closedLoop = simulateCorridorRun(rightGainPct / 100, gyroDrift, true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#0e141b';
    ctx.fillRect(0, 0, w, h);

    const toPx = (wx: number, wz: number): [number, number] => [
      ((wz + 3.0) / 6.0) * (w - 56) + 28,
      ((wx + 2.0) / 4.0) * (h - 48) + 24,
    ];

    // Arena floor grid
    ctx.strokeStyle = 'rgba(244, 247, 250, 0.07)';
    ctx.lineWidth = 1;
    for (let gz = -3; gz <= 3; gz += 0.5) {
      const [px] = toPx(0, gz);
      ctx.beginPath();
      ctx.moveTo(px, 24);
      ctx.lineTo(px, h - 24);
      ctx.stroke();
    }
    for (let gx = -2; gx <= 2; gx += 0.5) {
      const [, py] = toPx(gx, 0);
      ctx.beginPath();
      ctx.moveTo(28, py);
      ctx.lineTo(w - 28, py);
      ctx.stroke();
    }

    // Perimeter border
    ctx.strokeStyle = 'rgba(244, 247, 250, 0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(28, 24, w - 56, h - 48);

    // Centerline tape (left-to-right from Start to Goal)
    if (showIdealRef) {
      const [sx, sy] = toPx(0, -2.45);
      const [ex, ey] = toPx(0, 2.65);
      ctx.strokeStyle = 'rgba(244, 247, 250, 0.24)';
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Demo bags placed alongside the corridor
    const bags = [
      { x: 0.56, z: 0.15, label: 'Bag 1' },
      { x: -0.56, z: 1.45, label: 'Bag 2' },
    ];
    for (const bag of bags) {
      const [bx, by] = toPx(bag.x, bag.z);
      ctx.fillStyle = '#b45309';
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5;
      ctx.fillRect(bx - 22, by - 14, 44, 28);
      ctx.strokeRect(bx - 22, by - 14, 44, 28);
      ctx.fillStyle = '#fef3c7';
      ctx.font = '500 13px "IBM Plex Sans", sans-serif';
      ctx.fillText(bag.label, bx - 17, by + 5);
    }

    // Draw trajectories (Start on left at z = -2.45 driving right toward z = +2.65)
    const drawTrace = (pts: SimPathPoint[], color: string, width: number) => {
      if (pts.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      pts.forEach((pt, idx) => {
        const [px, py] = toPx(pt.x, pt.z);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();

      const last = pts[pts.length - 1]!;
      const [lx, ly] = toPx(last.x, last.z);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(lx, ly, 5, 0, Math.PI * 2);
      ctx.fill();
    };

    drawTrace(openLoop.points, '#f87171', 2.5);
    drawTrace(closedLoop.points, '#2dd4bf', 3);

    // Start & Goal markers
    const [stX, stY] = toPx(0, -2.45);
    ctx.fillStyle = '#f4f7fa';
    ctx.beginPath();
    ctx.arc(stX, stY, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c4d2e0';
    ctx.font = '500 13px "IBM Plex Sans", sans-serif';
    ctx.fillText('Start', stX - 14, stY - 12);

    const [goalX, goalY] = toPx(0, 2.65);
    ctx.strokeStyle = 'rgba(45, 212, 191, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(goalX, goalY, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#c4d2e0';
    ctx.fillText('Goal', goalX - 14, goalY - 12);
  }, [openLoop, closedLoop, showIdealRef]);

  return (
    <section className="lp-section lp-section-stone">
      <div className="lp-container">
        <h2 className="lp-h2">Code that handles weak motors and slippery floors</h2>
        <p className="lp-body">
          Physical hobby gearmotors never match perfectly. Adjust the right motor gain and gyro drift below to see
          why open-loop driving curves into obstacles while gyro heading-hold tracks straight down the corridor.
        </p>

        <div className="lp-gap-grid">
          <div className="lp-controls-stack">
            <label className="lp-range-field">
              <span className="lp-range-head">
                <span>Right motor gain</span>
                <strong>{rightGainPct}%</strong>
              </span>
              <input
                type="range"
                min={70}
                max={100}
                step={1}
                value={rightGainPct}
                onChange={(ev) => setRightGainPct(Number(ev.target.value))}
              />
            </label>

            <label className="lp-range-field">
              <span className="lp-range-head">
                <span>MPU6050 gyro drift</span>
                <strong>{gyroDrift.toFixed(2)} deg/s</strong>
              </span>
              <input
                type="range"
                min={0}
                max={2.0}
                step={0.05}
                value={gyroDrift}
                onChange={(ev) => setGyroDrift(Number(ev.target.value))}
              />
            </label>

            <div className="lp-segmented" role="tablist" aria-label="Centerline guide overlay">
              <button
                type="button"
                role="tab"
                aria-selected={showIdealRef}
                className="lp-seg-tab"
                onClick={() => setShowIdealRef(true)}
              >
                Show centerline tape
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={!showIdealRef}
                className="lp-seg-tab"
                onClick={() => setShowIdealRef(false)}
              >
                Hide centerline tape
              </button>
            </div>

            <p className="lp-body">
              {openLoop.hitBag
                ? 'At this asymmetry, an open-loop sketch drifts straight into Bag 1. Closed-loop gyro steering stays inside the corridor.'
                : 'Open-loop driving drifts off centerline as motor mismatch increases. Closed-loop MPU6050 steering holds heading.'}
            </p>

            <div>
              <button type="button" className="lp-cta" onClick={onLaunchRoomMapper}>
                Run Autonomous Room Mapper
                <ArrowRight size={17} />
              </button>
            </div>
          </div>

          <div className="lp-sim-canvas-wrap">
            <canvas
              ref={canvasRef}
              width={620}
              height={340}
              className="lp-sim-canvas"
              aria-label="Simulated rover corridor path comparison"
            />
            <div className="lp-sim-legend">
              <span>
                <span className="lp-legend-swatch" style={{ backgroundColor: '#2dd4bf' }} />
                MPU6050 heading-hold path
              </span>
              <span>
                <span className="lp-legend-swatch" style={{ backgroundColor: '#f87171' }} />
                Open-loop path ({openLoop.hitBag ? 'bag collision' : 'off centerline'})
              </span>
              <span>
                <span className="lp-legend-swatch" style={{ backgroundColor: '#fbbf24' }} />
                Demo bags
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
