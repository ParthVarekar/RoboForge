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

  /**
   * Height of whatever a wire would lie on at (x, z): the top of the highest part under that point, or the bench.
   * Each box is tested at its own mid-height in its local frame, so turned and upright parts are exact.
   */
  /** Top surface height at the centre of each cell of an nx x nz grid (row-major in z), as `surfaceY` gives it. */
  heightField(x0: number, z0: number, nx: number, nz: number, pitch: number, floorY: number): Float32Array {
    const h = new Float32Array(nx * nz).fill(floorY);
    for (const o of this.all) {
      const i0 = Math.max(0, Math.ceil((o.worldMin[0] - x0) / pitch));
      const i1 = Math.min(nx - 1, Math.floor((o.worldMax[0] - x0) / pitch));
      const k0 = Math.max(0, Math.ceil((o.worldMin[2] - z0) / pitch));
      const k1 = Math.min(nz - 1, Math.floor((o.worldMax[2] - z0) / pitch));
      if (i0 > i1 || k0 > k1) continue;
      const y = (o.worldMin[1] + o.worldMax[1]) / 2;
      const top = o.worldMax[1];
      const v = o.inv;
      for (let k = k0; k <= k1; k += 1) {
        const z = z0 + k * pitch;
        for (let i = i0; i <= i1; i += 1) {
          const c = k * nx + i;
          if (h[c]! >= top) continue;
          const x = x0 + i * pitch;
          const lx = v[0]! * x + v[4]! * y + v[8]! * z + v[12]!;
          const ly = v[1]! * x + v[5]! * y + v[9]! * z + v[13]!;
          const lz = v[2]! * x + v[6]! * y + v[10]! * z + v[14]!;
          if (lx >= o.min[0] && lx <= o.max[0] && ly >= o.min[1] - 1e-6 && ly <= o.max[1] + 1e-6 && lz >= o.min[2] && lz <= o.max[2]) h[c] = top;
        }
      }
    }
    return h;
  }

  surfaceY(x: number, z: number, floorY: number): number {
    let top = floorY;
    for (const o of this.all) {
      if (x < o.worldMin[0] || x > o.worldMax[0] || z < o.worldMin[2] || z > o.worldMax[2] || o.worldMax[1] <= top) continue;
      const y = (o.worldMin[1] + o.worldMax[1]) / 2;
      const v = o.inv;
      const lx = v[0]! * x + v[4]! * y + v[8]! * z + v[12]!;
      const ly = v[1]! * x + v[5]! * y + v[9]! * z + v[13]!;
      const lz = v[2]! * x + v[6]! * y + v[10]! * z + v[14]!;
      if (lx >= o.min[0] && lx <= o.max[0] && ly >= o.min[1] - 1e-6 && ly <= o.max[1] + 1e-6 && lz >= o.min[2] && lz <= o.max[2]) top = o.worldMax[1];
    }
    return top;
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

  /** Adds everything laid in another field. */
  merge(other: NeighborField): void {
    for (const [key, list] of other.cells) {
      const mine = this.cells.get(key);
      if (mine) mine.push(...list);
      else this.cells.set(key, [...list]);
    }
  }

  /** Whether any of `points` (a wire of `radius`) would touch a wire already laid. */
  overlaps(points: readonly V3[], radius: number, slack = 0.004): boolean {
    const c = this.cell;
    for (const p of points) {
      const cx = Math.floor(p[0] / c);
      const cy = Math.floor(p[1] / c);
      const cz = Math.floor(p[2] / c);
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dz = -1; dz <= 1; dz += 1) {
            const list = this.cells.get(cellKey(cx + dx, cy + dy, cz + dz));
            if (!list) continue;
            for (let k = 0; k < list.length; k += 4) {
              if (len(p[0] - list[k]!, p[1] - list[k + 1]!, p[2] - list[k + 2]!) < radius + list[k + 3]! - slack) return true;
            }
          }
        }
      }
    }
    return false;
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
  /**
   * How the spare length is shared between the legs from the start through each tie point to the end (one value per
   * leg, cm or any relative scale). Without it the spare length is shared in proportion to each leg's length.
   */
  legSlack?: readonly number[];
  /** Wires already laid, to rest on instead of passing through. */
  neighbors?: NeighborField;
  steps: number;
}

const STUB_POINTS = 2;

/** Lays one wire and returns its points from start to end. */
export function solveRope(o: RopeInput): V3[] {
  const r = o.radius;
  // links of about 3 mm; the straight stubs at the ends are links of their own on top of the rest length
  const n = Math.max(12, Math.min(90, Math.round(o.length / 0.3) + 1 + 2 * STUB_POINTS));
  const seg = o.length / (n - 1 - 2 * STUB_POINTS);
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
  const counts = shareLinks(legs, a1 - a0, seg, o.legSlack);
  const anchorIdx = [a0];
  for (const c of counts) anchorIdx.push(anchorIdx[anchorIdx.length - 1]! + c);
  anchorIdx.forEach((idx, k) => {
    if (k > 0 && k < anchorIdx.length - 1) {
      set(idx, anchorPts[k]!);
      pinned[idx] = 1;
    }
  });

  // start every free point on an arch just clear of the parts under the line between its anchors, then let it settle
  // (not above the tallest part nearby: a wire started over an antenna would end up hung on it like a washing line)
  for (let k = 0; k < anchorIdx.length - 1; k += 1) {
    const i0 = anchorIdx[k]!;
    const i1 = anchorIdx[k + 1]!;
    const p0 = get(i0);
    const p1 = get(i1);
    const legLen = len(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    const restLeg = (i1 - i0) * seg;
    const sagRoom = Math.sqrt(Math.max(0, (3 * legLen * Math.max(0, restLeg - legLen)) / 8));
    let clear = 0;
    for (let j = 1; j < 16; j += 1) {
      const t = j / 16;
      const under = o.grid.surfaceY(p0[0] + (p1[0] - p0[0]) * t, p0[2] + (p1[2] - p0[2]) * t, o.floorY) + 2 * r + 0.3;
      clear = Math.max(clear, (under - (p0[1] + (p1[1] - p0[1]) * t)) / Math.max(0.3, Math.sin(Math.PI * t)));
    }
    const lift = Math.max(sagRoom, clear);
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
  /**
   * Tethers (long-range attachments): no point may be farther from the fixed point on either side of it than the
   * length of wire between them. This holds the whole chain to its length at once, where the link-by-link constraint
   * alone lets a long hanging wire stretch under gravity.
   */
  const tether = () => {
    for (let k = 0; k < anchorIdx.length - 1; k += 1) {
      const i0 = anchorIdx[k]!;
      const i1 = anchorIdx[k + 1]!;
      for (let i = i0 + 1; i < i1; i += 1) {
        if (pinned[i]) continue;
        for (const [j, max] of [
          [i0, (i - i0) * seg],
          [i1, (i1 - i) * seg],
        ] as const) {
          const b = i * 3;
          const dx = pos[b]! - pos[j * 3]!;
          const dy = pos[b + 1]! - pos[j * 3 + 1]!;
          const dz = pos[b + 2]! - pos[j * 3 + 2]!;
          const d = len(dx, dy, dz);
          if (d <= max || d < 1e-9) continue;
          const f = max / d;
          pos[b] = pos[j * 3]! + dx * f;
          pos[b + 1] = pos[j * 3 + 1]! + dy * f;
          pos[b + 2] = pos[j * 3 + 2]! + dz * f;
        }
      }
    }
  };

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
    // padded by half a link, so no wire can slip between two points of this one unseen
    if (withNeighbors && o.neighbors) o.neighbors.separate(pos, b, r + seg * 0.5);
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
      // sweep the links forwards and backwards in turn, so a correction travels both ways along the chain
      if (pass % 2 === 0) for (let i = 0; i < n - 1; i += 1) relax(pos, pinned, i, i + 1, seg, false);
      else for (let i = n - 2; i >= 0; i -= 1) relax(pos, pinned, i, i + 1, seg, false);
      if (minBend > 0) for (let i = 0; i < n - 2; i += 1) relax(pos, pinned, i, i + 2, minBend, true);
      tether();
      for (let i = 0; i < n; i += 1) if (!pinned[i]) collide(i, neighborsOn && pass === passes - 1);
    }
  }

  // settle with gravity off: the chain comes back to its exact length and spreads any tight turn over more links. A
  // sagging chain shortens only slowly (each link pulls mostly along the curve), so this takes many cheap sweeps; the
  // parts and other wires are checked every third sweep and at the end.
  const SETTLE = 600;
  for (let k = 0; k < SETTLE; k += 1) {
    if (k % 2 === 0) for (let i = 0; i < n - 1; i += 1) relax(pos, pinned, i, i + 1, seg, false);
    else for (let i = n - 2; i >= 0; i -= 1) relax(pos, pinned, i, i + 1, seg, false);
    if (minBend > 0) for (let i = 0; i < n - 2; i += 1) relax(pos, pinned, i, i + 2, minBend, true);
    if (k % 3 === 0 || k === SETTLE - 1) for (let i = 0; i < n; i += 1) if (!pinned[i]) collide(i, k >= SETTLE / 5);
  }
  // last word to the other wires: a wire rests on them rather than passing through, even at a little stretch
  if (o.neighbors) for (let k = 0; k < 6; k += 1) for (let i = 0; i < n; i += 1) if (!pinned[i]) collide(i, true);

  const out: V3[] = [];
  for (let i = 0; i < n; i += 1) out.push(get(i));
  return out;
}

/**
 * Splits `links` chain links between legs of straight length `legs`: each leg gets its straight length plus its share
 * of the spare length. A leg with no share gets no more links than its straight length (it stays taut instead of
 * buckling sideways); links left over by rounding go to the legs with the most slack.
 */
export function shareLinks(legs: readonly number[], links: number, seg: number, slack?: readonly number[]): number[] {
  const n = legs.length;
  if (n === 0) return [];
  const straight = legs.reduce((a, b) => a + b, 0);
  const spare = Math.max(0, links * seg - straight);
  const weights = slack && slack.length === n ? slack.map((v) => Math.max(0, v)) : [...legs];
  const wsum = weights.reduce((a, b) => a + b, 0);
  const want = legs.map((leg, k) => (leg + (wsum > 1e-9 ? (spare * weights[k]!) / wsum : spare / n)) / seg);
  const counts = want.map((c) => Math.max(1, Math.floor(c)));
  let left = links - counts.reduce((a, b) => a + b, 0);
  const byNeed = want.map((_, k) => k).sort((x, y) => weights[y]! - weights[x]! || want[y]! - counts[y]! - (want[x]! - counts[x]!));
  const pool = byNeed.filter((k) => weights[k]! > 1e-9);
  const takers = pool.length > 0 ? pool : byNeed;
  for (let i = 0; left > 0; i = (i + 1) % takers.length, left -= 1) counts[takers[i]!]! += 1;
  while (left < 0) {
    let k = 0;
    for (let j = 1; j < n; j += 1) if (counts[j]! > counts[k]!) k = j;
    if (counts[k]! <= 1) break;
    counts[k]! -= 1;
    left += 1;
  }
  return counts;
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
