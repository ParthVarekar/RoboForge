import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Vec3, WireStyle } from '../schema/projectSchema';
import { markShared } from './kit/pbr';

export interface ComponentFootprint {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  topY: number;
}

/** How one end of a wire meets its pin: socket on a header pin, or a soldered joint on a lead/pad; `dir` is world space. */
export interface WireEnd {
  contact: 'header' | 'lead';
  dir: THREE.Vector3;
}

const UP = new THREE.Vector3(0, 1, 0);
const DEFAULT_END: WireEnd = { contact: 'header', dir: UP };

export interface WireRenderOptions {
  wireId: string;
  fromEnd?: WireEnd;
  toEnd?: WireEnd;
  color: string;
  selected: boolean;
  style: WireStyle;
  clearanceCm: number;
  laneIndex: number;
  isPower: boolean;
  isEscPhase: boolean;
  fromCompId: string;
  toCompId: string;
  waypoints?: readonly Vec3[];
  obstacles: readonly ComponentFootprint[];
}

function dedupePoints(raw: THREE.Vector3[]): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const p of raw) {
    const prev = out[out.length - 1];
    if (!prev || prev.distanceTo(p) > 0.04) {
      out.push(p.clone());
    }
  }
  return out;
}

/**
 * Builds an exact mechanical polyline path joined by tight quadratic corner fillets —
 * producing dead-straight, taut wire segments with clean rounded bends and zero spline overshoot.
 */
function buildFilletedCurvePath(points: THREE.Vector3[], bendRadius: number): THREE.CurvePath<THREE.Vector3> {
  const clean = dedupePoints(points);
  const path = new THREE.CurvePath<THREE.Vector3>();
  if (clean.length < 2) return path;
  if (clean.length === 2) {
    path.add(new THREE.LineCurve3(clean[0]!, clean[1]!));
    return path;
  }

  let cursor = clean[0]!.clone();
  for (let i = 1; i < clean.length - 1; i += 1) {
    const prev = clean[i - 1]!;
    const curr = clean[i]!;
    const next = clean[i + 1]!;

    const vIn = curr.clone().sub(prev);
    const vOut = next.clone().sub(curr);
    const lenIn = vIn.length();
    const lenOut = vOut.length();
    if (lenIn < 0.02 || lenOut < 0.02) continue;

    // Skip near-collinear corners cleanly
    const dot = vIn.clone().normalize().dot(vOut.clone().normalize());
    if (dot > 0.996) {
      continue;
    }

    const r = Math.min(bendRadius, lenIn * 0.4, lenOut * 0.4);
    const cornerEnter = curr.clone().sub(vIn.normalize().multiplyScalar(r));
    const cornerExit = curr.clone().add(vOut.normalize().multiplyScalar(r));

    if (cursor.distanceTo(cornerEnter) > 0.015) {
      path.add(new THREE.LineCurve3(cursor, cornerEnter));
    }
    path.add(new THREE.QuadraticBezierCurve3(cornerEnter, curr, cornerExit));
    cursor = cornerExit;
  }

  const last = clean[clean.length - 1]!;
  if (cursor.distanceTo(last) > 0.015) {
    path.add(new THREE.LineCurve3(cursor, last));
  }
  return path;
}

function segmentIntersectsFootprint(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  fp: ComponentFootprint,
  pad = 0.2,
): boolean {
  const minX = fp.minX - pad;
  const maxX = fp.maxX + pad;
  const minZ = fp.minZ - pad;
  const maxZ = fp.maxZ + pad;

  const segMinX = Math.min(ax, bx);
  const segMaxX = Math.max(ax, bx);
  const segMinZ = Math.min(az, bz);
  const segMaxZ = Math.max(az, bz);
  if (segMaxX < minX || segMinX > maxX || segMaxZ < minZ || segMinZ > maxZ) return false;

  // Sample 5 interior points along segment for exact hit check
  for (let t = 0.15; t <= 0.85; t += 0.175) {
    const px = ax + (bx - ax) * t;
    const pz = az + (bz - az) * t;
    if (px >= minX && px <= maxX && pz >= minZ && pz <= maxZ) return true;
  }
  return false;
}

function countPathCollisions(
  xzPts: Array<[number, number]>,
  obstacles: readonly ComponentFootprint[],
  ignoreIds: ReadonlySet<string>,
  trayY: number,
): number {
  let hits = 0;
  for (let i = 0; i < xzPts.length - 1; i += 1) {
    const [ax, az] = xzPts[i]!;
    const [bx, bz] = xzPts[i + 1]!;
    for (const fp of obstacles) {
      if (ignoreIds.has(fp.id)) continue;
      if (fp.topY <= trayY + 0.05) continue;
      if (segmentIntersectsFootprint(ax, az, bx, bz, fp, 0.25)) {
        hits += 1;
      }
    }
  }
  return hits;
}

function computeHarnessPoints(
  fromWorld: THREE.Vector3,
  toWorld: THREE.Vector3,
  opts: WireRenderOptions,
): THREE.Vector3[] {
  const riser = 0.42;
  const pStartUp = fromWorld.clone().add(new THREE.Vector3(0, riser, 0));
  const pEndUp = toWorld.clone().add(new THREE.Vector3(0, riser, 0));

  // 1. User-placed manual tie-down waypoints ("Route by hand")
  if (opts.waypoints && opts.waypoints.length > 0) {
    const pts: THREE.Vector3[] = [fromWorld, pStartUp];
    for (const wp of opts.waypoints) {
      pts.push(new THREE.Vector3(wp[0], Math.max(0.55, wp[1]), wp[2]));
    }
    pts.push(pEndUp, toWorld);
    return pts;
  }

  // 2. Brushless ESC phase / diagonal quadcopter arm runs: hug the carbon arm straight & taut!
  const dx = Math.abs(toWorld.x - fromWorld.x);
  const dz = Math.abs(toWorld.z - fromWorld.z);
  const isDiagonalArm = opts.isEscPhase || (dx > 3.2 && dz > 3.2 && Math.abs(dx - dz) < 3.0);
  if (opts.style === 'direct' || (opts.style === 'routed' && isDiagonalArm)) {
    const runY = isDiagonalArm
      ? Math.min(fromWorld.y, toWorld.y) + Math.min(0.28, opts.clearanceCm * 0.6)
      : Math.max(fromWorld.y, toWorld.y) + Math.max(0.32, opts.clearanceCm * 0.75);
    const pA = new THREE.Vector3(fromWorld.x, Math.max(fromWorld.y + 0.26, runY), fromWorld.z);
    const pB = new THREE.Vector3(toWorld.x, Math.max(toWorld.y + 0.26, runY), toWorld.z);
    if (isDiagonalArm) {
      const m1 = fromWorld.clone().lerp(toWorld, 0.14);
      const m2 = fromWorld.clone().lerp(toWorld, 0.86);
      m1.y = runY;
      m2.y = runY;
      return [fromWorld, pA, m1, m2, pB, toWorld];
    }
    return [fromWorld, pA, pB, toWorld];
  }

  // 3. Formed Breadboard / Hookup Jumper (neat crisp flat-top U bridge, zero wild arcs!)
  if (opts.style === 'arched') {
    const span = fromWorld.distanceTo(toWorld);
    const bridgeY =
      Math.max(fromWorld.y, toWorld.y) +
      Math.min(2.1, Math.max(0.75, span * 0.12)) +
      (opts.laneIndex % 4) * 0.12 +
      (opts.clearanceCm - 0.45) * 0.5;
    return [
      fromWorld,
      new THREE.Vector3(fromWorld.x, bridgeY, fromWorld.z),
      new THREE.Vector3(toWorld.x, bridgeY, toWorld.z),
      toWorld,
    ];
  }

  // 4. Orthogonal CAD Cable-Tray Harness Routing (side-by-side lane spacing + obstacle avoidance)
  const laneSlot = (opts.laneIndex % 5) - 2; // -2..+2
  const laneSpacing = 0.17;
  const laneOffset = laneSlot * laneSpacing;

  // Stratify harness layers cleanly: power rails hug lower tray, signal wires sit neatly just above
  const layerLift = opts.isPower ? 0.08 : 0.24;
  const trayY = Math.max(fromWorld.y, toWorld.y) + opts.clearanceCm * 0.62 + layerLift + (opts.laneIndex % 3) * 0.055;

  // Short jumps (< 2.4 cm): clean single crisp 90-degree L-jog
  if (Math.hypot(dx, dz) < 2.4) {
    const mid = new THREE.Vector3(toWorld.x, trayY, fromWorld.z);
    return [fromWorld, new THREE.Vector3(fromWorld.x, trayY, fromWorld.z), mid, new THREE.Vector3(toWorld.x, trayY, toWorld.z), toWorld];
  }

  const ignore = new Set([opts.fromCompId, opts.toCompId]);

  // Candidate A: horizontal first then vertical (shifted by laneOffset in Z)
  const zLaneA = fromWorld.z + laneOffset;
  const xLaneA = toWorld.x + laneOffset;
  const candA: Array<[number, number]> = [
    [fromWorld.x, fromWorld.z],
    [fromWorld.x, zLaneA],
    [xLaneA, zLaneA],
    [xLaneA, toWorld.z],
    [toWorld.x, toWorld.z],
  ];

  // Candidate B: vertical first then horizontal (shifted by laneOffset in X)
  const xLaneB = fromWorld.x + laneOffset;
  const zLaneB = toWorld.z + laneOffset;
  const candB: Array<[number, number]> = [
    [fromWorld.x, fromWorld.z],
    [xLaneB, fromWorld.z],
    [xLaneB, zLaneB],
    [toWorld.x, zLaneB],
    [toWorld.x, toWorld.z],
  ];

  // Candidate C: central bus channel spine (X = 0.0 + laneOffset) — super tidy on 2WD rover deck!
  const spineX = 0.0 + laneOffset * 1.15;
  const candC: Array<[number, number]> = [
    [fromWorld.x, fromWorld.z],
    [spineX, fromWorld.z],
    [spineX, toWorld.z],
    [toWorld.x, toWorld.z],
  ];

  // Candidate D: rear/front chassis wire gutter channels (clear of ESP32 & Battery!)
  const candD1: Array<[number, number]> = [
    [fromWorld.x, fromWorld.z],
    [fromWorld.x, 3.65 + laneOffset * 0.7],
    [toWorld.x, 3.65 + laneOffset * 0.7],
    [toWorld.x, toWorld.z],
  ];
  const candD2: Array<[number, number]> = [
    [fromWorld.x, fromWorld.z],
    [fromWorld.x, -3.7 + laneOffset * 0.7],
    [toWorld.x, -3.7 + laneOffset * 0.7],
    [toWorld.x, toWorld.z],
  ];

  const candidates = [candA, candB, candC, candD1, candD2];
  let best = candA;
  let bestScore = Infinity;

  for (const cand of candidates) {
    const hits = countPathCollisions(cand, opts.obstacles, ignore, trayY);
    let len = 0;
    for (let i = 0; i < cand.length - 1; i += 1) {
      len += Math.hypot(cand[i + 1]![0] - cand[i]![0], cand[i + 1]![1] - cand[i]![1]);
    }
    const score = hits * 32 + len;
    if (score < bestScore) {
      bestScore = score;
      best = cand;
    }
  }

  const pts: THREE.Vector3[] = [fromWorld];
  for (let i = 0; i < best.length; i += 1) {
    const [bx, bz] = best[i]!;
    pts.push(new THREE.Vector3(bx, trayY, bz));
  }
  pts.push(toWorld);
  return pts;
}

/**
 * Female DuPont (2.54 mm) housing as it really sits on a header pin: a 2.5 x 2.5 x 14 mm black sleeve that slides
 * down over the 6 mm pin onto the header's plastic spacer, with the latch window on one face and the crimped wire
 * leaving the top. `pinWorld` is the pin tip.
 */
const DUPONT_BELOW_TIP = 0.6;
export const DUPONT_ABOVE_TIP = 0.8;
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
function wireExit(tip: THREE.Vector3, end: WireEnd): THREE.Vector3 {
  const len = end.contact === 'header' ? DUPONT_ABOVE_TIP + 0.08 : 0.06 + SLEEVE_LEN;
  return tip.clone().addScaledVector(end.dir, len);
}

function addWireEnd(group: THREE.Group, tip: THREE.Vector3, end: WireEnd, wireId: string): void {
  if (end.contact === 'header') addDupontHousing(group, tip, end.dir, wireId);
  else addSolderJoint(group, tip, end.dir, wireId);
}

/**
 * Generates a top-notch CAD cable harness mesh between two world pin coordinates:
 * dead-straight filleted orthogonal / arm runs, obstacle-avoiding bus lanes, 2.54mm DuPont connectors,
 * 3-conductor ESC motor looms, cable-tie clamps, and optional manual tie-point clips.
 */
export function buildWireGroup(
  fromWorld: THREE.Vector3,
  toWorld: THREE.Vector3,
  opts: WireRenderOptions,
): THREE.Group {
  const group = new THREE.Group();
  const fromEnd = opts.fromEnd ?? DEFAULT_END;
  const toEnd = opts.toEnd ?? DEFAULT_END;
  // The wire leaves the top of each DuPont socket (or the end of the heat-shrink), not the pin tip it covers.
  const fromTop = wireExit(fromWorld, fromEnd);
  const toTop = wireExit(toWorld, toEnd);
  const points = computeHarnessPoints(fromTop, toTop, opts);
  const bendRadius = opts.style === 'arched' ? 0.24 : 0.3;
  const curvePath = buildFilletedCurvePath(points, bendRadius);
  if (curvePath.curves.length === 0) return group;

  const baseRadius = opts.isPower ? 0.078 : 0.056;
  const radius = opts.selected ? baseRadius * 1.48 : baseRadius;
  const totalLen = curvePath.getLength();
  const tubularSegs = Math.max(24, Math.min(96, Math.round(totalLen * 5.5)));

  const insulationMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(opts.color),
    roughness: 0.46,
    metalness: 0.06,
    emissive: opts.selected ? new THREE.Color(opts.color) : new THREE.Color(0x000000),
    emissiveIntensity: opts.selected ? 0.55 : 0,
  });

  if (opts.isEscPhase) {
    // Realistic 3-conductor parallel brushless ESC phase loom tucked cleanly along drone arm!
    const dir = toWorld.clone().sub(fromWorld);
    const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    const strandOffsets = [-0.14, 0, 0.14];
    const strandColors = [opts.color, '#18181b', opts.color];
    strandOffsets.forEach((off, idx) => {
      const shiftedPts = points.map((p, pIdx) => {
        if (pIdx === 0 || pIdx === points.length - 1) return p.clone();
        return p.clone().addScaledVector(perp, off);
      });
      const strandPath = buildFilletedCurvePath(shiftedPts, 0.22);
      const geo = new THREE.TubeGeometry(strandPath, Math.max(20, Math.round(tubularSegs * 0.7)), opts.selected ? 0.068 : 0.048, 8, false);
      const mat = idx === 1
        ? new THREE.MeshStandardMaterial({ color: strandColors[idx], roughness: 0.5 })
        : insulationMat;
      const strandMesh = new THREE.Mesh(geo, mat);
      strandMesh.castShadow = true;
      strandMesh.userData = { pickType: 'wire', wireId: opts.wireId };
      group.add(strandMesh);
    });

    // Black zip-tie collar sleeves holding the 3-wire motor loom neatly to the carbon arm
    const tieMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.72 });
    for (const frac of [0.35, 0.65]) {
      const pt = curvePath.getPointAt(frac);
      const tan = curvePath.getTangentAt(frac);
      const tie = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.22), tieMat);
      tie.position.copy(pt);
      tie.rotation.y = Math.atan2(tan.x, tan.z);
      tie.userData = { pickType: 'wire', wireId: opts.wireId };
      group.add(tie);
    }
  } else {
    const geo = new THREE.TubeGeometry(curvePath, tubularSegs, radius, 10, false);
    const tube = new THREE.Mesh(geo, insulationMat);
    tube.castShadow = true;
    tube.userData = { pickType: 'wire', wireId: opts.wireId };
    group.add(tube);

    // Neat matte-black cable-tie collars along long routed runs (> 6.5 cm)
    if (opts.style === 'routed' && totalLen > 6.5) {
      const tieMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.7 });
      const tieGeo = new THREE.CylinderGeometry(radius * 1.42, radius * 1.42, 0.16, 10);
      for (const frac of [0.35, 0.65]) {
        const pt = curvePath.getPointAt(frac);
        const tan = curvePath.getTangentAt(frac).normalize();
        const collar = new THREE.Mesh(tieGeo, tieMat);
        collar.position.copy(pt);
        collar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
        collar.userData = { pickType: 'wire', wireId: opts.wireId };
        group.add(collar);
      }
    }
  }

  // Render crisp tie-down clips at every manual waypoint
  if (opts.waypoints && opts.waypoints.length > 0) {
    const clipMat = new THREE.MeshStandardMaterial({
      color: opts.selected ? 0x0d9488 : 0x334155,
      roughness: 0.45,
      metalness: 0.25,
    });
    for (const wp of opts.waypoints) {
      const clip = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.16, 12), clipMat);
      clip.position.set(wp[0], Math.max(0.55, wp[1]), wp[2]);
      clip.userData = { pickType: 'wire', wireId: opts.wireId };
      group.add(clip);
    }
  }

  // DuPont sockets on header pins, solder joints on leads and pads
  addWireEnd(group, fromWorld, fromEnd, opts.wireId);
  addWireEnd(group, toWorld, toEnd, opts.wireId);

  group.userData = { pickType: 'wire', wireId: opts.wireId };
  return group;
}
