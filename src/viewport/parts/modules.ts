import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  DRV8833_HW627,
  ESP32_CAM,
  GY521,
  HCSR04,
  HCSR04_BACK_Z_MM,
  HEADER_PITCH_MM,
  HEADER_TIP_ABOVE_BOARD_MM,
  OLED_096,
  PCB_T_MM,
} from '../../catalog/boardGeometry';
import type { PartSpec } from '../../catalog/partsCatalog';
import type { BoardPainter } from '../kit/boardArt';
import { addHeaderPins } from '../kit/headers';
import { chipPassive, crystalHc49s, ledSmd, qfn, shieldCan, soic, sot23, tssop } from '../kit/packages';
import { PBR, plastic } from '../kit/pbr';
import { buildPcb, MM } from '../kit/pcb';
import { paintOledCanvas } from '../materials';
import type { PartBuilder } from './types';

type Pt = readonly [number, number];

/** Tips of the part's upright header pins (pins with a direction or soldered leads are drawn by the part itself). */
function uprightTips(spec: PartSpec): Array<readonly [number, number, number]> {
  return spec.pins.filter((p) => p.contact !== 'lead' && !p.dir).map((p) => p.localPos);
}

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, r = 0): THREE.Mesh {
  const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/* ================================================================== DRV8833 (HW-627) */

function drawDrv8833(p: BoardPainter): void {
  const g = DRV8833_HW627;
  const xIn = (g.wMm - g.rowSpacingMm) / 2;
  const xOut = (g.wMm + g.rowSpacingMm) / 2;
  const py = (i: number) => g.firstPinFromNorthMm + i * HEADER_PITCH_MM;
  const cx = g.wMm / 2;
  const cy = 8.6;
  const chipY = (row: number) => cy + (row - 3.5) * 0.65;

  // land pattern of the HTSSOP-16 (pins 1-8 face the output row, 9-16 the input row)
  for (let r = 0; r < 8; r += 1) {
    p.pad(cx - 3.0, chipY(r), 1.2, 0.36, { finish: 'tin' });
    p.pad(cx + 3.0, chipY(r), 1.2, 0.36, { finish: 'tin' });
  }
  // east: chip row -> header index (nSLEEP, AOUT1, AOUT2, BOUT2, BOUT1, nFAULT); west: AIN1, AIN2, VM, GND, BIN1, BIN2
  const east: Array<[number, number, number, boolean]> = [
    [0, 0, 0.25, false],
    [1, 1, 0.6, false],
    [3, 2, 0.6, false],
    [4, 4, 0.6, false],
    [6, 3, 0.6, true],
    [7, 5, 0.25, false],
  ];
  const west: Array<[number, number, number, boolean]> = [
    [0, 5, 0.25, false],
    [1, 4, 0.25, false],
    [4, 3, 0.7, false],
    [3, 2, 0.7, false],
    [7, 1, 0.25, true],
    [6, 0, 0.25, true],
  ];
  for (const [row, hdr, w, via] of east) {
    const a: Pt = [cx + 3.5, chipY(row)];
    if (via) {
      p.trace([a, [cx + 4.3, chipY(row)]], w, 0.2);
      p.via(cx + 4.3, chipY(row));
      p.via(xOut - 2.2, py(hdr));
      p.trace([[xOut - 2.2, py(hdr)], [xOut - 0.9, py(hdr)]], w, 0.2);
    } else {
      p.trace([a, [cx + 4.4, chipY(row)], [xOut - 2.3, py(hdr)], [xOut - 0.9, py(hdr)]], w, 0.2);
    }
  }
  for (const [row, hdr, w, via] of west) {
    const a: Pt = [cx - 3.5, chipY(row)];
    if (via) {
      p.trace([a, [cx - 4.3, chipY(row)]], w, 0.2);
      p.via(cx - 4.3, chipY(row));
      p.via(xIn + 2.2, py(hdr));
      p.trace([[xIn + 2.2, py(hdr)], [xIn + 0.9, py(hdr)]], w, 0.2);
    } else {
      p.trace([a, [cx - 4.4, chipY(row)], [xIn + 2.3, py(hdr)], [xIn + 0.9, py(hdr)]], w, 0.2);
    }
  }
  p.trace([[6.4, 13.4], [6.4, 11.6], [cx - 3.5, chipY(4)]], 0.5, 0.2);
  for (const [x, y] of [[9.25, 12.0], [11.4, 4.2], [7.0, 4.2], [12.4, 12.4]] as const) p.via(x, y);

  for (let i = 0; i < 6; i += 1) {
    p.ring(xIn, py(i), 1.75, 1.02, { finish: 'tin' });
    p.ring(xOut, py(i), 1.75, 1.02, { finish: 'tin', square: i === 0 });
  }
  g.inputs.forEach((n, i) => p.silkText(n, xIn + 1.35, py(i), 0.85, { align: 'left' }));
  g.outputs.forEach((n, i) => p.silkText(n, xOut - 1.35, py(i), 0.85, { align: 'right' }));
  p.silkText('DRV8833', cx, 4.25, 0.9);
}

export const buildDrv8833: PartBuilder = ({ group, spec }) => {
  const g = DRV8833_HW627;
  const board = buildPcb({ key: 'drv8833-hw627', wMm: g.wMm, dMm: g.dMm, cornerMm: 0.5, mask: '#b3141f', yBottom: g.boardBottomMm * MM, draw: drawDrv8833 });
  group.add(board.mesh);
  const at = board.at;
  tssop(group, { at: at(g.wMm / 2, 8.6), pins: 16, marking: ['DRV8833', 'TI 8AT', 'G4'] });
  chipPassive(group, { at: at(6.4, 14.0), code: '0805', kind: 'C' });
  chipPassive(group, { at: at(9.25, 14.0), code: '0603', kind: 'C' });
  chipPassive(group, { at: at(12.0, 14.0), code: '0603', kind: 'C' });
  chipPassive(group, { at: at(10.6, 2.1), code: '0603', kind: 'R', marking: '102' });
  ledSmd(group, { at: at(7.8, 2.1), code: '0603', color: 0xff2a1a, glow: 0.12 });
  addHeaderPins(group, { tips: uprightTips(spec), boardTop: board.top, boardBottom: board.bottom });
};

/* ================================================================== MPU-6050 (GY-521) */

function drawGy521(p: BoardPainter): void {
  const g = GY521;
  const px = (i: number) => g.wMm / 2 + (i - (g.pins.length - 1) / 2) * HEADER_PITCH_MM;
  const cx = g.wMm / 2;
  const cy = 7.6;
  p.pour(0.5, 0.5, g.wMm - 1, g.dMm - 1);
  // I2C and aux lines from the header up to the QFN, power to the LDO
  for (let i = 2; i < 8; i += 1) {
    p.trace([[px(i), g.pinRowFromNorthMm - 0.9], [px(i), 11.7], [cx + (i - 4.5) * 0.55, cy + 2.2]], 0.22, 0.2);
  }
  p.trace([[px(0), g.pinRowFromNorthMm - 0.9], [px(0), 11.4], [5.0, 9.8]], 0.5, 0.22);
  p.trace([[5.0, 7.0], [5.0, 5.6], [cx - 1.6, 5.6]], 0.4, 0.22);
  for (const [x, y] of [[3.4, 7.0], [7.0, 3.6], [15.6, 11.0], [12.6, 4.4], [16.2, 9.8], [3.0, 12.6]] as const) p.via(x, y);
  for (const h of g.holes) p.ring(h.x, h.y, h.d + 1.2, h.d, { finish: 'tin' });
  for (let i = 0; i < g.pins.length; i += 1) p.ring(px(i), g.pinRowFromNorthMm, 1.75, 1.02, { finish: 'tin', square: i === 0 });
  g.pins.forEach((n, i) => p.silkText(n, px(i), 12.6, 0.9));
  p.silkText('GY-521', cx - 0.4, 2.5, 1.4);
  // axis legend as printed on the board
  const o: Pt = [14.3, 5.6];
  p.silkLine([o, [16.5, 5.6]], 0.15);
  p.silkLine([[16.0, 5.25], [16.5, 5.6], [16.0, 5.95]], 0.15);
  p.silkLine([o, [14.3, 3.4]], 0.15);
  p.silkLine([[13.95, 3.9], [14.3, 3.4], [14.65, 3.9]], 0.15);
  p.silkText('X', 17.1, 5.6, 0.9);
  p.silkText('Y', 14.3, 2.75, 0.9);
}

export const buildMpu6050: PartBuilder = ({ group, spec }) => {
  const g = GY521;
  const board = buildPcb({
    key: 'gy521',
    wMm: g.wMm,
    dMm: g.dMm,
    cornerMm: 0.6,
    mask: '#1f56b8',
    yBottom: g.boardBottomMm * MM,
    holes: g.holes,
    draw: drawGy521,
  });
  group.add(board.mesh);
  const at = board.at;
  qfn(group, { at: at(g.wMm / 2, 7.6), size: 4, pins: 24, marking: ['MPU-6050', 'C T1K413', 'D2134'] });
  sot23(group, { at: at(5.0, 8.4), rot: Math.PI / 2, marking: ['662K'] });
  chipPassive(group, { at: at(8.1, 11.0), code: '0603', kind: 'R', marking: '472' });
  chipPassive(group, { at: at(13.1, 11.0), code: '0603', kind: 'R', marking: '472' });
  chipPassive(group, { at: at(17.6, 9.9), code: '0603', kind: 'R', marking: '102' });
  chipPassive(group, { at: at(3.2, 10.6), rot: Math.PI / 2, code: '0603', kind: 'C' });
  chipPassive(group, { at: at(7.4, 4.4), code: '0603', kind: 'C' });
  chipPassive(group, { at: at(13.6, 8.6), rot: Math.PI / 2, code: '0603', kind: 'C' });
  chipPassive(group, { at: at(10.6, 10.6), code: '0603', kind: 'C' });
  ledSmd(group, { at: at(17.6, 7.7), code: '0603', color: 0xff2a1a, glow: 0.12 });
  addHeaderPins(group, { tips: uprightTips(spec), boardTop: board.top, boardBottom: board.bottom });
};

/* ================================================================== 0.96" SSD1306 OLED */

function drawOled(p: BoardPainter): void {
  const g = OLED_096;
  const px = (i: number) => g.wMm / 2 + (i - (g.pins.length - 1) / 2) * HEADER_PITCH_MM;
  for (const h of g.holes) p.ring(h.x, h.y, h.d + 1.4, h.d, { finish: 'tin' });
  for (let i = 0; i < g.pins.length; i += 1) p.ring(px(i), g.pinRowFromNorthMm, 1.75, 1.02, { finish: 'tin', square: i === 0 });
  g.pins.forEach((n, i) => p.silkText(n, px(i), 3.55, 0.95));
  // traces from the header into the FPC landing hidden under the glass
  for (let i = 0; i < 4; i += 1) p.trace([[px(i), 2.5], [px(i), 4.4]], 0.3);
  p.pad(g.wMm / 2, 25.9, 12.6, 1.6, { finish: 'gold' });
}

export const buildOled: PartBuilder = ({ group, spec }) => {
  const g = OLED_096;
  const board = buildPcb({ key: 'oled-096', wMm: g.wMm, dMm: g.dMm, cornerMm: 0.6, mask: '#1d4f9e', yBottom: g.boardBottomMm * MM, holes: g.holes, draw: drawOled });
  group.add(board.mesh);
  const at = board.at;
  const gl = g.glass;
  const top = board.top;
  const tape = 0.15 * MM;
  const subT = 0.7 * MM;
  const coverT = 0.65 * MM;
  const coverD = 15.4;
  const glassCentre = at(g.wMm / 2, gl.yTop + gl.d / 2);

  // white foam tape under the panel (shows as a thin light line), bottom substrate, then the cover glass
  group.add(box((gl.w - 1.2) * MM, tape, (gl.d - 1.2) * MM, plastic(0xe9e9e4, 0.9), glassCentre.x, top + tape / 2, glassCentre.z));
  const glassMat = PBR.glassBlack();
  group.add(box(gl.w * MM, subT, gl.d * MM, glassMat, glassCentre.x, top + tape + subT / 2, glassCentre.z, 0.1 * MM));
  const coverCentre = at(g.wMm / 2, gl.yTop + coverD / 2);
  group.add(box(gl.w * MM, coverT, coverD * MM, glassMat, coverCentre.x, top + tape + subT + coverT / 2, coverCentre.z, 0.1 * MM));
  // driver IC bonded on the glass ledge and the FPC leaving it
  const ledgeTop = top + tape + subT;
  const ic = at(g.wMm / 2, gl.yTop + coverD + 1.3);
  group.add(box(15 * MM, 0.3 * MM, 1.0 * MM, PBR.icEpoxy(), ic.x, ledgeTop + 0.15 * MM, ic.z));
  const kapton = PBR.kapton();
  const fpcW = 12 * MM;
  const ledgeStart = gl.yTop + coverD + 2.3;
  const glassEnd = gl.yTop + gl.d;
  const a = at(g.wMm / 2, (ledgeStart + glassEnd) / 2);
  group.add(box(fpcW, 0.08 * MM, (glassEnd - ledgeStart) * MM, kapton, a.x, ledgeTop + 0.04 * MM, a.z));
  // the flex curls 180 degrees round the glass's bottom edge and runs back under the panel to its solder pads
  const curlR = (subT + tape) / 2 + 0.06 * MM;
  // theta -90..90 deg is the half facing +z (south), z = r cos(theta)
  const curl = new THREE.Mesh(new THREE.CylinderGeometry(curlR, curlR, fpcW, 20, 1, true, -Math.PI / 2, Math.PI), kapton);
  curl.rotation.z = Math.PI / 2;
  curl.position.set(a.x, top + curlR - 0.02 * MM, (glassEnd - g.dMm / 2) * MM);
  group.add(curl);

  // the lit dot matrix under the cover glass (live text from oled.println)
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  paintOledCanvas(canvas, [], true);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.3, roughness: 0.06, metalness: 0 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(gl.activeW * MM, gl.activeD * MM), screenMat);
  screen.rotation.x = -Math.PI / 2;
  const aa = at(g.wMm / 2, gl.yTop + 2.0 + gl.activeD / 2);
  screen.position.set(aa.x, top + tape + subT + coverT + 0.002, aa.z);
  group.add(screen);

  addHeaderPins(group, { tips: uprightTips(spec), boardTop: board.top, boardBottom: board.bottom });
  return { oledCanvas: canvas, oledTexture: tex };
};

/* ================================================================== ESP32-CAM (AI-Thinker) */

function drawEsp32Cam(p: BoardPainter): void {
  const g = ESP32_CAM;
  const xL = (g.wMm - g.rowSpacingMm) / 2;
  const xR = (g.wMm + g.rowSpacingMm) / 2;
  const py = (i: number) => g.dMm - g.lastPinFromSouthMm - i * HEADER_PITCH_MM;
  // PCB antenna in the keep-out at the north end
  const ant: Pt[] = [[6.0, 5.6], [6.0, 1.0]];
  for (let i = 0; i < 7; i += 1) {
    const x = 7.6 + i * 2.0;
    const down = i % 2 === 0;
    ant.push([x - 1.6, down ? 1.0 : 4.6], [x, down ? 1.0 : 4.6], [x, down ? 4.6 : 1.0]);
  }
  ant.push([21.6, 1.0]);
  p.trace(ant, 0.45);
  p.pour(0.6, 6.2, g.wMm - 1.2, g.dMm - 6.8);
  for (let i = 0; i < 8; i += 1) {
    p.ring(xL, py(i), 1.75, 1.02, { finish: 'tin', square: i === 0 });
    p.ring(xR, py(i), 1.75, 1.02, { finish: 'tin' });
  }
  for (let i = 0; i < 8; i += 1) p.trace([[xL + 0.9, py(i)], [5.6, py(i)]], 0.25, 0.2);
  for (const [x, y] of [[5.9, 22.0], [21.4, 22.0], [22.6, 30.0], [4.6, 30.4], [12.0, 25.9], [16.0, 25.9]] as const) p.via(x, y);
  p.silkRect(6.0, 21.8, 15.0, 3.9, 0.12);
  p.silkText('ESP32-CAM', 22.75, 13.8, 1.0, { rot: -Math.PI / 2 });
}

export const buildEsp32Cam: PartBuilder = ({ group, spec }) => {
  const g = ESP32_CAM;
  const board = buildPcb({ key: 'esp32-cam', wMm: g.wMm, dMm: g.dMm, cornerMm: 0.8, mask: '#141518', yBottom: g.boardBottomMm * MM, clearcoat: 0.6, draw: drawEsp32Cam });
  group.add(board.mesh);
  const at = board.at;
  const top = board.top;

  // ESP32 + flash + PSRAM under one can, U.FL antenna socket beside the PCB antenna
  shieldCan(group, { at: at(g.wMm / 2, 6.6 + 7.4), w: 16.0, d: 14.8, h: 2.2, lines: ['Ai-Thinker', 'ESP32-S'], sizes: [62, 104] });
  const ufl = at(23.0, 7.2);
  const uflBase = box(2.6 * MM, 0.5 * MM, 2.6 * MM, plastic(0xece8dd, 0.5), ufl.x, top + 0.25 * MM, ufl.z);
  group.add(uflBase);
  const uflPost = new THREE.Mesh(new THREE.CylinderGeometry(1.0 * MM, 1.0 * MM, 0.75 * MM, 20), PBR.gold());
  uflPost.position.set(ufl.x, top + 0.85 * MM, ufl.z);
  group.add(uflPost);

  // 24-pin 0.5 mm FPC connector with the camera ribbon folded back over the can
  const con = at(g.wMm / 2, 23.75);
  group.add(box(14.4 * MM, 1.2 * MM, 3.4 * MM, plastic(0x1a1a1b, 0.55), con.x, top + 0.6 * MM, con.z, 0.15 * MM));
  group.add(box(14.0 * MM, 0.5 * MM, 1.2 * MM, plastic(0x3a2a1c, 0.5), con.x, top + 1.45 * MM, con.z + 1.0 * MM));
  const kapton = PBR.kapton();
  const canTop = top + 2.2 * MM;
  const fpcW = 8.4 * MM;
  const f1 = at(g.wMm / 2, 19.0);
  group.add(box(fpcW, 0.1 * MM, 4.8 * MM, kapton, f1.x, canTop + 0.05 * MM, f1.z));
  const fold = new THREE.Mesh(new THREE.CylinderGeometry(0.55 * MM, 0.55 * MM, fpcW, 16, 1, true, -Math.PI / 2, Math.PI), kapton);
  fold.rotation.z = Math.PI / 2;
  fold.position.set(f1.x, (canTop + top + 1.2 * MM) / 2 + 0.3 * MM, at(0, 21.75).z);
  group.add(fold);

  // OV2640 camera module resting on the can: square holder, threaded barrel, glass lens
  const cam = at(g.wMm / 2, 12.2);
  group.add(box(8.5 * MM, 1.0 * MM, 8.5 * MM, plastic(0x1c1d20, 0.55), cam.x, canTop + 0.5 * MM, cam.z, 0.3 * MM));
  group.add(box(8.0 * MM, 3.2 * MM, 8.0 * MM, plastic(0x101012, 0.6), cam.x, canTop + 2.6 * MM, cam.z, 0.6 * MM));
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(3.3 * MM, 3.4 * MM, 2.2 * MM, 32), plastic(0x0d0d0f, 0.42));
  barrel.position.set(cam.x, canTop + 5.3 * MM, cam.z);
  barrel.castShadow = true;
  group.add(barrel);
  const lens = new THREE.Mesh(new THREE.SphereGeometry(2.2 * MM, 28, 12, 0, Math.PI * 2, 0, Math.PI / 3.2), PBR.lensGlass());
  lens.position.set(cam.x, canTop + 5.3 * MM, cam.z);
  group.add(lens);

  // white flash LED (yellow phosphor), microSD push-push socket at the south end
  ledSmd(group, { at: at(4.6, 26.5), rot: Math.PI / 2, code: '1206', color: 0xffe9a8, glow: 0.05 });
  const sd = at(g.wMm / 2, 33.2);
  group.add(box(14.2 * MM, 1.8 * MM, 15.0 * MM, PBR.nickel(), sd.x, top + 0.9 * MM, sd.z, 0.2 * MM));
  group.add(box(11.4 * MM, 0.9 * MM, 0.3 * MM, plastic(0x0a0a0b, 0.7), sd.x, top + 0.75 * MM, sd.z + 7.45 * MM));
  for (const dx of [-4.0, 4.0]) {
    const dimple = new THREE.Mesh(new THREE.SphereGeometry(0.9 * MM, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), PBR.nickel());
    dimple.scale.y = 0.25;
    dimple.position.set(sd.x + dx * MM, top + 1.8 * MM, sd.z - 2.0 * MM);
    group.add(dimple);
  }
  for (const [x, y, k] of [[22.4, 23.2, 'C'], [22.4, 24.6, 'R'], [5.6, 23.4, 'C'], [22.4, 26.2, 'C']] as const) {
    chipPassive(group, { at: at(x, y), code: '0402', kind: k });
  }
  addHeaderPins(group, { tips: uprightTips(spec), boardTop: board.top, boardBottom: board.bottom });
};

/* ================================================================== HC-SR04 */

let meshTex: THREE.CanvasTexture | null = null;

/** Woven metal screen over the transducer face. */
function transducerMeshTexture(): THREE.CanvasTexture {
  if (meshTex) return meshTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#9a9ea4';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#26282c';
    for (let y = 0; y < 256; y += 8) for (let x = 0; x < 256; x += 8) ctx.fillRect(x + 2, y + 2, 5, 5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 5);
  t.anisotropy = 8;
  t.userData.shared = true;
  meshTex = t;
  return t;
}

/** One 16 mm ultrasonic transducer standing on the board's face (local +Y is out of the board). */
function transducer(parent: THREE.Group, at: THREE.Vector3): void {
  const r = (HCSR04.canDMm / 2) * MM;
  const h = HCSR04.canHMm * MM;
  const sub = new THREE.Group();
  sub.position.copy(at);
  parent.add(sub);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.95, r * 0.95, 1.0 * MM, 40), plastic(0x18191b, 0.7));
  base.position.y = 0.5 * MM;
  sub.add(base);
  const side = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h - 1.0 * MM, 48, 1, true), PBR.aluminiumBrushed());
  side.position.y = 1.0 * MM + (h - 1.0 * MM) / 2;
  side.castShadow = true;
  sub.add(side);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(r - 0.35 * MM, 0.35 * MM, 10, 48), PBR.aluminium());
  lip.rotation.x = Math.PI / 2;
  lip.position.y = h - 0.35 * MM;
  sub.add(lip);
  const recess = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.6 * MM, r - 0.6 * MM, 0.5 * MM, 40, 1, true), plastic(0x0c0c0d, 0.8));
  recess.position.y = h - 0.5 * MM;
  sub.add(recess);
  const screen = new THREE.Mesh(
    new THREE.CircleGeometry(r - 0.6 * MM, 40),
    new THREE.MeshStandardMaterial({ map: transducerMeshTexture(), metalness: 0.7, roughness: 0.45 }),
  );
  screen.rotation.x = -Math.PI / 2;
  screen.position.y = h - 0.7 * MM;
  sub.add(screen);
}

function drawHcsr04(p: BoardPainter): void {
  const px = (i: number) => HCSR04.wMm / 2 + (i - 1.5) * HEADER_PITCH_MM;
  const rowY = HCSR04.hMm - HCSR04.pinRowHeightMm;
  for (const [x, y] of [[1.6, 1.6], [43.4, 1.6], [1.6, 18.4], [43.4, 18.4]] as const) p.ring(x, y, 2.9, 1.6, { finish: 'tin' });
  for (let i = 0; i < 4; i += 1) p.ring(px(i), rowY, 1.75, 1.02, { finish: 'tin', square: i === 0 });
  // transducer pads, crystal pads and the few front-side tracks
  for (const cx of [9.5, 35.5]) for (const dy of [-1.3, 1.3]) p.ring(cx + 4.2, 10 + dy, 1.6, 0.8, { finish: 'tin' });
  for (const dx of [-2.44, 2.44]) p.ring(22.5 + dx, 2.75, 1.5, 0.7, { finish: 'tin' });
  p.trace([[13.7, 11.3], [16.4, 11.3], [18.4, 13.6], [px(0), 13.6], [px(0), rowY - 0.9]], 0.4, 0.2);
  p.trace([[31.3, 11.3], [28.6, 11.3], [26.6, 13.6], [px(3), 13.6], [px(3), rowY - 0.9]], 0.4, 0.2);
  p.trace([[px(1), rowY - 0.9], [px(1), 15.0], [21.0, 12.6], [21.0, 5.0]], 0.25, 0.2);
  p.trace([[px(2), rowY - 0.9], [px(2), 15.0], [24.0, 12.6], [24.0, 5.0]], 0.25, 0.2);
  p.silkText('HC-SR04', 22.5, 8.6, 1.5);
  p.silkText('T', 19.6, 11.6, 1.3);
  p.silkText('R', 25.4, 11.6, 1.3);
  ['Vcc', 'Trig', 'Echo', 'Gnd'].forEach((n, i) => p.silkText(n, px(i), rowY - 2.6, 0.95, { rot: -Math.PI / 2 }));
}

export const buildHcsr04: PartBuilder = ({ group }) => {
  const W = HCSR04.wMm;
  const H = HCSR04.hMm;
  // Stand the board up: its component face looks north (-Z), its art's "up" is world +Y and art +x (the viewer's
  // right when facing the sensor) is world -X.
  const board = new THREE.Group();
  board.quaternion.setFromRotationMatrix(new THREE.Matrix4().set(-1, 0, 0, 0, 0, 0, -1, 0, 0, -1, 0, 0, 0, 0, 0, 1));
  board.position.set(0, (H / 2) * MM, HCSR04_BACK_Z_MM * MM);
  group.add(board);

  const pcb = buildPcb({
    key: 'hcsr04',
    wMm: W,
    dMm: H,
    cornerMm: 0.5,
    mask: '#1b5fa8',
    yBottom: 0,
    holes: [
      { x: 1.6, y: 1.6, d: 1.6 },
      { x: 43.4, y: 1.6, d: 1.6 },
      { x: 1.6, y: 18.4, d: 1.6 },
      { x: 43.4, y: 18.4, d: 1.6 },
    ],
    draw: drawHcsr04,
  });
  board.add(pcb.mesh);
  const at = pcb.at;

  // front: transmitter (left as you face it) and receiver, the 4 MHz crystal between them
  transducer(board, at(9.5, 10));
  transducer(board, at(35.5, 10));
  crystalHc49s(board, { at: at(W / 2, 2.75), marking: '4.000' });

  // back face (local -Y): driver, op-amp and MCU, plus the header pointing out of the back
  const back = new THREE.Group();
  back.rotation.x = Math.PI;
  board.add(back);
  const onBack = (x: number, y: number) => {
    const v = at(x, y);
    return new THREE.Vector3(v.x, 0, -v.z);
  };
  soic(back, { at: onBack(12.5, 9.0), rot: Math.PI / 2, pins: 16, marking: ['MAX232', 'ESE'] });
  soic(back, { at: onBack(32.5, 9.0), rot: Math.PI / 2, pins: 14, marking: ['LM324'] });
  soic(back, { at: onBack(22.5, 7.0), pins: 8, marking: ['EM78P153S'] });
  for (const [x, y] of [[17.0, 4.0], [28.0, 4.0], [17.2, 13.0], [27.8, 13.0], [6.0, 16.0], [39.0, 16.0]] as const) {
    chipPassive(back, { at: onBack(x, y), code: '0805', kind: x < 20 ? 'C' : 'R', marking: x < 20 ? undefined : '103' });
  }
  // In the back frame +Y points out of the back face; these land exactly on hcsr04PinTip() in the part frame.
  const rowZ = -(H - HCSR04.pinRowHeightMm - H / 2) * MM;
  const tips = [0, 1, 2, 3].map((i) => [(i - 1.5) * HEADER_PITCH_MM * MM, HEADER_TIP_ABOVE_BOARD_MM * MM, rowZ] as const);
  addHeaderPins(back, { tips, boardTop: 0, boardBottom: -PCB_T_MM * MM });
};
