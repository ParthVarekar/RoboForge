import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { LM2596_MODULE, TT_MOTOR } from '../../catalog/boardGeometry';
import type { BoardPainter } from '../kit/boardArt';
import { labelTexture } from '../kit/boardArt';
import { leadTube, v3 } from '../kit/leads';
import { diodeSma, electrolyticRadial, inductorShielded, to263, trimpot3296w } from '../kit/packages';
import { PBR, anodised, markShared, plastic, siliconeJacket } from '../kit/pbr';
import { buildPcb, MM } from '../kit/pcb';
import type { PartBuilder } from './types';

function add(group: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

const rbox = (w: number, h: number, d: number, r: number, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2));

/* ================================================================== TT gearmotor + 65 mm wheel */

let treadTex: THREE.CanvasTexture | null = null;

/** Bump map of the TT wheel's tread: staggered transverse blocks with a centre rib (u = round the tyre, v = across). */
function tyreTreadTexture(): THREE.CanvasTexture {
  if (treadTex) return treadTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 1024, 128);
    ctx.fillStyle = '#000';
    const blocks = 30;
    for (let i = 0; i < blocks; i += 1) {
      const u = (i / blocks) * 1024;
      ctx.fillRect(u, 30, 9, 30);
      ctx.fillRect(u + 1024 / blocks / 2, 68, 9, 30);
    }
    ctx.fillRect(0, 62, 1024, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  markShared(t);
  treadTex = t;
  return t;
}

/**
 * Yellow "TT" gearmotor (about 70 x 22.5 x 18.8 mm with its 130-size motor) and the common 65 x 26 mm wheel. The axle
 * is 32.5 mm up so the tyre stands on the bench; the gearbox is meant to be bolted to a chassis bracket.
 */
export const buildTtMotor: PartBuilder = ({ group, instance }) => {
  const t = TT_MOTOR;
  const yellow = plastic(0xf2c21b, 0.42, 0.1);
  const r = t.gearboxHMm * 0.5 * MM;
  const ax = t.axleZ;
  const ay = t.axleY;
  const zRear = t.gearboxRearZ;
  const half = (t.gearboxTMm / 2) * MM;

  // gearbox: side profile (z across, y up) rounded around the output gear, with the two M3 mounting holes
  const s = new THREE.Shape();
  s.moveTo(ax, ay - r);
  s.lineTo(zRear - 0.15, ay - r);
  s.quadraticCurveTo(zRear, ay - r, zRear, ay - r + 0.15);
  s.lineTo(zRear, ay + r - 0.15);
  s.quadraticCurveTo(zRear, ay + r, zRear - 0.15, ay + r);
  s.lineTo(ax, ay + r);
  s.absarc(ax, ay, r, Math.PI / 2, (3 * Math.PI) / 2, false);
  for (const hz of t.mountHoleZ) {
    const h = new THREE.Path();
    h.absarc(hz, ay, 0.16, 0, Math.PI * 2, true);
    s.holes.push(h);
  }
  const gb = new THREE.ExtrudeGeometry(s, { depth: half * 2 - 0.08, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 28 });
  gb.translate(0, 0, -(half * 2 - 0.08) / 2);
  gb.rotateY(-Math.PI / 2);
  add(group, gb, yellow);
  // parting line of the two housing halves, the bosses round the shaft and the clip screws
  add(group, new THREE.BoxGeometry(half * 2 + 0.01, 0.012, (zRear - ax) * 0.98), plastic(0x8d7210, 0.6), 0, ay + r * 0.55, (ax + zRear) / 2);
  for (const sx of [-1, 1]) {
    const boss = new THREE.CylinderGeometry(0.42, 0.42, 0.08, 28);
    boss.rotateZ(Math.PI / 2);
    add(group, boss, yellow, sx * (half + 0.04), ay, ax);
    const screw = new THREE.CylinderGeometry(0.11, 0.11, 0.04, 12);
    screw.rotateZ(Math.PI / 2);
    add(group, screw, PBR.steel(), sx * (half + 0.02), ay - r * 0.6, zRear - 0.45);
  }
  // white double-D output shaft through both sides
  const shaft = new THREE.CylinderGeometry(0.27, 0.27, half * 2 + 1.7, 20);
  shaft.rotateZ(Math.PI / 2);
  add(group, shaft, plastic(0xf1efe8, 0.45), 0, ay, ax);

  // 130 motor: steel can with flats, black end cap with its bushing and the two solder tabs
  const can = new THREE.Shape();
  const cr = 1.02;
  const flat = 0.755;
  const fa = Math.acos(flat / cr);
  can.absarc(0, 0, cr, fa, Math.PI - fa, false);
  can.absarc(0, 0, cr, Math.PI + fa, 2 * Math.PI - fa, false);
  can.closePath();
  const canGeo = new THREE.ExtrudeGeometry(can, { depth: t.motorLenCm, bevelEnabled: false, curveSegments: 32 });
  canGeo.rotateZ(Math.PI / 2);
  add(group, canGeo, PBR.nickel(), 0, ay, zRear - 0.4);
  const capZ = zRear - 0.4 + t.motorLenCm;
  const capGeo = new THREE.CylinderGeometry(0.98, 0.98, 0.3, 32);
  capGeo.rotateX(Math.PI / 2);
  add(group, capGeo, plastic(0x1c1c1e, 0.6), 0, ay, capZ + 0.15);
  const bush = new THREE.CylinderGeometry(0.28, 0.32, 0.12, 20);
  bush.rotateX(Math.PI / 2);
  add(group, bush, PBR.brass(), 0, ay, capZ + 0.36);
  for (const sx of [-1, 1]) {
    add(group, new THREE.BoxGeometry(0.3, 0.04, 0.42), PBR.tin(), sx * t.terminalX, ay, capZ + 0.3 + 0.21);
  }

  // wheel on the outboard shaft end: yellow rim with six windows, black tyre with tread
  const side = instance.side === 'left' ? -1 : 1;
  const wheel = new THREE.Group();
  wheel.position.set(side * t.wheelOffsetX, ay, ax);
  const R = (t.wheelDMm / 2) * MM;
  const W = t.wheelWMm * MM;
  const rimR = R - 0.78;
  const prof: THREE.Vector2[] = [];
  const hw = W / 2;
  prof.push(new THREE.Vector2(rimR, -hw + 0.12), new THREE.Vector2(R - 0.4, -hw));
  for (let i = 0; i <= 8; i += 1) {
    const a = -Math.PI / 2 + (i / 8) * (Math.PI / 2);
    prof.push(new THREE.Vector2(R - 0.36 + 0.36 * Math.cos(a), -hw + 0.36 + 0.36 * Math.sin(a)));
  }
  for (let i = 0; i <= 8; i += 1) {
    const a = (i / 8) * (Math.PI / 2);
    prof.push(new THREE.Vector2(R - 0.36 + 0.36 * Math.cos(a), hw - 0.36 + 0.36 * Math.sin(a)));
  }
  prof.push(new THREE.Vector2(R - 0.4, hw), new THREE.Vector2(rimR, hw - 0.12));
  const tyreGeo = new THREE.LatheGeometry(prof, 72);
  tyreGeo.rotateZ(Math.PI / 2);
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.9, metalness: 0, bumpMap: tyreTreadTexture(), bumpScale: 2.2 });
  add(wheel, tyreGeo, tyreMat);
  const rimBand = new THREE.CylinderGeometry(rimR, rimR, W - 0.3, 48, 1, true);
  rimBand.rotateZ(Math.PI / 2);
  add(wheel, rimBand, yellow);
  const face = new THREE.Shape();
  face.absarc(0, 0, rimR, 0, Math.PI * 2, false);
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * Math.PI * 2;
    const win = new THREE.Path();
    const cx = Math.cos(a) * rimR * 0.58;
    const cy = Math.sin(a) * rimR * 0.58;
    win.absarc(cx, cy, rimR * 0.24, 0, Math.PI * 2, true);
    face.holes.push(win);
  }
  const hub = new THREE.Path();
  hub.absarc(0, 0, 0.3, 0, Math.PI * 2, true);
  face.holes.push(hub);
  // rim faces sit almost flush with the tyre's sidewalls, as on the real wheel
  const faceGeo = new THREE.ExtrudeGeometry(face, { depth: 0.14, bevelEnabled: false, curveSegments: 40 });
  faceGeo.rotateY(Math.PI / 2);
  for (const fx of [-(hw - 0.22), hw - 0.22]) add(wheel, faceGeo, yellow, fx - 0.07, 0, 0);
  const hubGeo = new THREE.CylinderGeometry(0.55, 0.55, W * 0.82, 28);
  hubGeo.rotateZ(Math.PI / 2);
  add(wheel, hubGeo, yellow);
  const screwHead = new THREE.CylinderGeometry(0.2, 0.2, 0.08, 16);
  screwHead.rotateZ(Math.PI / 2);
  add(wheel, screwHead, PBR.steel(), side * (W * 0.41 + 0.04), 0, 0);
  group.add(wheel);
  return { wheelMesh: wheel };
};

/* ================================================================== 2207 brushless + 5" tri-blade */

/**
 * One prop blade lofted from cambered airfoil sections: chord and thickness taper toward a rounded tip and the blade
 * angle follows the geometric pitch, atan(P / 2 pi r). `ccw` gives a blade for counter-clockwise rotation seen from
 * above; the clockwise blade is its mirror image.
 */
function propBladeGeometry(radius: number, pitch: number, ccw: boolean): THREE.BufferGeometry {
  const NS = 26;
  const NP = 12;
  const r0 = 0.62;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= NS; i += 1) {
    const t = i / NS;
    const r = r0 + (radius - r0) * t;
    const chord = Math.max(0.1, t < 0.3 ? 0.95 + 0.5 * (t / 0.3) : 1.45 * Math.sqrt(Math.max(0, 1 - ((t - 0.3) / 0.7) ** 2.6)));
    const thick = 0.12 - 0.07 * t;
    const camber = 0.045;
    const ang = Math.atan(pitch / (2 * Math.PI * r));
    const sweep = 0.35 * t * t;
    const cosA = Math.cos(ang);
    const sinA = Math.sin(ang);
    for (let j = 0; j < 2 * NP; j += 1) {
      const upper = j < NP;
      const k = upper ? j / (NP - 1) : (j - NP) / (NP - 1);
      const xc = upper ? 1 - (1 - k) ** 2 : (1 - k) ** 2;
      const yt = 5 * thick * (0.2969 * Math.sqrt(xc) - 0.126 * xc - 0.3516 * xc * xc + 0.2843 * xc ** 3 - 0.1015 * xc ** 4) * chord;
      const yc = camber * 4 * xc * (1 - xc) * chord;
      const n = yc + (upper ? yt : -yt);
      const s = (xc - 0.3) * chord - sweep;
      // chord runs leading edge -> trailing edge along d = (0, -sin, cos); the surface normal side is (0, cos, sin)
      const y = -s * sinA + n * cosA;
      const z = s * cosA + n * sinA;
      pos.push(r, y, ccw ? z : -z);
    }
  }
  const ring = 2 * NP;
  for (let i = 0; i < NS; i += 1) {
    for (let j = 0; j < ring; j += 1) {
      const a = i * ring + j;
      const b = i * ring + ((j + 1) % ring);
      const c = (i + 1) * ring + ((j + 1) % ring);
      const d = (i + 1) * ring + j;
      if (ccw) idx.push(a, d, b, b, d, c);
      else idx.push(a, b, d, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * 2207 FPV motor (27.9 mm bell, 16 x 16 mm M3 base) with its copper windings showing through the bell windows, M5
 * shaft, blue nylon-insert lock nut and a 5" (127 mm) 4.3-pitch tri-blade in smoked polycarbonate. Three silicone
 * phase wires leave the base. `side: 'right'` builds the counter-clockwise prop.
 */
export const buildBrushless2207: PartBuilder = ({ group, instance }) => {
  const ccw = instance.side === 'right';
  const dark = anodised(0x24272d, 0.38);
  // base (its 16 x 16 mm M3 holes are on the underside, screwed from below the arm)
  add(group, new THREE.CylinderGeometry(1.32, 1.38, 0.28, 48), dark, 0, 0.14, 0);
  // stator: laminated core with 12 enamelled copper windings
  add(group, new THREE.CylinderGeometry(0.62, 0.62, 0.75, 24), PBR.steelDark(), 0, 0.68, 0);
  const coil = rbox(0.34, 0.62, 0.36, 0.1, 2);
  for (let k = 0; k < 12; k += 1) {
    const a = (k / 12) * Math.PI * 2;
    const m = add(group, coil, PBR.enamelledCopper(), Math.cos(a) * 0.86, 0.68, Math.sin(a) * 0.86);
    m.rotation.y = -a;
  }
  // bell: lower ring, six pillars, top cap with the chamfer and fan slots
  const bellR = 1.395;
  add(group, new THREE.CylinderGeometry(bellR, bellR, 0.22, 56, 1, true), dark, 0, 0.42, 0);
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * Math.PI * 2 + 0.26;
    const p = add(group, new THREE.BoxGeometry(0.22, 0.95, 0.2), dark, Math.cos(a) * (bellR - 0.08), 0.98, Math.sin(a) * (bellR - 0.08));
    p.rotation.y = -a;
  }
  add(group, new THREE.CylinderGeometry(bellR * 0.98, bellR * 0.98, 0.03, 56, 1, true), PBR.steelDark(), 0, 0.98, 0);
  const top = new THREE.LatheGeometry(
    [
      new THREE.Vector2(bellR, 1.45),
      new THREE.Vector2(bellR, 1.78),
      new THREE.Vector2(bellR - 0.12, 1.9),
      new THREE.Vector2(0.62, 1.95),
      new THREE.Vector2(0.3, 1.97),
      new THREE.Vector2(0.0, 1.97),
    ],
    56,
  );
  add(group, top, dark);
  add(group, new THREE.TorusGeometry(bellR - 0.07, 0.035, 8, 56), PBR.aluminium(), 0, 1.84, 0).rotation.x = Math.PI / 2;
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * Math.PI * 2;
    const slot = add(group, new THREE.BoxGeometry(0.5, 0.02, 0.16), plastic(0x0b0b0c, 0.7), Math.cos(a) * 0.95, 1.94, Math.sin(a) * 0.95);
    slot.rotation.y = -a + 0.4;
  }

  // spinning part: shaft, prop hub and blades, washer and the blue lock nut
  const rotor = new THREE.Group();
  rotor.position.y = 1.97;
  add(rotor, new THREE.CylinderGeometry(0.25, 0.25, 1.15, 16), PBR.steel(), 0, 0.55, 0);
  const propMat = new THREE.MeshPhysicalMaterial({
    color: 0x3b4352,
    roughness: 0.22,
    metalness: 0,
    transparent: true,
    opacity: 0.86,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
    side: THREE.DoubleSide,
  });
  add(rotor, new THREE.CylinderGeometry(0.66, 0.7, 0.62, 32), propMat, 0, 0.31, 0);
  const blade = propBladeGeometry(6.35, 10.9, ccw);
  for (let k = 0; k < 3; k += 1) {
    const m = add(rotor, blade, propMat, 0, 0.31, 0);
    m.rotation.y = (k * Math.PI * 2) / 3;
  }
  const blue = anodised(0x1f5fd6, 0.3);
  add(rotor, new THREE.CylinderGeometry(0.5, 0.5, 0.06, 24), blue, 0, 0.65, 0);
  add(rotor, new THREE.CylinderGeometry(0.46, 0.46, 0.42, 6), blue, 0, 0.89, 0);
  add(rotor, new THREE.CylinderGeometry(0.36, 0.42, 0.12, 24), plastic(0x2b55c8, 0.5), 0, 1.15, 0);
  group.add(rotor);

  // three phase wires out of the base toward the frame centre (+z), stripped and tinned at the ends
  for (const dx of [-0.16, 0, 0.16]) {
    group.add(leadTube([v3(dx, 0.14, 1.1), v3(dx, 0.14, 1.6), v3(dx, 0.12, 2.15)], 0.08, siliconeJacket(0x1a1a1c), 0.2));
    add(group, new THREE.CylinderGeometry(0.045, 0.045, 0.16, 8).rotateX(Math.PI / 2), PBR.tin(), dx, 0.12, 2.22);
  }
  return { propMesh: rotor };
};

/* ================================================================== 2S 18650 Li-ion pack */

const packLabelCache = new Map<string, THREE.CanvasTexture>();

function packLabel(key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const hit = packLabelCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx) paint(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  markShared(t);
  packLabelCache.set(key, t);
  return t;
}

function decalOn(group: THREE.Object3D, tex: THREE.Texture, w: number, h: number, pos: THREE.Vector3, rot: THREE.Euler, opacity = 1): void {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshPhysicalMaterial({ map: tex, transparent: true, opacity, roughness: 0.32, clearcoat: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  m.position.copy(pos);
  m.rotation.copy(rot);
  group.add(m);
}

/**
 * Two 18650 cells side by side (2S, 7.4 V) in clear-blue PVC shrink with fish-paper end rings and the nickel strip
 * showing, red/black silicone leads leaving one end with tinned tips.
 */
export const buildBattery2s: PartBuilder = ({ group, spec }) => {
  const cr = 0.93;
  const len = 6.5;
  const z0 = -len / 2 - 0.15;
  // the two cells (steel cans) under translucent blue wrap
  const cellGeo = new THREE.CylinderGeometry(cr * 0.985, cr * 0.985, len - 0.1, 40);
  cellGeo.rotateX(Math.PI / 2);
  for (const sx of [-1, 1]) add(group, cellGeo, PBR.steel(), sx * cr, cr, z0 + len / 2);
  const wrap = new THREE.Shape();
  wrap.absarc(-cr, 0, cr + 0.03, Math.PI / 2, (3 * Math.PI) / 2, false);
  wrap.absarc(cr, 0, cr + 0.03, -Math.PI / 2, Math.PI / 2, false);
  wrap.closePath();
  const wrapGeo = new THREE.ExtrudeGeometry(wrap, { depth: len, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 3, curveSegments: 32 });
  wrapGeo.translate(0, 0, z0);
  const wrapMat = new THREE.MeshPhysicalMaterial({ color: 0x1f6fd1, roughness: 0.28, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.15, transparent: true, opacity: 0.88 });
  add(group, wrapGeo, wrapMat, 0, cr, 0);
  // the wrap is folded over the ends: fish-paper rings with the steel cell ends showing through the opening, and the
  // nickel strip joining the cells at the far end
  for (const zEnd of [z0 - 0.09, z0 + len + 0.09]) {
    for (const sx of [-1, 1]) {
      const ring = add(group, new THREE.RingGeometry(cr * 0.45, cr * 0.9, 32), plastic(0xcfbf98, 0.85), sx * cr, cr, zEnd);
      ring.rotation.y = zEnd < 0 ? Math.PI : 0;
      const cellEnd = add(group, new THREE.CircleGeometry(cr * 0.45, 32), PBR.steel(), sx * cr, cr, zEnd + (zEnd < 0 ? -0.002 : 0.002));
      cellEnd.rotation.y = zEnd < 0 ? Math.PI : 0;
    }
  }
  add(group, new THREE.BoxGeometry(2.6, 0.7, 0.03), PBR.nickel(), 0, cr, z0 - 0.1);
  const label = packLabel('2s', 512, 256, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1b2a44';
    ctx.font = 'bold 64px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('2S1P  7.4V', w / 2, 92);
    ctx.font = '44px Arial';
    ctx.fillText('2200mAh  16.3Wh', w / 2, 152);
    ctx.font = '30px Arial';
    ctx.fillText('Li-ion 18650  ·  do not short', w / 2, 210);
  });
  // on top of the wrap: cell diameter + wrap gap (0.03) + the extrude bevel (0.06)
  decalOn(group, label, 2.6, 1.3, v3(0, 2 * cr + 0.03 + 0.06 + 0.004, 0.2), new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2));
  // leads
  const pos = spec.pins.find((p) => p.id === 'BAT_POS')?.localPos ?? [-0.45, 0.45, 4.6];
  const neg = spec.pins.find((p) => p.id === 'GND')?.localPos ?? [0.45, 0.45, 4.6];
  const zEnd = z0 + len + 0.1;
  for (const [pt, color] of [
    [pos, 0xc8231e],
    [neg, 0x1a1a1c],
  ] as const) {
    group.add(leadTube([v3(pt[0] * 0.8, cr + 0.3, zEnd - 0.2), v3(pt[0], cr + 0.3, zEnd + 0.35), v3(pt[0], pt[1], pt[2] - 0.35)], 0.075, siliconeJacket(color), 0.3));
    add(group, new THREE.CylinderGeometry(0.04, 0.04, 0.35, 8).rotateX(Math.PI / 2), PBR.tin(), pt[0], pt[1], pt[2] - 0.17);
  }
};

/* ================================================================== 6S 1100 mAh LiPo */

/**
 * 6S1P 1100 mAh pack (six pouch cells stacked) in printed shrink, a foam end plate, 12 AWG leads to a yellow XT60, the
 * 7-wire balance lead to its white JST-XH plug, and a battery strap with its buckle.
 */
export const buildLipo6s: PartBuilder = ({ group, spec }) => {
  const W = 3.5;
  const H = 3.3;
  const L = 6.9;
  const zc = -0.15;
  const zEnd = zc + L / 2;
  add(group, rbox(W, H, L, 0.22), new THREE.MeshPhysicalMaterial({ color: 0x17191d, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2 }), 0, H / 2, zc);
  const top = packLabel('6s-top', 512, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#17191d';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e8601c';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.62);
    ctx.lineTo(w, h * 0.42);
    ctx.lineTo(w, h * 0.56);
    ctx.lineTo(0, h * 0.76);
    ctx.fill();
    ctx.fillStyle = '#f4f4f2';
    ctx.textAlign = 'center';
    ctx.font = 'bold 150px Arial';
    ctx.fillText('6S', w / 2, h * 0.2);
    ctx.font = 'bold 84px Arial';
    ctx.fillText('1100mAh', w / 2, h * 0.31);
    ctx.font = '60px Arial';
    ctx.fillText('22.2V  100C', w / 2, h * 0.39);
    ctx.font = '34px Arial';
    ctx.fillText('LiPo · 24.4Wh', w / 2, h * 0.88);
  });
  decalOn(group, top, W * 0.92, L * 0.92, v3(0, H + 0.004, zc), new THREE.Euler(-Math.PI / 2, 0, 0));
  const side = packLabel('6s-side', 1024, 512, (ctx, w, h) => {
    ctx.fillStyle = '#17191d';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 3;
    for (let k = 1; k < 6; k += 1) {
      ctx.beginPath();
      ctx.moveTo(30, (h * k) / 6);
      ctx.lineTo(w - 30, (h * k) / 6);
      ctx.stroke();
    }
    ctx.fillStyle = '#e8601c';
    ctx.fillRect(0, h * 0.44, w, h * 0.12);
    ctx.fillStyle = '#f4f4f2';
    ctx.font = 'bold 54px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('6S1P  22.2V  1100mAh', w / 2, h * 0.3);
  });
  for (const sx of [-1, 1]) decalOn(group, side, L * 0.92, H * 0.9, v3(sx * (W / 2 + 0.004), H / 2, zc), new THREE.Euler(0, sx * (Math.PI / 2), 0));
  // foam end plate where the leads leave
  add(group, rbox(W * 0.96, H * 0.94, 0.12, 0.05), plastic(0x0f0f10, 0.9), 0, H / 2, zEnd + 0.06);

  // 12 AWG leads to the XT60
  const pos = spec.pins.find((p) => p.id === 'BAT_POS')?.localPos ?? [-0.36, 0.9, 6.9];
  const neg = spec.pins.find((p) => p.id === 'GND')?.localPos ?? [0.36, 0.9, 6.9];
  const xtRear = pos[2] - 1.6;
  for (const [pt, color] of [
    [pos, 0xc8231e],
    [neg, 0x1a1a1c],
  ] as const) {
    group.add(leadTube([v3(pt[0] * 1.3, H * 0.7, zEnd + 0.1), v3(pt[0] * 1.3, H * 0.7, zEnd + 0.8), v3(pt[0], pt[1], xtRear - 0.7), v3(pt[0], pt[1], xtRear - 0.1)], 0.19, siliconeJacket(color), 0.5, 14));
    add(group, new THREE.CylinderGeometry(0.24, 0.24, 0.75, 16).rotateX(Math.PI / 2), plastic(color === 0x1a1a1c ? 0x161618 : 0xb71d18, 0.6), pt[0], pt[1], xtRear - 0.3);
  }
  // XT60: yellow nylon housing 15.8 x 8.1 x 16 mm, two chamfered corners on the positive side, gold contacts at the face
  const xt = new THREE.Shape();
  const xw = 0.79;
  const xh = 0.405;
  const ch = 0.18;
  xt.moveTo(-xw, -xh + ch);
  xt.lineTo(-xw + ch, -xh);
  xt.lineTo(xw, -xh);
  xt.lineTo(xw, xh);
  xt.lineTo(-xw + ch, xh);
  xt.lineTo(-xw, xh - ch);
  xt.closePath();
  const xtGeo = new THREE.ExtrudeGeometry(xt, { depth: 1.6, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
  add(group, xtGeo, plastic(0xf2c400, 0.48, 0.15), 0, pos[1], xtRear);
  for (const pt of [pos, neg]) {
    const sock = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 20).rotateX(Math.PI / 2);
    add(group, sock, plastic(0x2a2306, 0.6), pt[0], pt[1], pt[2] + 0.005);
    add(group, new THREE.CylinderGeometry(0.17, 0.17, 0.08, 20).rotateX(Math.PI / 2), PBR.gold(), pt[0], pt[1], pt[2] - 0.03);
  }
  // moulded "+" on top of the housing (add() returns the parent, so position the mesh before adding it)
  const plus = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.3),
    new THREE.MeshStandardMaterial({ map: labelTexture(['+'], { wPx: 64, hPx: 64, color: '#5a4a00', weight: 800 }), transparent: true, depthWrite: false }),
  );
  plus.rotation.x = -Math.PI / 2;
  plus.position.set(pos[0], pos[1] + xh + 0.035, xtRear + 0.9);
  group.add(plus);

  // balance lead: seven thin wires to the JST-XH 7P plug
  const xhPos = v3(1.25, 0.32, zEnd + 1.6);
  for (let k = 0; k < 7; k += 1) {
    const dx = (k - 3) * 0.08;
    const col = k === 0 ? 0x1a1a1c : k === 6 ? 0xc8231e : 0x2a2d33;
    group.add(leadTube([v3(1.0 + dx, H * 0.35, zEnd + 0.1), v3(1.0 + dx, H * 0.35, zEnd + 0.6), v3(xhPos.x + dx, xhPos.y + 0.2, xhPos.z - 0.8), v3(xhPos.x + dx, xhPos.y, xhPos.z - 0.35)], 0.035, siliconeJacket(col), 0.25, 6));
  }
  add(group, rbox(1.75, 0.6, 0.72, 0.05), plastic(0xf1eee6, 0.55), xhPos.x, xhPos.y, xhPos.z);

  // strap with an aluminium buckle
  const strap = new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.92 });
  const sz = zc - 1.0;
  add(group, new THREE.BoxGeometry(W + 0.12, 0.06, 2.0), strap, 0, H + 0.035, sz);
  for (const sx of [-1, 1]) add(group, new THREE.BoxGeometry(0.06, H, 2.0), strap, sx * (W / 2 + 0.035), H / 2, sz);
  add(group, new THREE.BoxGeometry(W + 0.12, 0.06, 2.0), strap, 0, 0.03, sz);
  const buckle = add(group, rbox(2.3, 0.12, 0.5, 0.05), PBR.aluminiumBrushed(), 0.2, H + 0.1, sz);
  buckle.rotation.y = 0.0;
};

/* ================================================================== LM2596 buck module */

function drawLm2596(p: BoardPainter): void {
  const g = LM2596_MODULE;
  p.pour(0.5, 0.5, g.wMm - 1, g.dMm - 1);
  // wide power copper: input pads -> cap -> regulator, switch node -> inductor -> output cap -> output pads
  p.trace([[2.6, 3.2], [8.6, 3.2], [8.6, 6.4], [17.0, 6.4]], 1.6, 0.35);
  p.trace([[2.6, 17.8], [5.0, 17.8]], 1.6, 0.35);
  p.trace([[21.5, 15.8], [21.5, 19.0], [27.0, 19.0]], 1.0, 0.3);
  p.trace([[24.6, 6.9], [22.0, 6.9]], 1.2, 0.3);
  p.trace([[36.6, 6.9], [38.6, 6.9], [38.6, 3.2], [40.6, 3.2]], 1.6, 0.35);
  p.trace([[36.2, 13.8], [36.2, 11.4], [36.6, 10.2]], 1.0, 0.3);
  for (const [x, y] of [[12.0, 3.0], [16.0, 3.0], [24.0, 13.0], [33.0, 20.0], [3.4, 10.5], [42.0, 13.6], [14.2, 14.6]] as const) p.via(x, y, 0.7);
  for (const pad of g.pads) {
    p.pad(pad.x, pad.y, 2.8, 2.6, { finish: 'tin', radiusMm: 0.3 });
    p.ring(pad.x, pad.y, 1.9, 1.1, { finish: 'tin' });
  }
  for (const h of g.holes) p.ring(h.x, h.y, h.d + 1.0, h.d, { finish: 'tin' });
  p.silkText('IN+', 1.9, 5.5, 0.9);
  p.silkText('IN-', 1.9, 15.5, 0.9);
  p.silkText('OUT+', 41.3, 5.5, 0.9);
  p.silkText('OUT-', 41.3, 15.5, 0.9);
}

/**
 * The common blue LM2596S step-down module (43.2 x 21 mm): TO-263-5 regulator, 33 uH shielded inductor, SS34 Schottky,
 * input/output electrolytics and the blue 3296W trimmer that sets the output (here 5.2 V). Wires solder to the corner
 * pads.
 */
export const buildLm2596: PartBuilder = ({ group }) => {
  const g = LM2596_MODULE;
  const board = buildPcb({ key: 'lm2596', wMm: g.wMm, dMm: g.dMm, cornerMm: 0.6, mask: '#1f4fa8', yBottom: g.boardBottomMm * MM, holes: g.holes, draw: drawLm2596 });
  group.add(board.mesh);
  const at = board.at;
  electrolyticRadial(group, { at: at(8.6, 10.5), dMm: 8, hMm: 10, sleeve: '#16171a', stripe: '#c6cad0', lines: ['220µF', '50V'], leadCm: 0 });
  electrolyticRadial(group, { at: at(36.2, 17.0), dMm: 6.3, hMm: 11, sleeve: '#16171a', stripe: '#c6cad0', lines: ['220µF', '35V'], leadCm: 0 });
  to263(group, { at: at(19.5, 11.0), marking: ['LM2596S', '-ADJ  P+'] });
  inductorShielded(group, { at: at(30.6, 6.9), size: 12, h: 7, marking: '330' });
  diodeSma(group, { at: at(12.0, 18.0), size: 'SMB', marking: 'SS34' });
  trimpot3296w(group, { at: at(28.0, 17.8), marking: '103' });
};
