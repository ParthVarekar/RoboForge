import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CHASSIS_2WD, FC_STACK, TT_MOTOR } from '../../catalog/boardGeometry';
import type { BoardPainter } from '../kit/boardArt';
import { leadTube, v3 } from '../kit/leads';
import { chipPassive, electrolyticSmd, ledSmd, lqfp, qfn, soic, tactSmd, usbC } from '../kit/packages';
import { PBR, anodised, markShared, plastic, siliconeJacket } from '../kit/pbr';
import { buildPcb, MM, roundedRectShape } from '../kit/pcb';
import type { PartBuilder } from './types';

function add(group: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

/* ================================================================== carbon fibre */

let twill: { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } | null = null;

/**
 * 3K 2x2 twill weave: tows pass over two and under two, shifting one tow per row, so the bundles form the diagonal
 * stripes carbon plates show. Each tow is shaded along its length (the fibres catch the light along their direction).
 */
function carbonTwill(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  if (twill) return twill;
  const N = 16;
  const cell = 32;
  const size = N * cell;
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    return c;
  };
  const mc = mk();
  const bc = mk();
  const m = mc.getContext('2d');
  const b = bc.getContext('2d');
  if (m && b) {
    for (let r = 0; r < N; r += 1) {
      for (let c = 0; c < N; c += 1) {
        const warpOver = ((c - r) % 4 + 4) % 4 < 2;
        const x = c * cell;
        const y = r * cell;
        const g = warpOver ? m.createLinearGradient(x, y, x, y + cell) : m.createLinearGradient(x, y, x + cell, y);
        g.addColorStop(0, warpOver ? '#1a1b1e' : '#121315');
        g.addColorStop(0.5, warpOver ? '#3a3d42' : '#26282c');
        g.addColorStop(1, warpOver ? '#1a1b1e' : '#121315');
        m.fillStyle = g;
        m.fillRect(x, y, cell, cell);
        const gb = warpOver ? b.createLinearGradient(x, y, x + cell, y) : b.createLinearGradient(x, y, x, y + cell);
        gb.addColorStop(0, '#5a5a5a');
        gb.addColorStop(0.5, '#c8c8c8');
        gb.addColorStop(1, '#5a5a5a');
        b.fillStyle = gb;
        b.fillRect(x, y, cell, cell);
      }
    }
  }
  const finish = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    return markShared(t);
  };
  twill = { map: finish(mc, true), bump: finish(bc, false) };
  return twill;
}

/** Carbon plate material; `repeat` = weave tiles across the face (one tile is 16 tows of about 1.1 mm). */
function carbonMaterial(repeatX: number, repeatY: number): THREE.MeshPhysicalMaterial {
  const tw = carbonTwill();
  const map = tw.map.clone();
  map.repeat.set(repeatX, repeatY);
  map.needsUpdate = true;
  const bump = tw.bump.clone();
  bump.repeat.set(repeatX, repeatY);
  bump.needsUpdate = true;
  return new THREE.MeshPhysicalMaterial({ map, bumpMap: bump, bumpScale: 0.35, roughness: 0.42, metalness: 0.1, clearcoat: 0.35, clearcoatRoughness: 0.35 });
}

/** A flat carbon part from an outline (cm), `t` thick, lying on y = y0, with the weave on both faces and black cut edges. */
function carbonPlate(shape: THREE.Shape, t: number, y0: number): THREE.Mesh {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1, curveSegments: 18 });
  geo.translate(0, 0, -t / 2);
  geo.rotateX(-Math.PI / 2);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const w = bb ? bb.max.x - bb.min.x : 10;
  const d = bb ? bb.max.z - bb.min.z : 10;
  // cap UVs from the plate's own x/z extent in cm (side walls keep extrude UVs, drawn with the edge material)
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < pos.count; i += 1) uv.setXY(i, (pos.getX(i) - (bb?.min.x ?? 0)) / w, (pos.getZ(i) - (bb?.min.z ?? 0)) / d);
  uv.needsUpdate = true;
  const tile = 16 * 0.11;
  const m = new THREE.Mesh(geo, [carbonMaterial(w / tile, d / tile), PBR.carbonEdge()]);
  m.position.y = y0 + t / 2;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function hole(shape: THREE.Shape, x: number, y: number, r: number): void {
  const h = new THREE.Path();
  h.absarc(x, y, r, 0, Math.PI * 2, true);
  shape.holes.push(h);
}

function slot(shape: THREE.Shape, x: number, y: number, len: number, r: number, angle = 0): void {
  const h = new THREE.Path();
  const dx = Math.cos(angle) * (len / 2 - r);
  const dy = Math.sin(angle) * (len / 2 - r);
  h.absarc(x + dx, y + dy, r, angle - Math.PI / 2, angle + Math.PI / 2, false);
  h.absarc(x - dx, y - dy, r, angle + Math.PI / 2, angle + (3 * Math.PI) / 2, false);
  h.closePath();
  shape.holes.push(h);
}

function screwHead(group: THREE.Object3D, x: number, y: number, z: number, up = 1): void {
  add(group, new THREE.CylinderGeometry(0.27, 0.28, 0.17, 20), PBR.steelDark(), x, y + (up * 0.17) / 2, z);
  const hex = add(group, new THREE.CylinderGeometry(0.1, 0.1, 0.02, 6), plastic(0x050506, 0.8), x, y + up * 0.171, z);
  hex.receiveShadow = false;
}

/* ================================================================== F7 FC + 4-in-1 ESC stack */

function drawEsc(p: BoardPainter): void {
  const g = FC_STACK;
  const c = g.boardMm / 2;
  p.pour(1.0, 1.0, g.boardMm - 2, g.boardMm - 2);
  // three phase pads per motor along the side edges, battery pads at the rear edge
  for (const [mx, my, label] of [
    [g.motorPadXMm, c - g.motorPadDyMm, 'M1'],
    [g.boardMm - g.motorPadXMm, c - g.motorPadDyMm, 'M2'],
    [g.motorPadXMm, c + g.motorPadDyMm, 'M3'],
    [g.boardMm - g.motorPadXMm, c + g.motorPadDyMm, 'M4'],
  ] as const) {
    for (const dy of [-2.4, 0, 2.4]) p.pad(mx, my + dy, 2.6, 1.8, { finish: 'gold', radiusMm: 0.3 });
    p.silkText(label, mx < c ? mx + 2.4 : mx - 2.4, my, 1.1, { align: mx < c ? 'left' : 'right' });
  }
  for (const dx of [-g.batPadDxMm, g.batPadDxMm]) p.pad(c + dx, g.boardMm - g.batPadFromRearMm, 4.4, 3.2, { finish: 'gold', radiusMm: 0.4 });
  p.silkText('+', c - 5.0, g.boardMm - 5.2, 1.6);
  p.silkText('-', c + 5.0, g.boardMm - 5.2, 1.6);
  for (const [x, y] of g.holesMm) p.ring(x, y, 5.6, 4.1, { finish: 'gold' });
  p.silkText('45A 4IN1 BLHeli_32', c, 6.0, 1.0);
}

function drawFc(p: BoardPainter): void {
  const g = FC_STACK;
  const c = g.boardMm / 2;
  p.pour(1.0, 1.0, g.boardMm - 2, g.boardMm - 2);
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2;
    p.trace([[c + Math.cos(a) * 6.2, c + Math.sin(a) * 6.2], [c + Math.cos(a) * 10.5, c + Math.sin(a) * 10.5]], 0.18, 0.15);
  }
  for (const [x, y] of g.holesMm) p.ring(x, y, 5.6, 4.1, { finish: 'gold' });
  // solder pads along the rear edge: 5V, GND, LED, BZ- and the UART row
  const padNames = ['5V', 'G', 'LED', 'BZ-', 'T1', 'R1', 'T2', 'R2'];
  padNames.forEach((n, i) => {
    const x = g.fcPadX0Mm + i * 3.2;
    p.pad(x, g.boardMm - g.fcPadFromRearMm, 2.0, 1.6, { finish: 'gold', radiusMm: 0.25 });
    p.silkText(n, x, g.boardMm - g.fcPadFromRearMm - 2.1, 0.85);
  });
  p.silkText('F722', c + 9.5, 7.0, 1.2);
  // flight-direction arrow
  p.silkLine([[c - 1.8, 8.6], [c, 7.0], [c + 1.8, 8.6]], 0.25);
}

/**
 * 30.5 x 30.5 mm FPV stack: 4-in-1 45 A ESC at the bottom (24 MOSFETs, phase pads per corner, battery pads at the rear)
 * and an F722 flight controller above it on rubber grommets and nylon spacers, with its MCU, IMU, OSD, USB-C, boot
 * button and solder pads.
 */
export const buildFcStack: PartBuilder = ({ group }) => {
  const g = FC_STACK;
  const esc = buildPcb({ key: 'esc-4in1', wMm: g.boardMm, dMm: g.boardMm, cornerMm: 3.0, mask: '#121316', yBottom: g.escBottomCm, holes: g.holesMm.map(([x, y]) => ({ x, y, d: 4.1 })), draw: drawEsc });
  group.add(esc.mesh);
  const at = esc.at;
  // MOSFETs: four groups of six 3 x 3 DFNs beside each motor's pads, MCU per motor in between
  const quadrants: Array<[number, number]> = [
    [9.0, 9.5],
    [g.boardMm - 9.0, 9.5],
    [9.0, g.boardMm - 9.5],
    [g.boardMm - 9.0, g.boardMm - 9.5],
  ];
  for (const [qx, qy] of quadrants) {
    for (let k = 0; k < 6; k += 1) {
      const dx = (k % 2) * 3.6 - 1.8;
      const dy = Math.floor(k / 2) * 3.6 - 3.6;
      qfn(group, { at: at(qx + dx, qy + dy), size: 3.1, pins: 8, height: 0.85, marking: ['4N03'] });
    }
  }
  for (const [qx, qy] of quadrants) qfn(group, { at: at(qx > g.boardMm / 2 ? qx - 6.2 : qx + 6.2, qy), size: 3, pins: 20, height: 0.7 });
  chipPassive(group, { at: at(g.boardMm / 2, g.boardMm - 4.8), rot: Math.PI / 2, code: '2512', kind: 'R', marking: 'R001' });

  // grommets, nylon spacers, screws
  const grommet = plastic(0x18191b, 0.85);
  const fcBottom = g.fcBottomCm;
  for (const [hx, hy] of g.holesMm) {
    const p = at(hx, hy);
    add(group, new THREE.TorusGeometry(0.21, 0.08, 10, 20).rotateX(Math.PI / 2), grommet, p.x, esc.top + 0.03, p.z);
    add(group, new THREE.CylinderGeometry(0.28, 0.28, fcBottom - esc.top - 0.1, 6), plastic(0x0f0f10, 0.6), p.x, (esc.top + fcBottom) / 2, p.z);
  }

  const fc = buildPcb({ key: 'fc-f722', wMm: g.boardMm, dMm: g.boardMm, cornerMm: 3.0, mask: '#141518', yBottom: fcBottom, holes: g.holesMm.map(([x, y]) => ({ x, y, d: 4.1 })), draw: drawFc });
  group.add(fc.mesh);
  const atf = fc.at;
  lqfp(group, { at: atf(g.boardMm / 2, g.boardMm / 2 - 1.0), size: 10, pins: 64, marking: ['STM32F722', 'RET6', 'GH21V'] });
  qfn(group, { at: atf(g.boardMm / 2 + 8.0, g.boardMm / 2 + 6.0), size: 2.5, sizeD: 3.0, pins: 14, height: 0.9, marking: ['42688'] });
  soic(group, { at: atf(g.boardMm / 2 - 9.0, g.boardMm / 2 + 6.0), rot: Math.PI / 2, pins: 8, marking: ['25Q128'] });
  qfn(group, { at: atf(g.boardMm / 2 + 8.5, g.boardMm / 2 - 7.0), size: 5, pins: 28, marking: ['AT7456E'] });
  usbC(group, { at: atf(g.boardMm / 2, 3.6), rot: 0, overhangMm: 0.4 });
  tactSmd(group, { at: atf(g.boardMm / 2 - 8.6, 4.4), size: 3.0 });
  ledSmd(group, { at: atf(g.boardMm / 2 + 7.0, 3.6), code: '0603', color: 0x2f6bff, glow: 0.2 });
  ledSmd(group, { at: atf(g.boardMm / 2 + 9.0, 3.6), code: '0603', color: 0xff2a1a, glow: 0.2 });
  electrolyticSmd(group, { at: atf(g.boardMm / 2 - 8.5, g.boardMm / 2 - 6.0), dMm: 4, hMm: 5.4 });
  for (let k = 0; k < 8; k += 1) chipPassive(group, { at: atf(g.boardMm / 2 - 4.5 + k * 1.3, g.boardMm / 2 + 6.8), rot: Math.PI / 2, code: '0402', kind: k % 2 ? 'R' : 'C' });
  for (const [hx, hy] of g.holesMm) {
    const p = atf(hx, hy);
    add(group, new THREE.TorusGeometry(0.21, 0.08, 10, 20).rotateX(Math.PI / 2), grommet, p.x, fc.top + 0.03, p.z);
    screwHead(group, p.x, fc.top + 0.06, p.z);
  }
};

/* ================================================================== 2WD carbon chassis deck */

/**
 * 3 mm 3K-twill carbon deck (144 x 192 mm) on rubber feet: chamfered front corners, wiring slots, an M3 hole grid,
 * two vertical carbon brackets at the side edges that the TT gearmotors bolt to, and red anodised M3 standoffs for an
 * upper deck.
 */
export const buildChassis2wd: PartBuilder = ({ group }) => {
  const c = CHASSIS_2WD;
  const w = c.wCm;
  const d = c.dCm;
  // outline in shape coordinates, where shape +y becomes world -z (north, the front) once the plate is laid flat
  const s = new THREE.Shape();
  const ch = 1.6;
  const r = 0.6;
  s.moveTo(-w / 2 + r, -d / 2);
  s.lineTo(w / 2 - r, -d / 2);
  s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
  s.lineTo(w / 2, d / 2 - ch);
  s.lineTo(w / 2 - ch, d / 2);
  s.lineTo(-w / 2 + ch, d / 2);
  s.lineTo(-w / 2, d / 2 - ch);
  s.lineTo(-w / 2, -d / 2 + r);
  s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
  // shape y is world -z after the plate is laid flat (rotateX(-90)), so slots and holes use -z
  slot(s, 0, 2.6, 4.0, 0.35);
  slot(s, 0, -3.0, 4.0, 0.35);
  slot(s, -3.4, -6.4, 2.4, 0.3, Math.PI / 2);
  slot(s, 3.4, -6.4, 2.4, 0.3, Math.PI / 2);
  for (let ix = -2; ix <= 2; ix += 1) {
    for (let iz = -3; iz <= 3; iz += 1) {
      if (ix === 0) continue;
      hole(s, ix * 2.5, iz * 2.6, 0.16);
    }
  }
  for (const [sx, sz] of c.standoffs) hole(s, sx, -sz, 0.16);
  group.add(carbonPlate(s, c.plateCm, c.plateBottomCm));
  const deckTop = c.plateBottomCm + c.plateCm;

  // rubber feet
  for (const [fx, fz] of [
    [-w / 2 + 1.2, -d / 2 + 1.6],
    [w / 2 - 1.2, -d / 2 + 1.6],
    [-w / 2 + 1.2, d / 2 - 1.2],
    [w / 2 - 1.2, d / 2 - 1.2],
  ] as const) {
    add(group, new THREE.CylinderGeometry(0.4, 0.45, c.plateBottomCm, 20), PBR.rubber(), fx, c.plateBottomCm / 2, fz);
  }

  // motor brackets: vertical 3 mm carbon plates at each side edge, holes for the two M3 bolts and a nut on each
  const t = TT_MOTOR;
  const zA = c.motorZ + t.mountHoleZ[0] - 0.55;
  const zB = c.motorZ + t.mountHoleZ[1] + 0.6;
  const top = t.axleY + (t.gearboxHMm / 2) * MM + 0.15;
  for (const sx of [-1, 1]) {
    const b = new THREE.Shape();
    b.moveTo(zA, deckTop);
    b.lineTo(zB, deckTop);
    b.lineTo(zB, top - 0.3);
    b.quadraticCurveTo(zB, top, zB - 0.3, top);
    b.lineTo(zA + 0.3, top);
    b.quadraticCurveTo(zA, top, zA, top - 0.3);
    b.closePath();
    for (const hz of t.mountHoleZ) hole(b, c.motorZ + hz, t.axleY, 0.16);
    const geo = new THREE.ExtrudeGeometry(b, { depth: c.plateCm, bevelEnabled: false, curveSegments: 16 });
    geo.translate(0, 0, -c.plateCm / 2);
    geo.rotateY(-Math.PI / 2);
    geo.computeBoundingBox();
    // extrude UVs are the shape's own cm coordinates: one weave tile (16 tows x 1.1 mm) = 1.76 cm
    const bracket = new THREE.Mesh(geo, [carbonMaterial(1 / 1.76, 1 / 1.76), PBR.carbonEdge()]);
    bracket.position.x = sx * (w / 2 - c.plateCm / 2);
    bracket.castShadow = true;
    bracket.receiveShadow = true;
    group.add(bracket);
    // bracket foot glued and screwed to the deck
    add(group, new THREE.BoxGeometry(0.8, 0.3, zB - zA), PBR.carbonEdge(), sx * (w / 2 - c.plateCm - 0.4), deckTop + 0.15, (zA + zB) / 2);
    for (const hz of t.mountHoleZ) {
      const nut = new THREE.CylinderGeometry(0.32, 0.32, 0.24, 6).rotateZ(Math.PI / 2);
      add(group, nut, PBR.steel(), sx * (w / 2 - c.plateCm - 0.12), t.axleY, c.motorZ + hz);
      const bolt = new THREE.CylinderGeometry(0.14, 0.14, 0.3, 12).rotateZ(Math.PI / 2);
      add(group, bolt, PBR.steel(), sx * (w / 2 - c.plateCm - 0.3), t.axleY, c.motorZ + hz);
    }
  }

  // red anodised M3 standoffs (10 mm) with button-head screws underneath
  const red = anodised(0xc4161c, 0.3);
  for (const [sx, sz] of c.standoffs) {
    add(group, new THREE.CylinderGeometry(0.29, 0.29, 1.0, 6), red, sx, deckTop + 0.5, sz);
    add(group, new THREE.CylinderGeometry(0.13, 0.13, 0.02, 16), plastic(0x0a0a0b, 0.8), sx, deckTop + 1.005, sz);
  }
};

/* ================================================================== 5" true-X carbon frame */

/** Outline of a unibody true-X bottom plate: tapered arms ending in round motor mounts, concave centre corners. */
function xFrameOutline(armR: number, padR: number, wRoot: number, wEnd: number, centre: number): THREE.Shape {
  const s = new THREE.Shape();
  const pts = (theta: number) => {
    const u = new THREE.Vector2(Math.cos(theta), Math.sin(theta));
    const p = new THREE.Vector2(-Math.sin(theta), Math.cos(theta));
    return { u, p };
  };
  // the centre body's flat edges sit where neighbouring arm roots meet
  const edge = Math.SQRT1_2 * (centre * 0.9 + wRoot);
  for (let k = 0; k < 4; k += 1) {
    const th = Math.PI / 4 + (k * Math.PI) / 2;
    const { u, p } = pts(th);
    const rootR = u.clone().multiplyScalar(centre * 0.9).addScaledVector(p, -wRoot);
    const endR = u.clone().multiplyScalar(armR - padR * 0.9).addScaledVector(p, -wEnd);
    if (k === 0) s.moveTo(edge, 0);
    s.lineTo(rootR.x, rootR.y);
    s.lineTo(endR.x, endR.y);
    const centreP = u.clone().multiplyScalar(armR);
    const a0 = th - Math.PI / 2 - 0.35;
    const a1 = th + Math.PI / 2 + 0.35;
    s.quadraticCurveTo(centreP.x + Math.cos(a0) * padR * 1.05, centreP.y + Math.sin(a0) * padR * 1.05, centreP.x + Math.cos(a0) * padR, centreP.y + Math.sin(a0) * padR);
    s.absarc(centreP.x, centreP.y, padR, a0, a1, false);
    const endL = u.clone().multiplyScalar(armR - padR * 0.9).addScaledVector(p, wEnd);
    const rootL = u.clone().multiplyScalar(centre * 0.9).addScaledVector(p, wRoot);
    s.quadraticCurveTo(centreP.x + Math.cos(a1) * padR * 1.05, centreP.y + Math.sin(a1) * padR * 1.05, endL.x, endL.y);
    s.lineTo(rootL.x, rootL.y);
  }
  s.lineTo(edge, 0);
  return s;
}

/**
 * 5" true-X frame: 4 mm carbon unibody bottom plate with tapered arms (motor mounts on a 243 mm diagonal, 16 x 16 and
 * 12 x 12 mm motor holes, 30.5 mm stack holes), 25 mm red anodised standoffs and a 2 mm top plate for the battery.
 */
export const buildQuadFrame: PartBuilder = ({ group }) => {
  const armR = 8.6 * Math.SQRT2;
  const outline = xFrameOutline(armR, 1.45, 1.25, 0.85, 2.6);
  for (let k = 0; k < 4; k += 1) {
    const th = Math.PI / 4 + (k * Math.PI) / 2;
    const cx = Math.cos(th) * armR;
    const cy = Math.sin(th) * armR;
    hole(outline, cx, cy, 0.42);
    // 16 x 16 mm M3 pattern, and the 12 x 12 mm M2 pattern turned 45 degrees so the holes sit between
    for (let j = 0; j < 4; j += 1) {
      const a = th + Math.PI / 4 + (j * Math.PI) / 2;
      hole(outline, cx + Math.cos(a) * 0.8 * Math.SQRT2, cy + Math.sin(a) * 0.8 * Math.SQRT2, 0.16);
      hole(outline, cx + Math.cos(a + Math.PI / 4) * 0.6 * Math.SQRT2, cy + Math.sin(a + Math.PI / 4) * 0.6 * Math.SQRT2, 0.11);
    }
    // weight-saving slot along each arm
    slot(outline, Math.cos(th) * (armR * 0.55), Math.sin(th) * (armR * 0.55), 3.4, 0.28, th);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) hole(outline, sx * 1.525, sz * 1.525, 0.16);
  for (const [sx, sz] of [[-2.0, -3.0], [2.0, -3.0], [-2.0, 3.0], [2.0, 3.0]] as const) hole(outline, sx, sz, 0.16);
  group.add(carbonPlate(outline, 0.4, 0.02));

  const topY = 2.95;
  const standoffs: Array<[number, number]> = [
    [-2.0, -3.0],
    [2.0, -3.0],
    [-2.0, 3.0],
    [2.0, 3.0],
  ];
  const red = anodised(0xc4161c, 0.3);
  for (const [sx, sz] of standoffs) {
    add(group, new THREE.CylinderGeometry(0.29, 0.29, topY - 0.42, 6), red, sx, (0.42 + topY) / 2, -sz);
  }
  const plate = roundedRectShape(4.6, 10.4, 0.6);
  for (const [sx, sz] of standoffs) hole(plate, sx, sz, 0.16);
  slot(plate, 0, -1.6, 2.6, 0.25, 0);
  slot(plate, 0, 1.6, 2.6, 0.25, 0);
  group.add(carbonPlate(plate, 0.2, topY));
  for (const [sx, sz] of standoffs) {
    screwHead(group, sx, topY + 0.2, -sz);
    screwHead(group, sx, 0.02, -sz, -1);
  }
};

/* ================================================================== VTX antenna on a TPU mount */

let layerTex: THREE.CanvasTexture | null = null;

/** Layer lines of an FDM print (0.2 mm layers), used as a bump map on printed parts. */
function printLayers(): THREE.CanvasTexture {
  if (layerTex) return layerTex;
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    for (let y = 0; y < 64; y += 1) {
      const v = 150 + Math.round(70 * Math.sin((y / 8) * Math.PI * 2));
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(0, y, 8, 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  markShared(t);
  layerTex = t;
  return t;
}

/** Printed (FDM) plastic in a colour; `heightCm` sets the layer-line count (0.2 mm layers). */
function printed(hex: number, heightCm: number): THREE.MeshStandardMaterial {
  const bump = printLayers().clone();
  bump.repeat.set(1, Math.max(1, (heightCm * 10) / 0.2 / 8));
  bump.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.72, metalness: 0, bumpMap: bump, bumpScale: 0.6 });
}

/**
 * 5.8 GHz circularly polarised pagoda antenna (stacked PCB elements under a clear cap) on an SMA bulkhead, held in a
 * printed orange TPU tail mount, with the VTX power leads running forward.
 */
export const buildVtxAntenna: PartBuilder = ({ group, instance, spec }) => {
  const orange = printed(new THREE.Color(instance.color ?? spec.defaultColor).getHex(), 1.2);
  const base = new THREE.Shape();
  base.moveTo(-0.9, 0);
  base.lineTo(0.9, 0);
  base.lineTo(0.55, 1.15);
  base.lineTo(-0.55, 1.15);
  base.closePath();
  const baseGeo = new THREE.ExtrudeGeometry(base, { depth: 1.6, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 3 });
  baseGeo.translate(0, 0, -0.8);
  add(group, baseGeo, orange);
  // SMA bulkhead: gold body and nut
  add(group, new THREE.CylinderGeometry(0.32, 0.32, 0.28, 6), PBR.gold(), 0, 1.38, 0);
  add(group, new THREE.CylinderGeometry(0.22, 0.22, 0.55, 20), PBR.gold(), 0, 1.72, 0);
  // antenna stem (black shrink over the coax) and the pagoda head
  add(group, new THREE.CylinderGeometry(0.16, 0.18, 3.4, 16), plastic(0x121214, 0.5), 0, 3.65, 0);
  const headY = 5.35;
  for (let k = 0; k < 3; k += 1) {
    add(group, new THREE.CylinderGeometry(0.62 - k * 0.04, 0.62 - k * 0.04, 0.08, 32), plastic(k === 1 ? 0x1f6b3a : 0x205e8f, 0.45), 0, headY + k * 0.28, 0);
  }
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.72, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.08, transparent: true, opacity: 0.3, clearcoat: 1 }),
  );
  cap.position.y = headY - 0.08;
  cap.scale.y = 1.25;
  group.add(cap);
  add(group, new THREE.CylinderGeometry(0.72, 0.72, 0.18, 32, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.1, transparent: true, opacity: 0.3 }), 0, headY - 0.17, 0);
  // power leads out of the mount's front toward the stack
  const p5 = spec.pins.find((p) => p.id === '5V')?.localPos ?? [-0.12, 0.2, -1.4];
  const pg = spec.pins.find((p) => p.id === 'GND')?.localPos ?? [0.12, 0.2, -1.4];
  for (const [pt, col] of [
    [p5, 0xc8231e],
    [pg, 0x1a1a1c],
  ] as const) {
    group.add(leadTube([v3(pt[0], 0.45, -0.7), v3(pt[0], pt[1] + 0.05, -0.95), v3(pt[0], pt[1], pt[2] + 0.12)], 0.045, siliconeJacket(col), 0.15));
    add(group, new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8).rotateX(Math.PI / 2), PBR.tin(), pt[0], pt[1], pt[2] + 0.06);
  }
};

/* ================================================================== CAD shapes */

/** Printed mounting block: FDM layer lines, 0.6 mm rounded edges, in the part's colour and size. */
export const buildCadBox: PartBuilder = ({ group, instance, spec, size }) => {
  const [sx, sy, sz] = size;
  const mat = printed(new THREE.Color(instance.color ?? spec.defaultColor).getHex(), sy);
  add(group, new RoundedBoxGeometry(sx, sy, sz, 3, Math.min(0.06, sx / 4, sy / 4, sz / 4)), mat, 0, sy / 2, 0);
};

/** Printed cylinder / spacer with layer lines and a small top chamfer. */
export const buildCadCylinder: PartBuilder = ({ group, instance, spec, size }) => {
  const [sx, sy, sz] = size;
  const r = Math.min(sx, sz) / 2;
  const mat = printed(new THREE.Color(instance.color ?? spec.defaultColor).getHex(), sy);
  const geo = new THREE.LatheGeometry(
    [new THREE.Vector2(0, 0), new THREE.Vector2(r - 0.04, 0), new THREE.Vector2(r, 0.04), new THREE.Vector2(r, sy - 0.05), new THREE.Vector2(r - 0.05, sy), new THREE.Vector2(0, sy)],
    48,
  );
  add(group, geo, mat);
};

/** M3 aluminium hex standoff (5 mm across flats), anodised, with chamfered ends and the tapped holes. */
export const buildCadStandoff: PartBuilder = ({ group, instance, spec, size }) => {
  const [sx, sy] = size;
  const rc = sx / 2;
  const mat = anodised(new THREE.Color(instance.color ?? spec.defaultColor).getHex(), 0.28);
  const geo = new THREE.LatheGeometry(
    [new THREE.Vector2(0.13, 0), new THREE.Vector2(rc - 0.04, 0), new THREE.Vector2(rc, 0.04), new THREE.Vector2(rc, sy - 0.04), new THREE.Vector2(rc - 0.04, sy), new THREE.Vector2(0.13, sy)],
    6,
  );
  add(group, geo, mat);
  for (const y of [0.001, sy - 0.001]) {
    const tap = add(group, new THREE.CircleGeometry(0.13, 20), plastic(0x0a0a0b, 0.8), 0, y, 0);
    tap.rotation.x = y < 0.01 ? Math.PI / 2 : -Math.PI / 2;
  }
};

/** 2 mm 3K carbon plate with four M3 corner holes, in the part's size. */
export const buildCadPlate: PartBuilder = ({ group, size }) => {
  const [sx, sy, sz] = size;
  const s = roundedRectShape(sx, sz, 0.3);
  const inset = 0.45;
  for (const ix of [-1, 1]) for (const iz of [-1, 1]) hole(s, ix * (sx / 2 - inset), iz * (sz / 2 - inset), 0.16);
  group.add(carbonPlate(s, sy, 0));
};
