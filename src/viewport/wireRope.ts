/**
 * Wires that hang like real jumper wires.
 *
 * A wire is a chain of points of fixed total length. The two ends are fixed, with a short straight section along
 * the socket or lead direction (a jumper leaves its crimp straight before it can bend). Gravity pulls the chain down;
 * distance constraints keep its length, a bending constraint keeps it from folding sharper than a wire can, and
 * collisions make it rest on the bench, on the deck and on top of the parts it crosses (oriented boxes taken from
 * the parts' own meshes, so rotated parts are handled). Wires solved earlier act as obstacles for later ones, so
 * they lie on each other instead of passing through.
 *
 * Pure math with no three.js types, so it is fast and testable. Units are scene centimetres; +Y is up.
 */

export type V3 = [number, number, number];

/** An oriented box: a local axis-aligned box and its local-to-world matrix (column-major, as three.js stores it). */
export interface RopeObstacle {
  min: V3;
  max: V3;
  /** Local to world, column-major 4x4. */
  m: ArrayLike<number>;
  /** World to local, column-major 4x4. */
  inv: ArrayLike<number>;
  worldMin: V3;
  worldMax: V3;
}

interface PreparedObstacle extends RopeObstacle {
  scale: V3;
  /** World unit normals of the local +x, -x, +y, -y, +z, -z faces. */
  normals: V3[];
  /** Resting on the bench: never push a wire underneath it. */
  grounded: boolean;
}

const len = (x: number, y: number, z: number) => Math.hypot(x, y, z);

/** Integer cell coordinates packed into one number (cells within +-512 of the origin cover any bench). */
const cellKey = (x: number, y: number, z: number) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);

export function prepareObstacle(o: RopeObstacle, floorY: number): PreparedObstacle {
  const m = o.m;
  const col = (c: number): V3 => [m[c * 4]!, m[c * 4 + 1]!, m[c * 4 + 2]!];
  const cols = [col(0), col(1), col(2)];
  const scale = cols.map((c) => len(c[0], c[1], c[2]) || 1) as V3;
  const normals: V3[] = [];
  cols.forEach((c, i) => {
    const s = scale[i]!;
    normals.push([c[0] / s, c[1] / s, c[2] / s], [-c[0] / s, -c[1] / s, -c[2] / s]);
  });
  return { ...o, scale, normals, grounded: o.worldMin[1] < floorY + 0.35 };
}

/** Uniform grid over obstacles so each point only tests the few boxes near it. */
export class ObstacleGrid {
  private readonly cells = new Map<number, PreparedObstacle[]>();
  readonly all: PreparedObstacle[];

  constructor(obstacles: readonly RopeObstacle[], floorY: number, private readonly cell = 1.0, margin = 0.2) {
    this.all = obstacles.map((o) => prepareObstacle(o, floorY));
    for (const o of this.all) {
      const [x0, y0, z0] = o.worldMin.map((v) => Math.floor((v - margin) / cell));
      const [x1, y1, z1] = o.worldMax.map((v) => Math.floor((v + margin) / cell));
      for (let x = x0!; x <= x1!; x += 1) {
        for (let y = y0!; y <= y1!; y += 1) {
          for (let z = z0!; z <= z1!; z += 1) {
            const key = cellKey(x, y, z);
            const list = this.cells.get(key);
            if (list) list.push(o);
            else this.cells.set(key, [o]);
          }
        }
      }
    }
  }

  near(x: number, y: number, z: number): readonly PreparedObstacle[] {
    const c = this.cell;
    return this.cells.get(cellKey(Math.floor(x / c), Math.floor(y / c), Math.floor(z / c))) ?? EMPTY;
  }

  /** Obstacles whose world box overlaps a region (for the starting arch height). */
  inRegion(min: V3, max: V3): PreparedObstacle[] {
    return this.all.filter(
      (o) =>
        o.worldMax[0] >= min[0] && o.worldMin[0] <= max[0] && o.worldMax[1] >= min[1] && o.worldMin[1] <= max[1] && o.worldMax[2] >= min[2] && o.worldMin[2] <= max[2],
    );
  }
}

const EMPTY: readonly PreparedObstacle[] = [];

/** Points of wires already laid, kept in a hash so a new wire can stay clear of them. */
export class NeighborField {
  private readonly cells = new Map<number, number[]>();

  constructor(private readonly cell = 0.4) {}

  add(points: readonly V3[], radius: number): void {
    for (const p of points) {
      const key = this.key(p[0], p[1], p[2]);
      const list = this.cells.get(key);
      if (list) list.push(p[0], p[1], p[2], radius);
      else this.cells.set(key, [p[0], p[1], p[2], radius]);
    }
  }

  private key(x: number, y: number, z: number): number {
    const c = this.cell;
    return cellKey(Math.floor(x / c), Math.floor(y / c), Math.floor(z / c));
  }

  /** Moves the point at `pos[i..i+2]` out of any laid wire it overlaps. */
  separate(pos: Float64Array, i: number, radius: number): void {
    const c = this.cell;
    const cx = Math.floor(pos[i]! / c);
    const cy = Math.floor(pos[i + 1]! / c);
    const cz = Math.floor(pos[i + 2]! / c);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const list = this.cells.get(cellKey(cx + dx, cy + dy, cz + dz));
          if (!list) continue;
          for (let k = 0; k < list.length; k += 4) {
            const ox = pos[i]! - list[k]!;
            const oy = pos[i + 1]! - list[k + 1]!;
            const oz = pos[i + 2]! - list[k + 2]!;
            const min = radius + list[k + 3]!;
            const d = len(ox, oy, oz);
            if (d >= min) continue;
            if (d < 1e-6) {
              pos[i + 1] = pos[i + 1]! + min;
              continue;
            }
            const push = (min - d) / d;
            pos[i] = pos[i]! + ox * push;
            pos[i + 1] = pos[i + 1]! + oy * push;
            pos[i + 2] = pos[i + 2]! + oz * push;
          }
        }
      }
    }
  }
}

export interface RopeInput {
  /** Where the wire leaves its socket or heat-shrink, and the direction it leaves in. */
  start: V3;
  startDir: V3;
  end: V3;
  endDir: V3;
  /** Rest length between `start` and `end` (cm); the straight stubs at each end are added on top. */
  length: number;
  /** Tube radius (cm), used for collisions. */
  radius: number;
  grid: ObstacleGrid;
  floorY: number;
  /** 1 = a normal jumper; less makes a stiff wire that holds an arch. */
  gravity: number;
  /** 0..1: how close two points two links apart may get, as a share of two links (higher = gentler bends). */
  stiffness: number;
  /** Tie points the wire must pass through, in order (hand routing). */
  pins?: readonly V3[];
  /** Wires already laid, to rest on instead of passing through. */
  neighbors?: NeighborField;
  steps: number;
}

const STUB_POINTS = 2;

/** Lays one wire and returns its points from start to end. */
export function solveRope(o: RopeInput): V3[] {
  const r = o.radius;
  // the straight stubs at the ends are part of the wire too, so they get their own length on top
  const total = o.length + 2 * STUB_POINTS * 0.3;
  const n = Math.max(12, Math.min(84, Math.round(total / 0.3) + 1));
  const seg = total / (n - 1);
  const pos = new Float64Array(n * 3);
  const prev = new Float64Array(n * 3);
  const pinned = new Uint8Array(n);
  const set = (i: number, p: V3) => {
    pos[i * 3] = p[0];
    pos[i * 3 + 1] = p[1];
    pos[i * 3 + 2] = p[2];
  };
  const get = (i: number): V3 => [pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!];
  const unit = (d: V3): V3 => {
    const l = len(d[0], d[1], d[2]) || 1;
    return [d[0] / l, d[1] / l, d[2] / l];
  };

  // fixed ends and their straight stubs
  const sd = unit(o.startDir);
  const ed = unit(o.endDir);
  for (let k = 0; k <= STUB_POINTS; k += 1) {
    set(k, [o.start[0] + sd[0] * seg * k, o.start[1] + sd[1] * seg * k, o.start[2] + sd[2] * seg * k]);
    set(n - 1 - k, [o.end[0] + ed[0] * seg * k, o.end[1] + ed[1] * seg * k, o.end[2] + ed[2] * seg * k]);
    pinned[k] = 1;
    pinned[n - 1 - k] = 1;
  }

  // anchors the free part runs between: stub ends and tie points, spread along the wire by straight distance
  const a0 = STUB_POINTS;
  const a1 = n - 1 - STUB_POINTS;
  const anchorPts: V3[] = [get(a0), ...(o.pins ?? []), get(a1)];
  const legs = anchorPts.slice(1).map((p, i) => len(p[0] - anchorPts[i]![0], p[1] - anchorPts[i]![1], p[2] - anchorPts[i]![2]));
  const totalLeg = legs.reduce((s, v) => s + v, 0) || 1;
  const anchorIdx = [a0];
  let acc = 0;
  for (let k = 0; k < legs.length - 1; k += 1) {
    acc += legs[k]!;
    anchorIdx.push(Math.max(anchorIdx[anchorIdx.length - 1]! + 1, Math.min(a1 - 1, Math.round(a0 + ((a1 - a0) * acc) / totalLeg))));
  }
  anchorIdx.push(a1);
  anchorIdx.forEach((idx, k) => {
    if (k > 0 && k < anchorIdx.length - 1) {
      set(idx, anchorPts[k]!);
      pinned[idx] = 1;
    }
  });

  // start every free point on an arch above the parts in the way, then let it settle
  const lo: V3 = [Infinity, Infinity, Infinity];
  const hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of anchorPts) for (let k = 0; k < 3; k += 1) {
    lo[k] = Math.min(lo[k]!, p[k]!);
    hi[k] = Math.max(hi[k]!, p[k]!);
  }
  const reach = Math.max(0.5, (o.length - totalLeg) * 0.5);
  const region = o.grid.inRegion([lo[0] - reach, o.floorY, lo[2] - reach], [hi[0] + reach, hi[1] + 50, hi[2] + reach]);
  const topOfRegion = region.reduce((m, ob) => Math.max(m, ob.worldMax[1]), o.floorY);
  for (let k = 0; k < anchorIdx.length - 1; k += 1) {
    const i0 = anchorIdx[k]!;
    const i1 = anchorIdx[k + 1]!;
    const p0 = get(i0);
    const p1 = get(i1);
    const legLen = len(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    const restLeg = (i1 - i0) * seg;
    const sagRoom = Math.sqrt(Math.max(0, (3 * legLen * Math.max(0, restLeg - legLen)) / 8));
    const lift = Math.max(sagRoom, topOfRegion + 2 * r + 0.6 - Math.min(p0[1], p1[1]));
    for (let i = i0 + 1; i < i1; i += 1) {
      const t = (i - i0) / (i1 - i0);
      set(i, [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t + lift * Math.sin(Math.PI * t), p0[2] + (p1[2] - p0[2]) * t]);
    }
  }
  prev.set(pos);

  // gentle per-step gravity so the length constraints keep up with it (a stretched chain looks like elastic)
  const g = 0.0075 * o.gravity;
  const damping = 0.9;
  const minBend = o.stiffness * 2 * seg;
  const passes = 8;

  const collide = (i: number, withNeighbors: boolean) => {
    const b = i * 3;
    if (pos[b + 1]! < o.floorY + r) pos[b + 1] = o.floorY + r;
    const near = o.grid.near(pos[b]!, pos[b + 1]!, pos[b + 2]!);
    for (let k = 0; k < near.length; k += 1) {
      const ob = near[k]!;
      const x = pos[b]!;
      const y = pos[b + 1]!;
      const z = pos[b + 2]!;
      if (x < ob.worldMin[0] - r || x > ob.worldMax[0] + r || y < ob.worldMin[1] - r || y > ob.worldMax[1] + r || z < ob.worldMin[2] - r || z > ob.worldMax[2] + r) continue;
      const v = ob.inv;
      const lx = v[0]! * x + v[4]! * y + v[8]! * z + v[12]!;
      const ly = v[1]! * x + v[5]! * y + v[9]! * z + v[13]!;
      const lz = v[2]! * x + v[6]! * y + v[10]! * z + v[14]!;
      const rx = r / ob.scale[0];
      const ry = r / ob.scale[1];
      const rz = r / ob.scale[2];
      if (lx < ob.min[0] - rx || lx > ob.max[0] + rx || ly < ob.min[1] - ry || ly > ob.max[1] + ry || lz < ob.min[2] - rz || lz > ob.max[2] + rz) continue;
      const depths = [
        (ob.max[0] + rx - lx) * ob.scale[0],
        (lx - ob.min[0] + rx) * ob.scale[0],
        (ob.max[1] + ry - ly) * ob.scale[1],
        (ly - ob.min[1] + ry) * ob.scale[1],
        (ob.max[2] + rz - lz) * ob.scale[2],
        (lz - ob.min[2] + rz) * ob.scale[2],
      ];
      let best = -1;
      let bestCost = Infinity;
      for (let f = 0; f < 6; f += 1) {
        const ny = ob.normals[f]![1];
        if (ny < -0.5 && ob.grounded) continue; // never tuck a wire under something sitting on the bench
        // prefer resting on top, as a draped wire does
        const cost = depths[f]! * (ny > 0.5 ? 0.5 : ny < -0.5 ? 1.6 : 1);
        if (cost < bestCost) {
          bestCost = cost;
          best = f;
        }
      }
      if (best < 0) continue;
      const nrm = ob.normals[best]!;
      const d = depths[best]!;
      pos[b] = x + nrm[0] * d;
      pos[b + 1] = y + nrm[1] * d;
      pos[b + 2] = z + nrm[2] * d;
    }
    if (withNeighbors && o.neighbors) o.neighbors.separate(pos, b, r);
  };

  for (let step = 0; step < o.steps; step += 1) {
    for (let i = 0; i < n; i += 1) {
      if (pinned[i]) continue;
      const b = i * 3;
      for (let k = 0; k < 3; k += 1) {
        const cur = pos[b + k]!;
        const vel = (cur - prev[b + k]!) * damping;
        prev[b + k] = cur;
        pos[b + k] = cur + vel - (k === 1 ? g : 0);
      }
    }
    const neighborsOn = step > o.steps * 0.3;
    for (let pass = 0; pass < passes; pass += 1) {
      for (let i = 0; i < n - 1; i += 1) relax(pos, pinned, i, i + 1, seg, false);
      if (minBend > 0) for (let i = 0; i < n - 2; i += 1) relax(pos, pinned, i, i + 2, minBend, true);
      for (let i = 0; i < n; i += 1) if (!pinned[i]) collide(i, neighborsOn && pass === passes - 1);
    }
  }

  // settle with gravity off: the chain comes back to its exact length and spreads any tight turn over more links
  for (let k = 0; k < 60; k += 1) {
    for (let i = 0; i < n - 1; i += 1) relax(pos, pinned, i, i + 1, seg, false);
    if (minBend > 0) for (let i = 0; i < n - 2; i += 1) relax(pos, pinned, i, i + 2, minBend, true);
    for (let i = 0; i < n; i += 1) if (!pinned[i]) collide(i, k >= 48);
  }

  const out: V3[] = [];
  for (let i = 0; i < n; i += 1) out.push(get(i));
  return out;
}

/** Distance constraint between points a and b; `minOnly` only pushes apart (bending limit). */
function relax(pos: Float64Array, pinned: Uint8Array, a: number, b: number, rest: number, minOnly: boolean): void {
  const ia = a * 3;
  const ib = b * 3;
  const dx = pos[ib]! - pos[ia]!;
  const dy = pos[ib + 1]! - pos[ia + 1]!;
  const dz = pos[ib + 2]! - pos[ia + 2]!;
  const d = len(dx, dy, dz) || 1e-9;
  if (minOnly && d >= rest) return;
  const diff = (d - rest) / d;
  const pa = pinned[a]!;
  const pb = pinned[b]!;
  if (pa && pb) return;
  const wa = pa ? 0 : pb ? 1 : 0.5;
  const wb = pb ? 0 : pa ? 1 : 0.5;
  pos[ia] = pos[ia]! + dx * diff * wa;
  pos[ia + 1] = pos[ia + 1]! + dy * diff * wa;
  pos[ia + 2] = pos[ia + 2]! + dz * diff * wa;
  pos[ib] = pos[ib]! - dx * diff * wb;
  pos[ib + 1] = pos[ib + 1]! - dy * diff * wb;
  pos[ib + 2] = pos[ib + 2]! - dz * diff * wb;
}
