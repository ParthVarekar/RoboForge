import { useEffect, useRef } from 'react';
import type React from 'react';
import type { SignalSample } from '../engine/runtime';

export interface LogicPlotterPanelProps {
  getSamples: () => readonly SignalSample[];
  isRunning: boolean;
}

interface ChannelDef {
  label: string;
  color: string;
  unit: string;
  min: number;
  max: number;
  read: (s: SignalSample) => number;
}

const CHANNELS: ChannelDef[] = [
  { label: 'CH1 · GPIO25 (L_FWD / M1)', color: '#f97316', unit: 'PWM', min: 0, max: 255, read: (s) => s.pwm25 },
  { label: 'CH2 · GPIO27 (R_FWD / M3)', color: '#22c55e', unit: 'PWM', min: 0, max: 255, read: (s) => s.pwm27 },
  { label: 'CH3 · HC-SR04 Distance', color: '#38bdf8', unit: 'cm', min: 0, max: 200, read: (s) => s.distCm },
  { label: 'CH4 · MPU6050 Yaw', color: '#c084fc', unit: 'deg', min: -180, max: 180, read: (s) => s.yawDeg },
];

/**
 * Live 4-channel oscilloscope / logic plotter streaming real-time PWM, ultrasonic distance,
 * and IMU gyro heading waveforms while the virtual ESP32 sketch executes.
 */
export function LogicPlotterPanel({
  getSamples,
  isRunning,
}: LogicPlotterPanelProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let rafId = 0;

    const draw = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          ctx.fillStyle = '#090f1d';
          ctx.fillRect(0, 0, w, h);

          const samples = getSamples();
          const rowH = h / CHANNELS.length;

          CHANNELS.forEach((ch, idx) => {
            const top = idx * rowH;
            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, top + rowH);
            ctx.lineTo(w, top + rowH);
            ctx.stroke();

            // Midline guide
            ctx.strokeStyle = 'rgba(148,163,184,0.12)';
            ctx.beginPath();
            ctx.moveTo(0, top + rowH / 2);
            ctx.lineTo(w, top + rowH / 2);
            ctx.stroke();

            const lastVal = samples.length > 0 ? ch.read(samples[samples.length - 1]!) : 0;
            ctx.fillStyle = ch.color;
            ctx.font = 'bold 11px Consolas, monospace';
            ctx.fillText(`${ch.label}: ${lastVal.toFixed(1)} ${ch.unit}`, 8, top + 15);

            if (samples.length > 1) {
              ctx.strokeStyle = ch.color;
              ctx.lineWidth = 2;
              ctx.beginPath();
              samples.forEach((s, i) => {
                const x = (i / Math.max(1, samples.length - 1)) * (w - 16) + 8;
                const norm = (ch.read(s) - ch.min) / (ch.max - ch.min);
                const clamped = Math.max(0, Math.min(1, norm));
                const y = top + rowH - 10 - clamped * (rowH - 28);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
              });
              ctx.stroke();
            }
          });
        }
      }
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [getSamples]);

  return (
    <div className="panel-scroll">
      <div className="budget-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700 }}>LIVE 4-CH LOGIC &amp; TELEMETRY SCOPE</span>
          <span className={isRunning ? 'pill pill-ok' : 'pill'}>
            {isRunning ? 'SAMPLING 25 Hz' : 'PAUSED'}
          </span>
        </div>
        <div className="part-meta">
          Real-time PWM duty, HC-SR04 echo distance, and MPU6050 yaw trace directly from the running sketch.
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={360}
        height={380}
        style={{
          width: '100%',
          height: 360,
          borderRadius: 8,
          border: '1px solid var(--border-strong)',
          background: '#090f1d',
        }}
      />
    </div>
  );
}
