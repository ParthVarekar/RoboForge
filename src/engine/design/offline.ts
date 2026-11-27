import type { ComponentKind } from '../../schema/projectSchema';
import { ADDON_KINDS, PLATFORM_INFO, type BuildPlan, type PlanPart, type Platform } from './plan';

/**
 * The design chat without an AI: reads what the user wants from plain words and makes a build plan. Used when no
 * OpenRouter key is set, when the free quota is spent, when the AI's answer is not a usable plan, and in tests.
 * It also applies edits to an existing plan ("add a button", "remove the camera", "use an LCD instead of the OLED").
 */

const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, single: 1, two: 2, both: 2, pair: 2, three: 3, four: 4 };

interface Keyword {
  kind: ComponentKind;
  words: RegExp;
  role: string;
}

const MODULES: Keyword[] = [
  { kind: 'hcsr04', words: /\b(ultra ?sonic|hc-?sr04|distance|obstacle|avoid\w*|wall|sonar|range ?finder|proximity|parking)\b/, role: 'distance ahead' },
  { kind: 'mpu6050', words: /\b(imu|gyro\w*|mpu-?6050|accel\w*|heading|tilt|orientation|compass|balanc\w*|straight line|turn by)\b/, role: 'heading and turn rate' },
  { kind: 'lcd2004_i2c', words: /\b(20 ?x ?4|2004|four.line|4.line|big(ger)? (lcd|screen|display))\b/, role: 'text screen' },
  { kind: 'lcd1602_i2c', words: /\b(16 ?x ?2|1602|lcd|character (display|screen)|two.line)\b/, role: 'text screen' },
  { kind: 'oled_ssd1306', words: /\b(oled|ssd1306|screen|display|dashboard|readout|graphics?)\b/, role: 'status screen' },
  { kind: 'esp32_cam', words: /\b(camera|cam\b|esp32-?cam|video|stream\w*|photo|picture|fpv)\b/, role: 'camera view' },
  { kind: 'led_5mm', words: /\b(leds?|lights?|lamps?|indicators?|status light|blink\w*)\b/, role: 'status light' },
  { kind: 'tactile_button', words: /\b(buttons?|push ?buttons?|switch(es)?|press|start key)\b/, role: 'start / mode button' },
];

const LABEL: Record<string, string> = {
  hcsr04: 'ultrasonic distance sensor',
  mpu6050: 'IMU (gyro)',
  oled_ssd1306: 'OLED screen',
  lcd1602_i2c: '16x2 LCD',
  lcd2004_i2c: '20x4 LCD',
  esp32_cam: 'camera',
  led_5mm: 'LED',
  tactile_button: 'button',
  vtx_antenna: 'video transmitter antenna',
};

export function partLabel(kind: string): string {
  return LABEL[kind] ?? kind;
}

function platformOf(t: string): Platform | null {
  if (/\b(drone|quad\w*|fly\w*|flight|fpv drone|multirotor|copter)\b/.test(t)) return 'drone';
  if (/\b(rover|car|robot|wheels?|drive\w*|driving|motor|follow\w*|maze|explor\w*|patrol|vehicle|mov(e|es|ing)|chassis|2wd)\b/.test(t)) return 'rover';
  if (/\b(bench|desk|station|clock|thermometer|weather|monitor\w*|meter|counter|sign|panel|gadget|stand.?alone|no (wheels|motors))\b/.test(t)) return 'bench';
  return null;
}

/** "two LEDs", "3 buttons": how many of something the sentence asks for (1 when it does not say). */
function quantityNear(t: string, m: RegExpExecArray): number {
  const before = t.slice(Math.max(0, m.index - 14), m.index);
  const n = /(\d+|a|an|one|single|two|both|pair of|three|four)\s+(?:\w+\s+)?$/.exec(before)?.[1];
  if (!n) return 1;
  const v = /^\d+$/.test(n) ? Number(n) : (NUMBER_WORDS[n.replace(' of', '')] ?? 1);
  return Math.max(1, Math.min(4, v));
}

function negated(t: string, m: RegExpExecArray): boolean {
  return /\b(no|without|not|don'?t|dont|skip|remove|drop|except)\s+(?:a|an|the|any)?\s*(?:\w+\s+)?$/.test(t.slice(Math.max(0, m.index - 22), m.index));
}

/** Modules the words ask for, at most one screen kind (the most specific wins). */
function modulesIn(t: string): { want: PlanPart[]; unwanted: Set<ComponentKind> } {
  const want: PlanPart[] = [];
  const unwanted = new Set<ComponentKind>();
  let screen = false;
  for (const k of MODULES) {
    const m = new RegExp(k.words.source, 'g').exec(t);
    if (!m) continue;
    if (negated(t, m)) {
      unwanted.add(k.kind);
      continue;
    }
    const isScreen = k.kind === 'oled_ssd1306' || k.kind === 'lcd1602_i2c' || k.kind === 'lcd2004_i2c';
    if (isScreen && screen) continue;
    if (isScreen) screen = true;
    const qty = k.kind === 'led_5mm' || k.kind === 'tactile_button' || k.kind === 'hcsr04' ? quantityNear(t, m) : 1;
    if (k.kind === 'hcsr04') {
      const rear = /\b(back|rear|behind|reverse)\b/.test(t);
      const ahead = /\b(front|ahead|forward)\b/.test(t);
      if (rear && ahead) {
        // "front and back distance": one sensor looking each way
        want.push({ kind: k.kind, qty: 1, role: 'distance ahead', placement: 'front', locked: true });
        want.push({ kind: k.kind, qty: 1, role: 'distance behind', placement: 'back', locked: true });
        continue;
      }
      want.push({ kind: k.kind, qty, role: rear ? 'distance behind' : k.role, placement: rear && qty === 1 ? 'back' : 'front', locked: true });
      continue;
    }
    want.push({ kind: k.kind, qty, role: k.role, placement: 'any', locked: true });
  }
  return { want, unwanted };
}

/** Sensible add-ons when the user leaves the choice to the planner. */
const DEFAULTS: Record<Platform, PlanPart[]> = {
  rover: [
    { kind: 'hcsr04', qty: 1, role: 'distance ahead', placement: 'front', locked: false },
    { kind: 'mpu6050', qty: 1, role: 'heading and turn rate', placement: 'any', locked: false },
    { kind: 'oled_ssd1306', qty: 1, role: 'status screen', placement: 'any', locked: false },
    { kind: 'led_5mm', qty: 1, role: 'status light', placement: 'any', locked: false },
  ],
  bench: [
    { kind: 'oled_ssd1306', qty: 1, role: 'status screen', placement: 'any', locked: false },
    { kind: 'led_5mm', qty: 1, role: 'status light', placement: 'any', locked: false },
    { kind: 'tactile_button', qty: 1, role: 'mode button', placement: 'any', locked: false },
  ],
  drone: [{ kind: 'vtx_antenna', qty: 1, role: 'video link', placement: 'any', locked: false }],
};

function titleFor(platform: Platform, parts: PlanPart[]): string {
  const names = parts.slice(0, 3).map((p) => partLabel(p.kind));
  const base = PLATFORM_INFO[platform].name;
  return names.length ? `${base[0]!.toUpperCase()}${base.slice(1)} with ${names.join(', ')}`.slice(0, 80) : `${base[0]!.toUpperCase()}${base.slice(1)}`;
}

/** Things people ask for that the catalog does not have yet (said plainly instead of silently ignored). */
const MISSING: Array<[RegExp, string]> = [
  [/\b(temperature|thermo\w*|humidity|weather|dht\d*|bme\d*|bmp\d*)\b/, 'temperature or humidity sensor'],
  [/\b(gps|gnss)\b/, 'GPS module'],
  [/\b(servos?|robot arm|gripper|claw)\b/, 'servo'],
  [/\b(buzzer|speaker|sound|beep\w*|music)\b/, 'buzzer or speaker'],
  [/\b(relays?)\b/, 'relay'],
  [/\b(lidar|line (sensor|follow\w*)|ir sensor|infrared)\b/, 'line or IR sensor'],
  [/\b(soil|moisture|gas|smoke|light sensor|ldr|photo ?resistor)\b/, 'analog sensor (analog inputs are not simulated yet)'],
  [/\b(rgb|neopixel|ws2812|led strip)\b/, 'RGB LED strip'],
];

function missingIn(t: string): string[] {
  return MISSING.filter(([re]) => re.test(t)).map(([, name]) => name);
}

export interface OfflineAnswer {
  reply: string;
  plan: BuildPlan | null;
}

/**
 * One turn of the design chat without an AI. With no plan yet it makes one (or asks what kind of build it is);
 * with a plan it applies the edit the words describe.
 */
export function offlineTurn(text: string, current: BuildPlan | null, history: readonly string[] = []): OfflineAnswer {
  const t = text.toLowerCase();
  const all = [...history, text].join(' ').toLowerCase();
  const letAi = /\b(you (pick|choose|decide)|up to you|your choice|whatever|surprise me|anything)\b/.test(t);

  if (current) {
    // an edit to the plan: switch platform, add, remove or swap modules
    const nextPlatform = platformOf(t);
    const platform = nextPlatform && /\b(instead|make it|turn it into|change (it )?to|switch to)\b/.test(t) ? nextPlatform : current.platform;
    const { want, unwanted } = modulesIn(t);
    let parts = current.parts.filter((p) => !unwanted.has(p.kind));
    const swapToScreen = want.find((p) => p.kind === 'oled_ssd1306' || p.kind === 'lcd1602_i2c' || p.kind === 'lcd2004_i2c');
    if (swapToScreen) parts = parts.filter((p) => !['oled_ssd1306', 'lcd1602_i2c', 'lcd2004_i2c'].includes(p.kind));
    for (const w of want) {
      const have = parts.find((p) => p.kind === w.kind);
      if (have) {
        if (/\b(\d+|two|three|four|both|pair)\b/.test(t)) have.qty = w.qty;
        have.locked = true;
      } else parts.push(w);
    }
    parts = parts.filter((p) => ADDON_KINDS[platform].includes(p.kind));
    const changed = platform !== current.platform || want.length > 0 || unwanted.size > 0;
    if (!changed) {
      return { reply: 'I did not catch a change. Say what to add, remove or swap, for example "add a button" or "use a 16x2 LCD instead of the OLED", or press Build.', plan: current };
    }
    const plan: BuildPlan = { ...current, platform, parts, title: titleFor(platform, parts) };
    const said: string[] = [];
    if (platform !== current.platform) said.push(`switched to a ${PLATFORM_INFO[platform].name}`);
    for (const w of want) said.push(`added ${w.qty > 1 ? `${w.qty} ` : ''}${partLabel(w.kind)}${w.qty > 1 ? 's' : ''}`);
    for (const u of unwanted) said.push(`removed the ${partLabel(u)}`);
    return { reply: `Updated the plan: ${said.join(', ')}. Check the blueprint below, then press Build.`, plan };
  }

  const platform = platformOf(all);
  if (!platform && !letAi) {
    return {
      reply: 'What kind of build is it: a 2WD rover that drives around, a 5" quadcopter, or a project that stays on the bench (a screen, sensors, buttons)? You can also say "you pick".',
      plan: null,
    };
  }
  const chosen = platform ?? 'rover';
  const { want, unwanted } = modulesIn(all);
  let parts = want.filter((p) => ADDON_KINDS[chosen].includes(p.kind));
  const notHere = want.filter((p) => !ADDON_KINDS[chosen].includes(p.kind));
  if (parts.length === 0 || letAi) {
    for (const d of DEFAULTS[chosen]) if (!unwanted.has(d.kind) && !parts.some((p) => p.kind === d.kind)) parts.push({ ...d });
  }
  parts = parts.slice(0, 10);
  const plan: BuildPlan = {
    title: titleFor(chosen, parts),
    summary: text.trim().slice(0, 400),
    platform: chosen,
    parts,
  };
  const listed = parts.map((p) => `${p.qty > 1 ? `${p.qty} x ` : ''}${partLabel(p.kind)}${p.kind === 'hcsr04' && p.placement === 'back' ? ' (rear)' : ''}`).join(', ');
  const skipped = notHere.length ? ` The ${notHere.map((p) => partLabel(p.kind)).join(' and ')} is not available on the ${PLATFORM_INFO[chosen].name}, so I left it out.` : '';
  const missing = missingIn(all);
  const lacking = missing.length ? ` The parts library has no ${missing.join(', no ')} yet, so that part of the idea is not in this build.` : '';
  return {
    reply: `Here is a ${PLATFORM_INFO[chosen].name} with ${listed || 'no add-ons'}.${skipped}${lacking} The blueprint below shows where everything goes and how it is wired; change anything in words, or press Build.`,
    plan,
  };
}
