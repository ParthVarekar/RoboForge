import type { WireStyle } from '../schema/projectSchema';

/** How far a wire rises straight out of a DuPont socket on a header pin before it can bend (cm). */
export const SOCKET_RISE_CM = 0.88;

/**
 * Extra length a wire has beyond the straight span between its ends (cm). The same rule drives the 3D wire and the
 * cable length in the inspector and the cut list (an estimate there, as it does not know the routed path).
 *
 * - routed: a natural jumper with some slack, so it drapes and rests on the bench and the parts it crosses
 * - direct: pulled almost tight
 * - arched: a stiff formed jumper standing up in an arch
 * `clearanceCm` (default 0.45) adds or removes slack; "Lay out again" changes it.
 */
export function wireSlackCm(spanCm: number, style: WireStyle = 'routed', clearanceCm = 0.45): number {
  const extra = (clearanceCm - 0.45) * 2;
  if (style === 'direct') return Math.min(0.6, Math.max(0.15, spanCm * 0.03));
  if (style === 'arched') return Math.min(6, Math.max(1.5, spanCm * 0.3)) + Math.max(0, extra);
  // enough to drop from the socket and lie on the deck, not so much that it loops up between its ends
  return Math.max(0.4, Math.min(2.0, Math.max(0.6, spanCm * 0.08)) + extra);
}

export function wireLengthCm(spanCm: number, style: WireStyle = 'routed', clearanceCm = 0.45): number {
  return spanCm + wireSlackCm(spanCm, style, clearanceCm);
}

/**
 * Spare length for each leg of a wire that passes through guide points (cable clips). Slack
 * goes mainly into the two end legs, where the wire drops from its socket to the deck; the legs between guide points
 * lie on the deck and stay nearly taut (spare length there would crumple sideways into a zig-zag).
 */
export function legSlackThroughCm(points: ReadonlyArray<readonly [number, number, number]>, style: WireStyle = 'routed', clearanceCm = 0.45): number[] {
  const legs = points.slice(1).map((q, i) => Math.hypot(q[0] - points[i]![0], q[1] - points[i]![1], q[2] - points[i]![2]));
  if (legs.length <= 1) return [wireSlackCm(legs[0] ?? 0, style, clearanceCm)];
  return legs.map((leg, i) => (i === 0 || i === legs.length - 1 ? wireSlackCm(leg, style, clearanceCm) : Math.max(0.05, leg * 0.03)));
}

/** Length of a wire that passes through guide points: the straight legs plus each leg's slack. */
export function wireLengthThroughCm(points: ReadonlyArray<readonly [number, number, number]>, style: WireStyle = 'routed', clearanceCm = 0.45): number {
  const legs = points.slice(1).reduce((total, q, i) => total + Math.hypot(q[0] - points[i]![0], q[1] - points[i]![1], q[2] - points[i]![2]), 0);
  return legs + legSlackThroughCm(points, style, clearanceCm).reduce((a, b) => a + b, 0);
}
