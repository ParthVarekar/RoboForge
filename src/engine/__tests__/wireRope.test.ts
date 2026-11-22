import { describe, expect, it } from 'vitest';
import { NeighborField, ObstacleGrid, solveRope, type RopeObstacle, type V3 } from '../../viewport/wireRope';
import { wireLengthCm, wireSlackCm } from '../wireLength';

/** Axis-aligned box obstacle, optionally turned about Y by `yaw` around its centre. */
function box(min: V3, max: V3, yaw = 0): RopeObstacle {
  const cx = (min[0] + max[0]) / 2;
  const cy = (min[1] + max[1]) / 2;
  const cz = (min[2] + max[2]) / 2;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  // local box centred on the origin; m = translate(centre) * rotateY(yaw), column-major
  const hx = (max[0] - min[0]) / 2;
  const hy = (max[1] - min[1]) / 2;
  const hz = (max[2] - min[2]) / 2;
  const m = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, cx, cy, cz, 1];
  const inv = [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, -(c * cx - s * cz), -cy, -(s * cx + c * cz), 1];
  const ex = Math.abs(c) * hx + Math.abs(s) * hz;
  const ez = Math.abs(s) * hx + Math.abs(c) * hz;
  return { min: [-hx, -hy, -hz], max: [hx, hy, hz], m, inv, worldMin: [cx - ex, cy - hy, cz - ez], worldMax: [cx + ex, cy + hy, cz + ez] };
}

/** True when `p` is inside the (possibly turned) box shrunk by `margin`. */
function inside(o: RopeObstacle, p: V3, margin: number): boolean {
  const v = o.inv;
  const lx = v[0]! * p[0] + v[4]! * p[1] + v[8]! * p[2] + v[12]!;
  const ly = v[1]! * p[0] + v[5]! * p[1] + v[9]! * p[2] + v[13]!;
  const lz = v[2]! * p[0] + v[6]! * p[1] + v[10]! * p[2] + v[14]!;
  return lx > o.min[0] + margin && lx < o.max[0] - margin && ly > o.min[1] + margin && ly < o.max[1] - margin && lz > o.min[2] + margin && lz < o.max[2] - margin;
}

const pathLength = (pts: V3[]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1], p[2] - pts[i]![2]), 0);

const base = {
  startDir: [0, 1, 0] as V3,
  endDir: [0, 1, 0] as V3,
  radius: 0.056,
  floorY: 0,
  gravity: 1,
  stiffness: 0.84,
  steps: 180,
};

describe('hanging jumper wires', () => {
  it('keeps its length, starts and ends at its sockets and leaves them straight', () => {
    const start: V3 = [0, 2, 0];
    const end: V3 = [10, 2, 0];
    const length = wireLengthCm(10);
    const pts = solveRope({ ...base, start, end, length, grid: new ObstacleGrid([], 0) });
    expect(pts[0]).toEqual(start);
    expect(pts[pts.length - 1]).toEqual(end);
    expect(pts[1]![0]).toBeCloseTo(0, 6);
    expect(pts[1]![1]).toBeGreaterThan(2);
    expect(Math.abs(pathLength(pts) - (length + 4 * 0.3)) / length).toBeLessThan(0.04);
  });

  it('sags under gravity onto the bench when it has the slack', () => {
    const pts = solveRope({ ...base, start: [0, 1, 0], end: [8, 1, 0], length: 12, grid: new ObstacleGrid([], 0) });
    const lowest = Math.min(...pts.map((p) => p[1]));
    expect(lowest).toBeLessThan(0.08);
    expect(lowest).toBeGreaterThanOrEqual(0.056 - 1e-6);
  });

  it('drapes over a part instead of passing through it', () => {
    const part = box([3, 0, -2], [7, 2.5, 2]);
    const pts = solveRope({ ...base, start: [0, 1, 0], end: [10, 1, 0], length: wireLengthCm(10), grid: new ObstacleGrid([part], 0) });
    for (const p of pts) expect(inside(part, p, 0.01)).toBe(false);
    expect(Math.max(...pts.slice(5, -5).map((p) => p[1]))).toBeGreaterThan(2.5);
  });

  it('respects turned parts (oriented boxes)', () => {
    const part = box([3.5, 0, -1], [6.5, 1.5, 1], Math.PI / 5);
    const pts = solveRope({ ...base, start: [0, 0.8, 0], end: [10, 0.8, 0], length: wireLengthCm(10), grid: new ObstacleGrid([part], 0) });
    for (const p of pts) expect(inside(part, p, 0.01)).toBe(false);
  });

  it('never bends sharper than a wire can', () => {
    const pts = solveRope({ ...base, start: [0, 3, 0], end: [4, 3, 0], length: 14, grid: new ObstacleGrid([], 0) });
    for (let i = 1; i < pts.length - 1; i += 1) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const c = pts[i + 1]!;
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
      const cos = (u[0]! * v[0]! + u[1]! * v[1]! + u[2]! * v[2]!) / (Math.hypot(u[0]!, u[1]!, u[2]!) * Math.hypot(v[0]!, v[1]!, v[2]!));
      expect(Math.acos(Math.max(-1, Math.min(1, cos))) * (180 / Math.PI)).toBeLessThan(80);
    }
  });

  it('passes through a hand-placed tie point', () => {
    const tie: V3 = [5, 0.6, 3];
    const pts = solveRope({ ...base, start: [0, 1, 0], end: [10, 1, 0], length: wireLengthCm(12), pins: [tie], grid: new ObstacleGrid([], 0) });
    expect(pts.some((p) => p[0] === tie[0] && p[1] === tie[1] && p[2] === tie[2])).toBe(true);
  });

  it('rests on a wire already laid instead of passing through it', () => {
    const grid = new ObstacleGrid([], 0);
    const first = solveRope({ ...base, start: [0, 1, 0], end: [10, 1, 0], length: 12, grid });
    const field = new NeighborField();
    field.add(first, 0.056);
    const second = solveRope({ ...base, start: [0, 1.1, 0.02], end: [10, 1.1, 0.02], length: 12, grid, neighbors: field });
    let closest = Infinity;
    for (const p of second.slice(4, -4)) for (const q of first) closest = Math.min(closest, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
    expect(closest).toBeGreaterThan(0.09);
  });

  it('gives each style the slack it should', () => {
    expect(wireSlackCm(10, 'direct')).toBeLessThan(wireSlackCm(10, 'routed'));
    expect(wireSlackCm(10, 'routed')).toBeLessThan(wireSlackCm(10, 'arched'));
    expect(wireSlackCm(10, 'routed', 0.8)).toBeGreaterThan(wireSlackCm(10, 'routed', 0.45));
  });
});
