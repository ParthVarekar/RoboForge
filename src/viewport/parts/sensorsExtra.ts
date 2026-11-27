import * as THREE from 'three';
import { DHT22, GPS_NEO6M, LINE_TCRT5000 } from '../../catalog/moduleGeometry';
import { leadTube, v3 } from '../kit/leads';
import { chipPassive, ledSmd, shieldCan, soic, sot23 } from '../kit/packages';
import { PBR, plastic, siliconeJacket } from '../kit/pbr';
import { MM } from '../kit/pcb';
import { patchAntenna, trimpot3362 } from '../kit/thruhole';
import { moduleBoard } from './moduleKit';
import { box, cyl, extrudeMm, roundedRectPath, sideLabel, topLabel } from './shapes';
import type { PartBuilder } from './types';

/* ================================================================== DHT22 / AM2302 */

/**
 * DHT22 standing on its four legs, grille toward north: white case with the real open grille (you can see the
 * sensor board behind it), the mounting hole through the top, the printed back, and the tinned legs bent into feet.
 */
export const buildDht22: PartBuilder = ({ group }) => {
  const { w, h, d, legLift } = DHT22;
  const white = plastic(0xf3f1ea, 0.5, 0.1);
  const y0 = legLift * MM;
  const outline = (grille: boolean): THREE.Shape => {
    const s = new THREE.Shape();
    roundedRectPath(s, -w / 2, 0, w, h, 1.3);
    const hole = new THREE.Path();
    hole.absarc(0, h - 3.0, 1.5, 0, Math.PI * 2, true);
    s.holes.push(hole);
    if (grille) {
      const cols = 4;
      const rows = 6;
      const hw = 2.25;
      const hh = 1.95;
      const bar = 0.85;
      const gx0 = -(cols * hw + (cols - 1) * bar) / 2;
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const p = new THREE.Path();
          roundedRectPath(p, gx0 + c * (hw + bar), 2.6 + r * (hh + bar), hw, hh, 0.2);
          s.holes.push(p);
        }
      }
    }
    return s;
  };
  // grille toward the south (the side you look from on the bench), plain printed back toward the north
  const front = new THREE.Mesh(extrudeMm(outline(true), 0.6, 0.15), white);
  front.position.set(0, y0, (d / 2 - 0.75) * MM);
  front.castShadow = true;
  group.add(front);
  const back = new THREE.Mesh(extrudeMm(outline(false), d - 1.45, 0.15), white);
  back.position.set(0, y0, (-d / 2 + 0.15) * MM);
  back.castShadow = true;
  back.receiveShadow = true;
  group.add(back);
  // what you see through the grille: the sensor board and the humidity element
  group.add(box(13.6 * MM, 18.6 * MM, 0.2 * MM, plastic(0x13284a, 0.55), 0, y0 + 10.9 * MM, (d / 2 - 1.05) * MM));
  group.add(box(4.2 * MM, 5.0 * MM, 0.1 * MM, plastic(0xd9d4c4, 0.45), -1.6 * MM, y0 + 12 * MM, (d / 2 - 0.97) * MM));
  group.add(box(1.4 * MM, 1.4 * MM, 0.1 * MM, plastic(0x6b4a2e, 0.5), 3.0 * MM, y0 + 6.5 * MM, (d / 2 - 0.97) * MM));
  sideLabel(group, ['AM2302', 'DHT22'], 10, 6, 0, y0 + 12 * MM, (-d / 2 - 0.15) * MM - 0.001, -1, { color: 'rgba(120,122,126,0.8)' });
  // four legs: out of the base, down, then bent back (south) into feet resting on the bench
  for (let i = 0; i < 4; i += 1) {
    const x = (i - 1.5) * 2.54 * MM;
    group.add(leadTube([v3(x, y0 + 0.4 * MM, 0.4 * MM), v3(x, 0.4 * MM, 0.4 * MM), v3(x, 0.4 * MM, 5.5 * MM)], 0.3 * MM, PBR.tin(), 1.2 * MM, 8));
  }
};

/* ================================================================== GY-NEO6MV2 GPS */

/**
 * The GPS board (u-blox NEO-6M under its shield, AT24C32 EEPROM, backup cell, LDO, PPS LED, U.FL socket) and its
 * 25 mm ceramic patch antenna lying beside it on a foam pad, joined by the thin coax.
 */
export const buildGpsNeo6m: PartBuilder = ({ group }) => {
  const g = GPS_NEO6M;
  const board = moduleBoard(group, g, {
    draw: (p) => {
      p.pour(1, 1, g.wMm - 2, g.dMm - 6);
      for (let i = 0; i < 4; i += 1) p.trace([[8.69 + i * 2.54, 31.9], [8.69 + i * 2.54, 29.0], [10.5 + i * 1.3, 21.5]], 0.3, 0.2);
      p.trace([[12.5, 3.2], [12.5, 6.4]], 0.5, 0.25);
      // the NEO-6M's castellated pads peeking out from under it
      for (let i = 0; i < 9; i += 1) {
        p.pad(4.5, 8.2 + i * 1.1, 0.9, 0.7, { finish: 'gold' });
        p.pad(20.5, 8.2 + i * 1.1, 0.9, 0.7, { finish: 'gold' });
      }
      p.silkRect(4.2, 6.6, 16.6, 12.6, 0.15);
      p.silkText('GY-NEO6MV2', 12.5, 21.6, 1.2);
      p.silkText('PPS', 21.3, 27.0, 0.8);
      for (const [x, y] of [[3.4, 21.0], [21.6, 21.0], [8.0, 5.0], [17.0, 5.0]] as const) p.via(x, y);
    },
  });
  const at = board.at;
  shieldCan(group, { at: at(12.5, 12.9), w: 16, d: 12.2, h: 2.4, lines: ['u-blox', 'NEO-6M-0-001', '1342 3B 0123'], sizes: [62, 52, 40] });
  // U.FL socket with the coax plug clicked on
  const uf = at(12.5, 3.2);
  group.add(box(3.0 * MM, 0.9 * MM, 3.0 * MM, PBR.headerPlastic(), uf.x, board.top + 0.45 * MM, uf.z, 0.2 * MM));
  group.add(cyl(1.0 * MM, 1.1 * MM, PBR.nickel(), uf.x, board.top + 1.45 * MM, uf.z, 24));
  // MS621 backup cell, EEPROM, LDO, LED and passives
  const cell = at(6.0, 25.5);
  group.add(cyl(3.4 * MM, 2.1 * MM, PBR.steel(), cell.x, board.top + 1.25 * MM, cell.z, 40));
  topLabel(group, ['+', 'ML414'], 4.6, 3.6, cell.x, board.top + 2.31 * MM, cell.z, { color: 'rgba(70,74,80,0.85)', sizes: [70, 50] });
  for (const sx of [-1, 1]) group.add(box(1.6 * MM, 0.25 * MM, 2.4 * MM, PBR.nickel(), cell.x + sx * 3.9 * MM, board.top + 0.13 * MM, cell.z));
  soic(group, { at: at(17.2, 25.5), pins: 8, marking: ['ATMEL', '24C32'], rot: Math.PI / 2 });
  sot23(group, { at: at(12.0, 27.6), leads: 5, marking: ['662K'] });
  ledSmd(group, { at: at(21.3, 28.6), code: '0603', color: 0x2ed060, glow: 0.05 });
  chipPassive(group, { at: at(12.0, 24.6), code: '0603', kind: 'C' });
  chipPassive(group, { at: at(9.3, 21.6), code: '0603', kind: 'R', marking: '102', rot: Math.PI / 2 });
  chipPassive(group, { at: at(15.4, 29.2), code: '0603', kind: 'C' });
  chipPassive(group, { at: at(21.3, 25.6), code: '0603', kind: 'R', marking: '471', rot: Math.PI / 2 });

  // the antenna on its foam pad, east of the board, and its 1.13 mm coax looping from the U.FL plug
  const ax = (g.wMm / 2 + 2 + 12.5) * MM;
  group.add(box(23 * MM, 1.0 * MM, 23 * MM, plastic(0xe6e2d8, 0.9), ax, 0.5 * MM, 0, 0.3 * MM));
  patchAntenna(group, { at: new THREE.Vector3(ax, 1.0 * MM, 0) });
  const top = board.top;
  group.add(
    leadTube(
      [v3(uf.x, top + 2.0 * MM, uf.z), v3(uf.x + 2 * MM, top + 3.2 * MM, uf.z - 2.5 * MM), v3(ax - 15 * MM, 3.0 * MM, uf.z - 3 * MM), v3(ax - 11 * MM, 1.6 * MM, -6 * MM), v3(ax - 8 * MM, 0.6 * MM, -4 * MM)],
      0.55 * MM,
      siliconeJacket(0x2a2b2e),
      2.5 * MM,
      10,
    ),
  );
};

/* ================================================================== TCRT5000 line sensor */

/**
 * TCRT5000 module: LM393 comparator, blue threshold trimmer, power and output LEDs, and the reflective sensor
 * standing at the east end (blue emitter window, black detector window).
 */
export const buildLineTcrt5000: PartBuilder = ({ group }) => {
  const g = LINE_TCRT5000;
  const board = moduleBoard(group, g, {
    draw: (p) => {
      p.pour(9, 0.8, 22, 12.4);
      for (let i = 0; i < 4; i += 1) p.trace([[3.4, 3.19 + i * 2.54], [6.8, 3.19 + i * 2.54], [8.0, 5.0 + i * 1.27]], 0.3, 0.2);
      p.trace([[12.0, 7.0], [17.0, 7.0]], 0.3, 0.2);
      p.trace([[23.8, 5.0], [26.0, 5.0], [27.0, 4.3]], 0.3, 0.2);
      p.trace([[23.8, 9.0], [26.0, 9.0], [27.0, 9.7]], 0.3, 0.2);
      p.silkText('TCRT5000', 20.5, 1.2, 0.9);
      p.silkRect(25.0, 1.4, 6.2, 11.2, 0.15);
      for (const [x, y] of [[8.6, 1.6], [8.6, 12.4], [24.6, 7.0]] as const) p.via(x, y);
    },
  });
  const at = board.at;
  soic(group, { at: at(10.3, 7.0), pins: 8, marking: ['LM393', '24M'] });
  trimpot3362(group, { at: at(20.4, 7.0) });
  ledSmd(group, { at: at(17.8, 12.4), code: '0603', color: 0xff2a1a, glow: 0.12 });
  ledSmd(group, { at: at(23.0, 12.4), code: '0603', color: 0x2ed060, glow: 0.05 });
  chipPassive(group, { at: at(13.4, 1.7), code: '0603', kind: 'R', marking: '103' });
  chipPassive(group, { at: at(16.8, 1.7), code: '0603', kind: 'R', marking: '102' });
  chipPassive(group, { at: at(14.5, 12.4), code: '0603', kind: 'C' });
  // the TCRT5000: 10.2 x 5.8 x 7 mm black housing, its windows on top
  const s = at(28.1, 7.0);
  const lift = 1.0 * MM;
  group.add(box(5.8 * MM, 7.0 * MM, 10.2 * MM, plastic(0x141416, 0.55), s.x, board.top + lift + 3.5 * MM, s.z, 0.25 * MM));
  group.add(box(5.9 * MM, 0.4 * MM, 0.8 * MM, plastic(0x0d0d0f, 0.6), s.x, board.top + lift + 7.0 * MM, s.z));
  const domeTop = board.top + lift + 7.0 * MM;
  const emitter = new THREE.Mesh(new THREE.SphereGeometry(1.5 * MM, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x3f6fd8, roughness: 0.15, transmission: 0.2, clearcoat: 1, metalness: 0 }));
  emitter.position.set(s.x, domeTop - 0.3 * MM, s.z - 2.6 * MM);
  group.add(emitter);
  const detector = new THREE.Mesh(new THREE.SphereGeometry(1.5 * MM, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x0b0b0d, roughness: 0.12, clearcoat: 1 }));
  detector.position.set(s.x, domeTop - 0.3 * MM, s.z + 2.6 * MM);
  group.add(detector);
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) group.add(box(0.5 * MM, lift + 0.2 * MM, 0.5 * MM, PBR.tin(), s.x + sx * 1.27 * MM, board.top + lift / 2, s.z + sz * 3.8 * MM));
};
