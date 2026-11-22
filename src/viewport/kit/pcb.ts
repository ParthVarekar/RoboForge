import * as THREE from 'three';
import { createBoardArt, boardTopMaterial, type BoardPainter } from './boardArt';
import { PBR, solderMask } from './pbr';

/** Scene units are centimetres; datasheet numbers are millimetres. */
export const MM = 0.1;

export interface PcbHole {
  /** Board coordinates in mm: x from the left edge, y from the top (north) edge. */
  x: number;
  y: number;
  d: number;
}

export interface PcbOptions {
  key: string;
  wMm: number;
  dMm: number;
  thicknessMm?: number;
  cornerMm?: number;
  mask: string;
  silk?: string;
  holes?: readonly PcbHole[];
  /** Height of the board's underside in the part's frame, in cm. */
  yBottom: number;
  clearcoat?: number;
  draw: (p: BoardPainter) => void;
}

export interface PcbResult {
  mesh: THREE.Mesh;
  /** y of the top face (cm). */
  top: number;
  /** y of the underside (cm). */
  bottom: number;
  /** Board-mm (x from left, y from top) to part-frame cm, on the top face. */
  at: (xMm: number, yMm: number) => THREE.Vector3;
}

function roundedRect(shape: THREE.Shape | THREE.Path, x0: number, y0: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  shape.moveTo(x0 + rr, y0);
  shape.lineTo(x0 + w - rr, y0);
  shape.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + rr);
  shape.lineTo(x0 + w, y0 + h - rr);
  shape.quadraticCurveTo(x0 + w, y0 + h, x0 + w - rr, y0 + h);
  shape.lineTo(x0 + rr, y0 + h);
  shape.quadraticCurveTo(x0, y0 + h, x0, y0 + h - rr);
  shape.lineTo(x0, y0 + rr);
  shape.quadraticCurveTo(x0, y0, x0 + rr, y0);
}

/**
 * A printed circuit board: rounded outline, drilled holes, 1.6 mm FR-4 with the tan glass-epoxy showing on the cut
 * edges, procedural artwork on the top face, plain mask underneath. The board is centred on the part origin in x/z.
 */
export function buildPcb(o: PcbOptions): PcbResult {
  const t = o.thicknessMm ?? 1.6;
  const w = o.wMm;
  const d = o.dMm;
  const shape = new THREE.Shape();
  roundedRect(shape, -w / 2, -d / 2, w, d, o.cornerMm ?? 0.8);
  for (const hole of o.holes ?? []) {
    const p = new THREE.Path();
    p.absarc(hole.x - w / 2, d / 2 - hole.y, hole.d / 2, 0, Math.PI * 2, true);
    shape.holes.push(p);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 10 });

  // Cap UVs follow the board outline (0..1 over the board), so the artwork lands in millimetres where it was drawn.
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < pos.count; i += 1) {
    uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + d / 2) / d);
  }
  uv.needsUpdate = true;

  // ExtrudeGeometry puts both caps in group 0 (bottom faces first, then top faces). Split them so the top gets the
  // artwork and the underside gets plain mask.
  const g0 = geo.groups[0];
  if (g0) {
    let split = g0.start + g0.count;
    for (let i = g0.start; i < g0.start + g0.count; i += 3) {
      if (Math.abs(pos.getZ(i) - t) < 1e-6 && Math.abs(pos.getZ(i + 1) - t) < 1e-6 && Math.abs(pos.getZ(i + 2) - t) < 1e-6) {
        split = i;
        break;
      }
    }
    const groups = geo.groups.slice(1);
    geo.clearGroups();
    if (split > g0.start) geo.addGroup(g0.start, split - g0.start, 2);
    geo.addGroup(split, g0.start + g0.count - split, 0);
    for (const g of groups) geo.addGroup(g.start, g.count, g.materialIndex ?? 1);
  }

  geo.scale(MM, MM, MM);
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();

  const art = createBoardArt(o.key, w, d, { mask: o.mask, silk: o.silk }, o.draw);
  const mesh = new THREE.Mesh(geo, [boardTopMaterial(art, o.clearcoat ?? 0.5, o.mask), PBR.fr4Edge(), solderMask(parseInt(o.mask.slice(1), 16))]);
  mesh.position.y = o.yBottom;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const top = o.yBottom + t * MM;
  return {
    mesh,
    top,
    bottom: o.yBottom,
    at: (xMm, yMm) => new THREE.Vector3((xMm - w / 2) * MM, top, (yMm - d / 2) * MM),
  };
}

/** Rounded-corner rectangle outline in the XY plane (mm), handy for extruded plates and housings. */
export function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  roundedRect(s, -w / 2, -h / 2, w, h, r);
  return s;
}
