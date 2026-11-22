import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PBR, markShared } from './pbr';
import { MM } from './pcb';

/**
 * 2.54 mm (0.1") pin headers, the way they really sit on a module: a black PA66 spacer 2.5 mm tall on the board,
 * a 0.64 mm square pin with a pointed tip standing 6 mm above it, and the trimmed pin end with a solder fillet on
 * the underside. Built as instanced meshes, so a 30-pin board costs four draw calls.
 */

export const PITCH = 2.54 * MM;
const PIN = 0.64 * MM;
const SPACER_H = 2.5 * MM;
const SPACER_W = 2.48 * MM;

let blockGeo: THREE.BufferGeometry | null = null;
let shaftGeo: THREE.BufferGeometry | null = null;
let tipGeo: THREE.BufferGeometry | null = null;
let filletGeo: THREE.BufferGeometry | null = null;

function geos() {
  if (!blockGeo) {
    blockGeo = markShared(new RoundedBoxGeometry(SPACER_W, SPACER_H, SPACER_W, 2, 0.22 * MM));
    shaftGeo = markShared(new THREE.BoxGeometry(PIN, 1, PIN));
    const tip = new THREE.ConeGeometry(PIN * 0.72, 0.6 * MM, 4, 1);
    tip.rotateY(Math.PI / 4);
    tipGeo = markShared(tip);
    filletGeo = markShared(new THREE.CylinderGeometry(PIN * 0.75, 1.15 * MM, 0.7 * MM, 14, 1, true));
  }
  return { blockGeo: blockGeo!, shaftGeo: shaftGeo!, tipGeo: tipGeo!, filletGeo: filletGeo! };
}

export interface HeaderPinsOptions {
  /** Pin tip positions in the part frame (cm): exactly where wires attach. */
  tips: ReadonlyArray<readonly [number, number, number]>;
  /** Top face of the board the header is soldered into (cm). */
  boardTop: number;
  /** Underside of the board (cm); the trimmed pin and its fillet hang below this. */
  boardBottom: number;
  finish?: 'gold' | 'tin';
  /** Draw the plastic spacer (false for pins pressed straight into a board, like a buck module's terminals). */
  spacer?: boolean;
  /** How far the trimmed pin sticks out under the board (cm). */
  belowCm?: number;
}

/** Adds a header (one block and one pin per tip) and returns the meshes for picking-free decoration. */
export function addHeaderPins(group: THREE.Group, o: HeaderPinsOptions): THREE.Object3D[] {
  const { blockGeo: bg, shaftGeo: sg, tipGeo: tg, filletGeo: fg } = geos();
  const n = o.tips.length;
  if (n === 0) return [];
  const pinMat = o.finish === 'tin' ? PBR.tin() : PBR.gold();
  const below = o.belowCm ?? 1.4 * MM;
  const out: THREE.Object3D[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();

  if (o.spacer !== false) {
    const blocks = new THREE.InstancedMesh(bg, PBR.headerPlastic(), n);
    o.tips.forEach(([x, , z], i) => {
      m.makeTranslation(x, o.boardTop + SPACER_H / 2, z);
      blocks.setMatrixAt(i, m);
    });
    blocks.castShadow = true;
    blocks.receiveShadow = true;
    out.push(blocks);
  }

  const shafts = new THREE.InstancedMesh(sg, pinMat, n);
  const tips = new THREE.InstancedMesh(tg, pinMat, n);
  o.tips.forEach(([x, y, z], i) => {
    const tipLen = 0.6 * MM;
    const yLow = o.boardBottom - below;
    const yHigh = y - tipLen;
    p.set(x, (yLow + yHigh) / 2, z);
    sc.set(1, Math.max(0.01, yHigh - yLow), 1);
    m.compose(p, q, sc);
    shafts.setMatrixAt(i, m);
    m.makeTranslation(x, y - tipLen / 2, z);
    tips.setMatrixAt(i, m);
  });
  shafts.castShadow = true;
  out.push(shafts, tips);

  const fillets = new THREE.InstancedMesh(fg, PBR.solder(), n);
  o.tips.forEach(([x, , z], i) => {
    m.makeTranslation(x, o.boardBottom - 0.35 * MM, z);
    fillets.setMatrixAt(i, m);
  });
  out.push(fillets);

  for (const obj of out) group.add(obj);
  return out;
}

/** Tip positions for a straight row of `count` pins starting at (x0, z0), stepping along x or z. */
export function headerRow(count: number, x0: number, z0: number, axis: 'x' | 'z', tipY: number, pitch = PITCH): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i < count; i += 1) {
    out.push(axis === 'x' ? [x0 + i * pitch, tipY, z0] : [x0, tipY, z0 + i * pitch]);
  }
  return out;
}

/** Height of a header pin tip above the board top: 2.5 mm spacer + 6 mm pin. */
export const HEADER_TIP_ABOVE_BOARD = SPACER_H + 6.0 * MM;
