import * as THREE from 'three';
import { AXIAL_LEAD_END, TO220_FEET, TO92_FEET } from '../../catalog/moduleGeometry';
import { labelTexture } from '../kit/boardArt';
import { leadTube, v3 } from '../kit/leads';
import { PBR, markShared, plastic } from '../kit/pbr';
import { MM } from '../kit/pcb';
import { to220, to92 } from '../kit/thruhole';
import { box, cylAlong } from './shapes';
import type { PartBuilder } from './types';

/**
 * Loose through-hole parts as they come out of the bag: an axial diode lying on the bench, a TO-92 transistor and a
 * TO-220 MOSFET standing on their legs with the leads bent into feet toward the south, a dipped ceramic capacitor.
 */

const printCache = new Map<string, THREE.CanvasTexture>();
/**
 * Print on an axial body lying along x (cylAlong 'x'): u runs round the body with u = 0.25 on top, v along it with
 * the top of the canvas at the west end, so the text reads west to east from above.
 */
function axialPrint(text: string): THREE.CanvasTexture {
  const hit = printCache.get(text);
  if (hit) return hit;
  const c = document.createElement('canvas');
  // 512 px round the 8.5 mm circumference, 256 px along the 5.2 mm body: about the same scale both ways
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#141416';
    ctx.fillRect(0, 0, 512, 256);
    ctx.save();
    ctx.translate(128, 110);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = 'rgba(176,180,186,0.92)';
    ctx.font = 'bold 34px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  markShared(t);
  printCache.set(text, t);
  return t;
}

/** 1N4007 (DO-41): 5.2 x 2.7 mm black body, the grey cathode band to the east, straight tinned leads. */
export const buildDiode1n4007: PartBuilder = ({ group }) => {
  const y = 1.35 * MM;
  const body = cylAlong('x', 1.35 * MM, 5.2 * MM, new THREE.MeshPhysicalMaterial({ map: axialPrint('1N4007'), roughness: 0.45, clearcoat: 0.3 }), 0, y, 0, 32);
  group.add(body);
  for (const sx of [-1, 1]) {
    const end = new THREE.Mesh(new THREE.SphereGeometry(1.35 * MM, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), PBR.icEpoxy());
    end.scale.set(1, 0.35, 1);
    end.rotation.z = -sx * (Math.PI / 2);
    end.position.set(sx * 2.6 * MM, y, 0);
    group.add(end);
  }
  group.add(cylAlong('x', 1.37 * MM, 0.9 * MM, plastic(0xa9adb3, 0.45), 1.75 * MM, y, 0, 32));
  group.add(cylAlong('x', 0.4 * MM, AXIAL_LEAD_END * 2, PBR.tin(), 0, y, 0, 10));
};

/** 2N2222A (TO-92) standing, flat face toward the south, legs E-B-C bent into feet. */
export const buildNpn2n2222: PartBuilder = ({ group }) => {
  to92(group, { at: new THREE.Vector3(0, 0.4 * MM, 0), rot: Math.PI, legMm: 2.8, marking: 'P2N2222A' });
  for (const [, x] of TO92_FEET) {
    group.add(leadTube([v3(x, 1.4 * MM, -0.1 * MM), v3(x, 0.3 * MM, -0.1 * MM), v3(x, 0.3 * MM, 4.5 * MM)], 0.22 * MM, PBR.tin(), 0.5 * MM, 6));
  }
};

/** IRLZ44N (TO-220) standing, marked face toward the south, legs G-D-S bent into feet. */
export const buildMosfetIrlz44n: PartBuilder = ({ group }) => {
  to220(group, { at: new THREE.Vector3(0, 0.5 * MM, 0), rot: Math.PI, legMm: 3.0, marking: ['IRLZ44N', '2413 P'] });
  for (const [, x] of TO220_FEET) {
    group.add(leadTube([v3(x, 1.6 * MM, 0), v3(x, 0.3 * MM, 0), v3(x, 0.3 * MM, 5.5 * MM)], 0.3 * MM, PBR.tin(), 0.7 * MM, 6));
  }
};

/** 100 nF multilayer ceramic, blue epoxy-dipped, marked "104", on 2.54 mm legs bent into feet. */
export const buildCap100nf: PartBuilder = ({ group }) => {
  const bodyMat = plastic(0x2f62c4, 0.4, 0.3);
  const body = box(4.2 * MM, 4.6 * MM, 2.6 * MM, bodyMat, 0, 4.6 * MM, 0, 1.2 * MM);
  group.add(body);
  // dipped coating runs a little way down the legs
  for (const sx of [-1, 1]) group.add(box(0.9 * MM, 1.2 * MM, 0.9 * MM, bodyMat, sx * 1.27 * MM, 2.3 * MM, 0, 0.4 * MM));
  const tex = labelTexture(['104'], { wPx: 256, hPx: 160, color: 'rgba(240,242,246,0.92)' });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(2.8 * MM, 1.8 * MM), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false }));
  face.position.set(0, 4.8 * MM, 1.31 * MM);
  group.add(face);
  for (const sx of [-1, 1]) {
    const x = sx * 1.27 * MM;
    group.add(leadTube([v3(x, 2.4 * MM, 0), v3(x, 0.3 * MM, 0), v3(x, 0.3 * MM, 4.5 * MM)], 0.25 * MM, PBR.tin(), 0.5 * MM, 6));
  }
};
