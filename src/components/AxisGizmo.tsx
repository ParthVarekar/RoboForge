import type React from 'react';
import type { BenchCameraView } from '../viewport/WorkbenchScene';

export interface AxisGizmoProps {
  azimuthRad: number;
  polarRad: number;
  onSelectView: (view: BenchCameraView) => void;
}

/**
 * Interactive 3D Orientation Tripod Gizmo (X/Y/Z) synchronized with the viewport camera.
 * Clicking resets or aligns the camera view cleanly.
 */
export function AxisGizmo({
  azimuthRad,
  polarRad,
  onSelectView,
}: AxisGizmoProps): React.ReactElement {
  const cx = 36;
  const cy = 36;
  const r = 22;

  // Project unit X, Y (up), Z axes using camera azimuth & polar orientation
  const cosA = Math.cos(azimuthRad);
  const sinA = Math.sin(azimuthRad);
  const cosP = Math.cos(polarRad);
  const sinP = Math.sin(polarRad);

  const project = (vx: number, vy: number, vz: number) => {
    const sx = vx * cosA - vz * sinA;
    const sy = -(vy * sinP + (vx * sinA + vz * cosA) * cosP);
    return { x: cx + sx * r, y: cy + sy * r };
  };

  const px = project(1, 0, 0);
  const py = project(0, 1, 0);
  const pz = project(0, 0, 1);

  return (
    <div
      className="axis-gizmo-card"
      title="3D Orientation Gizmo (click to reset Isometric view)"
      onClick={() => onSelectView('iso')}
    >
      <svg width="72" height="72" viewBox="0 0 72 72">
        <line x1={cx} y1={cy} x2={px.x} y2={px.y} stroke="#dc2626" strokeWidth="2.2" />
        <line x1={cx} y1={cy} x2={pz.x} y2={pz.y} stroke="#16a34a" strokeWidth="2.2" />
        <line x1={cx} y1={cy} x2={py.x} y2={py.y} stroke="#0284c7" strokeWidth="2.2" />

        <circle cx={px.x} cy={px.y} r="7.5" fill="#dc2626" />
        <text x={px.x} y={px.y + 3.2} textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700">
          X
        </text>

        <circle cx={pz.x} cy={pz.y} r="7.5" fill="#16a34a" />
        <text x={pz.x} y={pz.y + 3.2} textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700">
          Y
        </text>

        <circle cx={py.x} cy={py.y} r="7.5" fill="#0284c7" />
        <text x={py.x} y={py.y + 3.2} textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700">
          Z
        </text>
      </svg>
    </div>
  );
}
