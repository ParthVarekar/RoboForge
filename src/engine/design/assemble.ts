import { getPartSpec } from '../../catalog/partsCatalog';
import { createPresetProject } from '../../catalog/presets';
import type { ComponentInstance, ComponentKind, StudioProject, Vec3, WireConnection, WirePinRef } from '../../schema/projectSchema';
import { pinCapacity } from '../pinCapacity';
import { partLabel } from './offline';
import { PLATFORM_INFO, type BuildPlan, type PlanPart } from './plan';
import { starterSketch, type SketchSpec } from './sketch';

/**
 * The assembler: turns a build plan into a placed and wired project, the same way every time.
 *
 * - The platform's core comes in a known-good layout (the rover's chassis, motors, driver and power as on the real rover).
 * - Add-ons go to their preferred spot, or the nearest free spot that fits their body, pins and the jumpers' sockets.
 * - GPIOs come from preference lists (input-only pins for ECHO, no boot or motor pins for buttons and LEDs).
 * - Shared nets fan out through solder splices whenever a header pin would need a second jumper.
 * - Parts the platform needs (driver, power, ECHO divider, LED resistor, bulk capacitor) are added and listed with why.
 */

export interface BuildStep {
  type: 'part' | 'wire';
  id: string;
  label: string;
}

export interface BomLine {
  kind: ComponentKind;
  name: string;
  qty: number;
  unitPriceUsd: number;
  massGrams: number;
  why: string;
  source: 'asked' | 'platform' | 'needed';
}

export interface PinLine {
  what: string;
  pin: string;
}

export interface AssembledBuild {
  project: StudioProject;
  steps: BuildStep[];
  bom: BomLine[];
  pins: PinLine[];
  notes: string[];
  dropped: Array<{ kind: string; reason: string }>;
}

/* ------------------------------------------------------------------ footprints and placement */

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** Where a part reaches on the deck (cm): its body, its pins, and the sockets or joints on pins that point sideways. */
export function footprint(kind: ComponentKind, at: Vec3, rotY: number): Rect {
  const spec = getPartSpec(kind);
  const [sx, , sz] = spec.sizeCm;
  const pts: Array<[number, number]> = [
    [-sx / 2, -sz / 2],
    [sx / 2, sz / 2],
  ];
  for (const p of spec.pins) {
    pts.push([p.localPos[0], p.localPos[2]]);
    // a DuPont socket on a sideways header pin is 14 mm long; a soldered joint with heat-shrink about 6 mm
    const reach = p.contact === 'lead' ? 0.6 : 1.6;
    if (p.dir) pts.push([p.localPos[0] + p.dir[0] * reach, p.localPos[2] + p.dir[2] * reach]);
  }
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const [x, z] of pts) {
    const rx = x * c + z * s;
    const rz = -x * s + z * c;
    x0 = Math.min(x0, rx);
    x1 = Math.max(x1, rx);
    z0 = Math.min(z0, rz);
    z1 = Math.max(z1, rz);
  }
  return { x0: at[0] + x0, z0: at[2] + z0, x1: at[0] + x1, z1: at[2] + z1 };
}

const overlaps = (a: Rect, b: Rect, gap: number) => a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.z0 < b.z1 + gap && b.z0 < a.z1 + gap;
const inside = (a: Rect, r: Rect) => a.x0 >= r.x0 && a.x1 <= r.x1 && a.z0 >= r.z0 && a.z1 <= r.z1;

class Layout {
  readonly taken: Rect[] = [];
  constructor(
    readonly region: Rect,
    readonly y: number,
    blocked: Rect[] = [],
  ) {
    this.taken.push(...blocked);
  }

  claim(kind: ComponentKind, at: Vec3, rotY: number): void {
    this.taken.push(footprint(kind, at, rotY));
  }

  /** Free spots for the part, nearest `want` first, no farther than `maxDist` (cm); nothing is claimed. */
  spots(kind: ComponentKind, want: [number, number], rotY: number, gap: number, maxDist: number, limit = 400, overhangFront = 0): Vec3[] {
    const step = 0.25;
    // sensors and cameras that look forward may stand out over the front edge, as on the real rover
    const region: Rect = { ...this.region, z0: this.region.z0 - overhangFront };
    const cands: Array<[number, number, number]> = [];
    const r2 = maxDist * maxDist;
    for (let x = region.x0; x <= region.x1; x += step) {
      for (let z = region.z0; z <= region.z1; z += step) {
        const d2 = (x - want[0]) ** 2 + (z - want[1]) ** 2;
        if (d2 <= r2) cands.push([x, z, d2]);
      }
    }
    cands.sort((a, b) => a[2] - b[2]);
    const out: Vec3[] = [];
    for (const [x, z] of cands) {
      const at: Vec3 = [Number(x.toFixed(2)), this.y, Number(z.toFixed(2))];
      const fp = footprint(kind, at, rotY);
      if (!inside(fp, region) || this.taken.some((t) => overlaps(fp, t, gap))) continue;
      out.push(at);
      if (out.length >= limit) break;
    }
    return out;
  }

  /** The free spot nearest `want` within `maxDist`, claimed; null if none. */
  place(kind: ComponentKind, want: [number, number], rotY: number, gap = 0.5, maxDist = 40): Vec3 | null {
    const at = this.spots(kind, want, rotY, gap, maxDist, 1)[0];
    if (!at) return null;
    this.taken.push(footprint(kind, at, rotY));
    return at;
  }

  /** Undoes the last `n` claims (a group that did not fit together). */
  release(n: number): void {
    this.taken.splice(this.taken.length - n, n);
  }
}

/* ------------------------------------------------------------------ GPIO allocation */

class Gpios {
  private readonly used = new Set<number>();
  constructor(reserved: number[]) {
    reserved.forEach((g) => this.used.add(g));
  }

  take(prefs: readonly number[]): number | null {
    const g = prefs.find((p) => !this.used.has(p));
    if (g === undefined) return null;
    this.used.add(g);
    return g;
  }
}

const TRIG_PINS = [13, 16, 17, 18, 19];
const ECHO_PINS = [35, 34, 36, 39];
const LED_PINS = [4, 23, 19, 18, 17, 16];
const BUTTON_PINS = [18, 19, 23, 16, 17, 4];
const SIGNAL_COLORS = ['#14b8a6', '#ec4899', '#84cc16', '#f97316', '#eab308', '#06b6d4', '#f472b6', '#22c55e'];
const COLOR = { v5: '#ef4444', gnd: '#1e293b', v33: '#f43f5e', sda: '#3b82f6', scl: '#a855f7', bat: '#ef4444' };

/* ------------------------------------------------------------------ the assembler */

const ref = (componentId: string, pinId: string): WirePinRef => ({ componentId, pinId });

export function assemble(plan: BuildPlan): AssembledBuild {
  if (plan.platform === 'drone') return assembleDrone(plan);

  const rover = plan.platform === 'rover';
  const base = createPresetProject(rover ? 'roboforge_rover' : 'blank_bench');
  const components: ComponentInstance[] = [];
  const wires: WireConnection[] = [];
  const steps: BuildStep[] = [];
  const bom = new Map<string, BomLine>();
  const pins: PinLine[] = [];
  const notes: string[] = [];
  const dropped: Array<{ kind: string; reason: string }> = [];
  let wireNo = 0;
  let signalColor = 0;

  const y = rover ? 0.45 : 0;
  const deck: Rect = rover ? { x0: -6.9, z0: -9.3, x1: 6.9, z1: 9.3 } : { x0: -14.5, z0: -12.5, x1: 14.5, z1: 12.5 };
  const blocked: Rect[] = rover
    ? [
        // standoffs in the corners and the motor brackets at the sides
        ...[[-6.2, -8.4], [6.2, -8.4], [-6.2, 8.6], [6.2, 8.6]].map(([x, z]) => ({ x0: x! - 0.3, z0: z! - 0.3, x1: x! + 0.3, z1: z! + 0.3 })),
        { x0: -7.2, z0: -1.4, x1: -5.3, z1: 3.8 },
        { x0: 5.3, z0: -1.4, x1: 7.2, z1: 3.8 },
        // the battery leads run east and then forward to the buck converter: keep their lane clear
        { x0: 3.0, z0: 2.4, x1: 6.9, z1: 8.8 },
      ]
    : [];
  const layout = new Layout(deck, y, blocked);

  const addBom = (kind: ComponentKind, why: string, source: BomLine['source']) => {
    const spec = getPartSpec(kind);
    const line = bom.get(kind);
    if (line) line.qty += 1;
    else bom.set(kind, { kind, name: spec.name, qty: 1, unitPriceUsd: spec.unitPriceUsd, massGrams: spec.massGrams, why, source });
  };
  const addPart = (c: ComponentInstance, why: string, source: BomLine['source'], claim = true) => {
    components.push(c);
    if (claim && c.kind !== 'chassis_2wd' && c.kind !== 'dc_motor') layout.claim(c.kind, c.position, c.rotationY);
    steps.push({ type: 'part', id: c.id, label: c.label });
    addBom(c.kind, why, source);
  };
  const wire = (from: WirePinRef, to: WirePinRef, color: string, label: string) => {
    wireNo += 1;
    const id = `aw${wireNo}`;
    wires.push({ id, from, to, color, style: 'routed' });
    steps.push({ type: 'wire', id, label });
  };

  /* ---------------- platform core */
  const esp = rover ? (base.components.find((c) => c.id === 'esp32_1')!.position as Vec3) : ([-6.5, 0, 0] as Vec3);
  if (rover) {
    addPart({ id: 'chassis_1', kind: 'chassis_2wd', label: '2WD Carbon Chassis', position: [0, 0, 0], rotationY: 0 }, 'the deck everything mounts on', 'platform');
    addPart({ id: 'motor_l', kind: 'dc_motor', label: 'Left Motor', position: [-8.14, 0, 1.2], rotationY: 0, side: 'left' }, 'the two drive wheels', 'platform');
    addPart({ id: 'motor_r', kind: 'dc_motor', label: 'Right Motor', position: [8.14, 0, 1.2], rotationY: 0, side: 'right' }, 'right drive wheel', 'platform');
  }
  addPart({ id: 'esp32_1', kind: 'esp32_devkit', label: 'ESP32 Main', position: esp, rotationY: 0 }, 'runs the sketch', 'platform');
  if (rover) {
    addPart({ id: 'bat_1', kind: 'battery_2s', label: '2S Li-Ion 7.4V', position: [0, y, 6.2], rotationY: Math.PI / 2 }, 'power for motors and electronics', 'platform');
    addPart({ id: 'buck_1', kind: 'lm2596_buck', label: 'LM2596 5.2V', position: [3.6, y, -4.6], rotationY: 0 }, 'steps the battery down to 5.2 V', 'platform');
    addPart({ id: 'drv_1', kind: 'drv8833', label: 'DRV8833 Driver', position: [3.2, y, 0.2], rotationY: 0 }, 'drives the two motors', 'platform');
    addPart({ id: 'cap_1', kind: 'cap_1000uf', label: '1000uF Bulk Cap', position: [5.6, y, -1.8], rotationY: 0 }, 'absorbs motor current spikes so the ESP32 does not reset', 'needed');
  } else {
    addPart({ id: 'bat_1', kind: 'battery_2s', label: '2S Li-Ion 7.4V', position: [-8.0, 0, 9.6], rotationY: 0 }, 'power', 'platform');
    addPart({ id: 'buck_1', kind: 'lm2596_buck', label: 'LM2596 5.2V', position: [-1.2, 0, 6.0], rotationY: 0 }, 'steps the battery down to 5.2 V', 'platform');
  }
  notes.push(`Platform: ${PLATFORM_INFO[plan.platform].name} (${PLATFORM_INFO[plan.platform].doc}).`);

  const gpio = new Gpios(rover ? [25, 26, 27, 14, 32, 33, 1, 3] : [21, 22, 1, 3]);
  const i2c = rover ? { sda: 32, scl: 33 } : { sda: 21, scl: 22 };

  /* ---------------- add-ons: place them, then wire them */
  const expanded: Array<PlanPart & { n: number }> = [];
  for (const p of plan.parts) for (let n = 1; n <= p.qty; n += 1) expanded.push({ ...p, n });

  const prefer = (kind: ComponentKind, placement: string, n: number): { at: [number, number]; rot: number } => {
    const r = rover;
    switch (kind) {
      case 'hcsr04':
        return placement === 'back' ? { at: [0.5, r ? 9.0 : 11], rot: Math.PI } : { at: [r ? 0.5 + (n - 1) * 5 : 4 + (n - 1) * 5.5, r ? -8.8 : -10.5], rot: 0 };
      case 'mpu6050':
        return { at: r ? [-3.5, -5.2] : [-1.5, -9.5], rot: 0 };
      case 'oled_ssd1306':
        return { at: r ? [-0.2, -5.5] : [-0.6, -5.6], rot: 0 };
      case 'lcd1602_i2c':
      case 'lcd2004_i2c':
        return { at: r ? [0, -6] : [6.6, -1.6], rot: 0 };
      case 'esp32_cam':
        return { at: r ? [4.2, -8.0] : [11.5, -8.5], rot: 0 };
      case 'led_5mm':
        return { at: r ? [0.2 + (n - 1) * 1.6, -2.8] : [2.6 + (n - 1) * 2, 2.4], rot: 0 };
      case 'tactile_button':
        return { at: r ? [-5.6 + (n - 1) * 1.6, 3.9] : [5.5 + (n - 1) * 2, 6.0], rot: 0 };
      default:
        return { at: [0, 0], rot: 0 };
    }
  };

  /** Parts that belong right next to a module: the ECHO divider beside an HC-SR04, the resistor beside an LED. */
  interface Satellite {
    kind: ComponentKind;
    /** Offset from the module (or from the previous satellite when `fromPrev`) where it should sit (cm). */
    dx: number;
    dz: number;
    rot: number;
    fromPrev?: boolean;
  }
  const satellitesOf = (p: PlanPart): Satellite[] => {
    if (p.kind === 'hcsr04') {
      const back = p.placement === 'back';
      return [
        { kind: 'resistor_10k', dx: -3.5, dz: back ? -1.2 : 1.0, rot: 0 },
        { kind: 'resistor_10k', dx: -2.3, dz: back ? -1.0 : 1.0, rot: Math.PI / 2, fromPrev: true },
      ];
    }
    if (p.kind === 'led_5mm') return [{ kind: 'resistor_10k', dx: 0, dz: 1.6, rot: 0 }];
    return [];
  };
  /** How far a module may move from its preferred spot: the rover's deck is small and its wiring lanes are planned. */
  const maxShift = rover ? 4.5 : 9;

  const placed: Array<{ part: PlanPart & { n: number }; id: string; sats: Vec3[] }> = [];
  const idFor: Record<string, string> = { hcsr04: 'us', mpu6050: 'mpu', oled_ssd1306: 'oled', lcd1602_i2c: 'lcd', lcd2004_i2c: 'lcd', esp32_cam: 'cam', led_5mm: 'led', tactile_button: 'btn' };
  const nameFor = (p: PlanPart & { n: number }) => {
    const base = getPartSpec(p.kind).shortName;
    if (p.kind === 'hcsr04') return `${base} ${p.placement === 'back' ? 'Rear' : p.n > 1 ? `Front ${p.n}` : 'Front'}`;
    return p.qty > 1 ? `${base} ${p.n}` : base;
  };
  // one screen and one camera at most; I2C devices share one address each
  let screens = 0;
  const kindCount = new Map<string, number>();
  for (const p of expanded) {
    const isScreen = p.kind === 'oled_ssd1306' || p.kind === 'lcd1602_i2c' || p.kind === 'lcd2004_i2c';
    if ((isScreen && screens > 0) || ((p.kind === 'mpu6050' || p.kind === 'esp32_cam') && p.n > 1)) {
      dropped.push({ kind: p.kind, reason: isScreen ? 'one screen per build (two would answer at the same I2C address)' : `only one ${partLabel(p.kind)} per build` });
      continue;
    }
    const { at, rot } = prefer(p.kind, p.placement, p.n);
    // the camera only takes 5V and GND, so it may sit close to its neighbours, as on the real rover
    const gap = p.kind === 'led_5mm' || p.kind === 'tactile_button' ? 0.8 : p.kind === 'esp32_cam' ? 0.1 : 0.6;
    const sats = satellitesOf(p);
    // the module and its satellites go down together: a spot only counts if they all fit close by
    let pos: Vec3 | null = null;
    let satPos: Vec3[] = [];
    const overhang = rover && (p.kind === 'esp32_cam' || (p.kind === 'hcsr04' && p.placement !== 'back')) ? 1.6 : 0;
    for (const cand of layout.spots(p.kind, at, rot, gap, maxShift, 120, overhang)) {
      layout.claim(p.kind, cand, rot);
      const got: Vec3[] = [];
      for (const s of sats) {
        const anchor = s.fromPrev && got.length ? got[got.length - 1]! : cand;
        const sp = layout.place(s.kind, [anchor[0] + s.dx, anchor[2] + s.dz], s.rot, 0.45, 2.5);
        if (!sp) break;
        got.push(sp);
      }
      if (got.length === sats.length) {
        pos = cand;
        satPos = got;
        break;
      }
      layout.release(1 + got.length);
    }
    if (!pos) {
      const extra = sats.length ? (p.kind === 'hcsr04' ? ' with its ECHO divider' : ' with its resistor') : '';
      dropped.push({ kind: p.kind, reason: `it does not fit${extra} on the ${PLATFORM_INFO[plan.platform].name}${rover ? "'s deck" : ''} next to the other parts` });
      continue;
    }
    if (isScreen) screens += 1;
    const prefix = idFor[p.kind] ?? p.kind;
    kindCount.set(prefix, (kindCount.get(prefix) ?? 0) + 1);
    const id = `${prefix}_${kindCount.get(prefix)}`;
    addPart({ id, kind: p.kind, label: nameFor(p), position: pos, rotationY: rot }, p.role || partLabel(p.kind), 'asked', false);
    placed.push({ part: p, id, sats: satPos });
  }

  /* ---------------- nets */
  // consumers of each shared net, wired after the parts so splices can sit near them
  const net5v: Array<{ r: WirePinRef; label: string }> = [];
  const netGnd5: Array<{ r: WirePinRef; label: string }> = [];
  const net33: Array<{ r: WirePinRef; label: string }> = [];
  const netLgnd: Array<{ r: WirePinRef; label: string }> = [];
  const netSda: Array<{ r: WirePinRef; label: string }> = [];
  const netScl: Array<{ r: WirePinRef; label: string }> = [];
  const signalWires: Array<[WirePinRef, WirePinRef, string, string]> = [];
  const sketch: SketchSpec = { title: plan.title, platform: plan.platform, i2c: null, mpu: false, screen: null, us: [], leds: [], buttons: [], cam: false };

  // power path
  wire(ref('bat_1', 'BAT_POS'), ref('buck_1', 'IN_POS'), COLOR.bat, 'Battery + to buck IN+');
  wire(ref('bat_1', 'GND'), ref('buck_1', 'IN_NEG'), COLOR.gnd, 'Battery - to buck IN-');
  net5v.push({ r: ref('esp32_1', 'VIN'), label: 'ESP32 VIN' });
  netGnd5.push({ r: ref('esp32_1', 'GND_R'), label: 'ESP32 GND' });
  pins.push({ what: 'ESP32 power', pin: 'VIN from the 5.2 V buck output, GND' });
  if (rover) {
    net5v.push({ r: ref('cap_1', 'POS'), label: 'bulk capacitor +' });
    netGnd5.push({ r: ref('cap_1', 'NEG'), label: 'bulk capacitor -' });
  }

  for (const { part, id, sats } of placed) {
    switch (part.kind) {
      case 'hcsr04': {
        const trig = gpio.take(TRIG_PINS);
        const echo = gpio.take(ECHO_PINS);
        if (trig === null || echo === null) {
          notes.push(`${id}: no free pins left for TRIG/ECHO.`);
          break;
        }
        // ECHO is 5 V: a 10k / 10k divider halves it for the 3.3 V input
        const num = id.split('_')[1];
        const rt = `rtop_${num}`;
        const rb = `rbot_${num}`;
        const rtAt = sats[0] ?? null;
        const rbAt = sats[1] ?? null;
        if (!rtAt || !rbAt) {
          notes.push(`${id}: no room for its ECHO divider; ECHO is wired straight to GPIO${echo} (5 V on a 3.3 V pin).`);
          signalWires.push([ref(id, 'ECHO'), ref('esp32_1', `GPIO${echo}`), SIGNAL_COLORS[signalColor++ % SIGNAL_COLORS.length]!, `${id} ECHO to GPIO${echo}`]);
        } else {
          addPart({ id: rt, kind: 'resistor_10k', label: `R ${part.n}a 10k (ECHO)`, position: rtAt, rotationY: 0 }, 'ECHO divider: brings the 5 V echo down to 2.5 V for the ESP32', 'needed', false);
          addPart({ id: rb, kind: 'resistor_10k', label: `R ${part.n}b 10k (GND)`, position: rbAt, rotationY: Math.PI / 2 }, 'ECHO divider (bottom)', 'needed', false);
          signalWires.push([ref(id, 'ECHO'), ref(rt, 'B'), '#ec4899', `${id} ECHO to divider`]);
          signalWires.push([ref(rt, 'A'), ref('esp32_1', `GPIO${echo}`), '#f472b6', `Divider to GPIO${echo}`]);
          signalWires.push([ref(rt, 'A'), ref(rb, 'A'), '#94a3b8', 'Divider joint']);
          netLgnd.push({ r: ref(rb, 'B'), label: 'divider bottom' });
        }
        signalWires.push([ref(id, 'TRIG'), ref('esp32_1', `GPIO${trig}`), '#14b8a6', `${id} TRIG to GPIO${trig}`]);
        net5v.push({ r: ref(id, 'VCC'), label: `${id} VCC` });
        netGnd5.push({ r: ref(id, 'GND'), label: `${id} GND` });
        pins.push({ what: `${nameFor(part)} TRIG / ECHO`, pin: `GPIO${trig} / GPIO${echo}${rtAt && rbAt ? ' (through a 10k/10k divider)' : ''}` });
        sketch.us.push({ trig, echo, placement: part.placement === 'back' ? 'back' : 'front' });
        break;
      }
      case 'mpu6050':
      case 'oled_ssd1306':
      case 'lcd1602_i2c':
      case 'lcd2004_i2c': {
        const lcd = part.kind !== 'mpu6050' && part.kind !== 'oled_ssd1306';
        (lcd ? net5v : net33).push({ r: ref(id, 'VCC'), label: `${id} VCC` });
        (lcd ? netGnd5 : netLgnd).push({ r: ref(id, 'GND'), label: `${id} GND` });
        netSda.push({ r: ref(id, 'SDA'), label: `${id} SDA` });
        netScl.push({ r: ref(id, 'SCL'), label: `${id} SCL` });
        sketch.i2c = i2c;
        if (part.kind === 'mpu6050') sketch.mpu = true;
        else sketch.screen = part.kind === 'oled_ssd1306' ? 'oled' : part.kind === 'lcd1602_i2c' ? 'lcd1602' : 'lcd2004';
        break;
      }
      case 'esp32_cam':
        net5v.push({ r: ref(id, '5V'), label: 'camera 5V' });
        netGnd5.push({ r: ref(id, 'GND'), label: 'camera GND' });
        pins.push({ what: 'ESP32-CAM', pin: '5V and GND only (it runs its own firmware)' });
        sketch.cam = true;
        break;
      case 'led_5mm': {
        const g = gpio.take(LED_PINS);
        if (g === null) {
          notes.push(`${id}: no free pin left.`);
          break;
        }
        const rAt = sats[0] ?? null;
        const rid = `rled_${id.split('_')[1]}`;
        if (rAt) {
          addPart({ id: rid, kind: 'resistor_10k', label: `R LED ${part.n}`, position: rAt, rotationY: 0 }, 'limits the LED current', 'needed', false);
          signalWires.push([ref('esp32_1', `GPIO${g}`), ref(rid, 'A'), '#84cc16', `GPIO${g} to LED resistor`]);
          signalWires.push([ref(rid, 'B'), ref(id, 'ANODE'), '#84cc16', 'Resistor to LED anode']);
        } else {
          notes.push(`${id}: no room for its resistor; wired without one (the circuit check will flag it).`);
          signalWires.push([ref('esp32_1', `GPIO${g}`), ref(id, 'ANODE'), '#84cc16', `GPIO${g} to LED`]);
        }
        netLgnd.push({ r: ref(id, 'CATHODE'), label: `${id} cathode` });
        pins.push({ what: `${nameFor(part)}`, pin: `GPIO${g}${rAt ? ' through a resistor' : ''}` });
        sketch.leds.push(g);
        break;
      }
      case 'tactile_button': {
        const g = gpio.take(BUTTON_PINS);
        if (g === null) {
          notes.push(`${id}: no free pin left.`);
          break;
        }
        signalWires.push([ref(id, 'A'), ref('esp32_1', `GPIO${g}`), SIGNAL_COLORS[signalColor++ % SIGNAL_COLORS.length]!, `${id} to GPIO${g}`]);
        net33.push({ r: ref(id, 'B'), label: `${id} to 3V3` });
        pins.push({ what: `${nameFor(part)}`, pin: `GPIO${g} (reads HIGH while pressed; INPUT_PULLDOWN on the board)` });
        sketch.buttons.push(g);
        break;
      }
      default:
        break;
    }
  }
  if (sketch.i2c) pins.push({ what: 'I2C bus (shared)', pin: `SDA GPIO${i2c.sda}, SCL GPIO${i2c.scl}` });
  if (rover) pins.push({ what: 'Motors (DRV8833)', pin: 'left GPIO25/26, right GPIO27/14' });

  /* ---------------- rover drive */
  if (rover) {
    wire(ref('cap_1', 'POS'), ref('drv_1', 'VM'), '#dc2626', 'Capacitor + to driver VM');
    wire(ref('cap_1', 'NEG'), ref('drv_1', 'GND'), '#0f172a', 'Capacitor - to driver GND');
    const drive: Array<[string, string, string]> = [
      ['GPIO25', 'IN1', '#f97316'],
      ['GPIO26', 'IN2', '#eab308'],
      ['GPIO27', 'IN3', '#22c55e'],
      ['GPIO14', 'IN4', '#06b6d4'],
    ];
    for (const [g, inp, color] of drive) wire(ref('esp32_1', g), ref('drv_1', inp), color, `${g} to driver ${inp}`);
    wire(ref('drv_1', 'OUT1'), ref('motor_l', 'M_POS'), '#fb923c', 'Driver OUT1 to left motor +');
    wire(ref('drv_1', 'OUT2'), ref('motor_l', 'M_NEG'), '#facc15', 'Driver OUT2 to left motor -');
    wire(ref('drv_1', 'OUT3'), ref('motor_r', 'M_POS'), '#4ade80', 'Driver OUT3 to right motor +');
    wire(ref('drv_1', 'OUT4'), ref('motor_r', 'M_NEG'), '#22d3ee', 'Driver OUT4 to right motor -');
  }

  /* ---------------- shared nets: direct, or through a splice when the source pin takes one jumper */
  let spliceNo = 0;
  const fanOut = (source: WirePinRef, consumers: Array<{ r: WirePinRef; label: string }>, color: string, name: string) => {
    if (!consumers.length) return;
    const comp = components.find((c) => c.id === source.componentId)!;
    const room = pinCapacity(comp.kind, source.pinId) === 1 ? 1 : 4;
    if (consumers.length <= room) {
      for (const c of consumers) wire(source, c.r, color, `${name} to ${c.label}`);
      return;
    }
    // Consumers far apart get their own local splice, fed from the splice nearest them, so no wire crosses the whole
    // build: one jumper leaves the source, and every consumer is wired to a splice close to it.
    const posOf = (r: WirePinRef) => components.find((k) => k.id === r.componentId)!.position;
    const srcPos = comp.position;
    const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!);
    const radius = rover ? 4 : 6;
    const groups: Array<{ members: typeof consumers; cx: number; cz: number }> = [];
    for (const c of [...consumers].sort((a, b) => dist(posOf(a.r), srcPos) - dist(posOf(b.r), srcPos))) {
      const p = posOf(c.r);
      const g = groups.find((k) => Math.hypot(k.cx - p[0], k.cz - p[2]) <= radius);
      if (g) {
        g.members.push(c);
        g.cx = g.members.reduce((s, m) => s + posOf(m.r)[0], 0) / g.members.length;
        g.cz = g.members.reduce((s, m) => s + posOf(m.r)[2], 0) / g.members.length;
      } else groups.push({ members: [c], cx: p[0], cz: p[2] });
    }
    const splices: Array<{ id: string; at: Vec3 }> = [];
    for (const g of groups) {
      const nearest = splices.length ? splices.reduce((a, b) => (dist(a.at, [g.cx, 0, g.cz]) <= dist(b.at, [g.cx, 0, g.cz]) ? a : b)) : null;
      if (nearest && g.members.length === 1) {
        // a lone consumer is wired to the nearest splice
        wire(ref(nearest.id, 'J'), g.members[0]!.r, color, `Splice to ${g.members[0]!.label}`);
        continue;
      }
      const feedAt = nearest ? nearest.at : srcPos;
      const want: [number, number] = [(g.cx * 2 + feedAt[0]) / 3, (g.cz * 2 + feedAt[2]) / 3];
      const at = layout.place('wire_splice', want, Math.PI / 2, 0.35);
      if (!at) {
        notes.push(`No room for a ${name} splice; those wires share ${nearest ? 'a splice farther away' : 'the source pin'}.`);
        for (const c of g.members) wire(nearest ? ref(nearest.id, 'J') : source, c.r, color, `${name} to ${c.label}`);
        continue;
      }
      spliceNo += 1;
      const sid = `sp_${spliceNo}`;
      addPart({ id: sid, kind: 'wire_splice', label: `Splice ${name}`, position: at, rotationY: Math.PI / 2 }, `joins the ${name} wires (a header pin takes one jumper)`, 'needed', false);
      wire(nearest ? ref(nearest.id, 'J') : source, ref(sid, 'J'), color, nearest ? `${name} splice to splice` : `${name} to splice`);
      for (const c of g.members) wire(ref(sid, 'J'), c.r, color, `Splice to ${c.label}`);
      splices.push({ id: sid, at });
    }
  };
  fanOut(ref('buck_1', 'OUT_POS'), net5v, COLOR.v5, '5V');
  fanOut(ref('buck_1', 'OUT_NEG'), netGnd5, COLOR.gnd, 'GND');
  fanOut(ref('esp32_1', '3V3'), net33, COLOR.v33, '3V3');
  fanOut(ref('esp32_1', 'GND_L'), netLgnd, COLOR.gnd, 'Logic GND');
  fanOut(ref('esp32_1', `GPIO${i2c.sda}`), netSda, COLOR.sda, 'SDA');
  fanOut(ref('esp32_1', `GPIO${i2c.scl}`), netScl, COLOR.scl, 'SCL');
  for (const [a, b, color, label] of signalWires) wire(a, b, color, label);

  // parts first in the build order, then the wires (power, drive, shared nets, signals)
  const ordered = [...steps.filter((s) => s.type === 'part'), ...steps.filter((s) => s.type === 'wire')];
  const project: StudioProject = {
    ...base,
    name: plan.title,
    description: plan.summary || `${PLATFORM_INFO[plan.platform].name} designed in the Design tab`,
    components,
    wires,
    code: starterSketch(sketch),
  };
  return { project, steps: ordered, bom: [...bom.values()], pins, notes, dropped };
}

/** The quad is a fixed, known-good build; the plan only decides the video antenna. */
function assembleDrone(plan: BuildPlan): AssembledBuild {
  const base = createPresetProject('quad_5in');
  const wantVtx = plan.parts.some((p) => p.kind === 'vtx_antenna');
  const components = base.components.filter((c) => wantVtx || c.kind !== 'vtx_antenna');
  const ids = new Set(components.map((c) => c.id));
  const wires = base.wires.filter((w) => ids.has(w.from.componentId) && ids.has(w.to.componentId));
  const bom = new Map<string, BomLine>();
  for (const c of components) {
    const spec = getPartSpec(c.kind);
    const line = bom.get(c.kind);
    if (line) line.qty += 1;
    else bom.set(c.kind, { kind: c.kind, name: spec.name, qty: 1, unitPriceUsd: spec.unitPriceUsd, massGrams: spec.massGrams, why: c.kind === 'vtx_antenna' ? 'video link' : 'part of the 5" quad', source: c.kind === 'vtx_antenna' ? 'asked' : 'platform' });
  }
  return {
    project: { ...base, name: plan.title, description: plan.summary || base.description, components, wires },
    steps: [...components.map((c) => ({ type: 'part' as const, id: c.id, label: c.label })), ...wires.map((w) => ({ type: 'wire' as const, id: w.id, label: `${w.from.pinId} to ${w.to.pinId}` }))],
    bom: [...bom.values()],
    pins: [{ what: 'ESC outputs', pin: 'M1-M4 on the flight controller (GPIO25/26/27/14 in the simulator)' }],
    notes: [`Platform: ${PLATFORM_INFO.drone.name} (${PLATFORM_INFO.drone.doc}).`],
    dropped: [],
  };
}

/** The parts list as Markdown (for "Export parts list"). */
export function bomMarkdown(build: AssembledBuild): string {
  const rows = build.bom.map((b) => `| ${b.qty} | ${b.name} | $${(b.unitPriceUsd * b.qty).toFixed(2)} | ${b.massGrams * b.qty} g | ${b.why} |`);
  const cost = build.bom.reduce((s, b) => s + b.unitPriceUsd * b.qty, 0);
  const mass = build.bom.reduce((s, b) => s + b.massGrams * b.qty, 0);
  return [
    `# ${build.project.name}`,
    '',
    build.project.description,
    '',
    '| Qty | Part | Cost | Mass | Why |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    `| | **Total** | **$${cost.toFixed(2)}** | **${mass} g** | |`,
    '',
    '## Pins',
    '',
    ...build.pins.map((p) => `- ${p.what}: ${p.pin}`),
    '',
    'Jumper wires and solder for the splices are not listed. Prices are typical single-unit prices.',
  ].join('\n');
}

export function bomCsv(build: AssembledBuild): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return ['qty,part,unit_price_usd,mass_g,why', ...build.bom.map((b) => [b.qty, q(b.name), b.unitPriceUsd.toFixed(2), b.massGrams, q(b.why)].join(','))].join('\n');
}
