import * as THREE from 'three';
import { moduleHeaderPins, moduleTip, type ModuleGeom } from '../../catalog/moduleGeometry';
import type { BoardPainter } from '../kit/boardArt';
import { addHeaderPins } from '../kit/headers';
import { PBR } from '../kit/pbr';
import { buildPcb, MM, type PcbResult } from '../kit/pcb';

/**
 * A module board from its geometry (catalog/moduleGeometry.ts): the PCB with its holes, a plated ring under every
 * header pin (square at pin 1 of each row), the pin labels in silkscreen, the solder pads, and the upright header
 * pins standing exactly on the catalog's pin tips. Builders add the module's own parts on top with `at`.
 */
export function moduleBoard(group: THREE.Group, g: ModuleGeom, opts: { draw?: (p: BoardPainter) => void; headers?: boolean; silk?: boolean; labelMm?: number } = {}): PcbResult {
  const pins = moduleHeaderPins(g);
  const labelMm = opts.labelMm ?? 0.95;
  const board = buildPcb({
    key: g.key,
    wMm: g.wMm,
    dMm: g.dMm,
    cornerMm: g.cornerMm ?? 0.9,
    mask: g.mask,
    yBottom: g.boardBottomMm * MM,
    holes: g.holes,
    draw: (p) => {
      for (const h of g.holes ?? []) p.ring(h.x, h.y, h.d + 1.4, h.d, { finish: 'tin' });
      let prevRow: unknown = null;
      for (const h of pins) {
        p.ring(h.x, h.y, 1.75, 1.02, { finish: 'tin', square: h.row !== prevRow });
        prevRow = h.row;
        if (opts.silk === false) continue;
        const side = h.row.silkSide ?? (h.row.axis === 'x' ? 'n' : 'e');
        const off = 1.5 + h.silk.length * 0.3 * (labelMm / 0.95);
        // labels beside a row along x stand on end so they do not run into each other
        if (side === 'n') p.silkText(h.silk, h.x, h.y - off, labelMm, { rot: -Math.PI / 2 });
        else if (side === 's') p.silkText(h.silk, h.x, h.y + off, labelMm, { rot: -Math.PI / 2 });
        else if (side === 'e') p.silkText(h.silk, h.x + 1.5, h.y, labelMm, { align: 'left' });
        else p.silkText(h.silk, h.x - 1.5, h.y, labelMm, { align: 'right' });
      }
      for (const pad of g.pads ?? []) {
        p.pad(pad.x, pad.y, 2.4, 1.9, { finish: 'tin', radiusMm: 0.3 });
        if (pad.silk && opts.silk !== false) {
          const inward = pad.x < g.wMm / 2 ? 1 : -1;
          p.silkText(pad.silk, pad.x + inward * 2.0, pad.y, labelMm, { align: inward > 0 ? 'left' : 'right' });
        }
      }
      opts.draw?.(p);
    },
  });
  group.add(board.mesh);
  if (opts.headers !== false && pins.length) {
    addHeaderPins(group, { tips: pins.map((h) => moduleTip(g, h.id)), boardTop: board.top, boardBottom: board.bottom });
  }
  return board;
}

/** Solder blobs on pads (a module's pads come pre-tinned). */
export function tinnedPads(group: THREE.Group, g: ModuleGeom, board: PcbResult): void {
  for (const pad of g.pads ?? []) {
    const blob = new THREE.Mesh(new THREE.SphereGeometry(0.8 * MM, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), PBR.solder());
    blob.scale.set(1.3, 0.35, 1.0);
    const at = board.at(pad.x, pad.y);
    blob.position.set(at.x, board.top, at.z);
    group.add(blob);
  }
}
