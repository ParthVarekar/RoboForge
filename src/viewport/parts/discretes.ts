import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { leadTube, v3 } from '../kit/leads';
import { electrolyticRadial } from '../kit/packages';
import { PBR, markShared, plastic } from '../kit/pbr';
import { MM } from '../kit/pcb';
import type { PartBuilder } from './types';

function add(group: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

/** Leg that drops from a body to the bench and bends out into a foot (formed leads of a loose LED or capacitor). */
function footLeg(group: THREE.Group, x: number, yTop: number, footX: number, footY: number, radius: number): void {
  group.add(leadTube([v3(x, yTop, 0), v3(x, footY, 0), v3(footX, footY, 0)], radius, PBR.tin(), radius * 4));
}

/* ================================================================== solder splice */

/**
 * A soldered splice lying on the deck: a 14 mm length of black 3.2 mm heat-shrink with the bright solder joint where
 * the wires meet showing through its open middle.
 */
export const buildWireSplice: PartBuilder = ({ group }) => {
  const r = 1.6 * MM;
  const sleeve = new THREE.CylinderGeometry(r, r, 5.2 * MM, 20);
  sleeve.rotateZ(Math.PI / 2);
  for (const sx of [-1, 1]) add(group, sleeve, plastic(0x18191c, 0.55, 0.25), sx * 4.4 * MM, r, 0);
  // the joint: twisted, tinned strands under a blob of solder
  const core = new THREE.CylinderGeometry(0.9 * MM, 0.9 * MM, 4.2 * MM, 16);
  core.rotateZ(Math.PI / 2);
  add(group, core, PBR.solder(), 0, r, 0);
  add(group, new THREE.SphereGeometry(1.5 * MM, 18, 12), PBR.solder(), 0, r + 0.5 * MM, 0).scale.set(1.3, 0.8, 1);
};

/* ================================================================== 6 x 6 mm tactile switch */

/**
 * 6 x 6 x 5 mm through-hole tact switch (B3F-style) standing on its four legs: black base, stamped steel frame,
 * round plunger. Legs on the same side (4.5 mm apart) are switched; legs facing each other are joined inside.
 */
export const buildTactileButton: PartBuilder = ({ group, instance }) => {
  const legH = 3.5 * MM;
  const baseH = 3.1 * MM;
  const s = 6 * MM;
  add(group, new RoundedBoxGeometry(s, baseH, s, 2, 0.3 * MM), plastic(0x19191b, 0.62), 0, legH + baseH / 2, 0);

  // steel frame: top plate with the plunger opening, tabs folded down two sides
  const plate = new THREE.Shape();
  plate.moveTo(-3, -3);
  plate.lineTo(3, -3);
  plate.lineTo(3, 3);
  plate.lineTo(-3, 3);
  plate.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, 1.95, 0, Math.PI * 2, true);
  plate.holes.push(hole);
  const plateGeo = new THREE.ExtrudeGeometry(plate, { depth: 0.25, bevelEnabled: false, curveSegments: 24 });
  plateGeo.scale(MM, MM, MM);
  plateGeo.rotateX(-Math.PI / 2);
  add(group, plateGeo, PBR.steel(), 0, legH + baseH, 0);
  for (const sx of [-1, 1]) add(group, new THREE.BoxGeometry(0.25 * MM, 2.2 * MM, 3.0 * MM), PBR.steel(), sx * 3.06 * MM, legH + baseH - 1.0 * MM, 0);

  // plunger
  const plungerH = 1.65 * MM;
  const plunger = add(group, new THREE.CylinderGeometry(1.75 * MM, 1.8 * MM, plungerH, 32), plastic(0x232325, 0.45), 0, legH + baseH + 0.25 * MM + plungerH / 2, 0);
  plunger.userData = { pickType: 'button', componentId: instance.id, restY: plunger.position.y, travel: 0.025 };

  // four flat legs: out from under the base, then straight down to the bench
  const legMat = PBR.tin();
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      add(group, new THREE.BoxGeometry(0.7 * MM, 0.3 * MM, 0.8 * MM), legMat, sx * 2.25 * MM, legH + 0.15 * MM, sz * 2.95 * MM);
      add(group, new THREE.BoxGeometry(0.7 * MM, legH + 0.3 * MM, 0.3 * MM), legMat, sx * 2.25 * MM, (legH + 0.3 * MM) / 2, sz * 3.3 * MM);
    }
  }
  return { buttonCap: plunger };
};

/* ================================================================== 1/4 W carbon-film resistor */

const BAND_COLORS: Record<number, string> = {
  0: '#161616',
  1: '#6b3a1e',
  2: '#c8281e',
  3: '#e2711d',
  4: '#e8c91c',
  5: '#2f8f3a',
  6: '#2453b3',
  7: '#7b3fa6',
  8: '#8a8a8a',
  9: '#f2f2ee',
};

const resistorTexCache = new Map<string, THREE.CanvasTexture>();

/**
 * Colour code painted around the body: two digits, multiplier and a gold 5 % band, on beige carbon-film lacquer.
 * `v` is the lathe's v coordinate, which runs along the body because the profile points are evenly spaced.
 */
function resistorTexture(ohms: number, profileY: (v: number) => number): THREE.CanvasTexture {
  const key = String(ohms);
  const hit = resistorTexCache.get(key);
  if (hit) return hit;
  const digits = String(Math.round(ohms));
  const d1 = Number(digits[0] ?? 1);
  const d2 = Number(digits[1] ?? 0);
  const mult = Math.max(0, digits.length - 2);
  const bands: Array<[number, string]> = [
    [-2.25, BAND_COLORS[d1] ?? '#000'],
    [-1.35, BAND_COLORS[d2] ?? '#000'],
    [-0.45, BAND_COLORS[mult] ?? '#000'],
    [2.2, '#c9a54b'],
  ];
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 512;
  const ctx = c.getContext('2d');
  if (ctx) {
    for (let row = 0; row < 512; row += 1) {
      const v = 1 - (row + 0.5) / 512;
      const y = profileY(v);
      const band = bands.find(([pos]) => Math.abs(y - pos) < 0.3);
      ctx.fillStyle = band ? band[1] : '#d6bd8f';
      ctx.fillRect(0, row, 64, 1);
    }
    // faint mottling of the lacquer
    for (let i = 0; i < 260; i += 1) {
      ctx.fillStyle = `rgba(120,90,50,${0.03 + Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * 64, Math.random() * 512, 2, 3);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  markShared(t);
  resistorTexCache.set(key, t);
  return t;
}

/** Axial 1/4 W resistor (6.3 x 2.3 mm "dog-bone" body) lying on the bench, leads trimmed straight out. */
export const buildResistor: PartBuilder = ({ group, spec }) => {
  const L = 6.3;
  const N = 40;
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, -L / 2)];
  const radiusAt = (y: number) => {
    const a = Math.abs(y);
    const cap = 1.17;
    const mid = 1.0;
    let r = a > 1.75 ? cap : a > 1.35 ? mid + (cap - mid) * ((a - 1.35) / 0.4) : mid;
    if (a > 2.55) r = cap * Math.sqrt(Math.max(0.02, 1 - ((a - 2.55) / 0.62) ** 2));
    return r;
  };
  for (let i = 0; i <= N; i += 1) {
    const y = -L / 2 + (L * i) / N;
    pts.push(new THREE.Vector2(radiusAt(y), y));
  }
  pts.push(new THREE.Vector2(0, L / 2));
  const profileY = (v: number) => {
    const j = v * (pts.length - 1);
    return -L / 2 + (L * Math.min(N, Math.max(0, j - 1))) / N;
  };
  const geo = new THREE.LatheGeometry(pts, 40);
  geo.scale(MM, MM, MM);
  geo.rotateZ(-Math.PI / 2);
  const body = new THREE.MeshPhysicalMaterial({ map: resistorTexture(10000, profileY), roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.4 });
  const yC = 1.17 * MM;
  add(group, geo, body, 0, yC, 0);
  const tip = Math.abs(spec.pins[0]?.localPos[0] ?? 1.05);
  for (const sx of [-1, 1]) {
    const lead = new THREE.CylinderGeometry(0.3 * MM, 0.3 * MM, tip - (L / 2 - 0.3) * MM, 12);
    lead.rotateZ(Math.PI / 2);
    add(group, lead, PBR.tin(), sx * ((L / 2 - 0.3) * MM + (tip - (L / 2 - 0.3) * MM) / 2), yC, 0);
  }
};

/* ================================================================== 5 mm LED */

/**
 * 5 mm through-hole LED standing on its legs: tinted clear epoxy dome with the flange flat on the cathode side, the
 * lead frame (anvil with its reflector cup, post) visible inside, legs bent out into feet. The epoxy glows with PWM.
 */
export const buildLed5mm: PartBuilder = ({ group, instance, spec }) => {
  const hex = new THREE.Color(instance.color ?? spec.defaultColor);
  const yBase = 0.5;
  const epoxy = new THREE.MeshPhysicalMaterial({
    color: hex,
    emissive: hex,
    emissiveIntensity: 0.12,
    roughness: 0.12,
    metalness: 0,
    transparent: true,
    opacity: 0.8,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
  });

  // flange with the cathode flat (+x)
  const fl = new THREE.Shape();
  const r = 2.9;
  const flatX = 2.5;
  const a0 = Math.acos(flatX / r);
  fl.absarc(0, 0, r, a0, Math.PI * 2 - a0, false);
  fl.lineTo(flatX, -Math.sqrt(r * r - flatX * flatX));
  fl.closePath();
  const flGeo = new THREE.ExtrudeGeometry(fl, { depth: 1.0, bevelEnabled: false, curveSegments: 40 });
  flGeo.scale(MM, MM, MM);
  flGeo.rotateX(-Math.PI / 2);
  add(group, flGeo, epoxy, 0, yBase, 0);

  // body and dome as one lathe
  const prof: THREE.Vector2[] = [new THREE.Vector2(2.5, 1.0), new THREE.Vector2(2.5, 6.1)];
  for (let i = 1; i <= 16; i += 1) {
    const t = (i / 16) * (Math.PI / 2);
    prof.push(new THREE.Vector2(2.5 * Math.cos(t), 6.1 + 2.5 * Math.sin(t)));
  }
  const bodyGeo = new THREE.LatheGeometry(prof, 48);
  bodyGeo.scale(MM, MM, MM);
  add(group, bodyGeo, epoxy, 0, yBase, 0);

  // lead frame inside: anvil (cathode) with the reflector cup, post (anode), gold bond wire
  const frame = new THREE.MeshStandardMaterial({ color: 0x8e9399, metalness: 1, roughness: 0.35 });
  add(group, new THREE.BoxGeometry(1.4 * MM, 3.6 * MM, 0.45 * MM), frame, 0.55 * MM, yBase + 2.8 * MM, 0);
  add(group, new THREE.CylinderGeometry(0.75 * MM, 0.45 * MM, 0.6 * MM, 20, 1, true), frame, 0.55 * MM, yBase + 4.9 * MM, 0);
  add(group, new THREE.BoxGeometry(0.5 * MM, 4.0 * MM, 0.45 * MM), frame, -0.9 * MM, yBase + 3.0 * MM, 0);
  group.add(leadTube([v3(0.55 * MM, yBase + 5.1 * MM, 0), v3(-0.2 * MM, yBase + 5.9 * MM, 0), v3(-0.9 * MM, yBase + 5.0 * MM, 0)], 0.03 * MM, PBR.gold(), 0.2 * MM, 6));

  // legs: anode (-x), cathode (+x) on 2.54 mm, bent out to the wire tips
  const anode = spec.pins.find((p) => p.id === 'ANODE')?.localPos ?? [-0.527, 0.07, 0];
  const cathode = spec.pins.find((p) => p.id === 'CATHODE')?.localPos ?? [0.527, 0.07, 0];
  footLeg(group, -1.27 * MM, yBase + 0.4 * MM, anode[0], anode[1], 0.25 * MM);
  footLeg(group, 1.27 * MM, yBase + 0.4 * MM, cathode[0], cathode[1], 0.25 * MM);
  return { ledMaterial: epoxy };
};

/* ================================================================== 1000 uF 16 V electrolytic */

/** 10 x 20 mm radial electrolytic standing on formed leads (5 mm spacing), stripe over the negative lead (+x). */
export const buildCap1000uf: PartBuilder = ({ group, spec }) => {
  const lift = 0.2;
  electrolyticRadial(group, {
    at: v3(0, lift, 0),
    dMm: 10,
    hMm: 20,
    sleeve: '#141517',
    stripe: '#c7cbd1',
    lines: ['1000µF', '16V', '105°C'],
    leadCm: 0,
  });
  const pos = spec.pins.find((p) => p.id === 'POS')?.localPos ?? [-0.65, 0.07, 0];
  const neg = spec.pins.find((p) => p.id === 'NEG')?.localPos ?? [0.65, 0.07, 0];
  footLeg(group, -2.5 * MM, lift + 0.05, pos[0], pos[1], 0.3 * MM);
  footLeg(group, 2.5 * MM, lift + 0.05, neg[0], neg[1], 0.3 * MM);
};
