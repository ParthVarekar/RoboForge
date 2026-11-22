import { describe, expect, it } from 'vitest';
import { densify, filletRun, makeDeckGrid, routeDeck, separateWires, shapeBridge, shapeDrop, smoothBumps, type DeckRequest } from '../../viewport/wireDeckRouter';
import type { V3 } from '../../viewport/wireRope';

const PITCH = 0.254;
const UP: V3 = [0, 1, 0];

interface Block {
  x: [number, number];
  z: [number, number];
  top: number;
}

/** A deck at `deckY` covering x, z in [-size, size] with blocks standing on it; the bench (0) around it. */
function deckFor(size: number, deckY: number, blocks: Block[] = [], margin = 1.5) {
  const x0 = -size - margin;
  const z0 = -size - margin;
  const n = Math.ceil((2 * (size + margin)) / PITCH) + 1;
  const heightAt = (dx: number, dz: number) => {
    const h = new Float32Array(n * n);
    for (let k = 0; k < n; k += 1) {
      for (let i = 0; i < n; i += 1) {
        const x = x0 + i * PITCH + dx;
        const z = z0 + k * PITCH + dz;
        let y = Math.abs(x) <= size && Math.abs(z) <= size ? deckY : 0;
        for (const b of blocks) if (x >= b.x[0] && x <= b.x[1] && z >= b.z[0] && z <= b.z[1]) y = Math.max(y, b.top);
        h[k * n + i] = y;
      }
    }
    return h;
  };
  return { x0, z0, n, heightAt };
}

function grid(size: number, deckY: number, blocks: Block[], focus: V3[]) {
  const d = deckFor(size, deckY, blocks);
  return makeDeckGrid(d.x0, d.z0, d.n, d.n, PITCH, d.heightAt, focus);
}

const req = (id: string, a: V3, b: V3, group = id, radius = 0.056): DeckRequest => ({ id, a, b, aDir: UP, bDir: UP, radius, group });

/** Smallest 3D gap between two wires' surfaces (negative = they pass through each other). */
function gap(p: readonly V3[], rp: number, q: readonly V3[], rq: number): number {
  const a = densify(p, 0.03);
  const b = densify(q, 0.03);
  let best = Infinity;
  for (const u of a) for (const v of b) best = Math.min(best, Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]));
  return best - rp - rq;
}

describe('deck grid', () => {
  it('finds the deck, blocks parts and their sides, and marks low parts', () => {
    const focus: V3[] = [[-2, 2, 0], [2, 2, 0]];
    const deck = grid(5, 0.5, [{ x: [-1, 1], z: [-1, 1], top: 2 }, { x: [2.5, 3.5], z: [-0.2, 0.2], top: 0.7 }], focus);
    expect(deck.deckY).toBeCloseTo(0.5, 2);
    const at = (x: number, z: number) => Math.round((z - deck.z0) / PITCH) * deck.nx + Math.round((x - deck.x0) / PITCH);
    expect(deck.blocked[at(0, 0)]).toBe(1); // on the part
    expect(deck.blocked[at(-3, 0)]).toBe(0); // open deck
    expect(deck.low[at(3, 0)]).toBe(1); // a resistor-height part can be lain over
    expect(deck.blocked[at(5.4, 0)]).toBe(1); // off the edge
  });
});

describe('deck routing', () => {
  it('lays wires side by side in their own lanes, never through each other', () => {
    const ends: V3[] = [];
    const reqs: DeckRequest[] = [];
    for (let k = 0; k < 4; k += 1) {
      const a: V3 = [-3, 1.5, -0.4 + k * PITCH];
      const b: V3 = [3, 1.5, -0.4 + k * PITCH];
      ends.push(a, b);
      reqs.push(req(`w${k}`, a, b, 'bundle'));
    }
    const deck = grid(5, 0.5, [], ends);
    const routes = routeDeck(deck, reqs);
    expect(routes.size).toBe(4);
    const runs = [...routes.values()].map((r) => r.run);
    for (let i = 0; i < runs.length; i += 1) for (let j = i + 1; j < runs.length; j += 1) expect(gap(runs[i]!, 0.056, runs[j]!, 0.056)).toBeGreaterThan(0);
    // lying on the deck, not floating
    for (const r of runs) expect(Math.min(...r.map((p) => p[1]))).toBeCloseTo(0.5 + 0.056, 2);
  });

  it('hops over a wire it has to cross', () => {
    const a1: V3 = [-3, 1.5, 0];
    const b1: V3 = [3, 1.5, 0];
    const a2: V3 = [0.3, 1.5, -3];
    const b2: V3 = [0.3, 1.5, 3];
    const deck = grid(5, 0.5, [], [a1, b1, a2, b2]);
    const routes = routeDeck(deck, [req('east', a1, b1), req('north', a2, b2)]);
    expect(routes.size).toBe(2);
    const east = routes.get('east')!;
    const north = routes.get('north')!;
    expect(east.crossings + north.crossings).toBeGreaterThanOrEqual(1);
    expect(gap(east.run, 0.056, north.run, 0.056)).toBeGreaterThan(0);
  });

  it('runs square to the chassis with rounded corners', () => {
    const a: V3 = [-3, 1.5, -3];
    const b: V3 = [3, 1.5, 3];
    const deck = grid(5, 0.5, [], [a, b]);
    const run = routeDeck(deck, [req('L', a, b)]).get('L')!.run;
    // between corners the run moves along x or z only; the bends are short arcs
    let bent = 0;
    for (let k = 1; k < run.length; k += 1) {
      const dx = Math.abs(run[k]![0] - run[k - 1]![0]);
      const dz = Math.abs(run[k]![2] - run[k - 1]![2]);
      if (dx > 1e-6 && dz > 1e-6) bent += Math.hypot(dx, dz);
    }
    expect(bent).toBeLessThan(2 * 0.7);
  });

  it('keeps its lanes off other wires\' joints near the deck', () => {
    const a: V3 = [-3, 1.5, 0];
    const b: V3 = [3, 1.5, 0];
    const joint: V3 = [0, 0.6, 0];
    const deck = grid(5, 0.5, [], [a, b]);
    const run = routeDeck(deck, [req('w', a, b)], { keepOut: [joint] }).get('w')!.run;
    expect(Math.min(...run.map((p) => Math.hypot(p[0] - joint[0], p[2] - joint[2])))).toBeGreaterThan(0.2);
  });

  it('lands wires from a row of pins in the same order as the pins', () => {
    const reqs: DeckRequest[] = [];
    const ends: V3[] = [];
    for (let k = 0; k < 5; k += 1) {
      const a: V3 = [-1 + k * PITCH, 2.5, -1.2];
      const b: V3 = [-1 + k * PITCH, 2.5, 3.5];
      ends.push(a, b);
      reqs.push(req(`p${k}`, a, b, 'row'));
    }
    // the header's board: a block the pins stand on
    const deck = grid(5, 0.5, [{ x: [-1.5, 0.5], z: [-1.6, -0.8], top: 1.6 }], ends);
    const routes = routeDeck(deck, reqs);
    expect(routes.size).toBe(5);
    const landX = reqs.map((r) => routes.get(r.id)!.run[0]![0]);
    for (let k = 1; k < landX.length; k += 1) expect(landX[k]!).toBeGreaterThan(landX[k - 1]!);
  });
});

describe('formed pieces', () => {
  it('rises out of the socket, comes down beside the part and ends on its run', () => {
    const exit: V3 = [0, 2.5, 0];
    const land: V3 = [0, 0.556, 0.8];
    const next: V3 = [0, 0.556, 1.1];
    const pts = shapeDrop(exit, UP, land, next, 0.056, () => 0.5);
    expect(pts[0]).toEqual(exit);
    expect(pts[pts.length - 1]).toEqual(next);
    expect(Math.max(...pts.map((p) => p[1]))).toBeGreaterThan(exit[1] + 0.3);
    // straight up out of the socket first
    expect(pts[1]![2]).toBeCloseTo(0, 6);
  });

  it('does not run out past its landing from a sideways tab and double back', () => {
    const exit: V3 = [0, 2, 0];
    const tab: V3 = [0, 0, 1]; // points +z, the landing is behind it
    const pts = shapeDrop(exit, tab, [0, 0.556, -0.6], [0, 0.556, -0.9], 0.056, () => 0.5);
    expect(Math.max(...pts.map((p) => p[2]))).toBeLessThan(0.16 + 1e-6);
  });

  it('bridges two pins square to the chassis, clear of what is between them', () => {
    const pts = shapeBridge([0, 2, 0], UP, [1.5, 2, 1], UP, 0.056, (x) => (x > 0.5 && x < 1 ? 2.3 : 1.5));
    const topY = Math.max(...pts.map((p) => p[1]));
    expect(topY).toBeGreaterThan(2.3 + 0.056);
    const flat = pts.filter((p) => Math.abs(p[1] - topY) < 1e-6);
    // the flat top turns one square corner: it is made of runs along x and runs along z
    let bent = 0;
    for (let k = 1; k < flat.length; k += 1) if (Math.abs(flat[k]![0] - flat[k - 1]![0]) > 1e-6 && Math.abs(flat[k]![2] - flat[k - 1]![2]) > 1e-6) bent += 1;
    expect(bent).toBeLessThan(flat.length / 3);
  });

  it('rounds the corners of a run', () => {
    const pts = filletRun([[0, 0], [2, 0], [2, 2]], 0.4);
    const cornerGap = Math.min(...pts.map(([x, z]) => Math.hypot(x - 2, z)));
    expect(cornerGap).toBeGreaterThan(0.1); // cuts inside the sharp corner
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[pts.length - 1]).toEqual([2, 2]);
  });
});

describe('heights along a run', () => {
  it('lifts once over two close bumps instead of rippling, and settles back on the deck', () => {
    const s = Array.from({ length: 61 }, (_, k) => k * 0.1);
    const need = s.map((v) => (Math.abs(v - 2) < 0.05 || Math.abs(v - 2.8) < 0.05 ? 0.7 : 0.5));
    const y = smoothBumps(s, need, 0.5);
    for (let k = 20; k <= 28; k += 1) expect(y[k]!).toBeGreaterThan(0.699);
    expect(y[0]).toBeCloseTo(0.5, 6);
    expect(y[60]).toBeCloseTo(0.5, 6);
  });
});

describe('last check', () => {
  it('lifts one of two touching wires over the other and leaves their ends alone', () => {
    const a = densify([[-2, 0.556, 0], [2, 0.556, 0]]);
    const b = densify([[0, 0.556, -2], [0, 0.556, 2]]);
    const ends = [a[0]!, a[a.length - 1]!, b[0]!, b[b.length - 1]!].map((p) => [...p]);
    const left = separateWires([a, b], [0.056, 0.056]);
    expect(left).toBe(0);
    expect(gap(a, 0.056, b, 0.056)).toBeGreaterThan(0);
    expect([a[0], a[a.length - 1], b[0], b[b.length - 1]]).toEqual(ends);
  });

  it('eases one of two wires rising side by side aside', () => {
    // apart at their sockets, bowing into each other halfway up
    const a = densify([[0, 0.5, 0], [0.06, 1.75, 0], [0, 3, 0]]);
    const b = densify([[0.2, 0.5, 0], [0.1, 1.75, 0], [0.2, 3, 0]]);
    separateWires([a, b], [0.056, 0.056]);
    expect(gap(a, 0.056, b, 0.056)).toBeGreaterThan(-0.002);
  });
});
