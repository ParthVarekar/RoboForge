import * as THREE from 'three';
import {
  A4988_MODULE,
  AMS1117_MODULE,
  BATTERY_4AA,
  L298N_MODULE,
  MT3608_MODULE,
  ROCKER,
  TB6612_MODULE,
  TP4056_MODULE,
  battery4aaPinTip,
  rockerPinTip,
} from '../../catalog/moduleGeometry';
import { labelTexture } from '../kit/boardArt';
import { leadTube, v3 } from '../kit/leads';
import { chipPassive, diodeSma, electrolyticRadial, inductorShielded, ledSmd, markingTop, qfn, soic, sot223, sot23, tssop, trimpot3296w, usbC, type Place } from '../kit/packages';
import { PBR, markShared, plastic, siliconeJacket } from '../kit/pbr';
import { MM } from '../kit/pcb';
import { finnedHeatsink, screwTerminal } from '../kit/thruhole';
import { moduleBoard, tinnedPads } from './moduleKit';
import { box, cyl, cylAlong, extrudeMm, roundedRectPath, sideLabel } from './shapes';
import type { PartBuilder } from './types';

/* ------------------------------------------------------------------ small shared pieces */

/** Two header pins with a black jumper shunt on them (`axis`: the direction the pair runs). */
function jumperShunt(group: THREE.Group, at: THREE.Vector3, axis: 'x' | 'z', boardTop: number): void {
  const along = (d: number): [number, number] => (axis === 'x' ? [at.x + d, at.z] : [at.x, at.z + d]);
  const [w, d] = axis === 'x' ? [5.08 * MM, 2.5 * MM] : [2.5 * MM, 5.08 * MM];
  group.add(box(w, 2.5 * MM, d, PBR.headerPlastic(), at.x, boardTop + 1.25 * MM, at.z, 0.2 * MM));
  for (const s of [-1.27, 1.27]) {
    const [x, z] = along(s * MM);
    group.add(box(0.64 * MM, 3.0 * MM, 0.64 * MM, PBR.gold(), x, boardTop + 3.5 * MM, z));
  }
  const [sw, sd] = axis === 'x' ? [4.9 * MM, 2.4 * MM] : [2.4 * MM, 4.9 * MM];
  group.add(box(sw, 6.0 * MM, sd, plastic(0x1b1b1d, 0.55), at.x, boardTop + 5.6 * MM, at.z, 0.3 * MM));
}

/** Moulded tantalum chip capacitor (case B, 3.5 x 2.8 mm): yellow body, brown anode bar, printed value. */
function tantalum(group: THREE.Group, p: Place & { marking?: string }): void {
  const sub = new THREE.Group();
  sub.position.copy(p.at);
  sub.rotation.y = p.rot ?? 0;
  group.add(sub);
  sub.add(box(2.9 * MM, 1.9 * MM, 2.8 * MM, plastic(0xe0b52c, 0.5), 0, 0.95 * MM, 0, 0.12 * MM));
  sub.add(box(0.6 * MM, 0.02 * MM, 2.6 * MM, plastic(0x6b4a24, 0.5), -1.0 * MM, 1.91 * MM, 0));
  for (const sx of [-1, 1]) sub.add(box(0.5 * MM, 1.0 * MM, 2.2 * MM, PBR.tin(), sx * 1.55 * MM, 0.5 * MM, 0));
  if (p.marking) sub.add(markingTop([p.marking], 2.0, 2.0, 1.92 * MM, 'rgba(70,52,20,0.9)'));
}

/** Small SMD single-turn trimmer (3 x 3 mm): white base, slotted metal rotor. */
function smdTrimmer(group: THREE.Group, at: THREE.Vector3): void {
  group.add(box(3.2 * MM, 1.0 * MM, 3.6 * MM, plastic(0xf0eee8, 0.5), at.x, at.y + 0.5 * MM, at.z, 0.15 * MM));
  group.add(cyl(1.3 * MM, 0.5 * MM, PBR.steel(), at.x, at.y + 1.25 * MM, at.z, 24));
  const slot = box(1.9 * MM, 0.12 * MM, 0.35 * MM, plastic(0x2a2c30, 0.6), at.x, at.y + 1.52 * MM, at.z);
  slot.rotation.y = 0.7;
  group.add(slot);
}

let layerTex: THREE.CanvasTexture | null = null;
/** Fine horizontal layer lines of an FDM print (used as a colour map on printed parts). */
function printedLayers(): THREE.CanvasTexture {
  if (layerTex) return layerTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    for (let y = 0; y < 256; y += 1) {
      const v = y % 4 === 0 ? 0.86 : y % 4 === 1 ? 0.95 : 1;
      const g = Math.round(255 * v);
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.fillRect(0, y, 64, 1);
    }
  }
  layerTex = new THREE.CanvasTexture(c);
  layerTex.wrapS = THREE.RepeatWrapping;
  layerTex.wrapT = THREE.RepeatWrapping;
  // extruded side walls carry their height in millimetres as v: about five 0.2 mm layers per millimetre
  layerTex.repeat.set(1, 0.08);
  layerTex.colorSpace = THREE.SRGBColorSpace;
  markShared(layerTex);
  return layerTex;
}

let cellWrap: THREE.CanvasTexture | null = null;
/** Printed wrap of an AA NiMH cell: u runs round the cell, v along it; the text runs along the top. */
function cellWrapTexture(): THREE.CanvasTexture {
  if (cellWrap) return cellWrap;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 1024;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#1e7a6a';
    ctx.fillRect(0, 0, 512, 1024);
    ctx.fillStyle = '#e9f1ee';
    ctx.fillRect(0, 0, 512, 60);
    ctx.save();
    ctx.translate(256, 512);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(245,247,250,0.95)';
    ctx.font = 'bold 74px Arial';
    ctx.fillText('NiMH  AA  1.2V', 0, -34);
    ctx.font = '46px Arial';
    ctx.fillText('2000mAh  rechargeable', 0, 36);
    ctx.restore();
  }
  cellWrap = new THREE.CanvasTexture(c);
  cellWrap.colorSpace = THREE.SRGBColorSpace;
  cellWrap.anisotropy = 8;
  markShared(cellWrap);
  return cellWrap;
}

/* ================================================================== L298N */

/**
 * The red L298N board: Multiwatt-15 L298N standing against its black finned heatsink, eight flyback diodes, the
 * 78M05 regulator with its 5 V-enable jumper, two 220 uF capacitors, the power LED, the blue screw terminals (motor A
 * west, motor B east, power south) and the six-pin control header.
 */
export const buildL298n: PartBuilder = ({ group }) => {
  const g = L298N_MODULE;
  const board = moduleBoard(group, g, {
    draw: (p) => {
      p.pour(1.2, 1.2, 40.6, 40.6);
      p.trace([[7.0, 37.5], [7.0, 33.5], [11.5, 23.0]], 1.4, 0.3);
      p.trace([[7.5, 16.0], [12.5, 17.0]], 1.2, 0.3);
      p.trace([[7.5, 21.1], [12.5, 20.0]], 1.2, 0.3);
      p.trace([[35.5, 16.0], [30.5, 17.0]], 1.2, 0.3);
      p.trace([[35.5, 21.1], [30.5, 20.0]], 1.2, 0.3);
      for (let i = 0; i < 6; i += 1) p.trace([[22.5 + i * 2.54, 39.6], [22.5 + i * 2.54, 36.5], [16.5 + i * 2.0, 22.5]], 0.3, 0.2);
      p.silkText('OUT1', 9.0, 14.4, 0.9, { align: 'left' });
      p.silkText('OUT2', 9.0, 22.8, 0.9, { align: 'left' });
      p.silkText('OUT3', 34.0, 22.8, 0.9, { align: 'right' });
      p.silkText('OUT4', 34.0, 14.4, 0.9, { align: 'right' });
      p.silkText('+12V', 7.0, 34.6, 0.85);
      p.silkText('GND', 12.08, 34.6, 0.85);
      p.silkText('+5V', 17.16, 34.6, 0.85);
      p.silkText('5V-EN', 19.0, 29.6, 0.75);
      p.silkText('L298N', 21.5, 1.6, 1.1);
      for (const [x, y] of [[16.0, 32.0], [27.0, 32.0], [36.5, 25.5], [6.5, 25.5]] as const) p.via(x, y);
    },
  });
  const at = board.at;
  const top = board.top;
  screwTerminal(group, { at: at(3.75, 18.55), ways: 2, rot: Math.PI / 2 });
  screwTerminal(group, { at: at(g.wMm - 3.75, 18.55), ways: 2, rot: -Math.PI / 2 });
  screwTerminal(group, { at: at(12.08, g.dMm - 3.75), ways: 3, rot: Math.PI });

  // heatsink with its fins toward the north edge, the L298N bolted to its south face
  finnedHeatsink(group, { at: at(21.5, 8.6), rot: Math.PI, wMm: 22, hMm: 22, dMm: 14, fins: 7 });
  const icZ = at(21.5, 18.0).z;
  const icX = at(21.5, 0).x;
  const icBottom = top + 4.0 * MM;
  group.add(box(19.6 * MM, 10.7 * MM, 4.8 * MM, PBR.icEpoxy(), icX, icBottom + 5.35 * MM, icZ, 0.3 * MM));
  group.add(box(19.6 * MM, 6.0 * MM, 0.6 * MM, PBR.tin(), icX, icBottom + 13.4 * MM, icZ - 2.1 * MM));
  sideLabel(group, ['L298N', 'GK1A9 VQ'], 15, 6, icX, icBottom + 5.6 * MM, icZ + 2.4 * MM + 0.001, 1, { color: 'rgba(200,203,208,0.85)' });
  // the 15 staggered legs: out of the base, bent forward or back, down through the board
  for (let i = 0; i < 15; i += 1) {
    const x = icX + (i - 7) * 1.27 * MM;
    const dz = (i % 2 ? 1.27 : -1.27) * 2 * MM;
    group.add(leadTube([v3(x, icBottom + 0.6 * MM, icZ), v3(x, icBottom - 0.6 * MM, icZ), v3(x, icBottom - 1.6 * MM, icZ + dz), v3(x, top - 0.3 * MM, icZ + dz)], 0.25 * MM, PBR.tin(), 0.8 * MM, 6));
  }
  for (const [x, y] of [[11.5, 24.2], [15.0, 24.2], [11.5, 28.4], [15.0, 28.4], [28.0, 24.2], [31.5, 24.2], [28.0, 28.4], [31.5, 28.4]] as const) {
    diodeSma(group, { at: at(x, y), marking: 'M7', rot: Math.PI / 2 });
  }
  sot223(group, { at: at(21.5, 25.8), marking: ['78M05'] });
  for (const x of [5.6, 37.4]) electrolyticRadial(group, { at: at(x, 29.4), dMm: 8, hMm: 12, lines: ['220uF', '35V'], leadCm: 0 });
  jumperShunt(group, at(19.0, 32.6), 'z', top);
  ledSmd(group, { at: at(26.5, 34.2), code: '0805', color: 0xff2a1a, glow: 0.12 });
  chipPassive(group, { at: at(29.5, 34.2), code: '0805', kind: 'R', marking: '102' });
  chipPassive(group, { at: at(24.0, 29.6), code: '0805', kind: 'C' });
};

/* ================================================================== TB6612FNG breakout */

/** Purple TB6612FNG breakout: the SSOP-24 driver in the middle, its three decoupling capacitors, labelled pins. */
export const buildTb6612: PartBuilder = ({ group }) => {
  const g = TB6612_MODULE;
  const board = moduleBoard(group, g, {
    labelMm: 0.62,
    draw: (p) => {
      p.pour(7.0, 0.8, 6.5, 18.9);
      for (let i = 0; i < 8; i += 1) p.trace([[3.5, 1.36 + i * 2.54], [6.6, 1.36 + i * 2.54], [7.6, 6.6 + i * 0.95]], 0.22, 0.18);
      p.silkText('TB6612FNG', g.wMm / 2, 19.6, 0.8);
    },
  });
  const at = board.at;
  tssop(group, { at: at(g.wMm / 2, 10.2), pins: 24, marking: ['TB6612', 'FNG', '7K19'] });
  chipPassive(group, { at: at(g.wMm / 2, 2.4), code: '0805', kind: 'C' });
  chipPassive(group, { at: at(g.wMm / 2 - 1.6, 17.6), code: '0603', kind: 'C', rot: Math.PI / 2 });
  chipPassive(group, { at: at(g.wMm / 2 + 1.6, 17.6), code: '0603', kind: 'C', rot: Math.PI / 2 });
};

/* ================================================================== A4988 carrier */

/** Green A4988 stepper carrier: QFN-28 driver, two R100 current-sense resistors, the current-limit trimmer, caps. */
export const buildA4988: PartBuilder = ({ group }) => {
  const g = A4988_MODULE;
  const board = moduleBoard(group, g, {
    silk: false,
    draw: (p) => {
      p.pour(3.0, 0.8, 9.2, 18.7);
      for (const [x, y] of [[4.2, 3.0], [11.0, 3.0], [4.2, 17.0], [11.0, 17.0]] as const) p.via(x, y);
      p.silkText('A4988', g.wMm / 2, 1.2, 0.8);
      p.silkText('VREF', 9.6, 18.6, 0.6);
    },
  });
  const at = board.at;
  qfn(group, { at: at(g.wMm / 2, 9.0), size: 5, pins: 28, marking: ['A4988', 'SETTR', 'KR2410'] });
  chipPassive(group, { at: at(5.2, 14.6), code: '1206', kind: 'R', marking: 'R100', rot: Math.PI / 2 });
  chipPassive(group, { at: at(10.0, 14.6), code: '1206', kind: 'R', marking: 'R100', rot: Math.PI / 2 });
  smdTrimmer(group, at(g.wMm / 2, 17.2));
  chipPassive(group, { at: at(g.wMm / 2, 3.6), code: '0805', kind: 'C' });
  chipPassive(group, { at: at(5.0, 4.2), code: '0603', kind: 'C', rot: Math.PI / 2 });
  chipPassive(group, { at: at(10.2, 4.2), code: '0603', kind: 'R', marking: '103', rot: Math.PI / 2 });
};

/* ================================================================== MT3608 boost */

/** Blue MT3608 boost board: SOT-23-6 controller, 22 uH inductor, SS34 Schottky, blue multi-turn trimmer, caps. */
export const buildMt3608: PartBuilder = ({ group }) => {
  const g = MT3608_MODULE;
  const board = moduleBoard(group, g, {
    draw: (p) => {
      p.trace([[2.2, 3.0], [9.0, 3.0]], 1.4, 0.25);
      p.trace([[2.2, 14.0], [33.8, 14.0]], 1.4, 0.25);
      p.trace([[27.0, 3.0], [33.8, 3.0]], 1.4, 0.25);
      p.silkText('MT3608', 18.0, 15.8, 0.85);
    },
  });
  tinnedPads(group, g, board);
  const at = board.at;
  chipPassive(group, { at: at(7.0, 8.5), code: '1206', kind: 'C', rot: Math.PI / 2 });
  sot23(group, { at: at(10.2, 5.0), leads: 6, marking: ['B628'] });
  inductorShielded(group, { at: at(15.2, 7.6), size: 5.8, h: 4.5, marking: '220' });
  diodeSma(group, { at: at(21.0, 4.2), marking: 'SS34' });
  trimpot3296w(group, { at: at(24.0, 10.8), marking: '103' });
  chipPassive(group, { at: at(31.0, 8.0), code: '1206', kind: 'C', rot: Math.PI / 2 });
  chipPassive(group, { at: at(12.0, 12.4), code: '0603', kind: 'R', marking: '222' });
};

/* ================================================================== TP4056 charger */

/**
 * Blue TP4056 charger with protection: USB-C socket at the west end, TP4056 (ESOP-8), DW01A and the FS8205A dual
 * MOSFET, the red charging and blue done LEDs, the 1.2 k charge-current resistor and the four pads at the east end.
 */
export const buildTp4056: PartBuilder = ({ group }) => {
  const g = TP4056_MODULE;
  const board = moduleBoard(group, g, {
    draw: (p) => {
      p.pour(9.5, 1.0, 13, 15);
      p.trace([[24.5, 6.6], [19.5, 6.6]], 1.0, 0.25);
      p.trace([[24.5, 2.4], [19.0, 2.4]], 1.0, 0.25);
      p.trace([[4.0, 8.5], [9.0, 8.5]], 0.8, 0.25);
      p.silkText('TP4056', 13.0, 1.4, 0.8);
      p.silkText('CHRG', 4.2, 15.3, 0.6);
      p.silkText('STDBY', 8.6, 15.3, 0.6);
    },
  });
  tinnedPads(group, g, board);
  const at = board.at;
  usbC(group, { at: at(3.7, 8.5), rot: Math.PI / 2, overhangMm: 1.0 });
  soic(group, { at: at(11.5, 8.5), pins: 8, marking: ['TP4056', '2410'], rot: Math.PI / 2 });
  sot23(group, { at: at(17.0, 12.0), leads: 6, marking: ['DW01A'] });
  tssop(group, { at: at(17.0, 5.6), pins: 8, marking: ['8205A'], rot: Math.PI / 2 });
  ledSmd(group, { at: at(4.2, 13.8), code: '0603', color: 0xff2a1a, glow: 0.12 });
  ledSmd(group, { at: at(8.6, 13.8), code: '0603', color: 0x3a6dff, glow: 0.05 });
  chipPassive(group, { at: at(9.0, 3.0), code: '0603', kind: 'R', marking: '122' });
  chipPassive(group, { at: at(14.0, 14.6), code: '0603', kind: 'C' });
  chipPassive(group, { at: at(20.2, 9.0), code: '0603', kind: 'C', rot: Math.PI / 2 });
};

/* ================================================================== AMS1117-3.3 module */

/** Blue AMS1117-3.3 board: SOT-223 regulator, two tantalum caps, the power LED, 3-pin header south. */
export const buildAms1117: PartBuilder = ({ group }) => {
  const g = AMS1117_MODULE;
  const board = moduleBoard(group, g, {
    draw: (p) => {
      p.trace([[8.46, 14.3], [8.46, 10.0], [7.0, 8.0]], 0.8, 0.25);
      p.trace([[13.54, 14.3], [13.54, 10.0], [15.0, 8.0]], 0.8, 0.25);
      p.silkText('AMS1117-3.3', 11.0, 1.4, 0.8);
    },
  });
  const at = board.at;
  sot223(group, { at: at(11.0, 6.4), marking: ['AMS1117', '3.3 2324'] });
  tantalum(group, { at: at(4.2, 9.0), rot: Math.PI / 2, marking: '107A' });
  tantalum(group, { at: at(17.8, 9.0), rot: Math.PI / 2, marking: '107A' });
  ledSmd(group, { at: at(4.0, 13.6), code: '0603', color: 0xff2a1a, glow: 0.12 });
  chipPassive(group, { at: at(17.8, 13.6), code: '0603', kind: 'R', marking: '102' });
};

/* ================================================================== 4 x AA holder */

/**
 * Open black 4 x AA holder with four NiMH cells (alternating), the coil springs on the negative ends and the flat
 * contacts on the positive ends, red and black leads leaving the south end with tinned tips.
 */
export const buildBattery4aa: PartBuilder = ({ group }) => {
  const { w, d, h } = BATTERY_4AA;
  const tray = plastic(0x141416, 0.62);
  const wall = 1.2;
  group.add(box(w * MM, 1.4 * MM, d * MM, tray, 0, 0.7 * MM, 0, 0.6 * MM));
  for (const sx of [-1, 1]) group.add(box(wall * MM, h * MM, d * MM, tray, sx * (w / 2 - wall / 2) * MM, (h / 2) * MM, 0, 0.4 * MM));
  for (const sz of [-1, 1]) group.add(box(w * MM, h * MM, 2.4 * MM, tray, 0, (h / 2) * MM, sz * (d / 2 - 1.2) * MM, 0.4 * MM));
  // ribs between the cells, lower than the walls
  for (let i = 1; i < 4; i += 1) group.add(box(0.9 * MM, 6.0 * MM, (d - 12) * MM, tray, (-w / 2 + wall + i * ((w - 2 * wall) / 4)) * MM, 3.0 * MM, 0));
  const cellR = 7.25;
  const pitch = (w - 2 * wall) / 4;
  const wrapMat = new THREE.MeshPhysicalMaterial({ map: cellWrapTexture(), roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  for (let i = 0; i < 4; i += 1) {
    const x = (-w / 2 + wall + pitch * (i + 0.5)) * MM;
    const yC = (1.4 + cellR) * MM;
    // alternate cells point their + end north and south; each cell is built with + toward -z, then turned
    const cell = new THREE.Group();
    cell.position.set(x, yC, 0);
    if (i % 2 === 1) cell.rotation.y = Math.PI;
    group.add(cell);
    cell.add(cylAlong('z', cellR * MM, 48.5 * MM, wrapMat, 0, 0, 0, 40));
    for (const e of [-1, 1]) cell.add(cylAlong('z', (cellR - 0.4) * MM, 0.6 * MM, PBR.steel(), 0, 0, e * 24.55 * MM, 32));
    cell.add(cylAlong('z', 2.6 * MM, 1.2 * MM, PBR.steel(), 0, 0, -25.45 * MM, 24));
    // the holder's contacts: flat plate against the + nub, a conical spring squashed against the - end
    cell.add(box(8.0 * MM, 9.0 * MM, 0.4 * MM, PBR.nickel(), 0, 0, -(d / 2 - 2.6) * MM));
    const coilPts: THREE.Vector3[] = [];
    for (let k = 0; k <= 72; k += 1) {
      const t = k / 72;
      const a = t * Math.PI * 2 * 3;
      const r = (4.6 - t * 2.4) * MM;
      coilPts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, (d / 2 - 2.4 - t * 1.4) * MM));
    }
    const coil = new THREE.CatmullRomCurve3(coilPts);
    cell.add(new THREE.Mesh(new THREE.TubeGeometry(coil, 120, 0.35 * MM, 6, false), PBR.steel()));
  }
  // leads from the south wall to tinned ends
  for (const pos of [true, false]) {
    const [tx, ty, tz] = battery4aaPinTip(pos);
    const x0 = (pos ? -1 : 1) * 2.0 * MM;
    group.add(leadTube([v3(x0, 4.0 * MM, (d / 2 - 1.5) * MM), v3(x0, 4.0 * MM, (d / 2 + 3) * MM), v3(tx, ty, tz - 6 * MM), v3(tx, ty, tz - 3.5 * MM)], 0.75 * MM, siliconeJacket(pos ? 0xc8231e : 0x1a1a1c), 3 * MM));
    group.add(cylAlong('z', 0.4 * MM, 3.5 * MM, PBR.tin(), tx, ty, tz - 1.75 * MM, 8));
  }
  sideLabel(group, ['4 x AA   6V'], 26, 5, 0, (h * 0.55) * MM, (d / 2) * MM + 0.002, 1, { color: 'rgba(200,202,206,0.7)' });
};

/* ================================================================== rocker switch in a printed holder */

/**
 * KCD1 rocker switch snapped into a printed holder block: black bezel and rocker (pressed to "I", on) with its
 * printed I / O marks, the two 4.8 mm quick-connect tabs coming out of the slot in the south face.
 */
export const buildRockerSwitch: PartBuilder = ({ group }) => {
  const { blockW, blockD, blockH } = ROCKER;
  const pla = new THREE.MeshStandardMaterial({ color: 0x3b4048, roughness: 0.7, map: printedLayers() });
  const plaFlat = plastic(0x3b4048, 0.7);
  // the block with the rectangular opening for the switch, drawn as an outline extruded upward
  const outline = new THREE.Shape();
  roundedRectPath(outline, -blockW / 2, -blockD / 2, blockW, blockD, 1.5);
  const hole = new THREE.Path();
  roundedRectPath(hole, -10.5, -7.5, 21, 15, 0.6);
  outline.holes.push(hole);
  const shell = extrudeMm(outline, blockH - 2, 0.4);
  shell.rotateX(-Math.PI / 2);
  const shellMesh = new THREE.Mesh(shell, pla);
  shellMesh.position.y = 2 * MM;
  shellMesh.castShadow = true;
  shellMesh.receiveShadow = true;
  group.add(shellMesh);
  group.add(box(blockW * MM, 2 * MM, blockD * MM, plaFlat, 0, 1 * MM, 0, 0.8 * MM));
  // the switch: body inside, bezel flange on top, the rocker tilted to "I"
  const black = plastic(0x151618, 0.45, 0.25);
  group.add(box(19.8 * MM, (blockH - 2.5) * MM, 13.8 * MM, plastic(0x111113, 0.6), 0, ((blockH - 2.5) / 2 + 2) * MM, 0));
  group.add(box(21 * MM, 1.6 * MM, 15 * MM, black, 0, (blockH + 0.8) * MM, 0, 0.5 * MM));
  const rocker = box(17 * MM, 3.0 * MM, 11 * MM, plastic(0x1a1b1e, 0.35, 0.3), 0, (blockH + 2.2) * MM, 0, 1.2 * MM);
  rocker.rotation.z = -0.16;
  group.add(rocker);
  const markTex = labelTexture(['O            I'], { wPx: 512, hPx: 128, color: 'rgba(240,240,240,0.92)', weight: 800 });
  const marks = new THREE.Mesh(new THREE.PlaneGeometry(14 * MM, 3.5 * MM), new THREE.MeshStandardMaterial({ map: markTex, transparent: true, depthWrite: false }));
  marks.rotation.x = -Math.PI / 2;
  marks.position.set(0, 1.51 * MM, 0);
  rocker.add(marks);
  // the slot in the south face and the two quick-connect tabs
  group.add(box(14 * MM, 5 * MM, 0.3 * MM, plastic(0x0b0b0c, 0.8), 0, 6 * MM, (blockD / 2 + 0.25) * MM));
  for (const i of [0, 1]) {
    const [tx, ty, tz] = rockerPinTip(i);
    const tab = box(4.8 * MM, 0.5 * MM, 9.5 * MM, PBR.brass(), tx, ty, tz - 4.75 * MM);
    group.add(tab);
    const holeMesh = new THREE.Mesh(new THREE.CircleGeometry(0.8 * MM, 16), plastic(0x0b0b0c, 0.8));
    holeMesh.rotation.x = -Math.PI / 2;
    holeMesh.position.set(tx, ty + 0.26 * MM, tz - 3.0 * MM);
    group.add(holeMesh);
  }
};
