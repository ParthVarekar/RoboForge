import * as THREE from 'three';

/**
 * Bent wire and component leads: a tube along a polyline whose corners are rounded with a small bend radius, the
 * way a formed resistor leg or a soft silicone wire actually bends (a spline would overshoot and bow).
 */
export function bentPath(points: readonly THREE.Vector3[], bendRadius: number): THREE.CurvePath<THREE.Vector3> {
  const path = new THREE.CurvePath<THREE.Vector3>();
  if (points.length < 2) return path;
  let cursor = points[0]!.clone();
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    const next = points[i + 1]!;
    const inDir = cur.clone().sub(prev);
    const outDir = next.clone().sub(cur);
    const r = Math.min(bendRadius, inDir.length() * 0.45, outDir.length() * 0.45);
    const a = cur.clone().addScaledVector(inDir.normalize(), -r);
    const b = cur.clone().addScaledVector(outDir.normalize(), r);
    if (cursor.distanceTo(a) > 1e-5) path.add(new THREE.LineCurve3(cursor, a));
    path.add(new THREE.QuadraticBezierCurve3(a, cur.clone(), b));
    cursor = b;
  }
  const last = points[points.length - 1]!;
  if (cursor.distanceTo(last) > 1e-5) path.add(new THREE.LineCurve3(cursor, last));
  return path;
}

/** A round lead or wire of `radius` (cm) along the given points. */
export function leadTube(points: readonly THREE.Vector3[], radius: number, mat: THREE.Material, bendRadius = radius * 3, radial = 10): THREE.Mesh {
  const path = bentPath(points, bendRadius);
  const segs = Math.max(8, Math.round(path.getLength() / (radius * 1.5)));
  const m = new THREE.Mesh(new THREE.TubeGeometry(path, Math.min(160, segs), radius, radial, false), mat);
  m.castShadow = true;
  return m;
}

/** Shorthand for a point. */
export const v3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
