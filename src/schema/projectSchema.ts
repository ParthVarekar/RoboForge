import { z } from 'zod';

export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

export const ComponentKindSchema = z.enum([
  'esp32_devkit',
  'drv8833',
  'mpu6050',
  'hcsr04',
  'dc_motor',
  'battery_2s',
  'lm2596_buck',
  'resistor_10k',
  'led_5mm',
  'cap_1000uf',
  'wire_splice',
  'esp32_cam',
  'chassis_2wd',
  'oled_ssd1306',
  'lcd1602_i2c',
  'lcd2004_i2c',
  'tactile_button',
  'frame_quad_5in',
  'brushless_2207',
  'fc_esc_stack',
  'battery_6s_lipo',
  'vtx_antenna',
  'cad_box',
  'cad_cylinder',
  'cad_standoff',
  'cad_plate',
]);

export const ComponentInstanceSchema = z.object({
  id: z.string().min(1),
  kind: ComponentKindSchema,
  label: z.string().min(1),
  position: Vec3Schema,
  rotationY: z.number(),
  side: z.enum(['left', 'right', 'center']).optional(),
  color: z.string().optional(),
  sizeOverride: Vec3Schema.optional(),
});

export const WirePinRefSchema = z.object({
  componentId: z.string().min(1),
  pinId: z.string().min(1),
});

export const WireStyleSchema = z.enum(['routed', 'direct', 'arched']);

export const WireConnectionSchema = z.object({
  id: z.string().min(1),
  from: WirePinRefSchema,
  to: WirePinRefSchema,
  color: z.string().min(1),
  style: WireStyleSchema.optional(),
  clearanceCm: z.number().min(0.1).max(6).optional(),
  waypoints: z.array(Vec3Schema).optional(),
});

export const ArenaObstacleKindSchema = z.enum([
  'bag',
  'box',
  'cone',
  'ramp',
  'wall',
  'tree',
  'gate',
  'pillar',
  'sphere',
  'cylinder',
]);

export const ArenaObstacleSchema = z.object({
  id: z.string().min(1),
  kind: ArenaObstacleKindSchema,
  label: z.string().min(1),
  position: Vec3Schema,
  size: Vec3Schema,
  color: z.string().min(1),
  rotationY: z.number().optional(),
});

export const ArenaEnvironmentSchema = z.enum([
  'indoor_lab',
  'forest_park',
  'warehouse_maze',
  'drone_course',
  'sandbox_open',
]);

export const ArenaConfigSchema = z.object({
  environment: ArenaEnvironmentSchema,
  widthM: z.number().min(2).max(40),
  lengthM: z.number().min(2).max(40),
  wallHeightM: z.number().min(0).max(5),
  enclosed: z.boolean(),
});

export const TwinFaultConfigSchema = z.object({
  leftMotorScale: z.number().min(0).max(1.5),
  rightMotorScale: z.number().min(0).max(1.5),
  minStartPwm: z.number().min(0).max(240),
  gyroDriftDegPerSec: z.number().min(-15).max(15),
  floorFriction: z.number().min(0.05).max(1.5),
  usNoiseCm: z.number().min(0).max(10),
});

export const StudioProjectSchema = z.object({
  version: z.literal(1),
  name: z.string().min(1),
  description: z.string(),
  components: z.array(ComponentInstanceSchema),
  wires: z.array(WireConnectionSchema),
  code: z.string(),
  obstacles: z.array(ArenaObstacleSchema),
  arena: ArenaConfigSchema.optional(),
  faults: TwinFaultConfigSchema,
  circuitProtection: z.boolean(),
});

export type Vec3 = z.infer<typeof Vec3Schema>;
export type ComponentKind = z.infer<typeof ComponentKindSchema>;
export type ComponentInstance = z.infer<typeof ComponentInstanceSchema>;
export type WirePinRef = z.infer<typeof WirePinRefSchema>;
export type WireStyle = z.infer<typeof WireStyleSchema>;
export type WireConnection = z.infer<typeof WireConnectionSchema>;
export type ArenaObstacleKind = z.infer<typeof ArenaObstacleKindSchema>;
export type ArenaObstacle = z.infer<typeof ArenaObstacleSchema>;
export type ArenaEnvironment = z.infer<typeof ArenaEnvironmentSchema>;
export type ArenaConfig = z.infer<typeof ArenaConfigSchema>;
export type TwinFaultConfig = z.infer<typeof TwinFaultConfigSchema>;
export type StudioProject = z.infer<typeof StudioProjectSchema>;

export const DEFAULT_ARENA_CONFIG: ArenaConfig = {
  environment: 'indoor_lab',
  widthM: 4.0,
  lengthM: 6.4,
  wallHeightM: 0.24,
  enclosed: true,
};

/**
 * Returns the resolved ArenaConfig for a project, falling back to DEFAULT_ARENA_CONFIG if absent.
 */
export function resolveArenaConfig(project: Pick<StudioProject, 'arena'>): ArenaConfig {
  return project.arena ?? DEFAULT_ARENA_CONFIG;
}

/**
 * Validates and parses an unknown JSON payload into a typed StudioProject.
 */
export function parseStudioProject(raw: unknown): StudioProject {
  return StudioProjectSchema.parse(raw);
}

/**
 * Serializes a StudioProject to formatted JSON after schema verification.
 */
export function serializeStudioProject(project: StudioProject): string {
  const validated = StudioProjectSchema.parse(project);
  return JSON.stringify(validated, null, 2);
}
