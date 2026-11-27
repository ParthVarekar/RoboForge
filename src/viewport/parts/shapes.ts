import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { labelTexture } from '../kit/boardArt';
import { MM } from '../kit/pcb';

/**
 * Small geometry helpers shared by the extended-library builders. All sizes here are already in centimetres (the
 * scene unit); callers multiply millimetres by MM.
 */

export function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, r = 0): THREE.Mesh {
  const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function cyl(r: number, h: number, mat: THREE.Material, x: number, y: number, z: number, seg = 40): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A cylinder lying along x (axis = 'x') or z. */
export function cylAlong(axis: 'x' | 'z', r: number, len: number, mat: THREE.Material, x: number, y: number, z: number, seg = 32): THREE.Mesh {
  const m = cyl(r, len, mat, x, y, z, seg);
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  else m.rotation.x = Math.PI / 2;
  return m;
}

/** A shape (mm, in the x/y plane) extruded `depthMm` along +z, scaled to cm. */
export function extrudeMm(shape: THREE.Shape, depthMm: number, bevelMm = 0, curveSegments = 16): THREE.ExtrudeGeometry {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: depthMm,
    bevelEnabled: bevelMm > 0,
    bevelSize: bevelMm,
    bevelThickness: bevelMm,
    bevelSegments: 2,
    curveSegments,
  });
  geo.scale(MM, MM, MM);
  return geo;
}

export function roundedRectPath(path: THREE.Shape | THREE.Path, x0: number, y0: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  path.moveTo(x0 + rr, y0);
  path.lineTo(x0 + w - rr, y0);
  path.absarc(x0 + w - rr, y0 + rr, rr, -Math.PI / 2, 0, false);
  path.lineTo(x0 + w, y0 + h - rr);
  path.absarc(x0 + w - rr, y0 + h - rr, rr, 0, Math.PI / 2, false);
  path.lineTo(x0 + rr, y0 + h);
  path.absarc(x0 + rr, y0 + h - rr, rr, Math.PI / 2, Math.PI, false);
  path.lineTo(x0, y0 + rr);
  path.absarc(x0 + rr, y0 + rr, rr, Math.PI, (3 * Math.PI) / 2, false);
}

/** A printed sticker on a vertical face: `face` -1 looks toward -z (north), 1 toward +z, 'e' / 'w' along x. */
export function sideLabel(
  group: THREE.Object3D,
  lines: readonly string[],
  wMm: number,
  hMm: number,
  x: number,
  y: number,
  z: number,
  face: 1 | -1 | 'e' | 'w',
  opts: { color?: string; bg?: string; sizes?: readonly number[]; weight?: number } = {},
): THREE.Mesh {
  const tex = labelTexture(lines, {
    wPx: 512,
    hPx: Math.max(32, Math.round((512 * hMm) / wMm)),
    color: opts.color ?? 'rgba(30,32,36,0.9)',
    bg: opts.bg,
    weight: opts.weight ?? 700,
    sizes: opts.sizes,
  });
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(wMm * MM, hMm * MM),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, transparent: !opts.bg, depthWrite: !!opts.bg, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  m.position.set(x, y, z);
  if (face === -1) m.rotation.y = Math.PI;
  else if (face === 'e') m.rotation.y = Math.PI / 2;
  else if (face === 'w') m.rotation.y = -Math.PI / 2;
  group.add(m);
  return m;
}

/** A flat label lying on a horizontal surface at height y (text reads from the south). */
export function topLabel(
  group: THREE.Object3D,
  lines: readonly string[],
  wMm: number,
  dMm: number,
  x: number,
  y: number,
  z: number,
  opts: { color?: string; bg?: string; sizes?: readonly number[]; weight?: number; rot?: number } = {},
): THREE.Mesh {
  const tex = labelTexture(lines, {
    wPx: 512,
    hPx: Math.max(32, Math.round((512 * dMm) / wMm)),
    color: opts.color ?? 'rgba(235,236,238,0.9)',
    bg: opts.bg,
    weight: opts.weight ?? 700,
    sizes: opts.sizes,
  });
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(wMm * MM, dMm * MM),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, transparent: !opts.bg, depthWrite: !!opts.bg, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  m.rotation.x = -Math.PI / 2;
  if (opts.rot) m.rotation.z = opts.rot;
  m.position.set(x, y, z);
  group.add(m);
  return m;
}
