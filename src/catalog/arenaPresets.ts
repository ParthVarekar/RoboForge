import type { ArenaConfig, ArenaEnvironment, ArenaObstacle, ArenaObstacleKind, Vec3 } from '../schema/projectSchema';

export interface ArenaTemplate {
  id: ArenaEnvironment;
  label: string;
  shortLabel: string;
  description: string;
  config: ArenaConfig;
  obstacles: ArenaObstacle[];
}

export interface ArenaElementPaletteItem {
  kind: ArenaObstacleKind;
  label: string;
  defaultSize: Vec3;
  defaultColor: string;
}

export const ARENA_ELEMENT_PALETTE: ArenaElementPaletteItem[] = [
  { kind: 'wall', label: 'Wall', defaultSize: [1.8, 0.85, 0.14], defaultColor: '#475569' },
  { kind: 'tree', label: 'Tree', defaultSize: [1.5, 3.8, 1.5], defaultColor: '#15803d' },
  { kind: 'gate', label: 'Drone Gate', defaultSize: [1.8, 1.7, 0.18], defaultColor: '#06b6d4' },
  { kind: 'box', label: 'Crate / Box', defaultSize: [0.45, 0.4, 0.45], defaultColor: '#64748b' },
  { kind: 'cylinder', label: 'Cylinder', defaultSize: [0.45, 0.65, 0.45], defaultColor: '#0284c7' },
  { kind: 'sphere', label: 'Boulder', defaultSize: [0.55, 0.55, 0.55], defaultColor: '#78716c' },
  { kind: 'pillar', label: 'Pillar', defaultSize: [0.32, 2.2, 0.32], defaultColor: '#94a3b8' },
  { kind: 'cone', label: 'Cone', defaultSize: [0.24, 0.36, 0.24], defaultColor: '#f97316' },
  { kind: 'bag', label: 'Demo Bag', defaultSize: [0.3, 0.24, 0.24], defaultColor: '#d97706' },
  { kind: 'ramp', label: 'Ramp', defaultSize: [0.7, 0.22, 0.95], defaultColor: '#b45309' },
];

/**
 * Returns the default catalog entry (size and color) for a given Arena obstacle kind.
 */
export function getArenaElementSpec(kind: ArenaObstacleKind): ArenaElementPaletteItem {
  return ARENA_ELEMENT_PALETTE.find((e) => e.kind === kind) ?? ARENA_ELEMENT_PALETTE[0]!;
}

/**
 * Creates a newly placed Arena obstacle centered at world `(x, z)` with optional rotation and size override.
 */
export function createArenaObstacle(
  kind: ArenaObstacleKind,
  x: number,
  z: number,
  index: number,
  overrides?: Partial<Pick<ArenaObstacle, 'size' | 'rotationY' | 'color' | 'label'>>,
): ArenaObstacle {
  const spec = getArenaElementSpec(kind);
  return {
    id: `${kind}_${Date.now().toString(36).slice(-4)}_${index}`,
    kind,
    label: overrides?.label ?? `${spec.label} ${index}`,
    position: [Number(x.toFixed(2)), 0, Number(z.toFixed(2))],
    size: overrides?.size ?? [...spec.defaultSize],
    color: overrides?.color ?? spec.defaultColor,
    rotationY: overrides?.rotationY ?? 0,
  };
}

function buildForestObstacles(): ArenaObstacle[] {
  // Deterministic pine/oak woodland with a clear central flight corridor & FPV gates
  const treeCoords: Array<[number, number, number, string]> = [
    [-6.2, -6.5, 4.4, '#166534'],
    [-3.1, -7.2, 3.8, '#15803d'],
    [3.4, -6.8, 4.6, '#14532d'],
    [6.5, -5.8, 4.0, '#15803d'],
    [-7.0, -2.8, 3.9, '#166534'],
    [-3.8, -3.4, 4.5, '#15803d'],
    [3.9, -3.1, 4.1, '#14532d'],
    [6.8, -2.0, 4.7, '#166534'],
    [-6.4, 0.8, 4.2, '#15803d'],
    [-3.2, 0.4, 3.6, '#166534'],
    [3.5, 0.9, 4.3, '#15803d'],
    [6.6, 1.8, 3.9, '#14532d'],
    [-5.8, 4.5, 4.4, '#166534'],
    [-2.8, 4.8, 3.7, '#15803d'],
    [2.9, 4.6, 4.1, '#166534'],
    [6.2, 5.2, 4.5, '#14532d'],
    [-7.2, 7.2, 4.0, '#15803d'],
    [7.0, 7.0, 4.2, '#166534'],
    [0.0, -6.6, 3.9, '#166534'],
    [-5.0, -5.0, 3.4, '#15803d'],
    [5.2, -4.4, 3.7, '#166534'],
    [-4.8, 2.7, 3.5, '#14532d'],
    [4.9, 3.0, 3.8, '#15803d'],
  ];

  const obs: ArenaObstacle[] = treeCoords.map(([x, z, h, color], i) => ({
    id: `tree_${i + 1}`,
    kind: 'tree',
    label: `Pine Tree ${i + 1}`,
    position: [x, 0, z],
    size: [Number((h * 0.42).toFixed(2)), h, Number((h * 0.42).toFixed(2))],
    color,
    rotationY: Number(((i * 0.9) % (Math.PI * 2)).toFixed(2)),
  }));

  obs.push(
    {
      id: 'gate_forest_1',
      kind: 'gate',
      label: 'Forest Gate 1',
      position: [0, 0, -0.8],
      size: [2.2, 2.0, 0.2],
      color: '#f97316',
      rotationY: 0,
    },
    {
      id: 'gate_forest_2',
      kind: 'gate',
      label: 'Forest Gate 2',
      position: [0.6, 0, -4.4],
      size: [2.2, 2.0, 0.2],
      color: '#06b6d4',
      rotationY: 0.25,
    },
    {
      id: 'boulder_1',
      kind: 'sphere',
      label: 'Mossy Boulder 1',
      position: [-2.1, 0, -1.6],
      size: [0.85, 0.65, 0.85],
      color: '#64748b',
      rotationY: 0,
    },
    {
      id: 'boulder_2',
      kind: 'sphere',
      label: 'Mossy Boulder 2',
      position: [2.3, 0, 2.1],
      size: [0.75, 0.55, 0.75],
      color: '#78716c',
      rotationY: 0,
    },
  );
  return obs;
}

function buildWarehouseMazeObstacles(): ArenaObstacle[] {
  return [
    {
      id: 'wall_m1',
      kind: 'wall',
      label: 'West Partition',
      position: [-1.45, 0, 1.0],
      size: [3.1, 0.9, 0.16],
      color: '#475569',
      rotationY: 0,
    },
    {
      id: 'wall_m2',
      kind: 'wall',
      label: 'East Partition',
      position: [1.45, 0, -1.2],
      size: [3.1, 0.9, 0.16],
      color: '#475569',
      rotationY: 0,
    },
    {
      id: 'wall_m3',
      kind: 'wall',
      label: 'Center Spine Wall',
      position: [-0.2, 0, -2.8],
      size: [0.16, 0.9, 2.4],
      color: '#64748b',
      rotationY: 0,
    },
    {
      id: 'box_m1',
      kind: 'box',
      label: 'Pallet Crate A',
      position: [2.0, 0, 2.2],
      size: [0.65, 0.55, 0.65],
      color: '#b45309',
      rotationY: 0.2,
    },
    {
      id: 'box_m2',
      kind: 'box',
      label: 'Pallet Crate B',
      position: [-2.1, 0, -2.5],
      size: [0.7, 0.55, 0.5],
      color: '#92400e',
      rotationY: -0.15,
    },
    {
      id: 'cone_m1',
      kind: 'cone',
      label: 'Apex Cone',
      position: [0.85, 0, 0.0],
      size: [0.24, 0.36, 0.24],
      color: '#f97316',
      rotationY: 0,
    },
  ];
}

function buildDroneCourseObstacles(): ArenaObstacle[] {
  return [
    { id: 'dg_1', kind: 'gate', label: 'Start Gate', position: [0, 0, 1.8], size: [2.4, 2.2, 0.2], color: '#22c55e', rotationY: 0 },
    { id: 'dg_2', kind: 'gate', label: 'Chicane Left', position: [-2.6, 0, -1.6], size: [2.4, 2.2, 0.2], color: '#06b6d4', rotationY: 0.45 },
    { id: 'dg_3', kind: 'gate', label: 'High Gate', position: [2.4, 0, -4.8], size: [2.4, 2.8, 0.2], color: '#f97316', rotationY: -0.4 },
    { id: 'dg_4', kind: 'gate', label: 'Backstretch Gate', position: [0, 0, -7.2], size: [2.6, 2.2, 0.2], color: '#a855f7', rotationY: 0 },
    { id: 'dp_1', kind: 'pillar', label: 'Slalom Flag 1', position: [-4.6, 0, 0.5], size: [0.35, 3.4, 0.35], color: '#ef4444', rotationY: 0 },
    { id: 'dp_2', kind: 'pillar', label: 'Slalom Flag 2', position: [4.6, 0, -0.5], size: [0.35, 3.4, 0.35], color: '#eab308', rotationY: 0 },
    { id: 'dp_3', kind: 'pillar', label: 'Slalom Flag 3', position: [-4.5, 0, -5.2], size: [0.35, 3.4, 0.35], color: '#3b82f6', rotationY: 0 },
    { id: 'dt_1', kind: 'tree', label: 'Edge Pine L', position: [-6.8, 0, -3.0], size: [1.7, 4.2, 1.7], color: '#15803d', rotationY: 0 },
    { id: 'dt_2', kind: 'tree', label: 'Edge Pine R', position: [6.8, 0, -3.5], size: [1.7, 4.0, 1.7], color: '#166534', rotationY: 1.1 },
  ];
}

export const ARENA_TEMPLATES: ArenaTemplate[] = [
  {
    id: 'indoor_lab',
    label: 'Indoor Robotics Lab (4 × 6.4 m)',
    shortLabel: 'Lab',
    description: 'Precision enclosed floor with centerline tape, perimeter curbs, and 2 demo bags.',
    config: {
      environment: 'indoor_lab',
      widthM: 4.0,
      lengthM: 6.4,
      wallHeightM: 0.24,
      enclosed: true,
    },
    obstacles: [
      { id: 'bag_1', kind: 'bag', label: 'Demo Bag 1', position: [0.0, 0, 0.7], size: [0.3, 0.24, 0.24], color: '#d97706', rotationY: 0 },
      { id: 'bag_2', kind: 'bag', label: 'Demo Bag 2', position: [0.0, 0, -1.05], size: [0.3, 0.24, 0.24], color: '#b45309', rotationY: 0 },
    ],
  },
  {
    id: 'forest_park',
    label: 'Pine Forest — Drone Space (18 × 18 m)',
    shortLabel: 'Forest',
    description: 'Open daylight woodland packed with pine trees, mossy boulders, and FPV gates for flying drones.',
    config: {
      environment: 'forest_park',
      widthM: 18.0,
      lengthM: 18.0,
      wallHeightM: 0,
      enclosed: false,
    },
    obstacles: buildForestObstacles(),
  },
  {
    id: 'warehouse_maze',
    label: 'Warehouse Maze & Rooms (7 × 9 m)',
    shortLabel: 'Maze',
    description: 'Interior partition walls, doorways, and pallet crates for multi-room rover SLAM testing.',
    config: {
      environment: 'warehouse_maze',
      widthM: 7.0,
      lengthM: 9.0,
      wallHeightM: 0.95,
      enclosed: true,
    },
    obstacles: buildWarehouseMazeObstacles(),
  },
  {
    id: 'drone_course',
    label: 'FPV Drone Race Airfield (16 × 18 m)',
    shortLabel: 'Airfield',
    description: 'Sunlit turf field with fly-through FPV racing gates and slalom flags.',
    config: {
      environment: 'drone_course',
      widthM: 16.0,
      lengthM: 18.0,
      wallHeightM: 0,
      enclosed: false,
    },
    obstacles: buildDroneCourseObstacles(),
  },
  {
    id: 'sandbox_open',
    label: 'Blank Custom Sandbox (10 × 10 m)',
    shortLabel: 'Blank',
    description: 'Clean customizable space — reshape dimensions, draw walls, and drop in any shapes or trees.',
    config: {
      environment: 'sandbox_open',
      widthM: 10.0,
      lengthM: 10.0,
      wallHeightM: 0.45,
      enclosed: true,
    },
    obstacles: [],
  },
];

/**
 * Returns a fresh deep copy of an ArenaTemplate (config + obstacles) by environment ID.
 */
export function getArenaTemplate(env: ArenaEnvironment): ArenaTemplate {
  const found = ARENA_TEMPLATES.find((t) => t.id === env) ?? ARENA_TEMPLATES[0]!;
  return structuredClone(found);
}
