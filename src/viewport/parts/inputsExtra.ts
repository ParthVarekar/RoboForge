import * as THREE from 'three';
import { JOYSTICK_KY023, MAX7219_MODULE, TM1637_MODULE, potPinTip } from '../../catalog/moduleGeometry';
import { leadTube, v3 } from '../kit/leads';
import { chipPassive, electrolyticRadial } from '../kit/packages';
import { PBR, plastic } from '../kit/pbr';
import { MM } from '../kit/pcb';
import { dip, ledMatrix8, potRv09, sevenSeg4 } from '../kit/thruhole';
import { moduleBoard } from './moduleKit';
import { box, cyl, extrudeMm, roundedRectPath } from './shapes';
import type { PartBuilder } from './types';

/* ================================================================== KY-023 joystick */

/**
 * KY-023: the PS2-style thumbstick on its black board: black base with the steel bracket, the two 10 k pots on its
 * south and east faces, the gimbal dome, the stick and the concave mushroom cap.
 */
export const buildJoystick: PartBuilder = ({ group }) => {
  const g = JOYSTICK_KY023;
  const board = moduleBoard(group, g, {
    draw: (p) => {
      for (let i = 0; i < 5; i += 1) p.trace([[3.4, 7.92 + i * 2.54], [8.0, 7.92 + i * 2.54], [12.0, 9.0 + i * 2.0]], 0.3, 0.2);
      p.silkText('KY-023', 21.5, 24.6, 0.8);
    },
  });
  const c = board.at(21.5, 12.5);
  const top = board.top;
  const black = plastic(0x18191b, 0.55);
  group.add(box(16 * MM, 5 * MM, 16 * MM, black, c.x, top + 2.5 * MM, c.z, 0.5 * MM));
  // the pots: dark bodies on two faces, their steel tabs
  // the two 10 k pots: slim black bodies on the south and east faces, the shaft ends showing in their round bosses
  group.add(box(10 * MM, 7 * MM, 3.2 * MM, black, c.x - 1 * MM, top + 3.5 * MM, c.z + 9.6 * MM, 0.4 * MM));
  group.add(box(3.2 * MM, 7 * MM, 10 * MM, black, c.x + 9.6 * MM, top + 3.5 * MM, c.z - 1 * MM, 0.4 * MM));
  const bossZ = cyl(2.2 * MM, 0.8 * MM, plastic(0x2a2c30, 0.5), c.x - 1 * MM, top + 4.0 * MM, c.z + 11.5 * MM, 24);
  bossZ.rotation.x = Math.PI / 2;
  group.add(bossZ);
  const bossX = cyl(2.2 * MM, 0.8 * MM, plastic(0x2a2c30, 0.5), c.x + 11.5 * MM, top + 4.0 * MM, c.z - 1 * MM, 24);
  bossX.rotation.z = Math.PI / 2;
  group.add(bossX);
  // steel bracket with the round opening, its four legs down to the base
  const plate = new THREE.Shape();
  roundedRectPath(plate, -8.5, -8.5, 17, 17, 1.2);
  const hole = new THREE.Path();
  hole.absarc(0, 0, 6.0, 0, Math.PI * 2, true);
  plate.holes.push(hole);
  const plateGeo = extrudeMm(plate, 0.5);
  plateGeo.rotateX(-Math.PI / 2);
  const plateMesh = new THREE.Mesh(plateGeo, PBR.steel());
  plateMesh.position.set(c.x, top + 7.5 * MM, c.z);
  plateMesh.castShadow = true;
  group.add(plateMesh);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) group.add(box(1.6 * MM, 2.6 * MM, 0.4 * MM, PBR.steel(), c.x + sx * 7.6 * MM, top + 6.2 * MM, c.z + sz * 8.3 * MM));
  // gimbal dome, stick and cap
  const dome = new THREE.Mesh(new THREE.SphereGeometry(6.4 * MM, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), plastic(0x141517, 0.4, 0.2));
  dome.position.set(c.x, top + 5 * MM, c.z);
  dome.castShadow = true;
  group.add(dome);
  group.add(cyl(1.6 * MM, 8 * MM, plastic(0x141517, 0.45), c.x, top + 13.5 * MM, c.z, 20));
  const prof = [
    [0, 0],
    [2.4, 0],
    [2.8, 1.0],
    [8.4, 1.6],
    [9.0, 2.6],
    [9.0, 5.6],
    [8.5, 6.6],
    [7.4, 7.0],
    [4.0, 6.3],
    [0, 6.1],
  ].map(([r, y]) => new THREE.Vector2(r! * MM, y! * MM));
  const cap = new THREE.Mesh(new THREE.LatheGeometry(prof, 64), plastic(0x16171a, 0.6));
  cap.position.set(c.x, top + 16.5 * MM, c.z);
  cap.castShadow = true;
  group.add(cap);
  // the cap's grip ribs
  for (let i = 0; i < 30; i += 1) {
    const a = (i / 30) * Math.PI * 2;
    const rib = box(0.5 * MM, 2.8 * MM, 0.4 * MM, plastic(0x16171a, 0.6), c.x + Math.cos(a) * 9.05 * MM, top + 20.6 * MM, c.z + Math.sin(a) * 9.05 * MM);
    rib.rotation.y = -a;
    group.add(rib);
  }
};

/* ================================================================== 10 k potentiometer */

/** RV09 10 k potentiometer standing on its three legs, bent into feet toward the south. */
export const buildPot10k: PartBuilder = ({ group }) => {
  potRv09(group, { at: new THREE.Vector3(0, 0.5 * MM, 0), legMm: 2.0 });
  for (let i = 0; i < 3; i += 1) {
    const [tx, ty, tz] = potPinTip(i);
    group.add(leadTube([v3(tx, 1.4 * MM, 5.2 * MM), v3(tx, ty, 5.2 * MM), v3(tx, ty, tz)], 0.32 * MM, PBR.tin(), 0.6 * MM, 6));
  }
};

/* ================================================================== TM1637 four-digit display */

/** Blue TM1637 module: the 0.36" four-digit display with its colon, the four pins at the west end. */
export const buildTm1637: PartBuilder = ({ group }) => {
  const g = TM1637_MODULE;
  const board = moduleBoard(group, g, {
    draw: (p) => {
      for (let i = 0; i < 4; i += 1) p.trace([[3.3, 8.19 + i * 2.54], [6.5, 8.19 + i * 2.54], [8.6, 6.0 + i * 3.6]], 0.3, 0.2);
      p.silkText('4-Digit Display', 25.0, 22.6, 0.75);
    },
  });
  sevenSeg4(group, { at: board.at(25.0, 11.4) });
  chipPassive(group, { at: board.at(8.6, 2.6), code: '0805', kind: 'C' });
};

/* ================================================================== MAX7219 8 x 8 matrix */

/**
 * Blue MAX7219 matrix module: the 8 x 8 dot matrix raised on its two female sockets, the MAX7219 (DIP-24) and the
 * 10 uF capacitor under it, input header west and pass-through header east.
 */
export const buildMax7219: PartBuilder = ({ group }) => {
  const g = MAX7219_MODULE;
  const board = moduleBoard(group, g, {
    draw: (p) => {
      p.pour(9.5, 6.0, 31.0, 20.0);
      p.silkText('MAX7219', 25.0, 31.0, 0.75);
    },
  });
  const at = board.at;
  const top = board.top;
  dip(group, { at: at(25.0, 16.0), pins: 24, rot: Math.PI / 2, marking: ['MAX7219CNG', '2309 E3'] });
  electrolyticRadial(group, { at: at(13.0, 9.0), dMm: 5, hMm: 7, lines: ['10uF', '16V'], leadCm: 0 });
  chipPassive(group, { at: at(37.0, 9.0), code: '0805', kind: 'R', marking: '103' });
  // the matrix's two female sockets
  for (const y of [3.3, 28.7]) {
    const s = at(25.0, y);
    group.add(box(20.32 * MM, 8.5 * MM, 2.54 * MM, PBR.headerPlastic(), s.x, top + 4.25 * MM, s.z, 0.2 * MM));
  }
  const m = at(25.0, 16.0);
  ledMatrix8(group, { at: new THREE.Vector3(m.x, top + 8.5 * MM, m.z) });
};
