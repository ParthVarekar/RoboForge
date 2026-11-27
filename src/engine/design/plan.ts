import { z } from 'zod';
import { getPartSpec } from '../../catalog/partsCatalog';
import { ComponentKindSchema, type ComponentKind } from '../../schema/projectSchema';

/**
 * The build plan: what the design chat (the AI or the offline planner) decides. It says *what* to build, never where
 * parts go or which pin does what; the assembler (assemble.ts) turns it into a placed, wired project the same way
 * every time.
 */

export const PlatformSchema = z.enum(['rover', 'drone', 'bench']);
export type Platform = z.infer<typeof PlatformSchema>;

/** Where a sensor looks or a part should sit, when it matters. */
export const PlacementSchema = z.enum(['front', 'back', 'any']);

export const PlanPartSchema = z.object({
  kind: ComponentKindSchema,
  qty: z.number().int().min(1).max(4).default(1),
  /** What it is for, in a few plain words ("front distance", "status screen"). */
  role: z.string().max(80).default(''),
  placement: PlacementSchema.default('any'),
  /** The user chose it: re-planning keeps it. */
  locked: z.boolean().default(false),
});
export type PlanPart = z.infer<typeof PlanPartSchema>;

export const BuildPlanSchema = z.object({
  title: z.string().min(1).max(80),
  summary: z.string().max(400).default(''),
  platform: PlatformSchema,
  /** The modules asked for; the assembler adds what the platform and wiring need (driver, power, resistors, splices). */
  parts: z.array(PlanPartSchema).max(16),
});
export type BuildPlan = z.infer<typeof BuildPlanSchema>;

/** Parts a plan may ask for, by platform. The rest come with the platform or are added by the assembler. */
export const ADDON_KINDS: Readonly<Record<Platform, readonly ComponentKind[]>> = {
  rover: ['hcsr04', 'mpu6050', 'oled_ssd1306', 'lcd1602_i2c', 'lcd2004_i2c', 'led_5mm', 'tactile_button', 'esp32_cam'],
  bench: ['hcsr04', 'mpu6050', 'oled_ssd1306', 'lcd1602_i2c', 'lcd2004_i2c', 'led_5mm', 'tactile_button', 'esp32_cam'],
  drone: ['vtx_antenna'],
};

/** What each platform brings with it (listed in the parts list as "comes with the platform"). */
export const PLATFORM_INFO: Readonly<Record<Platform, { name: string; doc: string }>> = {
  rover: { name: '2WD rover', doc: 'carbon 2WD chassis, two TT gearmotors, DRV8833 driver, ESP32, 2S Li-ion pack, LM2596 buck, 1000 uF bulk capacitor' },
  drone: { name: '5" quadcopter', doc: '5" carbon X-frame, four 2207 motors with props, F7 flight controller + 45 A ESC stack, 6S LiPo' },
  bench: { name: 'bench project', doc: 'ESP32 on the bench, 2S Li-ion pack, LM2596 buck converter' },
};

/** One line per part kind a plan may use, for the AI's instructions and the help text. */
export function catalogForPrompt(): string {
  const lines: string[] = [];
  for (const platform of PlatformSchema.options) {
    lines.push(`${platform}: ${PLATFORM_INFO[platform].doc}. Add-ons:`);
    for (const kind of ADDON_KINDS[platform]) {
      const spec = getPartSpec(kind);
      lines.push(`  - ${kind}: ${spec.name}. ${spec.description}`);
    }
  }
  return lines.join('\n');
}

/** Parses an untrusted plan (from the AI): fills defaults, drops parts that do not belong on the platform. */
export function parsePlan(raw: unknown): { plan: BuildPlan; dropped: Array<{ kind: string; reason: string }> } | { error: string } {
  const res = BuildPlanSchema.safeParse(raw);
  if (!res.success) {
    const first = res.error.issues[0];
    return { error: first ? `${first.path.join('.') || 'plan'}: ${first.message}` : 'the plan is not valid' };
  }
  const allowed = new Set(ADDON_KINDS[res.data.platform]);
  const dropped: Array<{ kind: string; reason: string }> = [];
  const parts = res.data.parts.filter((p) => {
    if (allowed.has(p.kind)) return true;
    dropped.push({ kind: p.kind, reason: `not an add-on for the ${PLATFORM_INFO[res.data.platform].name} (it comes with it, or it is not supported there)` });
    return false;
  });
  return { plan: { ...res.data, parts }, dropped };
}
