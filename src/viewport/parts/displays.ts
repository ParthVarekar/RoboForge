import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  HEADER_PITCH_MM,
  LCD1602_I2C,
  LCD2004_I2C,
  lcdBackpackPinHeightMm,
  lcdBackpackPinYMm,
  PCB_T_MM,
  type LcdModuleGeometry,
} from '../../catalog/boardGeometry';
import { paintLcd, type DisplaySurface } from '../displayPainter';
import type { BoardPainter } from '../kit/boardArt';
import { chipPassive, ledSmd, soic } from '../kit/packages';
import { markShared, PBR, plastic } from '../kit/pbr';
import { buildPcb, MM, roundedRectShape } from '../kit/pcb';
import type { PartBuilder } from './types';

/**
 * Character LCD modules (1602 and 2004) with the PCF8574T I2C backpack, as they sit in a build: the LCD board face up
 * on four white nylon standoffs, the zinc-plated steel bezel over the glass, the backpack soldered under the 16-pin
 * header with its blue contrast trimmer, backlight jumper and the right-angle 4-pin header pointing west.
 */

const LCD_PINS = ['VSS', 'VDD', 'V0', 'RS', 'RW', 'E', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'A', 'K'];
const PX_PER_MM = 16;

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, r = 0): THREE.Mesh {
  const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

let zincMat: THREE.MeshStandardMaterial | null = null;
/** Zinc-plated steel of the LCD bezel: dull, slightly blue-grey. */
function zinc(): THREE.MeshStandardMaterial {
  if (!zincMat) zincMat = markShared(new THREE.MeshStandardMaterial({ color: 0x9aa1aa, metalness: 1, roughness: 0.48 }));
  return zincMat;
}

let nylonMat: THREE.MeshStandardMaterial | null = null;
function nylon(): THREE.MeshStandardMaterial {
  if (!nylonMat) nylonMat = markShared(new THREE.MeshStandardMaterial({ color: 0xece8dc, roughness: 0.62, metalness: 0 }));
  return nylonMat;
}

function drawLcdBoard(g: LcdModuleGeometry): (p: BoardPainter) => void {
  return (p) => {
    const hx = (i: number) => g.header1XMm + i * HEADER_PITCH_MM;
    for (const [x, y] of holes(g)) p.ring(x, y, g.holeDMm + 1.6, g.holeDMm, { finish: 'tin' });
    for (let i = 0; i < 16; i += 1) {
      p.ring(hx(i), g.headerYMm, 1.8, 1.0, { finish: 'tin', square: i === 0 });
      p.silkText(LCD_PINS[i]!, hx(i), g.headerYMm + 2.1, 0.75);
    }
    p.silkText('1', hx(0) - 1.9, g.headerYMm, 0.9);
    p.silkText('16', hx(15) + 2.2, g.headerYMm, 0.9);
    // backlight anode / cathode tabs at the east end, and the tracks from the header
    const tabX = g.wMm - 3.2;
    p.pad(tabX, g.dMm / 2 - 2.0, 2.2, 3.2, { finish: 'tin' });
    p.pad(tabX, g.dMm / 2 + 2.0, 2.2, 3.2, { finish: 'tin' });
    p.silkText('A', tabX - 2.4, g.dMm / 2 - 2.0, 1.0);
    p.silkText('K', tabX - 2.4, g.dMm / 2 + 2.0, 1.0);
    p.trace([[hx(14), g.headerYMm + 0.9], [hx(14), g.headerYMm + 1.4], [tabX - 1.6, g.headerYMm + 1.4], [tabX - 1.6, g.dMm / 2 - 2.0]], 0.5, 0.2);
    p.silkText(g.cols === 20 ? 'LCD2004A' : 'LCD1602A', g.wMm - 14, g.dMm - 2.4, 1.2);
  };
}

function holes(g: LcdModuleGeometry): Array<[number, number]> {
  const i = g.holeInsetMm;
  return [
    [i, i],
    [g.wMm - i, i],
    [i, g.dMm - i],
    [g.wMm - i, g.dMm - i],
  ];
}

function drawBackpack(p: BoardPainter): void {
  // the backpack's own art (it faces the LCD board, so little of it shows)
  for (let i = 0; i < 16; i += 1) p.ring(1.75 + i * HEADER_PITCH_MM, 1.9, 1.7, 1.0, { finish: 'tin', square: i === 0 });
  p.pour(4, 5, 34, 12);
}

/** The window-cut bezel: a 0.4 mm steel top with the viewing window and walls down to the board. */
function bezel(group: THREE.Group, g: LcdModuleGeometry, top: number, centre: THREE.Vector3): void {
  const t = 0.4;
  const outer = roundedRectShape(g.bezel.w, g.bezel.d, 0.8);
  const win = new THREE.Path();
  const ww = g.view.w + 0.6;
  const wd = g.view.d + 0.6;
  win.moveTo(-ww / 2, -wd / 2);
  win.lineTo(ww / 2, -wd / 2);
  win.lineTo(ww / 2, wd / 2);
  win.lineTo(-ww / 2, wd / 2);
  win.closePath();
  outer.holes.push(win);
  const lid = new THREE.ExtrudeGeometry(outer, { depth: t, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.15, bevelSegments: 2, curveSegments: 6 });
  lid.scale(MM, MM, MM);
  lid.rotateX(-Math.PI / 2);
  const lidMesh = new THREE.Mesh(lid, zinc());
  lidMesh.position.set(centre.x, top + (g.bezel.h - t) * MM, centre.z);
  lidMesh.castShadow = true;
  lidMesh.receiveShadow = true;
  group.add(lidMesh);
  // walls: outline minus a 0.4 mm inset
  const wall = roundedRectShape(g.bezel.w, g.bezel.d, 0.8);
  const inner = new THREE.Path();
  const iw = g.bezel.w - 0.8;
  const id = g.bezel.d - 0.8;
  inner.moveTo(-iw / 2, -id / 2);
  inner.lineTo(iw / 2, -id / 2);
  inner.lineTo(iw / 2, id / 2);
  inner.lineTo(-iw / 2, id / 2);
  inner.closePath();
  wall.holes.push(inner);
  const walls = new THREE.ExtrudeGeometry(wall, { depth: g.bezel.h - t, bevelEnabled: false, curveSegments: 6 });
  walls.scale(MM, MM, MM);
  walls.rotateX(-Math.PI / 2);
  const wallMesh = new THREE.Mesh(walls, zinc());
  wallMesh.position.set(centre.x, top, centre.z);
  wallMesh.castShadow = true;
  group.add(wallMesh);
  // fold-over tabs gripping the board edge
  for (const sx of [-1, 1]) {
    for (const fz of [-0.3, 0.3]) {
      group.add(box(1.2 * MM, 1.2 * MM, 2.4 * MM, zinc(), centre.x + sx * (g.bezel.w / 2 - 0.3) * MM, top - 0.6 * MM, centre.z + fz * g.bezel.d * MM));
    }
  }
}

/** White nylon M3 standoff (5.5 mm across flats) with a pan-head nylon screw on top. */
function standoff(group: THREE.Group, at: THREE.Vector3, bottom: number, height: number, boardTop: number): void {
  const hex = new THREE.Mesh(new THREE.CylinderGeometry(3.15 * MM, 3.15 * MM, height, 6), nylon());
  hex.position.set(at.x, bottom + height / 2, at.z);
  hex.castShadow = true;
  hex.receiveShadow = true;
  group.add(hex);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(2.6 * MM, 2.75 * MM, 1.7 * MM, 24), nylon());
  head.position.set(at.x, boardTop + 0.85 * MM, at.z);
  head.castShadow = true;
  group.add(head);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(3.6 * MM, 0.5 * MM, 0.6 * MM), plastic(0xbdb8aa, 0.7));
  slot.position.set(at.x, boardTop + 1.55 * MM, at.z);
  group.add(slot);
}

/** Small square single-turn trimmer (contrast) with its white cross rotor, standing on the backpack's underside. */
function contrastTrimmer(parent: THREE.Group, at: THREE.Vector3): void {
  const s = 6.6;
  const h = 4.6;
  parent.add(box(s * MM, h * MM, s * MM, plastic(0x2f62c4, 0.42, 0.2), at.x, at.y + (h / 2) * MM, at.z, 0.3 * MM));
  const rotor = new THREE.Mesh(new THREE.CylinderGeometry(2.0 * MM, 2.0 * MM, 0.8 * MM, 24), plastic(0xf2f2ee, 0.5));
  rotor.position.set(at.x, at.y + (h + 0.4) * MM, at.z);
  parent.add(rotor);
  for (const r of [0, Math.PI / 2]) {
    const slot = box(3.0 * MM, 0.3 * MM, 0.55 * MM, plastic(0x9a9a96, 0.6), at.x, at.y + (h + 0.82) * MM, at.z);
    slot.rotation.y = r;
    parent.add(slot);
  }
}

function buildLcd(g: LcdModuleGeometry, key: string): PartBuilder {
  return ({ group }) => {
    const bottom = g.boardBottomMm * MM;
    const board = buildPcb({ key, wMm: g.wMm, dMm: g.dMm, cornerMm: 0.6, mask: '#1f7a3a', yBottom: bottom, holes: holes(g).map(([x, y]) => ({ x, y, d: g.holeDMm })), draw: drawLcdBoard(g) });
    group.add(board.mesh);
    const at = board.at;
    const top = board.top;

    for (const [x, y] of holes(g)) {
      const p = at(x, y);
      standoff(group, p, 0, bottom, top);
    }

    // bezel, the glass seal border inside the window, and the screen
    const centre = at(g.wMm / 2, g.dMm / 2);
    bezel(group, g, top, centre);
    const glassTop = top + (g.bezel.h - 0.75) * MM;
    group.add(box((g.view.w + 0.5) * MM, 0.5 * MM, (g.view.d + 0.5) * MM, plastic(0x0d1426, 0.3, 0.6), centre.x, glassTop - 0.25 * MM, centre.z));

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(g.view.w * PX_PER_MM);
    canvas.height = Math.round(g.view.d * PX_PER_MM);
    const layout = { pxPerMm: PX_PER_MM, viewW: g.view.w, viewD: g.view.d, cols: g.cols, rows: g.rows, charW: g.charW, charD: g.charD, pitchX: g.pitchX, pitchY: g.pitchY };
    paintLcd(canvas, layout, undefined, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    // the front polariser is matte (anti-glare), so the room barely reflects in it
    const screenMat = new THREE.MeshPhysicalMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.45, roughness: 0.7, metalness: 0, specularIntensity: 0.15 });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(g.view.w * MM, g.view.d * MM), screenMat);
    screen.rotation.x = -Math.PI / 2;
    screen.position.set(centre.x, glassTop + 0.01 * MM, centre.z);
    group.add(screen);

    // solder joints of the 16 header pins on the LCD board's top
    const joint = new THREE.CylinderGeometry(0.35 * MM, 0.85 * MM, 0.6 * MM, 12);
    const joints = new THREE.InstancedMesh(joint, PBR.solder(), 16);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 16; i += 1) {
      const p = at(g.header1XMm + i * HEADER_PITCH_MM, g.headerYMm);
      m4.makeTranslation(p.x, top + 0.3 * MM, p.z);
      joints.setMatrixAt(i, m4);
    }
    group.add(joints);

    // ---------------------------------------------------------------- the I2C backpack under the header
    const bp = g.backpack;
    const spacer = 2.5;
    const bpTop = bottom - spacer * MM;
    const bpBottom = bpTop - PCB_T_MM * MM;
    // header spacer and pins between the two boards
    const spacerGeo = new THREE.BoxGeometry(HEADER_PITCH_MM * 16 * MM, spacer * MM, 2.5 * MM);
    const sp = new THREE.Mesh(spacerGeo, PBR.headerPlastic());
    const spAt = at(g.header1XMm + 7.5 * HEADER_PITCH_MM, g.headerYMm);
    sp.position.set(spAt.x, bpTop + (spacer / 2) * MM, spAt.z);
    sp.castShadow = true;
    group.add(sp);

    const bpPcb = buildPcb({ key: 'pcf8574-backpack', wMm: bp.w, dMm: bp.d, cornerMm: 0.5, mask: '#17191c', yBottom: bpBottom, draw: drawBackpack });
    const bpCentre = at(bp.leftXMm + bp.w / 2, bp.northYMm + bp.d / 2);
    bpPcb.mesh.position.x = bpCentre.x;
    bpPcb.mesh.position.z = bpCentre.z;
    group.add(bpPcb.mesh);

    // underside parts (the frame below has +Y pointing down, toward the bench)
    const under = new THREE.Group();
    under.rotation.x = Math.PI;
    under.position.y = bpBottom;
    group.add(under);
    const onUnder = (xMm: number, yMm: number) => {
      const v = at(xMm, yMm);
      return new THREE.Vector3(v.x, 0, -v.z);
    };
    soic(under, { at: onUnder(bp.leftXMm + 22, bp.northYMm + 11.5), pins: 16, marking: ['PCF8574T', 'NXP'] });
    contrastTrimmer(under, onUnder(bp.leftXMm + 33.5, bp.northYMm + 11.0));
    for (const [x, y, kind] of [[12.5, 8.0, 'R'], [12.5, 10.4, 'R'], [12.5, 12.8, 'R'], [15.5, 15.5, 'C'], [28.5, 6.0, 'R']] as const) {
      chipPassive(under, { at: onUnder(bp.leftXMm + x, bp.northYMm + y), code: '0805', kind, marking: kind === 'R' ? '472' : undefined });
    }
    ledSmd(under, { at: onUnder(bp.leftXMm + 9.2, bp.northYMm + 16.5), code: '0805', color: 0xff3030, glow: 0.05 });
    // backlight jumper: two pins with the black link cap
    const jx = bp.leftXMm + 39.4;
    const jy = bp.northYMm + 9.5;
    const jAt = onUnder(jx, jy);
    under.add(box(2.5 * MM, 2.5 * MM, 5.08 * MM, PBR.headerPlastic(), jAt.x, 1.25 * MM, jAt.z));
    under.add(box(2.3 * MM, 5.8 * MM, 4.9 * MM, plastic(0x1b1b1d, 0.55), jAt.x, (2.5 + 2.9) * MM, jAt.z, 0.3 * MM));

    // right-angle 4-pin header at the west end: body on the underside, pins running west past the edge
    const pinH = lcdBackpackPinHeightMm(g) * MM;
    const bodyX = bp.leftXMm + 1.0;
    const yMid = (lcdBackpackPinYMm(g, 0) + lcdBackpackPinYMm(g, 3)) / 2;
    const bodyAt = at(bodyX, yMid);
    group.add(box(2.5 * MM, 2.5 * MM, 4 * HEADER_PITCH_MM * MM, PBR.headerPlastic(), bodyAt.x, bpBottom - 1.25 * MM, bodyAt.z, 0.2 * MM));
    const bendX = bp.leftXMm + 2.0;
    const tipX = bp.leftXMm - 6.2;
    const pinMat = PBR.gold();
    for (let i = 0; i < 4; i += 1) {
      const y = lcdBackpackPinYMm(g, i);
      const a = at((bendX + tipX + 0.6) / 2, y);
      group.add(box((bendX - tipX - 0.6) * MM, 0.64 * MM, 0.64 * MM, pinMat, a.x, pinH, a.z));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.46 * MM, 0.6 * MM, 4), pinMat);
      tip.rotation.z = Math.PI / 2;
      tip.rotation.x = Math.PI / 4;
      const tAt = at(tipX + 0.3, y);
      tip.position.set(tAt.x, pinH, tAt.z);
      group.add(tip);
      const leg = at(bendX, y);
      group.add(box(0.64 * MM, bpTop + 0.8 * MM - pinH, 0.64 * MM, pinMat, leg.x, (pinH + bpTop + 0.8 * MM) / 2, leg.z));
    }

    const display: DisplaySurface = { type: 'lcd', canvas, texture: tex, material: screenMat, lcd: layout };
    return { display };
  };
}

export const buildLcd1602 = buildLcd(LCD1602_I2C, 'lcd1602');
export const buildLcd2004 = buildLcd(LCD2004_I2C, 'lcd2004');
