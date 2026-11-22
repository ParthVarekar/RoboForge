import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ESP32_DEVKIT, HEADER_PITCH_MM } from '../../catalog/boardGeometry';
import type { BoardPainter } from '../kit/boardArt';
import { addHeaderPins } from '../kit/headers';
import { chipPassive, diodeSma, ledSmd, microUsb, qfn, shieldCan, sot223, sot23, tactSmd } from '../kit/packages';
import { PBR } from '../kit/pbr';
import { buildPcb, MM } from '../kit/pcb';
import type { PartBuilder } from './types';

type Pt = readonly [number, number];

/* ================================================================== ESP32 DevKit V1 (DOIT, 30 pins) */

/**
 * ESP-WROOM-32 module (Espressif datasheet): 18 x 25.5 x 3.1 mm, 0.8 mm module PCB, 38 castellated pads at 1.27 mm
 * (14 down each side, 10 along the bottom), PCB antenna at the top, shield can over the rest.
 */
const WROOM = { w: 18, d: 25.5, t: 0.8, pitch: 1.27, side: 14, bottom: 10, canW: 15.9, canD: 17.6, canH: 2.3 };
/** Module position on the DevKit in board mm (x from the left edge, y from the antenna end). */
const MOD_X0 = (ESP32_DEVKIT.wMm - WROOM.w) / 2;
const MOD_Y0 = 0.2;

const wroomSidePadY = (k: number) => WROOM.d - WROOM.pitch * (WROOM.side - k);
const wroomBottomPadX = (k: number) => (WROOM.w - (WROOM.bottom - 1) * WROOM.pitch) / 2 + k * WROOM.pitch;

function drawWroomModule(p: BoardPainter): void {
  // ground plane under the can, then the meandered inverted-F antenna in the keep-out at the top
  p.pour(0.9, 6.9, WROOM.w - 1.8, 18);
  const ant: Pt[] = [
    [3.2, 6.3],
    [3.2, 1.0],
  ];
  for (let i = 0; i < 6; i += 1) {
    const x = 4.6 + i * 2.0;
    const down = i % 2 === 0;
    ant.push([x - 1.4, down ? 1.0 : 4.8], [x, down ? 1.0 : 4.8], [x, down ? 4.8 : 1.0]);
  }
  ant.push([16.8, 1.0]);
  p.trace(ant, 0.45);
  p.trace(
    [
      [2.0, 6.3],
      [2.0, 3.0],
      [3.2, 3.0],
    ],
    0.45,
  );
  // castellated pads: half-holes on the module edges with their gold land
  for (let k = 0; k < WROOM.side; k += 1) {
    const y = wroomSidePadY(k);
    for (const x of [0, WROOM.w]) {
      p.pad(x === 0 ? 0.45 : WROOM.w - 0.45, y, 0.9, 0.85, { finish: 'gold' });
      p.ring(x, y, 0.9, 0.5, { finish: 'gold' });
    }
  }
  for (let k = 0; k < WROOM.bottom; k += 1) {
    const x = wroomBottomPadX(k);
    p.pad(x, WROOM.d - 0.45, 0.85, 0.9, { finish: 'gold' });
    p.ring(x, WROOM.d, 0.9, 0.5, { finish: 'gold' });
  }
}

/** Deterministic pseudo-random numbers, so procedural artwork is identical on every load. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function drawEsp32Board(p: BoardPainter): void {
  const g = ESP32_DEVKIT;
  const W = g.wMm;
  const D = g.dMm;
  const rowL = (W - g.rowSpacingMm) / 2;
  const rowR = (W + g.rowSpacingMm) / 2;
  const pinY = (i: number) => g.firstPinFromNorthMm + i * HEADER_PITCH_MM;
  const clr = 0.22;

  // Ground pour over the board, leaving the keep-out under the module antenna bare (it reads darker on real boards).
  p.pour(0.6, MOD_Y0 + 7.4, W - 1.2, D - MOD_Y0 - 8.0);

  // Power path: USB VBUS -> SS14 -> VIN rail -> AMS1117 -> 3V3 rail (wide traces), USB data to the CP2102.
  p.trace([[2.3, pinY(14)], [7.6, pinY(14)], [8.4, 40.3]], 0.9, clr);
  p.trace([[6.4, pinY(14)], [6.4, 37.2], [7.3, 36.3], [7.3, 35.4]], 0.7, clr);
  p.trace([[12.8, 39.6], [13.4, 40.2], [13.4, 45.6]], 0.8, clr);
  p.trace([[11.1, 29.6], [12.6, 28.9], [22.6, 28.9], [22.8, 29.2], [22.8, 39.6], [24.3, pinY(14)], [26.0, pinY(14)]], 0.6, clr);
  p.trace([[14.0, 46.6], [14.0, 41.2], [16.9, 38.4], [16.9, 36.1]], 0.2, 0.2);
  p.trace([[14.7, 46.6], [14.7, 41.5], [17.6, 38.7], [17.6, 36.1]], 0.2, 0.2);
  // CP2102 TXD/RXD to the module, auto-reset transistors to EN/BOOT
  p.trace([[19.0, 30.9], [19.0, 27.6], [19.9, 26.7]], 0.2, 0.2);
  p.trace([[19.7, 30.9], [19.7, 28.0], [20.6, 27.1]], 0.2, 0.2);
  p.trace([[19.4, 46.0], [19.4, 43.4], [20.3, 42.6]], 0.25, 0.2);
  p.trace([[8.7, 46.0], [8.7, 44.0], [7.6, 43.0]], 0.25, 0.2);
  p.trace([[21.6, 36.3], [21.6, 31.5], [21.1, 30.9]], 0.25, 0.2);

  // Stitching vias where the pour shows between parts.
  const vias: Pt[] = [
    [5.8, 28.2], [7.8, 28.2], [21.4, 27.0], [5.7, 31.5], [5.7, 33.6], [14.2, 39.7], [19.0, 40.3], [12.2, 45.4],
    [4.2, 44.4], [24.3, 44.4], [3.0, 50.2], [25.3, 50.2], [8.4, 50.6], [19.9, 50.6], [10.0, 37.4], [20.0, 34.6],
  ];
  const rnd = lcg(32);
  for (let i = 0; i < 6; i += 1) vias.push([5.8 + rnd() * 3, 49.6 + rnd() * 1.2]);
  for (const [x, y] of vias) p.via(x, y, 0.6);

  // Header lands (HASL): plated through-holes under the spacers, square pad for pin 1.
  for (let i = 0; i < g.pinsPerSide; i += 1) {
    p.ring(rowL, pinY(i), 1.75, 1.02, { finish: 'tin', square: i === 0 });
    p.ring(rowR, pinY(i), 1.75, 1.02, { finish: 'tin' });
  }
  // Land pads for the module's castellations (visible as tinned tabs beside the module).
  for (let k = 0; k < WROOM.side; k += 1) {
    const y = MOD_Y0 + wroomSidePadY(k);
    p.pad(MOD_X0, y, 0.95, 0.75, { finish: 'tin' });
    p.pad(MOD_X0 + WROOM.w, y, 0.95, 0.75, { finish: 'tin' });
  }
  for (let k = 0; k < WROOM.bottom; k += 1) p.pad(MOD_X0 + wroomBottomPadX(k), MOD_Y0 + WROOM.d, 0.75, 0.95, { finish: 'tin' });

  // Silkscreen: pin names beside each header, button names, board name.
  g.left.forEach((name, i) => p.silkText(name, rowL + 1.4, pinY(i), 0.9, { align: 'left' }));
  g.right.forEach((name, i) => p.silkText(name, rowR - 1.4, pinY(i), 0.9, { align: 'right' }));
  p.silkText('EN', 6.3, 44.6, 1.05);
  p.silkText('BOOT', 22.0, 44.6, 1.05);
  p.silkText('ESP32 DEVKIT V1', W / 2, 27.6, 1.1);
  p.silkLine([[16.4, 44.2], [18.8, 44.2]], 0.12);
}

export const buildEsp32Devkit: PartBuilder = ({ group, spec }) => {
  const g = ESP32_DEVKIT;
  const board = buildPcb({
    key: 'esp32-devkit-v1',
    wMm: g.wMm,
    dMm: g.dMm,
    cornerMm: 1.0,
    mask: '#16181d',
    yBottom: g.boardBottomMm * MM,
    clearcoat: 0.6,
    draw: drawEsp32Board,
  });
  group.add(board.mesh);
  const at = board.at;

  // ---- ESP-WROOM-32 module
  const modCentre = at(MOD_X0 + WROOM.w / 2, MOD_Y0 + WROOM.d / 2);
  const mod = buildPcb({ key: 'esp-wroom-32', wMm: WROOM.w, dMm: WROOM.d, thicknessMm: WROOM.t, cornerMm: 0.3, mask: '#1c2230', yBottom: board.top, clearcoat: 0.45, draw: drawWroomModule });
  mod.mesh.position.x = modCentre.x;
  mod.mesh.position.z = modCentre.z;
  group.add(mod.mesh);

  // castellation plating on the module edges and the solder fillets onto the DevKit pads
  const plating: THREE.BufferGeometry[] = [];
  const fillets: THREE.BufferGeometry[] = [];
  const addCastellation = (xMm: number, yMm: number, normal: 'w' | 'e' | 's') => {
    const c = at(xMm, yMm);
    const along = normal === 's' ? 'x' : 'z';
    const pl = new THREE.BoxGeometry(along === 'x' ? 0.75 * MM : 0.08 * MM, WROOM.t * MM, along === 'z' ? 0.75 * MM : 0.08 * MM);
    pl.translate(c.x, board.top + (WROOM.t / 2) * MM, c.z);
    plating.push(pl);
    const out = 0.32 * MM;
    const f = new THREE.BoxGeometry(along === 'x' ? 0.72 * MM : 0.64 * MM, 0.26 * MM, along === 'z' ? 0.72 * MM : 0.64 * MM);
    const dx = normal === 'w' ? -out : normal === 'e' ? out : 0;
    const dz = normal === 's' ? out : 0;
    f.translate(c.x + dx, board.top + 0.13 * MM, c.z + dz);
    fillets.push(f);
  };
  for (let k = 0; k < WROOM.side; k += 1) {
    const y = MOD_Y0 + wroomSidePadY(k);
    addCastellation(MOD_X0, y, 'w');
    addCastellation(MOD_X0 + WROOM.w, y, 'e');
  }
  for (let k = 0; k < WROOM.bottom; k += 1) addCastellation(MOD_X0 + wroomBottomPadX(k), MOD_Y0 + WROOM.d, 's');
  const platingMesh = new THREE.Mesh(mergeGeometries(plating), PBR.gold());
  const filletMesh = new THREE.Mesh(mergeGeometries(fillets), PBR.solder());
  plating.forEach((x) => x.dispose());
  fillets.forEach((x) => x.dispose());
  group.add(platingMesh, filletMesh);

  shieldCan(group, {
    at: at(MOD_X0 + WROOM.w / 2, MOD_Y0 + 7.1 + WROOM.canD / 2).setY(mod.top),
    w: WROOM.canW,
    d: WROOM.canD,
    h: WROOM.canH,
    lines: ['ESPRESSIF', 'ESP-WROOM-32', 'FCC ID:2AC7Z-ESPWROOM32', '211-161007'],
    sizes: [74, 66, 34, 34],
  });

  // ---- support chips (positions from the DOIT V1 layout)
  qfn(group, { at: at(17.6, 33.4), size: 5, pins: 28, marking: ['SILABS', 'CP2102', 'DCL00X'] });
  sot223(group, { at: at(9.6, 32.4), rot: -Math.PI / 2, marking: ['AMS1117', '3.3  1826'] });
  diodeSma(group, { at: at(10.6, 39.6), marking: 'SS14' });
  sot23(group, { at: at(20.9, 37.6), marking: ['J3Y'] });
  sot23(group, { at: at(20.9, 41.4), marking: ['J3Y'] });

  // decoupling, pull-ups and LED resistors
  chipPassive(group, { at: at(6.6, 37.4), rot: Math.PI / 2, code: '0805', kind: 'C' });
  chipPassive(group, { at: at(13.4, 37.4), rot: Math.PI / 2, code: '0805', kind: 'C' });
  chipPassive(group, { at: at(14.0, 29.6), code: '0603', kind: 'C' });
  chipPassive(group, { at: at(16.2, 29.6), code: '0603', kind: 'C' });
  chipPassive(group, { at: at(19.6, 29.6), code: '0603', kind: 'C' });
  chipPassive(group, { at: at(15.4, 38.0), code: '0603', kind: 'R', marking: '220' });
  chipPassive(group, { at: at(18.8, 38.0), code: '0603', kind: 'R', marking: '103' });
  chipPassive(group, { at: at(6.6, 43.0), code: '0603', kind: 'R', marking: '103' });
  chipPassive(group, { at: at(12.6, 42.9), code: '0603', kind: 'R', marking: '102' });
  chipPassive(group, { at: at(15.6, 42.9), code: '0603', kind: 'R', marking: '102' });

  // red power LED and the blue LED on GPIO2 (glows with the pin)
  ledSmd(group, { at: at(10.6, 42.9), code: '0805', color: 0xff2a1a, glow: 0.12 });
  const blue = ledSmd(group, { at: at(17.6, 42.9), code: '0805', color: 0x2f6bff, glow: 0.1 });

  // EN / BOOT buttons and the Micro-USB port overhanging the end of the board
  tactSmd(group, { at: at(6.3, 47.2) });
  tactSmd(group, { at: at(22.0, 47.2) });
  microUsb(group, { at: at(g.wMm / 2, g.dMm - 2.5), rot: Math.PI, overhangMm: 0.6 });

  // ---- 2 x 15 male headers (pins up, trimmed ends and solder joints under the board)
  addHeaderPins(group, {
    tips: spec.pins.map((pin) => pin.localPos),
    boardTop: board.top,
    boardBottom: board.bottom,
  });

  return { ledMaterial: blue };
};
