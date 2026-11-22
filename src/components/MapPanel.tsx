import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { Compass, Map as MapIcon, RotateCcw, Trash2 } from 'lucide-react';
import type { ArenaPhysicsEngine, ArenaTelemetry } from '../engine/arenaPhysics';

export interface MapPanelProps {
  physicsRef: React.MutableRefObject<ArenaPhysicsEngine>;
  isRunning: boolean;
  onClearMap: () => void;
  onResetRover: () => void;
  onLoadRoomMapper: () => void;
}

/**
 * Live 2D Occupancy Grid SLAM Map panel rendering walls, demo bags, free space,
 * rover trajectory, active HC-SR04 ray, and zero-collision exploration coverage.
 */
export function MapPanel({
  physicsRef,
  isRunning,
  onClearMap,
  onResetRover,
  onLoadRoomMapper,
}: MapPanelProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stats, setStats] = useState<ArenaTelemetry>(() => physicsRef.current.getTelemetry());

  useEffect(() => {
    let rafId = 0;
    let lastTextMs = 0;

    const draw = (now: number) => {
      const canvas = canvasRef.current;
      const engine = physicsRef.current;
      const grid = engine.getOccupancyGrid();
      const tel = engine.getTelemetry();

      if (canvas) {
        const aspect = grid.halfW / Math.max(0.5, grid.halfL);
        const targetW = Math.round(Math.min(256, Math.max(150, 240 * Math.min(1.15, aspect * 1.4))));
        const targetH = Math.round(Math.min(360, Math.max(180, targetW / Math.max(0.45, aspect))));
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          const cellW = w / grid.cols;
          const cellH = h / grid.rows;

          ctx.fillStyle = '#090f1d';
          ctx.fillRect(0, 0, w, h);

          // Draw occupancy grid cells
          for (let r = 0; r < grid.rows; r += 1) {
            for (let c = 0; c < grid.cols; c += 1) {
              const val = grid.cells[r * grid.cols + c];
              if (val === 1) {
                ctx.fillStyle = '#064e3b';
                ctx.fillRect(c * cellW, r * cellH, cellW + 0.4, cellH + 0.4);
              } else if (val === 2) {
                ctx.fillStyle = '#f97316';
                ctx.fillRect(c * cellW, r * cellH, cellW + 0.5, cellH + 0.5);
              }
            }
          }

          // Subtle coordinate grid overlay
          ctx.strokeStyle = 'rgba(148,163,184,0.12)';
          ctx.lineWidth = 1;
          for (let x = 0; x <= w; x += w / 4) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
          }
          for (let y = 0; y <= h; y += h / 6) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
          }

          const toPx = (wx: number, wz: number): [number, number] => [
            ((wx + grid.halfW) / (grid.halfW * 2)) * w,
            ((wz + grid.halfL) / (grid.halfL * 2)) * h,
          ];

          // Draw rover path trail
          if (tel.trail.length > 1) {
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2;
            ctx.beginPath();
            tel.trail.forEach(([tx, tz], i) => {
              const [px, py] = toPx(tx, tz);
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            });
            ctx.stroke();
          }

          // Draw live ultrasonic beam
          const [ox, oz] = toPx(tel.rayOrigin[0], tel.rayOrigin[2]);
          if (tel.rayHit) {
            const [hx, hz] = toPx(tel.rayHit[0], tel.rayHit[2]);
            ctx.strokeStyle =
              tel.ultrasonicCm !== null && tel.ultrasonicCm < 45 ? '#f59e0b' : '#22c55e';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(ox, oz);
            ctx.lineTo(hx, hz);
            ctx.stroke();

            ctx.fillStyle = '#facc15';
            ctx.beginPath();
            ctx.arc(hx, hz, 3, 0, Math.PI * 2);
            ctx.fill();
          }

          // Draw rover body & heading wedge (yawDeg=0 faces -Z which is top of canvas)
          const [rx, ry] = toPx(tel.x, tel.z);
          const headingRad = (-tel.yawDeg * Math.PI) / 180;
          ctx.save();
          ctx.translate(rx, ry);
          ctx.rotate(headingRad);
          ctx.fillStyle = '#f8fafc';
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, -10);
          ctx.lineTo(7, 8);
          ctx.lineTo(-7, 8);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }

      if (now - lastTextMs > 120) {
        lastTextMs = now;
        setStats(tel);
      }
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [physicsRef]);

  return (
    <div className="panel-scroll">
      <div className="budget-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <MapIcon size={13} color="var(--accent)" /> 2D OCCUPANCY SLAM MAP
          </span>
          <span className={isRunning ? 'pill pill-ok' : 'pill'}>
            {isRunning ? 'MAPPING LIVE' : 'IDLE'}
          </span>
        </div>

        <div className="budget-grid">
          <div className="metric-box">
            <div className="metric-label">Room Mapped</div>
            <div className="metric-val" style={{ color: 'var(--accent-strong)' }}>
              {stats.exploredPercent}%
            </div>
          </div>
          <div className="metric-box">
            <div className="metric-label">Collisions</div>
            <div
              className="metric-val"
              style={{ color: stats.collisions === 0 ? 'var(--green)' : 'var(--red)' }}
            >
              {stats.collisions}
            </div>
          </div>
          <div className="metric-box">
            <div className="metric-label">Obstacle Hits</div>
            <div className="metric-val">{stats.mappedHitCount} pts</div>
          </div>
          <div className="metric-box">
            <div className="metric-label">Path Driven</div>
            <div className="metric-val">{stats.pathLengthM.toFixed(2)} m</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-sm btn-accent" onClick={onLoadRoomMapper}>
            <Compass size={12} /> Load &amp; Run Room Mapper
          </button>
          <button type="button" className="btn btn-sm" onClick={onClearMap}>
            <Trash2 size={12} /> Clear Map
          </button>
          <button type="button" className="btn btn-sm" onClick={onResetRover}>
            <RotateCcw size={12} /> Reset Rover
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          background: '#090f1d',
          borderRadius: 8,
          border: '1px solid var(--border-strong)',
          padding: 8,
          gap: 6,
        }}
      >
        <canvas
          ref={canvasRef}
          width={240}
          height={360}
          aria-label="2D Room Occupancy Map"
          style={{ maxWidth: 245, maxHeight: 350, width: 'auto', height: 'auto', borderRadius: 4, border: '1px solid #1e293b' }}
        />
        <div
          style={{
            display: 'flex',
            gap: 10,
            fontSize: 10.5,
            color: '#94a3b8',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <span>
            <span style={{ color: '#10b981' }}>■</span> Free
          </span>
          <span>
            <span style={{ color: '#f97316' }}>■</span> Wall / Bag
          </span>
          <span>
            <span style={{ color: '#38bdf8' }}>—</span> Trail
          </span>
          <span>
            <span style={{ color: '#f8fafc' }}>▲</span> Rover
          </span>
        </div>
      </div>
    </div>
  );
}
