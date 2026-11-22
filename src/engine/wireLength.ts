import type { WireStyle } from '../schema/projectSchema';

/** How far a wire rises straight out of a DuPont socket on a header pin before it can bend (cm). */
export const SOCKET_RISE_CM = 0.88;

/**
 * Extra length a wire has beyond the straight span between its ends (cm). The same rule drives the 3D wire and the
 * cable length in the inspector and the cut list, so what you see is what you would cut.
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
  return Math.max(0.6, Math.min(3.5, Math.max(0.9, spanCm * 0.16)) + extra);
}

export function wireLengthCm(spanCm: number, style: WireStyle = 'routed', clearanceCm = 0.45): number {
  return spanCm + wireSlackCm(spanCm, style, clearanceCm);
}
