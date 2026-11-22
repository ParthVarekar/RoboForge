import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { SOCKET_RISE_CM } from '../engine/wireLength';
import type { Vec3 } from '../schema/projectSchema';
import { markShared } from './kit/pbr';
import type { V3 } from './wireRope';

/** How one end of a wire meets its pin: socket on a header pin, or a soldered joint on a lead/pad; `dir` is world space. */
export interface WireEnd {
  contact: 'header' | 'lead';
  dir: THREE.Vector3;
}

const UP = new THREE.Vector3(0, 1, 0);
export const DEFAULT_END: WireEnd = { contact: 'header', dir: UP };

export interface WireRenderOptions {
  wireId: string;
  fromEnd?: WireEnd;
  toEnd?: WireEnd;
  color: string;
  selected: boolean;
  isPower: boolean;
  isEscPhase: boolean;
  waypoints?: readonly Vec3[];
}

/** Jacket radius (cm): 22 AWG jumper, a thicker power lead, or the three-wire ESC loom as a bundle. */
export function wireRadius(isPower: boolean, isEscPhase: boolean): number {
  if (isEscPhase) return 0.14;
  return isPower ? 0.072 : 0.056;
}

/**
 * Female DuPont (2.54 mm) housing as it really sits on a header pin: a 2.5 x 2.5 x 14 mm black sleeve that slides
 * down over the 6 mm pin onto the header's plastic spacer, with the latch window on one face and the crimped wire
 * leaving the top. `pinWorld` is the pin tip.
 */
const DUPONT_BELOW_TIP = 0.6;
export const DUPONT_ABOVE_TIP = SOCKET_RISE_CM - 0.08;
let dupontGeo: THREE.BufferGeometry | null = null;
let dupontWindowGeo: THREE.BufferGeometry | null = null;
let dupontCrimpGeo: THREE.BufferGeometry | null = null;
let dupontMat: THREE.MeshStandardMaterial | null = null;
let dupontWindowMat: THREE.MeshStandardMaterial | null = null;
let dupontCrimpMat: THREE.MeshStandardMaterial | null = null;

function addDupontHousing(group: THREE.Group, pinWorld: THREE.Vector3, dir: THREE.Vector3, wireId: string): void {
  if (!dupontGeo) {
    const len = DUPONT_BELOW_TIP + DUPONT_ABOVE_TIP;
    dupontGeo = markShared(new RoundedBoxGeometry(0.25, len, 0.25, 2, 0.02));
    dupontWindowGeo = markShared(new THREE.BoxGeometry(0.12, 0.32, 0.01));
    dupontCrimpGeo = markShared(new THREE.CylinderGeometry(0.05, 0.07, 0.12, 10));
    dupontMat = markShared(new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.55, metalness: 0 }));
    dupontWindowMat = markShared(new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.3, metalness: 1 }));
    dupontCrimpMat = markShared(new THREE.MeshStandardMaterial({ color: 0xd2d5da, roughness: 0.28, metalness: 1 }));
  }
  // built along +Y at the tip, then turned to the pin's direction
  const socket = new THREE.Group();
  socket.position.copy(pinWorld);
  socket.quaternion.setFromUnitVectors(UP, dir);
  socket.userData = { pickType: 'wire', wireId };

  const housing = new THREE.Mesh(dupontGeo, dupontMat!);
  housing.position.set(0, (DUPONT_ABOVE_TIP - DUPONT_BELOW_TIP) / 2, 0);
  housing.castShadow = true;
  housing.userData = { pickType: 'wire', wireId };

  // the steel contact seen through the latch window near the bottom of the sleeve
  const window = new THREE.Mesh(dupontWindowGeo!, dupontWindowMat!);
  window.position.set(0, -DUPONT_BELOW_TIP + 0.32, 0.126);
  window.userData = { pickType: 'wire', wireId };

  // crimp barrel gripping the insulation where the wire leaves the top
  const crimp = new THREE.Mesh(dupontCrimpGeo!, dupontCrimpMat!);
  crimp.position.set(0, DUPONT_ABOVE_TIP + 0.04, 0);
  crimp.userData = { pickType: 'wire', wireId };

  socket.add(housing, window, crimp);
  group.add(socket);
}

/**
 * A wire soldered to a component lead, a solder tab or a pad: a bright solder joint at the tip and a black
 * heat-shrink sleeve over the joint, the way hand-wired parts look.
 */
const SLEEVE_LEN = 0.46;
let jointGeo: THREE.BufferGeometry | null = null;
let sleeveGeo: THREE.BufferGeometry | null = null;
let jointMat: THREE.MeshStandardMaterial | null = null;
let sleeveMat: THREE.MeshStandardMaterial | null = null;

function addSolderJoint(group: THREE.Group, tip: THREE.Vector3, dir: THREE.Vector3, wireId: string): void {
  if (!jointGeo) {
    jointGeo = markShared(new THREE.SphereGeometry(0.06, 14, 10));
    sleeveGeo = markShared(new THREE.CylinderGeometry(0.068, 0.072, SLEEVE_LEN, 14));
    jointMat = markShared(new THREE.MeshStandardMaterial({ color: 0xc3c7cc, metalness: 1, roughness: 0.22 }));
    sleeveMat = markShared(new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.62, metalness: 0 }));
  }
  const joint = new THREE.Group();
  joint.position.copy(tip);
  joint.quaternion.setFromUnitVectors(UP, dir);
  joint.userData = { pickType: 'wire', wireId };
  const blob = new THREE.Mesh(jointGeo, jointMat!);
  blob.scale.set(1, 1.5, 1);
  blob.position.y = 0.03;
  blob.userData = { pickType: 'wire', wireId };
  const sleeve = new THREE.Mesh(sleeveGeo!, sleeveMat!);
  sleeve.position.y = 0.06 + SLEEVE_LEN / 2;
  sleeve.castShadow = true;
  sleeve.userData = { pickType: 'wire', wireId };
  joint.add(blob, sleeve);
  group.add(joint);
}

/** Where the insulated wire starts: the top of the DuPont socket, or the end of the heat-shrink. */
export function wireExit(tip: THREE.Vector3, end: WireEnd): THREE.Vector3 {
  const len = end.contact === 'header' ? SOCKET_RISE_CM : 0.06 + SLEEVE_LEN;
  return tip.clone().addScaledVector(end.dir, len);
}

function addWireEnd(group: THREE.Group, tip: THREE.Vector3, end: WireEnd, wireId: string): void {
  if (end.contact === 'header') addDupontHousing(group, tip, end.dir, wireId);
  else addSolderJoint(group, tip, end.dir, wireId);
}

function jacket(color: string, selected: boolean): THREE.MeshPhysicalMaterial {
  const c = new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({
    color: c,
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.25,
    clearcoatRoughness: 0.5,
    emissive: selected ? c : new THREE.Color(0x000000),
    emissiveIntensity: selected ? 0.35 : 0,
  });
}

/**
 * The 3D wire for a solved path (see wireRope.ts): a smooth tube through the path, the socket or solder joint at
 * each end, cable clips at hand-placed tie points, and a loosely twisted three-wire loom for ESC phase leads.
 */
export function buildWireGroup(path: readonly V3[], fromWorld: THREE.Vector3, toWorld: THREE.Vector3, opts: WireRenderOptions): THREE.Group {
  const group = new THREE.Group();
  group.userData = { pickType: 'wire', wireId: opts.wireId };
  const tag = (m: THREE.Mesh) => {
    m.userData = { pickType: 'wire', wireId: opts.wireId };
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  if (path.length >= 2) {
    const curve = new THREE.CatmullRomCurve3(
      path.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
      false,
      'centripetal',
    );
    const segments = Math.max(24, Math.min(420, path.length * 4));
    if (opts.isEscPhase) {
      // three phase wires twisted loosely along the run, one turn every ~3 cm
      const frames = curve.computeFrenetFrames(segments, false);
      const total = curve.getLength();
      const turns = total / 3;
      const strandColors = [opts.color, '#1b1b1d', opts.color];
      for (let k = 0; k < 3; k += 1) {
        const pts: THREE.Vector3[] = [];
        for (let j = 0; j <= segments; j += 1) {
          const u = j / segments;
          const taper = Math.min(1, Math.min(u, 1 - u) * 8);
          const a = (k * Math.PI * 2) / 3 + u * turns * Math.PI * 2;
          const off = 0.085 * (0.45 + 0.55 * taper);
          const p = curve.getPointAt(u);
          p.addScaledVector(frames.normals[j]!, Math.cos(a) * off).addScaledVector(frames.binormals[j]!, Math.sin(a) * off);
          pts.push(p);
        }
        const strand = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
        group.add(tag(new THREE.Mesh(new THREE.TubeGeometry(strand, segments, opts.selected ? 0.06 : 0.048, 8, false), jacket(strandColors[k]!, opts.selected))));
      }
    } else {
      const radius = wireRadius(opts.isPower, false) * (opts.selected ? 1.3 : 1);
      group.add(tag(new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 10, false), jacket(opts.color, opts.selected))));
    }
  }

  // adhesive cable clips at the tie points the wire was routed through by hand
  if (opts.waypoints?.length) {
    const clipMat = new THREE.MeshStandardMaterial({ color: opts.selected ? 0x0d9488 : 0x2a2f38, roughness: 0.55 });
    for (const wp of opts.waypoints) {
      const clip = tag(new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.16, 0.24, 2, 0.05), clipMat));
      clip.position.set(wp[0], Math.max(0.08, wp[1] - 0.04), wp[2]);
      group.add(clip);
    }
  }

  addWireEnd(group, fromWorld, opts.fromEnd ?? DEFAULT_END, opts.wireId);
  addWireEnd(group, toWorld, opts.toEnd ?? DEFAULT_END, opts.wireId);
  return group;
}
