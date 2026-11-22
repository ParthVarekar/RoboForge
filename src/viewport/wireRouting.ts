import { legSlackThroughCm, wireSlackCm } from '../engine/wireLength';
import type { WireStyle } from '../schema/projectSchema';
import type { ObstacleGrid, V3 } from './wireRope';

export interface WirePlan {
  /** Rest length between the two wire exits (cm). */
  length: number;
  /** Spare length of each leg between the exits and guide points (cm), for the rope to place where it belongs. */
  legSlack: number[];
}

/**
 * Rest length for a wire through its guide points, leg by leg. For a "natural" wire each end gets only as much slack
 * as it needs to curve down from where it sits to the surface below (a socket on a header needs room, a battery lead
 * lying on the deck needs almost none). Legs between guide points are taut, as a dressed wire is held flat, apart
 * from what it needs to step between surfaces of different height; spare length on the deck crumples into a zig-zag.
 * Other styles use the plain rule.
 */
export function planWire(chain: readonly V3[], style: WireStyle, clearanceCm: number, grid: ObstacleGrid, floorY = 0): WirePlan {
  const legs = chain.slice(1).map((q, i) => Math.hypot(q[0] - chain[i]![0], q[1] - chain[i]![1], q[2] - chain[i]![2]));
  const straight = legs.reduce((a, b) => a + b, 0);
  const done = (legSlack: number[]): WirePlan => ({ length: straight + legSlack.reduce((a, b) => a + b, 0), legSlack });
  if (style !== 'routed') return done(legSlackThroughCm(chain, style, clearanceCm));
  const extra = (clearanceCm - 0.45) * 2;
  const height = (p: V3) => Math.max(0, p[1] - grid.surfaceY(p[0], p[2], floorY));
  const endSlack = (leg: number, h: number) => Math.max(0.1, Math.min(wireSlackCm(leg, 'routed'), 0.15 + 0.6 * h) + extra);
  if (legs.length === 1) {
    const h = height(chain[0]!) + height(chain[1]!);
    return done([Math.max(0.1, Math.min(wireSlackCm(legs[0]!, 'routed'), 0.2 + 0.6 * h) + extra)]);
  }
  return done(
    legs.map((leg, i) => {
      if (i === 0) return endSlack(leg, height(chain[0]!));
      if (i === legs.length - 1) return endSlack(leg, height(chain[chain.length - 1]!));
      return 0.5 * Math.max(0, Math.abs(chain[i + 1]![1] - chain[i]![1]) - 0.1); // only enough to step off a board
    }),
  );
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (v: V3) => Math.hypot(v[0], v[1], v[2]);

/** Arc length at each point of a path. */
export function arcLengths3(path: readonly V3[]): number[] {
  const s = [0];
  for (let k = 1; k < path.length; k += 1) s.push(s[k - 1]! + norm(sub(path[k]!, path[k - 1]!)));
  return s;
}

/** Point and unit tangent at arc length `at` along a path (with `s` from arcLengths3). */
export function pointAlong(path: readonly V3[], s: readonly number[], at: number): { p: V3; t: V3 } {
  let i = 1;
  while (i < s.length - 1 && s[i]! < at) i += 1;
  const a = path[i - 1]!;
  const b = path[i]!;
  const span = s[i]! - s[i - 1]! || 1;
  const u = Math.min(1, Math.max(0, (at - s[i - 1]!) / span));
  const d = sub(b, a);
  const l = norm(d) || 1;
  return { p: [a[0] + d[0] * u, a[1] + d[1] * u, a[2] + d[2] * u], t: [d[0] / l, d[1] / l, d[2] / l] };
}
