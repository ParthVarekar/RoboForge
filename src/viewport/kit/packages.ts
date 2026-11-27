import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { labelTexture } from './boardArt';
import { PBR, ledEmitter, markShared, plastic } from './pbr';
import { MM } from './pcb';

/**
 * Electronic packages at their real (datasheet) sizes. Every function places one part on a board: `at` is the
 * point on the board's top surface under the part's centre (cm), `rot` turns it about the vertical axis.
 * Dimensions below are millimetres and converted with MM.
 */

export interface Place {
  at: THREE.Vector3;
  rot?: number;
}

export function placed(g: THREE.Group, p: Place): THREE.Group {
  const sub = new THREE.Group();
  sub.position.copy(p.at);
  sub.rotation.y = p.rot ?? 0;
  g.add(sub);
  return sub;
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

export const rbox = (w: number, h: number, d: number, r: number, seg = 2) => new RoundedBoxGeometry(w * MM, h * MM, d * MM, seg, Math.min(r, w / 2, h / 2, d / 2) * MM);

/** A flat decal (marking, label) lying on a surface at height y (cm). */
export function decal(tex: THREE.Texture, wMm: number, dMm: number, y: number, opacity = 1): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(wMm * MM, dMm * MM),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity, roughness: 0.6, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.renderOrder = 2;
  return m;
}

/* ------------------------------------------------------------------ gull-wing lead geometry */

const leadCache = new Map<string, THREE.BufferGeometry>();

/**
 * One gull-wing lead seen from the side (x outward from the body edge, y up from the board), extruded to its width.
 * The foot rests on the board at y = 0.
 */
function gullLead(lengthMm: number, exitYMm: number, widthMm: number, thickMm = 0.15): THREE.BufferGeometry {
  const key = `${lengthMm}_${exitYMm}_${widthMm}_${thickMm}`;
  const hit = leadCache.get(key);
  if (hit) return hit;
  const t = thickMm;
  const a = lengthMm * 0.22;
  const b = lengthMm * 0.48;
  const s = new THREE.Shape();
  s.moveTo(-0.05, exitYMm + t / 2);
  s.lineTo(a, exitYMm + t / 2);
  s.quadraticCurveTo(a + (b - a) * 0.55, exitYMm + t / 2, b, t);
  s.lineTo(lengthMm, t);
  s.lineTo(lengthMm, 0);
  s.lineTo(b - t * 0.5, 0);
  s.quadraticCurveTo(a + (b - a) * 0.4, exitYMm - t / 2, a - t * 0.3, exitYMm - t / 2);
  s.lineTo(-0.05, exitYMm - t / 2);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: widthMm, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -widthMm / 2);
  g.scale(MM, MM, MM);
  markShared(g);
  leadCache.set(key, g);
  return g;
}

/** Leads along one body edge: `count` leads at `pitch`, pointing in direction `dir` (radians about Y). */
function leadRow(
  geos: THREE.BufferGeometry[],
  base: THREE.BufferGeometry,
  count: number,
  pitchMm: number,
  edgeOffsetMm: number,
  dir: number,
): void {
  for (let i = 0; i < count; i += 1) {
    const along = (i - (count - 1) / 2) * pitchMm;
    const g = base.clone();
    g.translate(edgeOffsetMm * MM, 0, along * MM);
    g.rotateY(dir);
    geos.push(g);
  }
}

/** Laser marking on a package top. Text runs along the longer side, as manufacturers print it. */
export function markingTop(lines: readonly string[], wMm: number, dMm: number, yTopCm: number, color = 'rgba(196,199,204,0.78)'): THREE.Mesh {
  const along = dMm > wMm * 1.2;
  const tw = along ? dMm : wMm;
  const td = along ? wMm : dMm;
  const tex = labelTexture(lines, { wPx: Math.round(256 * Math.min(3, tw / td)), hPx: 256, color });
  const m = decal(tex, tw * 0.86, td * 0.8, yTopCm + 0.002);
  if (along) m.rotation.z = Math.PI / 2;
  return m;
}

export function pin1Dot(xMm: number, zMm: number, yTopCm: number, rMm = 0.3): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(rMm * MM, 16), new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.3 }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(xMm * MM, yTopCm + 0.001, zMm * MM);
  return m;
}

/* ------------------------------------------------------------------ passives */

const CHIP_SIZES: Record<string, [number, number, number]> = {
  '0402': [1.0, 0.5, 0.35],
  '0603': [1.6, 0.8, 0.45],
  '0805': [2.0, 1.25, 0.5],
  '1206': [3.2, 1.6, 0.55],
  '2512': [6.3, 3.2, 0.6],
};

/** Chip resistor (white alumina, black glaze top), MLCC (grey-tan ceramic) or chip inductor, with tin end caps. */
export function chipPassive(g: THREE.Group, p: Place & { code?: keyof typeof CHIP_SIZES; kind?: 'R' | 'C' | 'L'; marking?: string }): void {
  const [l, w, h] = CHIP_SIZES[p.code ?? '0603'] ?? [1.6, 0.8, 0.45];
  const sub = placed(g, p);
  const cap = Math.min(0.35, l * 0.22);
  const kind = p.kind ?? 'R';
  const bodyMat = kind === 'R' ? PBR.aluminaWhite() : kind === 'L' ? PBR.ferrite() : PBR.mlcc();
  sub.add(mesh(rbox(l - cap * 2 + 0.02, h * 0.92, w, 0.06), bodyMat, 0, (h * 0.46) * MM, 0, false));
  if (kind === 'R') {
    sub.add(mesh(new THREE.BoxGeometry((l - cap * 2) * MM, 0.04 * MM, w * 0.9 * MM), PBR.resistorGlaze(), 0, h * 0.94 * MM, 0, false));
    if (p.marking) sub.add(markingTop([p.marking], l - cap * 2, w * 0.9, h * 0.96 * MM, 'rgba(235,235,235,0.9)'));
  }
  for (const sx of [-1, 1]) {
    sub.add(mesh(rbox(cap, h, w + 0.02, 0.06), PBR.tin(), sx * (l / 2 - cap / 2) * MM, (h / 2) * MM, 0, false));
  }
}

/* ------------------------------------------------------------------ ICs */

export interface IcOptions extends Place {
  marking?: readonly string[];
}

/** SOIC-n: 3.9 mm body, 1.27 mm pitch, gull-wing leads to 6.0 mm overall. */
export function soic(g: THREE.Group, p: IcOptions & { pins: number }): void {
  const perSide = p.pins / 2;
  const bodyL = Math.max(4.9, perSide * 1.27 + 0.6);
  icGull(g, p, { bodyW: 3.9, bodyL, bodyH: 1.5, perSide, pitch: 1.27, leadLen: 1.05, leadW: 0.42, standoff: 0.15 });
}

/** SOIC-n wide body (7.5 mm, 300 mil), 1.27 mm pitch, about 10.3 mm overall: DS3231SN, CH340G. */
export function soicWide(g: THREE.Group, p: IcOptions & { pins: number }): void {
  const perSide = p.pins / 2;
  icGull(g, p, { bodyW: 7.5, bodyL: perSide * 1.27 + 0.2, bodyH: 2.35, perSide, pitch: 1.27, leadLen: 1.3, leadW: 0.42, standoff: 0.15 });
}

/** TSSOP-n / HTSSOP-n: 4.4 mm body, 0.65 mm pitch, 6.4 mm overall. */
export function tssop(g: THREE.Group, p: IcOptions & { pins: number }): void {
  const perSide = p.pins / 2;
  icGull(g, p, { bodyW: 4.4, bodyL: perSide * 0.65 + 0.5, bodyH: 1.0, perSide, pitch: 0.65, leadLen: 1.0, leadW: 0.25, standoff: 0.08 });
}

function icGull(
  g: THREE.Group,
  p: IcOptions,
  d: { bodyW: number; bodyL: number; bodyH: number; perSide: number; pitch: number; leadLen: number; leadW: number; standoff: number },
): void {
  const sub = placed(g, p);
  const yBody = d.standoff + d.bodyH / 2;
  sub.add(mesh(rbox(d.bodyW, d.bodyH, d.bodyL, 0.12), PBR.icEpoxy(), 0, yBody * MM, 0));
  const lead = gullLead(d.leadLen, yBody, d.leadW);
  const geos: THREE.BufferGeometry[] = [];
  leadRow(geos, lead, d.perSide, d.pitch, d.bodyW / 2, 0);
  leadRow(geos, lead, d.perSide, d.pitch, d.bodyW / 2, Math.PI);
  sub.add(mesh(mergeGeometries(geos), PBR.tin(), 0, 0, 0, false));
  geos.forEach((x) => x.dispose());
  const top = (d.standoff + d.bodyH) * MM;
  if (p.marking) sub.add(markingTop(p.marking, d.bodyW, d.bodyL, top));
  sub.add(pin1Dot(-d.bodyW / 2 + 0.6, -d.bodyL / 2 + 0.6, top, 0.28));
}

/** LQFP (four-sided gull wing), body size in mm, total pins, 0.5 mm pitch by default. */
export function lqfp(g: THREE.Group, p: IcOptions & { size: number; pins: number; pitch?: number }): void {
  const sub = placed(g, p);
  const h = 1.4;
  const standoff = 0.1;
  const yBody = standoff + h / 2;
  sub.add(mesh(rbox(p.size, h, p.size, 0.15), PBR.icEpoxy(), 0, yBody * MM, 0));
  const perSide = p.pins / 4;
  const pitch = p.pitch ?? 0.5;
  const lead = gullLead(1.0, yBody, 0.22);
  const geos: THREE.BufferGeometry[] = [];
  for (const dir of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) leadRow(geos, lead, perSide, pitch, p.size / 2, dir);
  sub.add(mesh(mergeGeometries(geos), PBR.tin(), 0, 0, 0, false));
  geos.forEach((x) => x.dispose());
  const top = (standoff + h) * MM;
  if (p.marking) sub.add(markingTop(p.marking, p.size, p.size * 0.7, top));
  sub.add(pin1Dot(-p.size / 2 + 1.0, -p.size / 2 + 1.0, top, 0.45));
}

/** QFN/DFN: leadless square with the end of each pad showing on the sides. */
export function qfn(g: THREE.Group, p: IcOptions & { size: number; pins: number; height?: number; sizeD?: number }): void {
  const sub = placed(g, p);
  const w = p.size;
  const dd = p.sizeD ?? p.size;
  const h = p.height ?? 0.9;
  sub.add(mesh(rbox(w, h, dd, 0.08), PBR.icEpoxy(), 0, (h / 2 + 0.02) * MM, 0));
  const perSide = Math.max(1, Math.round(p.pins / 4));
  const pitch = Math.min(0.5, (Math.min(w, dd) - 0.8) / perSide);
  const geos: THREE.BufferGeometry[] = [];
  const pad = new THREE.BoxGeometry(0.06 * MM, 0.2 * MM, 0.24 * MM);
  for (const [dir, half] of [
    [0, w / 2],
    [Math.PI, w / 2],
    [Math.PI / 2, dd / 2],
    [-Math.PI / 2, dd / 2],
  ] as const) {
    for (let i = 0; i < perSide; i += 1) {
      const gg = pad.clone();
      gg.translate((half + 0.01) * MM, 0.12 * MM, (i - (perSide - 1) / 2) * pitch * MM);
      gg.rotateY(dir);
      geos.push(gg);
    }
  }
  pad.dispose();
  sub.add(mesh(mergeGeometries(geos), PBR.tin(), 0, 0, 0, false));
  geos.forEach((x) => x.dispose());
  const top = (h + 0.02) * MM;
  if (p.marking) sub.add(markingTop(p.marking, w, dd, top));
  sub.add(pin1Dot(-w / 2 + 0.45, -dd / 2 + 0.45, top, 0.18));
}

/** SOT-23 (3 leads) or SOT-23-5/6. */
export function sot23(g: THREE.Group, p: IcOptions & { leads?: 3 | 5 | 6 }): void {
  const sub = placed(g, p);
  const h = 1.0;
  const yBody = 0.1 + h / 2;
  sub.add(mesh(rbox(1.3, h, 2.9, 0.08), PBR.icEpoxy(), 0, yBody * MM, 0));
  const lead = gullLead(0.55, yBody * 0.7, 0.4);
  const geos: THREE.BufferGeometry[] = [];
  const n = p.leads ?? 3;
  if (n === 3) {
    for (const z of [-0.95, 0.95]) {
      const a = lead.clone();
      a.translate(0.65 * MM, 0, z * MM);
      geos.push(a);
    }
    const b = lead.clone();
    b.translate(0.65 * MM, 0, 0);
    b.rotateY(Math.PI);
    geos.push(b);
  } else {
    leadRow(geos, lead, 3, 0.95, 0.65, 0);
    leadRow(geos, lead, n - 3, 0.95 * (n === 5 ? 2 : 1), 0.65, Math.PI);
  }
  sub.add(mesh(mergeGeometries(geos), PBR.tin(), 0, 0, 0, false));
  geos.forEach((x) => x.dispose());
  if (p.marking) sub.add(markingTop(p.marking, 1.3, 2.9, (0.1 + h) * MM));
}

/** SOT-223: 6.5 x 3.5 mm body, three 0.7 mm leads at 2.3 mm on one side, a 3.0 mm tab on the other. */
export function sot223(g: THREE.Group, p: IcOptions): void {
  const sub = placed(g, p);
  const h = 1.6;
  const yBody = 0.06 + h / 2;
  sub.add(mesh(rbox(3.5, h, 6.5, 0.1), PBR.icEpoxy(), 0, yBody * MM, 0));
  const small = gullLead(1.6, yBody * 0.8, 0.7, 0.25);
  const tab = gullLead(1.6, yBody * 0.8, 3.0, 0.25);
  const geos: THREE.BufferGeometry[] = [];
  leadRow(geos, small, 3, 2.3, 1.75, 0);
  const t = tab.clone();
  t.translate(1.75 * MM, 0, 0);
  t.rotateY(Math.PI);
  geos.push(t);
  sub.add(mesh(mergeGeometries(geos), PBR.tin(), 0, 0, 0, false));
  geos.forEach((x) => x.dispose());
  if (p.marking) sub.add(markingTop(p.marking, 3.5, 6.5, (0.06 + h) * MM));
}

/** TO-263-5 (D2PAK-5): power regulator with the big tab soldered to the board. */
export function to263(g: THREE.Group, p: IcOptions): void {
  const sub = placed(g, p);
  const h = 4.4;
  // tab (metal) under/behind the body
  sub.add(mesh(new THREE.BoxGeometry(10.1 * MM, 1.3 * MM, 1.6 * MM), PBR.tin(), 0, 0.65 * MM, -4.6 * MM));
  sub.add(mesh(rbox(10.1, h, 8.9, 0.25), PBR.icEpoxy(), 0, (h / 2 + 0.05) * MM, 0));
  const lead = gullLead(2.6, 1.2, 0.8, 0.5);
  const geos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i += 1) {
    const l = lead.clone();
    l.translate(4.45 * MM, 0, (i - 2) * 1.7 * MM);
    l.rotateY(-Math.PI / 2);
    geos.push(l);
  }
  sub.add(mesh(mergeGeometries(geos), PBR.tin(), 0, 0, 0, false));
  geos.forEach((x) => x.dispose());
  if (p.marking) sub.add(markingTop(p.marking, 9, 7.5, (h + 0.05) * MM));
}

/* ------------------------------------------------------------------ discretes */

/** SMA / SMB moulded diode with its cathode band and folded J-leads. */
export function diodeSma(g: THREE.Group, p: Place & { marking?: string; size?: 'SMA' | 'SMB' }): void {
  const sub = placed(g, p);
  const [l, w, h] = p.size === 'SMB' ? [4.4, 3.6, 2.2] : [4.3, 2.6, 2.1];
  sub.add(mesh(rbox(l, h, w, 0.3), PBR.icEpoxy(), 0, (h / 2 + 0.05) * MM, 0));
  sub.add(mesh(new THREE.BoxGeometry(0.5 * MM, 0.02 * MM, w * 0.92 * MM), plastic(0x9aa0a6, 0.5), (-l / 2 + 0.7) * MM, (h + 0.06) * MM, 0, false));
  for (const sx of [-1, 1]) sub.add(mesh(new THREE.BoxGeometry(1.4 * MM, 0.2 * MM, 1.5 * MM), PBR.tin(), sx * (l / 2) * MM, 0.1 * MM, 0, false));
  if (p.marking) sub.add(markingTop([p.marking], l * 0.6, w * 0.7, (h + 0.05) * MM));
}

/** SMD LED (0603/0805/1206): white package with a clear lens; returns the emitter material so it can glow. */
export function ledSmd(g: THREE.Group, p: Place & { code?: '0603' | '0805' | '1206'; color: number; glow?: number }): THREE.MeshStandardMaterial {
  const [l, w] = CHIP_SIZES[p.code ?? '0805'] ?? [2.0, 1.25];
  const sub = placed(g, p);
  const h = 0.6;
  sub.add(mesh(rbox(l * 0.8, h * 0.5, w, 0.05), plastic(0xf2efe6, 0.4), 0, h * 0.25 * MM, 0, false));
  const emit = ledEmitter(p.color, p.glow ?? 0.15);
  const lens = new THREE.Mesh(rbox(l * 0.62, h * 0.5, w * 0.9, 0.12), emit);
  lens.position.y = h * 0.72 * MM;
  sub.add(lens);
  for (const sx of [-1, 1]) sub.add(mesh(rbox(l * 0.12, h * 0.6, w, 0.03), PBR.tin(), sx * (l / 2 - l * 0.06) * MM, h * 0.3 * MM, 0, false));
  return emit;
}

/** HC-49/S low-profile through-hole crystal: stadium-shaped metal can. */
export function crystalHc49s(g: THREE.Group, p: Place & { marking?: string }): void {
  const sub = placed(g, p);
  const l = 11.05;
  const w = 4.65;
  const h = 3.5;
  const s = new THREE.Shape();
  const r = w / 2;
  s.moveTo(-l / 2 + r, -r);
  s.lineTo(l / 2 - r, -r);
  s.absarc(l / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-l / 2 + r, r);
  s.absarc(-l / 2 + r, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false);
  const geo = new THREE.ExtrudeGeometry(s, { depth: h - 0.3, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 3, curveSegments: 20 });
  geo.scale(MM, MM, MM);
  geo.rotateX(-Math.PI / 2);
  sub.add(mesh(geo, PBR.nickel(), 0, 0.3 * MM, 0));
  sub.add(mesh(new THREE.BoxGeometry((l + 0.6) * MM, 0.4 * MM, (w + 0.6) * MM), PBR.nickel(), 0, 0.2 * MM, 0));
  if (p.marking) sub.add(markingTop([p.marking], l * 0.7, w * 0.7, (h + 0.32) * MM, 'rgba(60,64,70,0.75)'));
}

/** 3.2 x 2.5 mm SMD crystal: metal lid on a ceramic base. */
export function crystalSmd3225(g: THREE.Group, p: Place): void {
  const sub = placed(g, p);
  sub.add(mesh(new THREE.BoxGeometry(3.2 * MM, 0.35 * MM, 2.5 * MM), plastic(0xd8cfbf, 0.6), 0, 0.175 * MM, 0, false));
  sub.add(mesh(rbox(3.0, 0.45, 2.3, 0.08), PBR.nickel(), 0, 0.57 * MM, 0, false));
}

/** SMD tactile switch (the EN/BOOT buttons of dev boards): black body, steel cover, round plunger. */
export function tactSmd(g: THREE.Group, p: Place & { size?: number }): THREE.Mesh {
  const s = p.size ?? 4.5;
  const sub = placed(g, p);
  sub.add(mesh(rbox(s, 1.4, s * 0.78, 0.15), plastic(0x1b1b1d, 0.55), 0, 0.7 * MM, 0));
  sub.add(mesh(new THREE.BoxGeometry(s * 0.96 * MM, 0.12 * MM, s * 0.74 * MM), PBR.steel(), 0, 1.46 * MM, 0, false));
  const plunger = mesh(new THREE.CylinderGeometry(0.85 * MM, 0.95 * MM, 0.6 * MM, 24), plastic(0x2a2a2c, 0.5), 0, 1.8 * MM, 0);
  sub.add(plunger);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) sub.add(mesh(new THREE.BoxGeometry(0.9 * MM, 0.2 * MM, 0.6 * MM), PBR.tin(), sx * (s / 2 + 0.2) * MM, 0.1 * MM, sz * s * 0.3 * MM, false));
  return plunger;
}

/** Micro-USB B receptacle (7.5 x 5.0 x 2.6 mm), nickel shell with its trapezoid mouth facing `-z` before rotation. */
export function microUsb(g: THREE.Group, p: Place & { overhangMm?: number }): void {
  const sub = placed(g, p);
  const w = 7.5;
  const h = 2.6;
  const d = 5.0;
  // shell outline (trapezoid, wider at the top) with the opening as a hole: extruded along the plug direction
  const outer = new THREE.Shape();
  outer.moveTo(-w / 2, h);
  outer.lineTo(w / 2, h);
  outer.lineTo(w / 2, 1.0);
  outer.lineTo(w / 2 - 0.6, 0.15);
  outer.lineTo(-w / 2 + 0.6, 0.15);
  outer.lineTo(-w / 2, 1.0);
  outer.closePath();
  const inner = new THREE.Path();
  const iw = 6.9;
  inner.moveTo(-iw / 2 + 0.15, h - 0.25);
  inner.lineTo(-iw / 2 + 0.15, 1.1);
  inner.lineTo(-iw / 2 + 0.65, 0.4);
  inner.lineTo(iw / 2 - 0.65, 0.4);
  inner.lineTo(iw / 2 - 0.15, 1.1);
  inner.lineTo(iw / 2 - 0.15, h - 0.25);
  inner.closePath();
  outer.holes.push(inner);
  const shell = new THREE.ExtrudeGeometry(outer, { depth: d, bevelEnabled: false });
  shell.scale(MM, MM, MM);
  shell.translate(0, 0, (-d / 2 - (p.overhangMm ?? 0.6)) * MM);
  sub.add(mesh(shell, PBR.nickel(), 0, 0, 0));
  const back = new THREE.BoxGeometry(w * MM, (h - 0.15) * MM, 0.15 * MM);
  sub.add(mesh(back, PBR.nickel(), 0, ((h + 0.15) / 2) * MM, (d / 2 - (p.overhangMm ?? 0.6)) * MM));
  // tongue with five gold contacts
  sub.add(mesh(new THREE.BoxGeometry(5.6 * MM, 0.6 * MM, 3.6 * MM), plastic(0x18181a, 0.6), 0, 1.75 * MM, (-0.5 - (p.overhangMm ?? 0.6)) * MM, false));
  for (let i = 0; i < 5; i += 1) {
    sub.add(mesh(new THREE.BoxGeometry(0.3 * MM, 0.04 * MM, 2.6 * MM), PBR.gold(), (i - 2) * 0.65 * MM, 1.43 * MM, (-0.9 - (p.overhangMm ?? 0.6)) * MM, false));
  }
  for (const sx of [-1, 1]) sub.add(mesh(new THREE.BoxGeometry(1.2 * MM, 1.0 * MM, 1.6 * MM), PBR.nickel(), sx * (w / 2 + 0.3) * MM, 0.5 * MM, (0.8 - (p.overhangMm ?? 0.6)) * MM, false));
}

/** USB-C receptacle (8.94 x 3.26 mm stadium mouth, 7.35 mm deep) facing `-z`. */
export function usbC(g: THREE.Group, p: Place & { overhangMm?: number }): void {
  const sub = placed(g, p);
  const w = 8.94;
  const h = 3.26;
  const d = 7.35;
  const stadium = (sw: number, sh: number) => {
    const s = new THREE.Shape();
    const r = sh / 2;
    s.moveTo(-sw / 2 + r, -r);
    s.lineTo(sw / 2 - r, -r);
    s.absarc(sw / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
    s.lineTo(-sw / 2 + r, r);
    s.absarc(-sw / 2 + r, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false);
    return s;
  };
  const outer = stadium(w, h);
  const innerShape = stadium(w - 0.6, h - 0.6);
  const inner = new THREE.Path(innerShape.getPoints(24));
  outer.holes.push(inner);
  const shell = new THREE.ExtrudeGeometry(outer, { depth: d, bevelEnabled: false, curveSegments: 16 });
  shell.scale(MM, MM, MM);
  shell.translate(0, (h / 2) * MM, (-d / 2 - (p.overhangMm ?? 0.8)) * MM);
  sub.add(mesh(shell, PBR.nickel(), 0, 0, 0));
  sub.add(mesh(new THREE.BoxGeometry(6.7 * MM, 0.7 * MM, 4.2 * MM), plastic(0x18181a, 0.6), 0, (h / 2) * MM, (-0.6 - (p.overhangMm ?? 0.8)) * MM, false));
  for (let i = 0; i < 12; i += 1) {
    sub.add(mesh(new THREE.BoxGeometry(0.25 * MM, 0.04 * MM, 2.8 * MM), PBR.gold(), (i - 5.5) * 0.5 * MM, (h / 2 + 0.37) * MM, (-1.0 - (p.overhangMm ?? 0.8)) * MM, false));
  }
}

/** Stamped RF shield can with laser-etched lines on top. */
export function shieldCan(
  g: THREE.Group,
  p: Place & { w: number; d: number; h: number; lines?: readonly string[]; sizes?: readonly number[] },
): void {
  const sub = placed(g, p);
  sub.add(mesh(rbox(p.w, p.h, p.d, 0.25, 3), PBR.nickel(), 0, (p.h / 2) * MM, 0));
  if (p.lines) {
    const tex = labelTexture(p.lines, { wPx: 512, hPx: Math.round((512 * p.d) / p.w), color: 'rgba(70,74,80,0.85)', weight: 700, sizes: p.sizes });
    sub.add(decal(tex, p.w * 0.9, p.d * 0.86, p.h * MM + 0.002, 0.95));
  }
}

/* ------------------------------------------------------------------ capacitors, inductors, trimmers */

const sleeveCache = new Map<string, THREE.CanvasTexture>();

/** Printed PET sleeve of an aluminium electrolytic: colour, text and the minus-stripe over the negative lead. */
function sleeveTexture(sleeve: string, stripe: string, lines: readonly string[]): THREE.CanvasTexture {
  const key = `${sleeve}|${stripe}|${lines.join('/')}`;
  const hit = sleeveCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = sleeve;
    ctx.fillRect(0, 0, 1024, 512);
    // negative stripe with minus signs, centred on the texture seam so it faces +x (the negative lead) on the body
    ctx.fillStyle = stripe;
    ctx.fillRect(0, 0, 80, 512);
    ctx.fillRect(1024 - 80, 0, 80, 512);
    ctx.fillStyle = sleeve;
    ctx.font = 'bold 120px Arial';
    ctx.textAlign = 'center';
    for (let y = 70; y < 512; y += 125) {
      ctx.fillText('−', 0, y + 40);
      ctx.fillText('−', 1024, y + 40);
    }
    ctx.fillStyle = stripe;
    ctx.font = 'bold 64px "Arial Narrow", Arial';
    ctx.save();
    ctx.translate(560, 256);
    ctx.rotate(-Math.PI / 2);
    lines.forEach((ln, i) => ctx.fillText(ln, 0, (i - (lines.length - 1) / 2) * 78));
    ctx.restore();
    // rolled-over top edge and the groove where the can is crimped
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, 1024, 18);
    ctx.fillRect(0, 470, 1024, 14);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  markShared(t);
  sleeveCache.set(key, t);
  return t;
}

export interface ElectrolyticOptions extends Place {
  dMm: number;
  hMm: number;
  sleeve?: string;
  stripe?: string;
  lines?: readonly string[];
  /** Lead length below the body (cm) for loose parts; 0 for parts soldered flush to a board. */
  leadCm?: number;
  leadSpacingMm?: number;
}

/**
 * Radial aluminium electrolytic: printed sleeve, aluminium top with its stamped K vent, tinned leads (negative lead
 * under the stripe).
 */
export function electrolyticRadial(g: THREE.Group, p: ElectrolyticOptions): THREE.Group {
  const sub = placed(g, p);
  const r = (p.dMm / 2) * MM;
  const h = p.hMm * MM;
  const lift = 0.3 * MM;
  const tex = sleeveTexture(p.sleeve ?? '#1f2b48', p.stripe ?? '#e6e9ee', p.lines ?? []);
  const side = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  const body = new THREE.CylinderGeometry(r, r, h - 0.4 * MM, 48, 1, true);
  body.rotateY(Math.PI / 2);
  sub.add(mesh(body, side, 0, lift + h / 2 - 0.1 * MM, 0));
  // rolled sleeve shoulder and the aluminium top disc
  const shoulder = new THREE.TorusGeometry(r * 0.94, 0.28 * MM, 10, 48);
  shoulder.rotateX(Math.PI / 2);
  sub.add(mesh(shoulder, new THREE.MeshPhysicalMaterial({ color: new THREE.Color(p.sleeve ?? '#1f2b48'), roughness: 0.4, clearcoat: 0.5 }), 0, lift + h - 0.3 * MM, 0));
  const topDisc = new THREE.CylinderGeometry(r * 0.86, r * 0.86, 0.1 * MM, 48);
  sub.add(mesh(topDisc, PBR.aluminium(), 0, lift + h - 0.33 * MM, 0, false));
  // K-shaped vent scoring (three grooves)
  const groove = new THREE.MeshStandardMaterial({ color: 0x8d9298, metalness: 1, roughness: 0.5 });
  for (const a of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
    const s = mesh(new THREE.BoxGeometry(r * 0.78, 0.03 * MM, 0.18 * MM), groove, Math.cos(a) * r * 0.39, lift + h - 0.27 * MM, Math.sin(a) * r * 0.39, false);
    s.rotation.y = -a;
    sub.add(s);
  }
  sub.add(mesh(new THREE.CylinderGeometry(r, r, 0.4 * MM, 48), plastic(0x23242a, 0.7), 0, lift + 0.2 * MM, 0, false));
  // leads
  const spacing = (p.leadSpacingMm ?? (p.dMm >= 10 ? 5.0 : p.dMm >= 8 ? 3.5 : 2.5)) * MM;
  const leadLen = p.leadCm ?? 0;
  if (leadLen > 0) {
    for (const sx of [-1, 1]) {
      const lead = new THREE.CylinderGeometry(0.3 * MM, 0.3 * MM, leadLen + lift, 10);
      sub.add(mesh(lead, PBR.tin(), (sx * spacing) / 2, (lift - leadLen) / 2 + lift / 2, 0, false));
    }
  }
  return sub;
}

/** Aluminium "V-chip" SMD electrolytic on its black square base, polarity mark on the lid. */
export function electrolyticSmd(g: THREE.Group, p: Place & { dMm: number; hMm: number }): void {
  const sub = placed(g, p);
  const r = (p.dMm / 2) * MM;
  const base = p.dMm + 0.3;
  sub.add(mesh(rbox(base, 1.0, base, 0.35), plastic(0x1c1c1e, 0.65), 0, 0.5 * MM, 0));
  sub.add(mesh(new THREE.CylinderGeometry(r, r, (p.hMm - 1.0) * MM, 40), PBR.aluminiumBrushed(), 0, ((p.hMm - 1.0) / 2 + 1.0) * MM, 0));
  const half = new THREE.Mesh(new THREE.CircleGeometry(r * 0.92, 32, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x15171d, roughness: 0.5 }));
  half.rotation.x = -Math.PI / 2;
  half.position.y = p.hMm * MM + 0.001;
  sub.add(half);
}

/** Shielded SMD power inductor (square ferrite drum) with its value printed on top. */
export function inductorShielded(g: THREE.Group, p: Place & { size: number; h: number; marking?: string }): void {
  const sub = placed(g, p);
  sub.add(mesh(rbox(p.size, p.h, p.size, Math.min(1.6, p.size * 0.18), 3), PBR.ferrite(), 0, (p.h / 2) * MM, 0));
  if (p.marking) sub.add(markingTop([p.marking], p.size * 0.6, p.size * 0.4, p.h * MM, 'rgba(225,225,225,0.85)'));
  for (const sx of [-1, 1]) sub.add(mesh(new THREE.BoxGeometry(1.5 * MM, 0.4 * MM, p.size * 0.5 * MM), PBR.tin(), sx * (p.size / 2) * MM, 0.2 * MM, 0, false));
}

/** Bourns 3296W multi-turn trimmer: blue box, brass adjustment screw near one end. */
export function trimpot3296w(g: THREE.Group, p: Place & { marking?: string }): void {
  const sub = placed(g, p);
  const w = 9.53;
  const d = 4.83;
  const h = 10.03;
  sub.add(mesh(rbox(w, h, d, 0.4), plastic(0x2f5fb3, 0.45, 0.2), 0, (h / 2) * MM, 0));
  const screw = mesh(new THREE.CylinderGeometry(1.1 * MM, 1.1 * MM, 0.9 * MM, 24), PBR.brass(), (w / 2 - 1.8) * MM, (h + 0.35) * MM, 0);
  sub.add(screw);
  sub.add(mesh(new THREE.BoxGeometry(2.0 * MM, 0.2 * MM, 0.3 * MM), new THREE.MeshStandardMaterial({ color: 0x3d3220, roughness: 0.6 }), (w / 2 - 1.8) * MM, (h + 0.81) * MM, 0, false));
  if (p.marking) {
    const tex = labelTexture([p.marking], { wPx: 256, hPx: 128, color: 'rgba(240,240,240,0.9)' });
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(5 * MM, 2.2 * MM), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false }));
    lab.position.set(-1.4 * MM, (h * 0.55) * MM, (d / 2 + 0.01) * MM);
    sub.add(lab);
  }
}
