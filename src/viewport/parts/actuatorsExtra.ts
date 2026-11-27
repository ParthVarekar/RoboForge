import * as THREE from 'three';
import { HEADER_PITCH_MM } from '../../catalog/boardGeometry';
import { MG996R, N20, SG90, ULN2003_BOARD, type ServoGeom } from '../../catalog/moduleGeometry';
import { leadTube, v3 } from '../kit/leads';
import { chipPassive, ledSmd } from '../kit/packages';
import { PBR, plastic, siliconeJacket } from '../kit/pbr';
import { MM } from '../kit/pcb';
import { dip, jstXh } from '../kit/thruhole';
import { moduleBoard } from './moduleKit';
import { box, cyl, sideLabel } from './shapes';
import type { PartBuilder } from './types';

/* ================================================================== hobby servos */

/**
 * A hobby servo standing on its base, output shaft up: case in three shells with their seams, mounting tabs with
 * their holes, the output boss and spline with a single-arm horn, the maker's sticker on the side, and the lead
 * running east as a brown / red / orange ribbon into its 3-pin connector with a header adapter.
 */
function buildServo(g: ServoGeom, model: string, sticker: string[]): PartBuilder {
  return ({ group }) => {
    const L = g.bodyL * MM;
    const W = g.bodyW * MM;
    const H = g.caseH * MM;
    const shell = plastic(g.color, g.color === 0x2a62c9 ? 0.35 : 0.45, g.color === 0x2a62c9 ? 0.35 : 0.15);
    // three shells: bottom cover, middle (motor) section, top (gear) cover, with dark seams between them
    const cuts = [0, 0.18, 0.82, 1];
    for (let i = 0; i < 3; i += 1) {
      const y0 = cuts[i]! * H;
      const y1 = cuts[i + 1]! * H;
      group.add(box(L, y1 - y0 - 0.15 * MM, W, shell, 0, (y0 + y1) / 2, 0, 0.6 * MM));
    }
    // mounting tabs (moulded with the middle shell) with their holes and slots
    const tabY = g.tabTop * MM - (g.tabT * MM) / 2;
    const tabLen = ((g.tabSpan - g.bodyL) / 2) * MM;
    for (const sx of [-1, 1]) {
      group.add(box(tabLen + 0.6 * MM, g.tabT * MM, W, shell, sx * (L / 2 + tabLen / 2 - 0.3 * MM), tabY, 0, 0.4 * MM));
      const hole = cyl(1.0 * MM, g.tabT * MM + 0.02, plastic(0x0a0a0b, 0.9), sx * (L / 2 + tabLen * 0.55), tabY, 0, 20);
      group.add(hole);
    }
    // the gear cover's output boss, the spline and the horn
    const shaftX = -L / 2 + g.shaftFromEnd * MM;
    group.add(cyl((g.bossD / 2) * MM, g.bossH * MM, shell, shaftX, H + (g.bossH / 2) * MM, 0, 48));
    group.add(cyl(((g.bossD / 2) * 0.45) * MM, 1.0 * MM, shell, shaftX + (g.bossD * 0.55) * MM, H + 0.5 * MM, 0, 32));
    const spline = g === MG996R ? PBR.brass() : plastic(0xf2f2ee, 0.5);
    group.add(cyl(2.4 * MM, 3.0 * MM, spline, shaftX, H + (g.bossH + 1.5) * MM, 0, 24));
    const hornTop = H + (g.bossH + 3.0) * MM;
    const horn = plastic(0xf5f5f0, 0.45);
    group.add(cyl(3.6 * MM, 4.0 * MM, horn, shaftX, hornTop + 2.0 * MM, 0, 32));
    const arm = new THREE.Shape();
    arm.moveTo(0, -2.6);
    arm.lineTo(g.hornLen, -1.6);
    arm.absarc(g.hornLen, 0, 1.6, -Math.PI / 2, Math.PI / 2, false);
    arm.lineTo(0, 2.6);
    arm.closePath();
    const armGeo = new THREE.ExtrudeGeometry(arm, { depth: 1.6, bevelEnabled: true, bevelSize: 0.2, bevelThickness: 0.2, curveSegments: 16 });
    armGeo.scale(MM, MM, MM);
    armGeo.rotateX(-Math.PI / 2);
    const armMesh = new THREE.Mesh(armGeo, horn);
    // the arm lies along the case, over the body, the way servos are sold
    armMesh.position.set(shaftX, hornTop + 2.4 * MM, 0);
    armMesh.castShadow = true;
    group.add(armMesh);
    const holeMat = plastic(0x1c1c1e, 0.8);
    for (let i = 1; i <= 5; i += 1) {
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.42 * MM, 14), holeMat);
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(shaftX + ((2.6 + ((g.hornLen - 2.6) * i) / 5.4) * MM), hornTop + 4.21 * MM, 0);
      group.add(hole);
    }
    group.add(cyl(1.0 * MM, 0.4 * MM, PBR.steelDark(), shaftX, hornTop + 4.2 * MM, 0, 16));
    // the maker's sticker on the north face
    sideLabel(group, sticker, g.bodyL * 0.8, g.caseH * 0.36, 0, H * 0.48, -W / 2 - 0.0015, -1, { bg: 'rgba(244,244,240,0.96)' });

    // the lead: three conductors leaving the east end low down, dropping to the bench and running to the connector
    const tipX = g.pinTipX * MM;
    const housingL = 14 * MM;
    const housingEnd = tipX - 6.3 * MM;
    const housingStart = housingEnd - 2.5 * MM - housingL;
    const colors = [0x6b3f22, 0xc62d2d, 0xe8892a];
    colors.forEach((c, i) => {
      const z = (i - 1) * 0.95 * MM;
      const pts = [v3(L / 2 - 0.5 * MM, 3.5 * MM, z), v3(L / 2 + 4 * MM, 3.0 * MM, z), v3(L / 2 + 8 * MM, 0.6 * MM, z), v3(housingStart - 4 * MM, 0.6 * MM, z * 1.6), v3(housingStart + 0.5 * MM, 1.25 * MM, (i - 1) * HEADER_PITCH_MM * MM)];
      group.add(leadTube(pts, 0.48 * MM, siliconeJacket(c), 2.2 * MM, 10));
    });
    // female housing (black) with the header adapter: black spacer, three pins sticking out east
    group.add(box(housingL, 2.6 * MM, 7.8 * MM, PBR.headerPlastic(), housingStart + housingL / 2, 1.3 * MM, 0, 0.25 * MM));
    group.add(box(2.5 * MM, 2.5 * MM, 7.62 * MM, PBR.headerPlastic(), housingEnd - 1.25 * MM, 1.4 * MM, 0, 0.2 * MM));
    for (let i = 0; i < 3; i += 1) {
      const z = (i - 1) * HEADER_PITCH_MM * MM;
      group.add(box(6.3 * MM + 2.5 * MM, 0.64 * MM, 0.64 * MM, PBR.gold(), housingEnd - 2.5 * MM + (6.3 + 2.5) * MM / 2, 1.4 * MM, z));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.46 * MM, 0.6 * MM, 4), PBR.gold());
      tip.rotation.z = -Math.PI / 2;
      tip.rotation.x = Math.PI / 4;
      tip.position.set(tipX - 0.3 * MM, 1.4 * MM, z);
      group.add(tip);
    }
    void model;
  };
}

export const buildServoSg90 = buildServo(SG90, 'SG90', ['SG90  9g', 'MICRO SERVO']);
export const buildServoMg996r = buildServo(MG996R, 'MG996R', ['MG996R', 'HIGH TORQUE', 'METAL GEAR']);

/* ================================================================== N20 micro gearmotor */

/**
 * N20 gearmotor lying on its side: flattened steel can with the black end cap and its two solder tabs (east), the
 * brass gear stages between two plates (west) and the 3 mm D-shaft.
 */
export const buildN20: PartBuilder = ({ group }) => {
  const w = N20.w * MM;
  const h = N20.h * MM;
  const y = h / 2;
  // motor can: a cylinder with two flats (12 x 10 mm section)
  const can = new THREE.CylinderGeometry(6 * MM, 6 * MM, N20.motorL * MM, 40);
  can.rotateZ(Math.PI / 2);
  const canMesh = new THREE.Mesh(can, PBR.steel());
  canMesh.scale.set(1, h / w, 1);
  canMesh.position.set((N20.motorL / 2 - 1.5) * MM, y, 0);
  canMesh.castShadow = true;
  group.add(canMesh);
  group.add(box(1.6 * MM, h * 0.96, w * 0.96, plastic(0x18191b, 0.6), (N20.motorL - 1.2) * MM, y, 0, 0.3 * MM));
  for (const sz of [-1, 1]) group.add(box(1.4 * MM, 3.0 * MM, 1.2 * MM, PBR.brass(), (N20.motorL - 0.6) * MM, y, sz * 2.5 * MM));
  // gearbox: two plates and the gears between them
  const gx = -(N20.gearL / 2 + 1.5) * MM;
  for (const dx of [-N20.gearL / 2 + 0.4, N20.gearL / 2 - 0.4]) group.add(box(0.8 * MM, h, w, PBR.brass(), gx + dx * MM, y, 0, 0.2 * MM));
  for (let i = 0; i < 4; i += 1) {
    const gear = cyl((4.2 - i * 0.6) * MM, 1.1 * MM, PBR.brass(), gx + (-3 + i * 2) * MM, y + (i % 2 ? 1.2 : -1.0) * MM, 0, 18);
    gear.rotation.z = Math.PI / 2;
    group.add(gear);
  }
  for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const post = cyl(0.5 * MM, N20.gearL * MM, PBR.steel(), gx, y + sy * 3.6 * MM, sz * 4.6 * MM, 12);
    post.rotation.z = Math.PI / 2;
    group.add(post);
  }
  const shaft = cyl(1.5 * MM, N20.shaftL * MM, PBR.steel(), gx - ((N20.gearL + N20.shaftL) / 2) * MM, y, 0, 20);
  shaft.rotation.z = Math.PI / 2;
  group.add(shaft);
};

/* ================================================================== 28BYJ-48 stepper on its ULN2003 board */

/**
 * The ULN2003 driver board (DIP-16 Darlington array, four phase LEDs, 5-pin JST XH socket, IN1-IN4 and power headers
 * with the on/off jumper) with the 28BYJ-48 lying north of it, its five-colour lead plugged into the socket.
 */
export const buildStepper28byj48: PartBuilder = ({ group }) => {
  const g = ULN2003_BOARD;
  const board = moduleBoard(group, g, {
    draw: (p) => {
      p.silkText('ULN2003', 17.5, 25.0, 1.4);
      ['A', 'B', 'C', 'D'].forEach((n, i) => p.silkText(n, 27 + i * 2.0, 13.0, 0.9));
      p.trace([[2.6, 11.2], [9.0, 11.2], [9.0, 14.0]], 0.3);
      p.trace([[2.6, 18.8], [9.0, 18.8], [9.0, 16.0]], 0.3);
      p.pour(24, 2, 9, 7);
    },
  });
  const at = board.at;
  dip(group, { at: at(15.5, 16.0), pins: 16, marking: ['ULN2003APG'] });
  for (let i = 0; i < 4; i += 1) {
    ledSmd(group, { at: at(27 + i * 2.0, 10.8), color: 0xff2a2a, glow: 0.05 });
    chipPassive(group, { at: at(27 + i * 2.0, 7.6), code: '0805', kind: 'R', marking: '102', rot: Math.PI / 2 });
  }
  jstXh(group, { at: at(17.5, 3.6), pins: 5, plug: true });
  // the power jumper beside the + / - header
  const jAt = at(28.0, 29.6);
  group.add(box(5.08 * MM, 2.5 * MM, 2.5 * MM, PBR.headerPlastic(), jAt.x, board.top + 1.25 * MM, jAt.z, 0.2 * MM));
  group.add(box(4.9 * MM, 6.0 * MM, 2.4 * MM, plastic(0x1b1b1d, 0.55), jAt.x, board.top + 5.4 * MM, jAt.z, 0.3 * MM));

  // the motor: 28 mm steel can with its two ears, the blue cap where the wires leave, the shaft (eccentric, up)
  const mz = at(17.5, -28).z;
  const mx = at(17.5, 0).x;
  const canH = 19 * MM;
  group.add(cyl(14 * MM, canH, PBR.steel(), mx, canH / 2, mz, 64));
  group.add(cyl(14.2 * MM, 0.6 * MM, PBR.steel(), mx, canH - 0.3 * MM, mz, 64));
  const ears = new THREE.Shape();
  ears.moveTo(-21, -3.5);
  ears.lineTo(21, -3.5);
  ears.absarc(21, 0, 3.5, -Math.PI / 2, Math.PI / 2, false);
  ears.lineTo(-21, 3.5);
  ears.absarc(-21, 0, 3.5, Math.PI / 2, (3 * Math.PI) / 2, false);
  for (const sx of [-1, 1]) {
    const hole = new THREE.Path();
    hole.absarc(sx * 17.5, 0, 2.1, 0, Math.PI * 2, true);
    ears.holes.push(hole);
  }
  const earGeo = new THREE.ExtrudeGeometry(ears, { depth: 0.8, bevelEnabled: false, curveSegments: 20 });
  earGeo.scale(MM, MM, MM);
  earGeo.rotateX(-Math.PI / 2);
  const earMesh = new THREE.Mesh(earGeo, PBR.steel());
  earMesh.position.set(mx, canH, mz);
  earMesh.castShadow = true;
  group.add(earMesh);
  group.add(cyl(4.5 * MM, 1.5 * MM, PBR.steel(), mx, canH + 0.75 * MM, mz - 8 * MM, 32));
  const shaft = cyl(2.5 * MM, 6 * MM, PBR.brass(), mx, canH + 4.5 * MM, mz - 8 * MM, 24);
  group.add(shaft);
  group.add(box(5 * MM, 0.05, 3 * MM, PBR.brass(), mx, canH + 6.0 * MM, mz - 8 * MM));
  const cap = box(17 * MM, 9 * MM, 8 * MM, plastic(0x2a62c9, 0.4, 0.2), mx, 4.5 * MM, mz + 15 * MM, 1.5 * MM);
  group.add(cap);
  // five-colour lead from the cap into the JST plug
  // (they leave the top of the cap and arch over into the back of the plug)
  const plugBack = at(17.5, 3.6).z - 6.0 * MM;
  const plugY = board.top + 3.8 * MM;
  [0x2a62c9, 0xe0b0c0, 0xe8d23a, 0xe8892a, 0xc62d2d].forEach((c, i) => {
    const x = mx + (i - 2) * 1.0 * MM;
    const xe = mx + (i - 2) * 2.5 * MM;
    group.add(
      leadTube(
        [v3(x, 6.5 * MM, mz + 18.5 * MM), v3(x, 9.5 * MM, mz + 20.5 * MM), v3((x + xe) / 2, 10.5 * MM, (mz + 19 * MM + plugBack) / 2 + 1.5 * MM), v3(xe, plugY + 1.0 * MM, plugBack - 1.2 * MM), v3(xe, plugY, plugBack + 0.6 * MM)],
        0.45 * MM,
        siliconeJacket(c),
        1.5 * MM,
        8,
      ),
    );
  });
};
