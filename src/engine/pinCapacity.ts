import { getPinSpec } from '../catalog/partsCatalog';
import type { StudioProject, WirePinRef } from '../schema/projectSchema';

/**
 * How many wires a pin can physically take. A 2.54 mm header pin takes one DuPont socket, so one jumper. A soldered
 * point (a resistor or LED lead, a buck converter pad, a motor tab, a battery lead, a solder splice) can take several
 * wires soldered together.
 */
export function pinCapacity(kind: Parameters<typeof getPinSpec>[0], pinId: string): number {
  const spec = getPinSpec(kind, pinId);
  return spec?.contact === 'lead' ? Number.POSITIVE_INFINITY : 1;
}

export function wiresOnPin(project: StudioProject, ref: WirePinRef): string[] {
  return project.wires
    .filter((w) => [w.from, w.to].some((e) => e.componentId === ref.componentId && e.pinId === ref.pinId))
    .map((w) => w.id);
}

/** Why a new wire cannot go on this pin, or null when it can. */
export function pinRefusal(project: StudioProject, ref: WirePinRef): string | null {
  const comp = project.components.find((c) => c.id === ref.componentId);
  if (!comp) return null;
  const used = wiresOnPin(project, ref).length;
  if (used < pinCapacity(comp.kind, ref.pinId)) return null;
  const label = getPinSpec(comp.kind, ref.pinId)?.label ?? ref.pinId;
  return `${comp.label} ${label} already has a jumper: a header pin takes one DuPont socket. To share this signal, run one jumper to a solder splice (Passives) and branch from there.`;
}

/** Header pins carrying more wires than fit (from an imported or older build). */
export function overloadedPins(project: StudioProject): Array<{ ref: WirePinRef; wireIds: string[] }> {
  const seen = new Map<string, { ref: WirePinRef; wireIds: string[] }>();
  for (const w of project.wires) {
    for (const e of [w.from, w.to]) {
      const key = `${e.componentId}::${e.pinId}`;
      const entry = seen.get(key) ?? { ref: e, wireIds: [] };
      entry.wireIds.push(w.id);
      seen.set(key, entry);
    }
  }
  const out: Array<{ ref: WirePinRef; wireIds: string[] }> = [];
  for (const entry of seen.values()) {
    const comp = project.components.find((c) => c.id === entry.ref.componentId);
    if (comp && entry.wireIds.length > pinCapacity(comp.kind, entry.ref.pinId)) out.push(entry);
  }
  return out;
}
