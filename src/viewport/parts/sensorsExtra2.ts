import * as THREE from 'three';
import { BME280_MODULE, PIR_HCSR501, VL53L0X_MODULE, pirPinTip } from '../../catalog/moduleGeometry';
import { chipPassive, soic, sot23 } from '../kit/packages';
import { PBR, plastic } from '../kit/pbr';
import { buildPcb, MM } from '../kit/pcb';
import { trimpot3362 } from '../kit/thruhole';
import { moduleBoard } from './moduleKit';
import { box, cyl } from './shapes';
import type { PartBuilder } from './types';

/* ================================================================== GY-BME280 (4-pin) */

/** Purple GY-BME280: the 2.5 mm BME280 under its metal lid with the vent hole, I2C pull-ups and decoupling. */
export const buildBme280: PartBuilder = ({ group }) => {
  const g = BME280_MODULE;
  const board = moduleBoard(group, g, {
    labelMm: 0.75,
    draw: (p) => {
      p.trace([[4.48, 11.5], [4.48, 8.6], [4.0, 7.6]], 0.25, 0.2);
      p.trace([[7.02, 11.5], [7.02, 8.6], [7.8, 7.6]], 0.25, 0.2);
    },
  });
  const at = board.at;
  const s = at(4.2, 6.6);
  group.add(box(2.5 * MM, 0.93 * MM, 2.5 * MM, PBR.nickel(), s.x, board.top + 0.465 * MM, s.z, 0.08 * MM));
  const vent = new THREE.Mesh(new THREE.CircleGeometry(0.22 * MM, 16), plastic(0x0b0b0c, 0.9));
  vent.rotation.x = -Math.PI / 2;
  vent.position.set(s.x + 0.65 * MM, board.top + 0.935 * MM, s.z - 0.65 * MM);
  group.add(vent);
  chipPassive(group, { at: at(8.2, 5.4), code: '0402', kind: 'R', marking: '' });
  chipPassive(group, { at: at(8.2, 6.6), code: '0402', kind: 'R', marking: '' });
  chipPassive(group, { at: at(8.2, 7.8), code: '0402', kind: 'C' });
  chipPassive(group, { at: at(2.0, 6.6), code: '0402', kind: 'C', rot: Math.PI / 2 });
};

/* ================================================================== GY-VL53L0XV2 */

/**
 * Purple VL53L0X board: the sensor (black package with its two glass windows, the orange protective film still on),
 * the 2.8 V regulator, two level-shift MOSFETs and their pull-ups.
 */
export const buildVl53l0x: PartBuilder = ({ group }) => {
  const g = VL53L0X_MODULE;
  const board = moduleBoard(group, g, {
    labelMm: 0.7,
    draw: (p) => {
      p.pour(5.0, 0.6, 15.0, 4.2);
      p.silkText('VL53L0X', 2.6, 10.0, 0.55);
    },
  });
  const at = board.at;
  const s = at(12.5, 2.6);
  group.add(box(4.4 * MM, 1.0 * MM, 2.4 * MM, PBR.icEpoxy(), s.x, board.top + 0.5 * MM, s.z, 0.08 * MM));
  for (const dx of [-1.0, 1.0]) {
    const win = new THREE.Mesh(new THREE.CircleGeometry(0.45 * MM, 20), PBR.lensGlass());
    win.rotation.x = -Math.PI / 2;
    win.position.set(s.x + dx * MM, board.top + 1.005 * MM, s.z);
    group.add(win);
  }
  // protective film with its pull tab
  group.add(box(5.0 * MM, 0.05 * MM, 3.0 * MM, PBR.kapton(), s.x, board.top + 1.03 * MM, s.z));
  group.add(box(2.4 * MM, 0.05 * MM, 1.8 * MM, PBR.kapton(), s.x + 3.4 * MM, board.top + 1.03 * MM, s.z));
  sot23(group, { at: at(22.2, 7.6), leads: 5, marking: ['2.8'] });
  sot23(group, { at: at(3.2, 7.4), marking: ['702'] });
  for (const [x, y] of [[8.6, 2.6], [16.4, 2.6], [17.2, 5.6], [8.0, 5.6]] as const) chipPassive(group, { at: at(x, y), code: '0402', kind: x > 16 ? 'R' : 'C', rot: Math.PI / 2 });
};

/* ================================================================== HC-SR501 PIR */

/**
 * HC-SR501: green board under the milky Fresnel dome on its square frame; underneath, the BISS0001, the time and
 * sensitivity trimmers, the trigger jumper, the regulator, and the three pins (a right-angle header pointing south).
 * It stands on two nylon spacers in its mounting holes.
 */
export const buildPirHcsr501: PartBuilder = ({ group }) => {
  const g = PIR_HCSR501;
  const holes = [
    { x: 2.4, y: g.dMm / 2, d: 2.2 },
    { x: g.wMm - 2.4, y: g.dMm / 2, d: 2.2 },
  ];
  const board = buildPcb({
    key: 'hcsr501',
    wMm: g.wMm,
    dMm: g.dMm,
    cornerMm: 1.0,
    mask: '#1a7a3a',
    yBottom: g.boardBottomMm * MM,
    holes,
    draw: (p) => {
      for (const h of holes) p.ring(h.x, h.y, h.d + 1.4, h.d, { finish: 'tin' });
      p.silkRect(g.wMm / 2 - 12.2, g.dMm / 2 - 12.0, 24.4, 24.0, 0.15);
    },
  });
  group.add(board.mesh);
  const top = board.top;
  // lens frame and the Fresnel dome (stepped rings, milky white)
  const milky = new THREE.MeshPhysicalMaterial({ color: 0xf6f5f0, roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.4, side: THREE.DoubleSide });
  group.add(box(24 * MM, 1.6 * MM, 23.6 * MM, milky, 0, top + 0.8 * MM, 0, 0.6 * MM));
  const R = g.domeD / 2;
  const H = g.domeH;
  const pts: THREE.Vector2[] = [];
  const steps = 14;
  for (let k = 0; k <= steps; k += 1) {
    const t = (k / steps) * (Math.PI / 2);
    const r = R * Math.cos(t);
    const y = H * Math.sin(t);
    // each Fresnel zone is a small step: out a little, then up
    pts.push(new THREE.Vector2(r * MM, y * MM));
    if (k < steps) pts.push(new THREE.Vector2((r - 0.55) * MM, (y + 0.3) * MM));
  }
  pts.push(new THREE.Vector2(0, H * MM));
  const dome = new THREE.Mesh(new THREE.LatheGeometry(pts, 72), milky);
  dome.position.y = top + 1.6 * MM;
  dome.castShadow = true;
  group.add(dome);

  // underneath: parts mounted upside down on the board's underside
  const under = new THREE.Group();
  under.position.y = board.bottom;
  under.rotation.x = Math.PI;
  group.add(under);
  const u = (bx: number, by: number) => new THREE.Vector3((bx - g.wMm / 2) * MM, 0, -(by - g.dMm / 2) * MM);
  soic(under, { at: u(15.0, 11.0), pins: 16, marking: ['BISS0001'] });
  trimpot3362(under, { at: u(25.4, 6.4), color: 0xe8862a });
  trimpot3362(under, { at: u(25.4, 16.8), color: 0xe8862a });
  sot23(under, { at: u(8.0, 5.0), marking: ['7133'] });
  for (const [x, y] of [[11.0, 4.6], [19.0, 4.6], [11.0, 17.6], [19.0, 17.6], [8.0, 8.0]] as const) chipPassive(under, { at: u(x, y), code: '0805', kind: 'C' });
  // the H / L trigger jumper: 3 pins, the shunt on two of them
  const j = u(7.0, 14.0);
  under.add(box(2.5 * MM, 2.5 * MM, 7.62 * MM, PBR.headerPlastic(), j.x, 1.25 * MM, j.z, 0.2 * MM));
  under.add(box(2.4 * MM, 4.4 * MM, 4.9 * MM, plastic(0x1b1b1d, 0.55), j.x, 4.7 * MM, j.z - 1.27 * MM, 0.3 * MM));
  under.add(box(0.64 * MM, 3.0 * MM, 0.64 * MM, PBR.gold(), j.x, 3.4 * MM, j.z + 2.54 * MM));
  // right-angle header at the south edge: plastic under the board, pins out to the south
  const hz = (g.dMm / 2 - 1.6) * MM;
  group.add(box(7.62 * MM, 2.5 * MM, 2.5 * MM, PBR.headerPlastic(), 0, board.bottom - 1.25 * MM, hz, 0.2 * MM));
  for (let i = 0; i < 3; i += 1) {
    const [tx, ty, tz] = pirPinTip(i);
    group.add(box(0.64 * MM, board.bottom - ty + 0.3 * MM, 0.64 * MM, PBR.gold(), tx, (board.bottom + ty) / 2, hz));
    group.add(box(0.64 * MM, 0.64 * MM, tz - hz - 0.3 * MM, PBR.gold(), tx, ty, (hz + tz - 0.3 * MM) / 2));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.46 * MM, 0.6 * MM, 4), PBR.gold());
    tip.rotation.x = Math.PI / 2;
    tip.rotation.y = Math.PI / 4;
    tip.position.set(tx, ty, tz - 0.3 * MM);
    group.add(tip);
  }
  // two nylon hex spacers under the mounting holes, with the screw heads on top
  for (const h of holes) {
    const x = (h.x - g.wMm / 2) * MM;
    group.add(cyl(2.3 * MM, board.bottom, plastic(0xece8dc, 0.55), x, board.bottom / 2, 0, 6));
    group.add(cyl(1.9 * MM, 1.2 * MM, PBR.steel(), x, top + 0.6 * MM, 0, 24));
    group.add(box(2.6 * MM, 0.2 * MM, 0.5 * MM, PBR.steelDark(), x, top + 1.25 * MM, 0));
  }
};
