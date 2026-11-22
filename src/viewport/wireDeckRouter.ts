import type { V3 } from './wireRope';

/**
 * Lays wires flat on the deck in tidy lanes, the way a hand-dressed wiring board looks: runs follow the chassis axes
 * with rounded square corners, wires going the same way lie side by side as a bundle, and no two wires ever share a
 * lane. Where one wire has to cross another it hops over it.
 *
 * - `makeDeckGrid` finds the deck and where a wire may lie on it; `routeDeck` lays the runs.
 * - `shapeDrop` forms the piece from a socket down onto its run, `shapeBridge` a short jumper between two sockets.
 * - `separateWires` is the last check that no two finished wires touch.
 *
 * The deck is a grid of cells one lane (2.54 mm) wide. Each cell remembers which directions wires already use it in:
 * a cell taken along X can still be crossed along Z (with a hop), never followed along X, and never turned in.
 */

/** Surface the wires lie on, as a grid of cells (row-major in z). */
export interface DeckGrid {
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  /** Cell size and lane spacing (cm). */
  pitch: number;
  /** Height of the deck surface (cm). */
  deckY: number;
  /** Surface height per cell. */
  height: Float32Array;
  /** 1 where a wire may not lie: on or right beside parts standing on the deck, and off its edge. */
  blocked: Uint8Array;
  /** 1 over low parts a wire may lie across when it has to (resistors lying on the deck and the like). */
  low: Uint8Array;
}

/** Highest a part may stand above the deck and still be crossed by a wire lying over it (cm). */
const LOW_PART_CM = 0.35;

/** How close a wire's centre may come to the side of a part or the deck edge (cm): a wire's radius and a hair. */
export const SIDE_CLEARANCE_CM = 0.1;

/**
 * Builds the deck grid from surface heights. `heightAt(dx, dz)` gives the surface height at every cell centre moved by
 * (dx, dz); a cell is open when its centre and the points one clearance away on each side are all on the deck. The
 * deck height is the most common surface height near the wire ends (nearer counts more), so a rover's chassis plate,
 * a quad's frame plate or the bench, for parts laid out on it, is found without being told.
 */
export function makeDeckGrid(x0: number, z0: number, nx: number, nz: number, pitch: number, heightAt: (dx: number, dz: number) => Float32Array, focus: readonly V3[], reach = 3): DeckGrid {
  const height = heightAt(0, 0);
  const counts = new Map<number, { n: number; sum: number }>();
  const r2 = reach * reach;
  for (let k = 0; k < nz; k += 1) {
    for (let i = 0; i < nx; i += 1) {
      const x = x0 + i * pitch;
      const z = z0 + k * pitch;
      // closer to a wire end counts for more: the plate the parts stand on, not the bench around a thin frame
      let near = 0;
      for (const p of focus) {
        const d2 = (p[0] - x) ** 2 + (p[2] - z) ** 2;
        if (d2 <= r2) near = Math.max(near, 1 - Math.sqrt(d2) / reach);
      }
      if (near <= 0) continue;
      const h = height[k * nx + i]!;
      const key = Math.round(h / 0.02);
      const c = counts.get(key);
      if (c) {
        c.n += near;
        c.sum += h * near;
      } else counts.set(key, { n: near, sum: h * near });
    }
  }
  let deckY = 0;
  let best = -1;
  for (const c of counts.values()) {
    if (c.n > best) {
      best = c.n;
      deckY = c.sum / c.n;
    }
  }
  const n = nx * nz;
  const blocked = new Uint8Array(n);
  const low = new Uint8Array(n);
  const c = SIDE_CLEARANCE_CM;
  const around = [height, heightAt(c, 0), heightAt(-c, 0), heightAt(0, c), heightAt(0, -c), heightAt(c, c), heightAt(-c, c), heightAt(c, -c), heightAt(-c, -c)];
  for (let k = 0; k < n; k += 1) {
    let hi = -Infinity;
    let lo = Infinity;
    for (const field of around) {
      hi = Math.max(hi, field[k]!);
      lo = Math.min(lo, field[k]!);
    }
    if (hi - deckY > LOW_PART_CM || lo - deckY < -0.05) blocked[k] = 1;
    else if (hi - deckY > 0.04) low[k] = 1;
  }
  return { x0, z0, nx, nz, pitch, deckY, height, blocked, low };
}

export interface DeckRequest {
  id: string;
  /** Where the wire comes down from (its exit at one end) and goes back up to (the other end). */
  a: V3;
  b: V3;
  radius: number;
  /** Direction each end leaves its socket in (the wire rises this way before it bends towards the deck). */
  aDir?: V3;
  bDir?: V3;
  /** Wires with the same group (e.g. the same two parts) are routed one after another so they bundle. */
  group: string;
}

export interface DeckRoute {
  /** The run on the deck from the cell where end `a` lands to the cell where end `b` lands, finely sampled. */
  run: V3[];
  /** How many other wires this one hops over. */
  crossings: number;
  /** How many cells it lies on top of another wire along the same lane (only when no free lane was left). */
  stacked: number;
}

export interface DeckOptions {
  /** Corner radius of a run (cm). */
  filletCm?: number;
  /** Extra cost of a corner, in cells. */
  bendCost?: number;
  /** Extra cost of hopping over another wire, in cells. */
  crossCost?: number;
  /** How far from its exit a wire may land on the deck (cm). */
  escapeCm?: number;
  /** Discount per cell for running right beside a wire going the same way (what makes bundles). */
  bundleBonus?: number;
  /** How many times to rip up and retry when wires find no lane (1 while a part is being dragged). */
  attempts?: number;
  /** Route short wires first ('short', the default) or long bundles first ('long'). */
  order?: 'long' | 'short';
  /** Told about each wire that gets no run on the deck, and why. */
  onSkip?: (id: string, why: string) => void;
  /** Ends of other wires near the deck (pin joints, leads): no lane passes through them. */
  keepOut?: readonly V3[];
  /** Receives the lane map after routing (for inspection). */
  onDone?: (state: { occ: Uint8Array; owner: Int32Array; landings: { id: string; s: number; g: number }[] }) => void;
}

/** How far a wire rises straight out of its socket before it bends over towards the deck (cm). */
export const RISE_CM = 0.45;

const DX = [1, -1, 0, 0] as const;
const DZ = [0, 0, 1, -1] as const;
const OPPOSITE = [1, 0, 3, 2] as const;
/** Occupancy bit per direction: 1 = along x, 2 = along z. */
const AXIS_BIT = [1, 1, 2, 2] as const;

/** Lays the requested wires on the deck; a wire that finds no clean run is left out (it hangs freely instead). */
export function routeDeck(deck: DeckGrid, requests: readonly DeckRequest[], options: DeckOptions = {}): Map<string, DeckRoute> {
  const fillet = options.filletCm ?? 0.4;
  const bendCost = options.bendCost ?? 4;
  const crossCost = options.crossCost ?? 4;
  const escapeCm = options.escapeCm ?? 3.5;
  const bundleBonus = options.bundleBonus ?? 0;
  const longFirst = (options.order ?? 'short') === 'long';
  const { x0, z0, nx, nz, pitch } = deck;
  const n = nx * nz;
  /** Landing cells (a wire comes straight down there: nothing else may pass) and ports, by the wire they belong to. */
  const owner = new Int32Array(n).fill(-1);
  const portOf = new Int32Array(n).fill(-1);
  const cx = (c: number) => x0 + (c % nx) * pitch;
  const cz = (c: number) => z0 + Math.floor(c / nx) * pitch;
  /** Direction index (+x, -x, +z, -z) closest to a horizontal vector. */
  const heading = (dx: number, dz: number) => (Math.abs(dx) >= Math.abs(dz) ? (dx >= 0 ? 0 : 1) : dz >= 0 ? 2 : 3);
  const step = (c: number, d: number) => {
    const i = (c % nx) + DX[d]!;
    const k = Math.floor(c / nx) + DZ[d]!;
    return i < 0 || k < 0 || i >= nx || k >= nz ? -1 : k * nx + i;
  };
  // the ends of wires close to the deck (a joint on a capacitor leg, a battery lead) are kept clear of other lanes
  const zone = new Int32Array(n).fill(-1);
  const keep = (p: V3, who: number) => {
    if (p[1] > deck.deckY + 1.2) return;
    const reach = 0.2;
    const i0 = Math.max(0, Math.ceil((p[0] - reach - x0) / pitch));
    const i1 = Math.min(nx - 1, Math.floor((p[0] + reach - x0) / pitch));
    const k0 = Math.max(0, Math.ceil((p[2] - reach - z0) / pitch));
    const k1 = Math.min(nz - 1, Math.floor((p[2] + reach - z0) / pitch));
    for (let k = k0; k <= k1; k += 1) for (let i = i0; i <= i1; i += 1) if (Math.hypot(x0 + i * pitch - p[0], z0 + k * pitch - p[2]) <= reach) zone[k * nx + i] = zone[k * nx + i] === -1 || zone[k * nx + i] === who ? who : -2;
  };
  for (const p of options.keepOut ?? []) keep(p, -2);
  requests.forEach((r, i) => {
    keep(r.a, i);
    keep(r.b, i);
  });
  const open = (c: number, who: number) => zone[c] === -1 || zone[c] === who;
  const free = (c: number, who: number) => c >= 0 && !deck.blocked[c] && !deck.low[c] && owner[c]! < 0 && portOf[c]! < 0 && open(c, who);

  // 1. Where each end lands on the deck: the nearest free cell to where the wire bends over, plus its "port", the next
  //    cell out. The wire always leaves its landing through its port, so wires from a row of pins leave side by side
  //    and a landing can never be shut in by its neighbours.
  interface Landing {
    cell: number;
    port: number;
    /** Heading from the landing into its port. */
    out: number;
  }
  const findLanding = (exit: V3, dir: V3 | undefined, far: V3, who: number): Landing | null => {
    const p: V3 = dir ? [exit[0] + dir[0] * RISE_CM, exit[1] + dir[1] * RISE_CM, exit[2] + dir[2] * RISE_CM] : exit;
    const k = Math.ceil(escapeCm / pitch);
    const pi = Math.round((p[0] - x0) / pitch);
    const pk = Math.round((p[2] - z0) / pitch);
    let best: Landing | null = null;
    let bestScore = Infinity;
    for (let kk = Math.max(0, pk - k); kk <= Math.min(nz - 1, pk + k); kk += 1) {
      for (let ii = Math.max(0, pi - k); ii <= Math.min(nx - 1, pi + k); ii += 1) {
        const c = kk * nx + ii;
        if (!free(c, who)) continue;
        const x = cx(c);
        const z = cz(c);
        const near = Math.hypot(x - p[0], z - p[2]);
        if (near > escapeCm) continue;
        // out the way the wire was already heading as it came down; straight down: towards the other end
        const out = near > 0.05 ? heading(x - p[0], z - p[2]) : heading(far[0] - x, far[2] - z);
        const port = step(c, out);
        if (!free(port, who)) continue;
        const score = near + 0.05 * Math.hypot(x - far[0], z - far[2]);
        if (score < bestScore) {
          bestScore = score;
          best = { cell: c, port, out };
        }
      }
    }
    if (best) {
      owner[best.cell] = who;
      portOf[best.port] = who;
    }
    return best;
  };
  const landings = requests.map((r, i) => ({ s: findLanding(r.a, r.aDir, r.b, i), g: findLanding(r.b, r.bDir, r.a, i) }));
  // Untangle the landings: seen from above, the path from a socket to its landing should not cross another such path
  // or pass over another socket in both directions at once (then neither drop could pass over the other). Swapping
  // the two landings fixes it and makes the pair shorter, so a few passes settle it.
  const endsList: { i: number; exit: V3; side: 's' | 'g' }[] = [];
  requests.forEach((r, i) => {
    endsList.push({ i, exit: r.a, side: 's' }, { i, exit: r.b, side: 'g' });
  });
  const segDist = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => {
    const vx = bx - ax;
    const vz = bz - az;
    const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1)));
    return Math.hypot(ax + vx * t - px, az + vz * t - pz);
  };
  const cross = (ax: number, az: number, bx: number, bz: number, cx2: number, cz2: number, dx: number, dz: number) => {
    const o = (px: number, pz: number, qx: number, qz: number, rx: number, rz: number) => Math.sign((qx - px) * (rz - pz) - (qz - pz) * (rx - px));
    return o(ax, az, bx, bz, cx2, cz2) * o(ax, az, bx, bz, dx, dz) < 0 && o(cx2, cz2, dx, dz, ax, az) * o(cx2, cz2, dx, dz, bx, bz) < 0;
  };
  for (let pass = 0; pass < 6; pass += 1) {
    let swapped = false;
    for (let p = 0; p < endsList.length; p += 1) {
      for (let q = p + 1; q < endsList.length; q += 1) {
        const A = endsList[p]!;
        const B = endsList[q]!;
        if (A.i === B.i || Math.hypot(B.exit[0] - A.exit[0], B.exit[2] - A.exit[2]) > 2) continue;
        const la = landings[A.i]![A.side];
        const lb = landings[B.i]![B.side];
        if (!la || !lb) continue;
        const [ax, az, bx, bz] = [A.exit[0], A.exit[2], cx(la.cell), cz(la.cell)];
        const [ex, ez, fx, fz] = [B.exit[0], B.exit[2], cx(lb.cell), cz(lb.cell)];
        const tangled = cross(ax, az, bx, bz, ex, ez, fx, fz) || (segDist(ex, ez, ax, az, bx, bz) < 0.16 && segDist(ax, az, ex, ez, fx, fz) < 0.16);
        if (!tangled) continue;
        const before = Math.hypot(bx - ax, bz - az) + Math.hypot(fx - ex, fz - ez);
        const after = Math.hypot(fx - ax, fz - az) + Math.hypot(bx - ex, bz - ez);
        if (after > before + 0.3) continue;
        landings[A.i]![A.side] = lb;
        landings[B.i]![B.side] = la;
        owner[lb.cell] = A.i;
        portOf[lb.port] = A.i;
        owner[la.cell] = B.i;
        portOf[la.port] = B.i;
        swapped = true;
      }
    }
    if (!swapped) break;
  }

  // 2. Order: short wires first (they have the fewest ways to go), the wires of a bundle one after another, in order
  //    across the bundle so it does not cross itself
  const manhattan = (i: number) => {
    const { s, g } = landings[i]!;
    return !s || !g ? 0 : Math.abs(cx(s.cell) - cx(g.cell)) + Math.abs(cz(s.cell) - cz(g.cell));
  };
  const groupSpan = new Map<string, number>();
  requests.forEach((r, i) => groupSpan.set(r.group, Math.max(groupSpan.get(r.group) ?? 0, manhattan(i))));
  const groupDir = new Map<string, [number, number]>();
  requests.forEach((r, i) => {
    const { s, g } = landings[i]!;
    if (!s || !g) return;
    const v = groupDir.get(r.group) ?? [0, 0];
    groupDir.set(r.group, [v[0] + cx(g.cell) - cx(s.cell), v[1] + cz(g.cell) - cz(s.cell)]);
  });
  const lateralKey = (i: number) => {
    const { s, g } = landings[i]!;
    const [dx, dz] = groupDir.get(requests[i]!.group) ?? [1, 0];
    const len = Math.hypot(dx, dz) || 1;
    return !s || !g ? 0 : ((cx(s.cell) + cx(g.cell)) * -dz + (cz(s.cell) + cz(g.cell)) * dx) / len;
  };
  const initialOrder = requests
    .map((_, i) => i)
    .sort((p, q) => {
      const gp = requests[p]!.group;
      const gq = requests[q]!.group;
      if (gp !== gq) return ((groupSpan.get(gq) ?? 0) - (groupSpan.get(gp) ?? 0)) * (longFirst ? 1 : -1) || (gp < gq ? -1 : 1);
      return lateralKey(p) - lateralKey(q);
    });

  // 3. A* over (cell, heading) through the lanes left free by the wires laid so far
  const gScore = new Float32Array(n * 4);
  const came = new Int32Array(n * 4);
  const heap = new MinHeap(n * 4);
  /** Ports are claimed along their heading before their wires are laid; real lanes are in `occ`. */
  const claim = new Uint8Array(n);
  for (const l of landings) for (const e of [l.s, l.g]) if (e) claim[e.port] = AXIS_BIT[e.out]!;
  /** `over`: when no free lane is left, a wire may also lie on top of a taken one (raised over it), at a cost. */
  const astar = (who: number, s: Landing, g: Landing, occ: Uint8Array, over = false): number[] | null => {
    const taken = (c: number) => occ[c]! | (portOf[c]! >= 0 && portOf[c] !== who ? claim[c]! : 0);
    gScore.fill(Infinity);
    came.fill(-1);
    heap.clear();
    const gx = g.cell % nx;
    const gz = Math.floor(g.cell / nx);
    const h = (c: number) => (1 - bundleBonus) * (Math.abs((c % nx) - gx) + Math.abs(Math.floor(c / nx) - gz));
    const first = s.port * 4 + s.out;
    gScore[first] = 1;
    heap.push(first, 1 + h(s.port));
    while (heap.size > 0) {
      const st = heap.pop();
      const c = st >> 2;
      const d = st & 3;
      if (c === g.cell) {
        const cells: number[] = [];
        for (let cur = st; cur >= 0; cur = came[cur]!) cells.push(cur >> 2);
        cells.push(s.cell);
        return cells.reverse();
      }
      const base = gScore[st]!;
      for (let nd = 0; nd < 4; nd += 1) {
        if (nd === OPPOSITE[d]) continue;
        const nb = step(c, nd);
        if (nb < 0 || nb === s.cell) continue;
        if (nb === g.cell && c !== g.port) continue; // a wire arrives through its port only
        if (deck.blocked[nb] && nb !== g.cell) continue;
        if (owner[nb]! >= 0 && owner[nb] !== who) continue;
        if (!open(nb, who)) continue;
        const turning = nd !== d;
        let cost = 1;
        if (turning && taken(c)) {
          if (!over) continue; // never turn where another wire lies or will lie
          cost += 8;
        }
        const bit = AXIS_BIT[nd]!;
        const there = taken(nb);
        if (there & bit) {
          if (!over) continue; // would lie along another wire
          cost += 8;
        } else if (there) cost += crossCost;
        if (deck.low[nb]) cost += 3;
        if (turning) cost += bendCost + (c === s.port || c === g.port ? 4 : 0); // lead out straight from a landing
        // right beside a wire going the same way: that is how bundles form
        const sideA = step(nb, nd < 2 ? 2 : 0);
        const sideB = step(nb, nd < 2 ? 3 : 1);
        if (((sideA >= 0 ? occ[sideA]! : 0) | (sideB >= 0 ? occ[sideB]! : 0)) & bit) cost -= bundleBonus;
        const ns = nb * 4 + nd;
        const ng = base + cost;
        if (ng < gScore[ns]!) {
          gScore[ns] = ng;
          came[ns] = st;
          heap.push(ns, ng + h(nb));
        }
      }
    }
    return null;
  };

  interface Attempt {
    out: Map<string, DeckRoute>;
    failed: { i: number; why: string }[];
    occ: Uint8Array;
    top: Float32Array;
    cost: number;
  }
  /** Lays wire `i` along `cells`, claiming its lanes; returns the run and what it cost. */
  const lay = (i: number, cells: number[], occ: Uint8Array, top: Float32Array): { route: DeckRoute; cost: number } => {
    const req = requests[i]!;
    // corners of the run, then the run itself with rounded corners
    const corners: [number, number][] = [[cx(cells[0]!), cz(cells[0]!)]];
    for (let k = 1; k < cells.length - 1; k += 1) if (cells[k]! - cells[k - 1]! !== cells[k + 1]! - cells[k]!) corners.push([cx(cells[k]!), cz(cells[k]!)]);
    corners.push([cx(cells[cells.length - 1]!), cz(cells[cells.length - 1]!)]);
    const flat = filletRun(corners, fillet);
    const sAt = arcLengths(flat);
    let j = 0;
    const at = cells.map((c) => {
      // samples run in step with the cells, so the nearest is found by walking forward
      const x = cx(c);
      const z = cz(c);
      let bd = (flat[j]![0] - x) ** 2 + (flat[j]![1] - z) ** 2;
      for (let k = j + 1; k < flat.length; k += 1) {
        const dd = (flat[k]![0] - x) ** 2 + (flat[k]![1] - z) ** 2;
        if (dd > bd + 1e-9 && dd > pitch * pitch) break;
        if (dd < bd) {
          bd = dd;
          j = k;
        }
      }
      return j;
    });
    // height along the run: on the deck, over low parts, and hopping over the wires it crosses
    const base = deck.deckY + req.radius;
    const need = flat.map(() => base);
    let crossings = 0;
    let stacked = 0;
    cells.forEach((c, k) => {
      if (k > 0 && occ[c]! & (Math.abs(c - cells[k - 1]!) === 1 ? 1 : 2)) stacked += 1;
      let y = base;
      if (deck.low[c]) y = Math.max(y, deck.height[c]! + req.radius);
      if (occ[c] && top[c]! > -Infinity) {
        y = Math.max(y, top[c]! + req.radius + 0.015);
        crossings += 1;
      }
      need[at[k]!] = Math.max(need[at[k]!]!, y);
    });
    const ys = smoothBumps(sAt, need, base);
    const run: V3[] = flat.map(([x, z], k) => [x, ys[k]!, z]);
    // claim the lanes: each cell in the directions the wire uses it (both at a corner or a landing)
    cells.forEach((c, k) => {
      if (k === 0 || k === cells.length - 1) occ[c] = occ[c]! | 3;
      else occ[c] = occ[c]! | (Math.abs(c - cells[k - 1]!) === 1 ? 1 : 2) | (Math.abs(cells[k + 1]! - c) === 1 ? 1 : 2);
    });
    // the top of the wire in every cell it passes over, for the wires that will hop over it
    for (const p of run) {
      const ii = Math.round((p[0] - x0) / pitch);
      const kk = Math.round((p[2] - z0) / pitch);
      if (ii >= 0 && kk >= 0 && ii < nx && kk < nz) top[kk * nx + ii] = Math.max(top[kk * nx + ii]!, p[1] + req.radius);
    }
    return { route: { run, crossings: crossings - stacked, stacked }, cost: cells.length + crossings * crossCost + (corners.length - 2) * bendCost };
  };
  const routeAll = (order: readonly number[]): Attempt => {
    const occ = new Uint8Array(n);
    const top = new Float32Array(n).fill(-Infinity);
    const out = new Map<string, DeckRoute>();
    const failed: { i: number; why: string }[] = [];
    let cost = 0;
    for (const i of order) {
      const { s, g } = landings[i]!;
      if (!s || !g) {
        failed.push({ i, why: `no free spot on the deck near ${!s ? 'the start' : 'the end'}` });
        continue;
      }
      const cells = astar(i, s, g, occ);
      if (!cells) {
        failed.push({ i, why: 'no free lane between its ends' });
        continue;
      }
      const laid = lay(i, cells, occ, top);
      cost += laid.cost;
      out.set(requests[i]!.id, laid.route);
    }
    return { out, failed, occ, top, cost };
  };

  // 4. Rip up and retry: wires that found no lane go first next time; the attempt with the fewest left out wins
  let order = initialOrder;
  let best: Attempt | null = null;
  for (let attempt = 0; attempt < (options.attempts ?? 4); attempt += 1) {
    const result = routeAll(order);
    if (!best || result.failed.length < best.failed.length || (result.failed.length === best.failed.length && result.cost < best.cost)) best = result;
    if (result.failed.length === 0) break;
    const late = new Set(result.failed.map((f) => f.i));
    order = [...result.failed.map((f) => f.i), ...order.filter((i) => !late.has(i))];
  }
  // 5. Wires still without a lane lie on top of the bundles they follow (raised over them), as in a real harness
  const still: { i: number; why: string }[] = [];
  for (const f of best!.failed) {
    const { s, g } = landings[f.i]!;
    const cells = s && g ? astar(f.i, s, g, best!.occ, true) : null;
    if (!cells) {
      still.push(f);
      continue;
    }
    best!.out.set(requests[f.i]!.id, lay(f.i, cells, best!.occ, best!.top).route);
  }
  best!.failed = still;
  for (const f of best!.failed) options.onSkip?.(requests[f.i]!.id, f.why);
  options.onDone?.({ occ: best!.occ, owner, landings: landings.map((l, i) => ({ id: requests[i]!.id, s: l.s?.cell ?? -1, g: l.g?.cell ?? -1 })) });
  return best!.out;
}

/** A run through axis-aligned corner points with each corner rounded, sampled about every 0.12 cm. */
export function filletRun(corners: readonly (readonly [number, number])[], radius: number, step = 0.12): [number, number][] {
  const pts: [number, number][] = [];
  const push = (x: number, z: number) => {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(last[0] - x, last[1] - z) > 1e-6) pts.push([x, z]);
  };
  const line = (a: readonly [number, number], b: readonly [number, number]) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const m = Math.max(1, Math.ceil(L / step));
    for (let j = 0; j <= m; j += 1) push(a[0] + ((b[0] - a[0]) * j) / m, a[1] + ((b[1] - a[1]) * j) / m);
  };
  if (corners.length < 2) return corners.map((c) => [c[0], c[1]]);
  let from: readonly [number, number] = corners[0]!;
  for (let k = 1; k < corners.length - 1; k += 1) {
    const p = corners[k - 1]!;
    const c = corners[k]!;
    const q = corners[k + 1]!;
    const lin = Math.hypot(c[0] - p[0], c[1] - p[1]);
    const lout = Math.hypot(q[0] - c[0], q[1] - c[1]);
    // the end legs keep a straight piece for the wire to come down onto
    const inCap = k === 1 ? lin - 0.65 : lin / 2;
    const outCap = k === corners.length - 2 ? lout - 0.65 : lout / 2;
    const r = Math.max(0.05, Math.min(radius, inCap, outCap));
    const u: [number, number] = [(c[0] - p[0]) / lin, (c[1] - p[1]) / lin];
    const v: [number, number] = [(q[0] - c[0]) / lout, (q[1] - c[1]) / lout];
    const t1: [number, number] = [c[0] - u[0] * r, c[1] - u[1] * r];
    line(from, t1);
    const centre: [number, number] = [t1[0] + v[0] * r, t1[1] + v[1] * r];
    const m = Math.max(4, Math.ceil((Math.PI * r) / 2 / step));
    for (let j = 1; j <= m; j += 1) {
      const th = ((Math.PI / 2) * j) / m;
      push(centre[0] - v[0] * r * Math.cos(th) + u[0] * r * Math.sin(th), centre[1] - v[1] * r * Math.cos(th) + u[1] * r * Math.sin(th));
    }
    from = [c[0] + v[0] * r, c[1] + v[1] * r];
  }
  line(from, corners[corners.length - 1]!);
  return pts;
}

function arcLengths(pts: readonly (readonly [number, number])[]): number[] {
  const s = [0];
  for (let k = 1; k < pts.length; k += 1) s.push(s[k - 1]! + Math.hypot(pts[k]![0] - pts[k - 1]![0], pts[k]![1] - pts[k - 1]![1]));
  return s;
}

/**
 * Height along a run from the height each point needs: full height within 0.2 cm of a bump (a wire crossed, a low
 * part lain over), easing back down to the deck over the next 0.55 cm, the way a wire drapes over something. Bumps
 * closer than 1.2 cm merge into one, so a wire crossing a bundle lifts once over all of it instead of rippling.
 */
export function smoothBumps(s: readonly number[], need: readonly number[], base: number): number[] {
  const flatCm = 0.2;
  const easeCm = 0.55;
  const out = need.map(() => base);
  for (let j = 0; j < need.length; j += 1) {
    const rise = need[j]! - base;
    if (rise <= 1e-6) continue;
    for (let k = 0; k < need.length; k += 1) {
      const d = Math.abs(s[k]! - s[j]!);
      if (d >= flatCm + easeCm) continue;
      const w = d <= flatCm ? 1 : Math.cos(((d - flatCm) / easeCm) * (Math.PI / 2)) ** 2;
      out[k] = Math.max(out[k]!, base + rise * w);
    }
  }
  // fill a dip between two bumps that are close together (the lower of the two heights either side)
  const gap = 1.2;
  const filled = out.slice();
  for (let k = 0; k < out.length; k += 1) {
    let left = -Infinity;
    let right = -Infinity;
    for (let j = k - 1; j >= 0 && s[k]! - s[j]! <= gap; j -= 1) left = Math.max(left, need[j]!);
    for (let j = k + 1; j < out.length && s[j]! - s[k]! <= gap; j += 1) right = Math.max(right, need[j]!);
    filled[k] = Math.max(out[k]!, Math.min(left, right));
  }
  return filled;
}

/** Binary min-heap of integer items keyed by float priority; grows as needed. */
class MinHeap {
  private items: Int32Array;
  private keys: Float32Array;
  size = 0;

  constructor(capacity: number) {
    this.items = new Int32Array(Math.max(16, capacity));
    this.keys = new Float32Array(Math.max(16, capacity));
  }

  clear(): void {
    this.size = 0;
  }

  push(item: number, key: number): void {
    if (this.size >= this.items.length) {
      const items = new Int32Array(this.items.length * 2);
      const keys = new Float32Array(this.keys.length * 2);
      items.set(this.items);
      keys.set(this.keys);
      this.items = items;
      this.keys = keys;
    }
    let i = this.size;
    this.size += 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent]! <= key) break;
      this.items[i] = this.items[parent]!;
      this.keys[i] = this.keys[parent]!;
      i = parent;
    }
    this.items[i] = item;
    this.keys[i] = key;
  }

  pop(): number {
    const first = this.items[0]!;
    this.size -= 1;
    const item = this.items[this.size]!;
    const key = this.keys[this.size]!;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      if (l >= this.size) break;
      const r = l + 1;
      const c = r < this.size && this.keys[r]! < this.keys[l]! ? r : l;
      if (this.keys[c]! >= key) break;
      this.items[i] = this.items[c]!;
      this.keys[i] = this.keys[c]!;
      i = c;
    }
    this.items[i] = item;
    this.keys[i] = key;
    return first;
  }
}

/**
 * The piece of wire from a socket down to the deck: straight out of the socket, over, straight down beside the part
 * to where it lands, then curving onto its run (`next` is a point a little way along the run). Neighbouring pins land
 * on neighbouring lanes in the same order, so these pieces lie side by side without touching. `surface` gives the
 * height of whatever is under a point, so the wire passes over parts between its socket and the landing; `lift`
 * raises the bend so the piece can pass over a neighbour's.
 */
export function shapeDrop(exit: V3, dir: V3, land: V3, next: V3, radius: number, surface: (x: number, z: number) => number, lift = 0): V3[] {
  // an end pointing sideways (a solder tab) only runs out as far as its landing, so it never doubles back
  const sideways = Math.hypot(dir[0], dir[2]);
  const ahead = sideways > 1e-6 ? ((land[0] - exit[0]) * dir[0] + (land[2] - exit[2]) * dir[2]) / sideways : RISE_CM;
  const rise = RISE_CM * (1 - sideways) + sideways * Math.min(RISE_CM, Math.max(0.15, ahead));
  const bend: V3 = [exit[0] + dir[0] * rise, exit[1] + dir[1] * rise, exit[2] + dir[2] * rise];
  const hx = land[0] - bend[0];
  const hz = land[2] - bend[2];
  const across = Math.hypot(hx, hz);
  let top = bend[1];
  const m = Math.max(2, Math.ceil(across / 0.08));
  for (let k = 0; k <= m; k += 1) {
    const x = bend[0] + (hx * k) / m;
    const z = bend[2] + (hz * k) / m;
    if (Math.hypot(x - land[0], z - land[2]) < 0.18) continue;
    top = Math.max(top, surface(x, z) + radius + 0.08);
  }
  top += lift;
  const pts: V3[] = [exit, bend];
  if (top > bend[1] + 0.02) pts.push([bend[0], top, bend[2]]);
  if (across > 0.05) pts.push([land[0], top, land[2]]);
  pts.push(land, next);
  return roundCorners(pts, 0.3);
}

/**
 * A short jumper between two sockets that does not go down to the deck: straight out of each socket, then across at
 * the height that clears everything between them (plus `lift`, to pass over wires already laid), square to the
 * chassis with one corner where it needs one, all corners rounded.
 */
export function shapeBridge(a: V3, aDir: V3, b: V3, bDir: V3, radius: number, surface: (x: number, z: number) => number, lift = 0): V3[] {
  const ba: V3 = [a[0] + aDir[0] * RISE_CM, a[1] + aDir[1] * RISE_CM, a[2] + aDir[2] * RISE_CM];
  const bb: V3 = [b[0] + bDir[0] * RISE_CM, b[1] + bDir[1] * RISE_CM, b[2] + bDir[2] * RISE_CM];
  // across square to the chassis, like the runs on the deck: one corner, on the side with less in the way
  const dx = Math.abs(bb[0] - ba[0]);
  const dz = Math.abs(bb[2] - ba[2]);
  const highest = (path: [number, number][]) => {
    let h = Math.max(ba[1], bb[1]);
    for (let s = 1; s < path.length; s += 1) {
      const [p, q] = [path[s - 1]!, path[s]!];
      const m = Math.max(2, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.08));
      for (let k = 0; k <= m; k += 1) h = Math.max(h, surface(p[0] + ((q[0] - p[0]) * k) / m, p[1] + ((q[1] - p[1]) * k) / m) + radius + 0.08);
    }
    return h;
  };
  const straight: [number, number][] = [[ba[0], ba[2]], [bb[0], bb[2]]];
  const options: [number, number][][] =
    Math.min(dx, dz) < 0.3 ? [straight] : [
      [[ba[0], ba[2]], [bb[0], ba[2]], [bb[0], bb[2]]],
      [[ba[0], ba[2]], [ba[0], bb[2]], [bb[0], bb[2]]],
    ];
  let path = options[0]!;
  let top = highest(path);
  for (const o of options.slice(1)) {
    const h = highest(o);
    if (h < top - 0.01) {
      top = h;
      path = o;
    }
  }
  top += lift;
  return roundCorners([a, ba, ...path.map(([x, z]): V3 => [x, top, z]), bb, b], 0.3, 0.08, 0.15);
}

/** A polyline with every corner rounded (radius about `radius`), sampled about every 0.08 cm. */
export function roundCorners(pts: readonly V3[], radius: number, step = 0.08, keepEnd = 0.05): V3[] {
  const clean: V3[] = [];
  for (const p of pts) {
    const last = clean[clean.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) > 1e-4) clean.push(p);
  }
  if (clean.length < 3) return clean;
  const seg = (a: V3, b: V3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const unit = (a: V3, b: V3): V3 => {
    const l = seg(a, b) || 1;
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l, (b[2] - a[2]) / l];
  };
  const out: V3[] = [];
  const line = (a: V3, b: V3) => {
    const k = Math.max(1, Math.ceil(seg(a, b) / step));
    for (let j = out.length > 0 ? 1 : 0; j <= k; j += 1) out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k, a[2] + ((b[2] - a[2]) * j) / k]);
  };
  let from = clean[0]!;
  for (let k = 1; k < clean.length - 1; k += 1) {
    const p = clean[k - 1]!;
    const c = clean[k]!;
    const q = clean[k + 1]!;
    const u = unit(p, c);
    const v = unit(c, q);
    const turn = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2])));
    if (turn < 0.02) continue;
    const lin = seg(p, c);
    const lout = seg(c, q);
    // keep a straight bit at each end: the wire leaves its socket straight and lies straight on its run
    const capIn = k === 1 ? lin - 0.15 : lin / 2;
    const capOut = k === clean.length - 2 ? lout - keepEnd : lout / 2;
    const d = Math.max(0, Math.min(radius * Math.tan(turn / 2), capIn, capOut));
    const t1: V3 = [c[0] - u[0] * d, c[1] - u[1] * d, c[2] - u[2] * d];
    const t2: V3 = [c[0] + v[0] * d, c[1] + v[1] * d, c[2] + v[2] * d];
    line(from, t1);
    const n = Math.max(3, Math.ceil((d * turn) / step));
    for (let j = 1; j <= n; j += 1) {
      const t = j / n;
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const e = t * t;
      out.push([a * t1[0] + b * c[0] + e * t2[0], a * t1[1] + b * c[1] + e * t2[1], a * t1[2] + b * c[2] + e * t2[2]]);
    }
    from = t2;
  }
  line(from, clean[clean.length - 1]!);
  return out;
}

/** Splits a path so no step is longer than `step` (cm). */
export function densify(path: readonly V3[], step = 0.06): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < path.length; i += 1) {
    const b = path[i]!;
    if (i > 0) {
      const a = path[i - 1]!;
      const m = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / step);
      for (let j = 1; j < m; j += 1) out.push([a[0] + ((b[0] - a[0]) * j) / m, a[1] + ((b[1] - a[1]) * j) / m, a[2] + ((b[2] - a[2]) * j) / m]);
    }
    out.push([b[0], b[1], b[2]]);
  }
  return out;
}

/**
 * Last check that no two wires pass through each other: wherever two wires come closer than their radii, the more
 * level of the two is lifted over the other with a smooth bump (the last `keepEnds` cm into each socket never move,
 * and nothing is lifted more than `maxLift` cm).
 * Paths are edited in place and should be dense (see `densify`). Returns how many touching pairs could not be cleared.
 */
export function separateWires(paths: V3[][], radii: readonly number[], keepEnds = 0.12, rounds = 16, maxLift = 0.6): number {
  const base = paths.map((p) => p.map((pt) => pt[1]));
  // Which wire of a level pair goes over: the one that sits higher overall (as laid). A fixed order like this means
  // two wires never take turns going over each other, and three can never go round in a circle.
  const meanY = base.map((ys) => ys.reduce((a, b) => a + b, 0) / Math.max(1, ys.length));
  // a cell as wide as the closest two wires may come, so only the 27 cells around a point need checking
  const cell = 2 * Math.max(0.05, ...radii) + 0.012;
  const key = (x: number, y: number, z: number) => ((Math.floor(x / cell) + 512) * 1024 + (Math.floor(y / cell) + 512)) * 1024 + (Math.floor(z / cell) + 512);
  let left = 0;
  for (let round = 0; round < rounds; round += 1) {
    const lengths = paths.map((p) => arcLengths3D(p));
    const hash = new Map<number, number[]>();
    paths.forEach((p, w) =>
      p.forEach((pt, i) => {
        const k = key(pt[0], pt[1], pt[2]);
        const list = hash.get(k);
        if (list) list.push(w, i);
        else hash.set(k, [w, i]);
      }),
    );
    const tangentY = (w: number, i: number) => {
      const p = paths[w]!;
      const a = p[Math.max(0, i - 2)]!;
      const b = p[Math.min(p.length - 1, i + 2)]!;
      const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;
      return Math.abs(b[1] - a[1]) / l;
    };
    const movable = (w: number, i: number) => {
      const s = lengths[w]!;
      return s[i]! > keepEnds && s[s.length - 1]! - s[i]! > keepEnds;
    };
    /** Lift wanted per wire, as (arc length, rise) pairs; and sideways nudges, as (arc length, dx, dz). */
    const lifts = new Map<number, [number, number][]>();
    const nudges = new Map<number, [number, number, number][]>();
    const pairs = new Set<number>();
    let stuck = 0;
    paths.forEach((p, a) =>
      p.forEach((pa, i) => {
        const cxa = Math.floor(pa[0] / cell);
        const cya = Math.floor(pa[1] / cell);
        const cza = Math.floor(pa[2] / cell);
        for (let dx = -1; dx <= 1; dx += 1) {
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dz = -1; dz <= 1; dz += 1) {
              const list = hash.get(((cxa + dx + 512) * 1024 + (cya + dy + 512)) * 1024 + (cza + dz + 512));
              if (!list) continue;
              for (let k = 0; k < list.length; k += 2) {
                const b = list[k]!;
                if (b <= a) continue;
                const j = list[k + 1]!;
                const pb = paths[b]![j]!;
                const need = radii[a]! + radii[b]! + 0.01;
                const d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
                if (d >= need - 0.002) continue;
                const ma = movable(a, i);
                const mb = movable(b, j);
                pairs.add(a * 4096 + b);
                if (!ma && !mb) {
                  stuck += 1;
                  continue;
                }
                // lift the more level wire (it can go over); the higher one if both are level
                const ta = tangentY(a, i);
                const tb = tangentY(b, j);
                let up: number;
                if (!mb) up = a;
                else if (!ma) up = b;
                else if (Math.abs(ta - tb) > 0.2) up = ta < tb ? a : b;
                else up = meanY[a]! >= meanY[b]! ? a : b;
                const [pu, po, iu, other] = up === a ? [pa, pb, i, b] : [pb, pa, j, a];
                const h = Math.hypot(pu[0] - po[0], pu[2] - po[2]);
                const nudge = () => {
                  const away = h > 1e-4 ? [(pu[0] - po[0]) / h, (pu[2] - po[2]) / h] : [1, 0];
                  const push = Math.max(0.01, need - h + 0.004);
                  const list3 = nudges.get(up) ?? [];
                  list3.push([lengths[up]![iu]!, away[0]! * push, away[1]! * push]);
                  nudges.set(up, list3);
                };
                if (ta > 0.6 && tb > 0.6) {
                  nudge(); // two wires both rising side by side: lifting does nothing, so ease one aside
                  continue;
                }
                // over the other wire where it is under this point: the top of it, if it rises straight up here
                let ceiling = po[1];
                if (tangentY(other, up === a ? j : i) > 0.6) for (const q of paths[other]!) if (Math.hypot(q[0] - pu[0], q[2] - pu[2]) < need) ceiling = Math.max(ceiling, q[1]);
                const rise = ceiling + Math.sqrt(Math.max(0, need * need - h * h)) - pu[1];
                if (rise <= 0) continue;
                if (pu[1] - base[up]![iu]! + rise > maxLift) {
                  nudge(); // lifting it that far would make it fly: ease it aside instead
                  continue;
                }
                const list2 = lifts.get(up) ?? [];
                list2.push([lengths[up]![iu]!, rise + 0.002]);
                lifts.set(up, list2);
              }
            }
          }
        }
      }),
    );
    left = pairs.size;
    if (lifts.size === 0 && nudges.size === 0) return stuck > 0 ? left : 0;
    const bump = (d: number) => (d >= 0.7 ? 0 : d <= 0.15 ? 1 : Math.cos(((d - 0.15) / 0.55) * (Math.PI / 2)) ** 2);
    for (const [w, want] of nudges) {
      const p = paths[w]!;
      const s = lengths[w]!;
      const total = s[s.length - 1]!;
      p.forEach((pt, k) => {
        let best = 0;
        let mx = 0;
        let mz = 0;
        for (const [at, dx, dz] of want) {
          const f = bump(Math.abs(s[k]! - at));
          const m = Math.hypot(dx, dz) * f;
          if (m > best) {
            best = m;
            mx = dx * f;
            mz = dz * f;
          }
        }
        const fromEnd = Math.min(s[k]!, total - s[k]!);
        const fade = fromEnd <= keepEnds ? 0 : Math.min(1, (fromEnd - keepEnds) / 0.12);
        pt[0] += mx * fade;
        pt[2] += mz * fade;
      });
    }
    for (const [w, want] of lifts) {
      const p = paths[w]!;
      const s = lengths[w]!;
      const total = s[s.length - 1]!;
      p.forEach((pt, k) => {
        let rise = 0;
        for (const [at, r] of want) {
          const d = Math.abs(s[k]! - at);
          if (d >= 0.7) continue;
          rise = Math.max(rise, r * (d <= 0.15 ? 1 : Math.cos(((d - 0.15) / 0.55) * (Math.PI / 2)) ** 2));
        }
        // fade to nothing at the sockets
        const fromEnd = Math.min(s[k]!, total - s[k]!);
        const fade = fromEnd <= keepEnds ? 0 : Math.min(1, (fromEnd - keepEnds) / 0.12);
        // never more than `maxLift` above where the wire was laid: past that it is better left touching than flying
        pt[1] = Math.min(base[w]![k]! + maxLift, pt[1] + rise * fade);
      });
    }
  }
  return left;
}

function arcLengths3D(path: readonly V3[]): number[] {
  const s = [0];
  for (let k = 1; k < path.length; k += 1) s.push(s[k - 1]! + Math.hypot(path[k]![0] - path[k - 1]![0], path[k]![1] - path[k - 1]![1], path[k]![2] - path[k - 1]![2]));
  return s;
}
