import * as THREE from 'three';
import { markShared } from './pbr';

/**
 * Procedural PCB artwork drawn in real millimetres.
 *
 * One call paints three canvases at once: the colour map (solder mask, copper seen through the mask, exposed pads,
 * silkscreen), an "ORM" map (green = roughness, blue = metalness, the channels three.js reads) so exposed pads are
 * metal and the mask is satin, and a bump map so traces and silkscreen stand slightly proud of the board.
 * Coordinates: x from the left edge, y from the top (north) edge of the board, both in mm.
 */

export type PadFinish = 'gold' | 'tin';

export interface BoardPainter {
  readonly wMm: number;
  readonly dMm: number;
  /**
   * Copper trace under the solder mask (shows as a lighter tint and a faint ridge). `clearanceMm` cuts the gap a
   * trace has when it runs through a copper pour, so it reads as an outlined line the way it does on real boards.
   */
  trace(points: ReadonlyArray<readonly [number, number]>, widthMm: number, clearanceMm?: number): void;
  /** Filled copper pour under the mask (ground plane areas). */
  pour(x: number, y: number, w: number, h: number): void;
  /** Exposed pad (no mask): rectangle or round. */
  pad(x: number, y: number, w: number, h: number, opts?: { round?: boolean; finish?: PadFinish; radiusMm?: number }): void;
  /** Plated through-hole ring (annular ring with the drilled hole). */
  ring(x: number, y: number, outerMm: number, holeMm: number, opts?: { square?: boolean; finish?: PadFinish }): void;
  /** Small tented via (mask-covered dot with a ring ridge). */
  via(x: number, y: number, dMm?: number): void;
  silkText(
    text: string,
    x: number,
    y: number,
    sizeMm: number,
    opts?: { align?: CanvasTextAlign; rot?: number; weight?: number; color?: string; font?: string; baseline?: CanvasTextBaseline },
  ): void;
  silkLine(points: ReadonlyArray<readonly [number, number]>, widthMm?: number, closed?: boolean): void;
  silkRect(x: number, y: number, w: number, h: number, widthMm?: number, fill?: boolean): void;
  silkCircle(x: number, y: number, rMm: number, widthMm?: number, fill?: boolean): void;
  /** Unmasked bare-copper/ENIG area such as an antenna or edge finger. */
  copperArt(path: ReadonlyArray<readonly [number, number]>, widthMm: number, finish?: PadFinish): void;
}

export interface BoardArt {
  map: THREE.CanvasTexture;
  orm: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
}

export interface BoardArtOptions {
  mask: string;
  silk?: string;
  /** Colour copper takes when seen through this mask (defaults to a lighter mask tint). */
  copperUnderMask?: string;
  maxPx?: number;
}

const artCache = new Map<string, BoardArt>();

const FINISH_COLOR: Record<PadFinish, string> = { gold: '#d7a94f', tin: '#c9ccd0' };
const FINISH_ROUGH: Record<PadFinish, number> = { gold: 70, tin: 85 };

/** Lighter (or darker for pale masks) tint of a mask colour, the way copper shows through green/blue/black masks. */
function tint(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const k = lum > 150 ? -amount : amount;
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (k > 0 ? (255 - c) * k : c * k))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export function createBoardArt(
  key: string,
  wMm: number,
  dMm: number,
  opts: BoardArtOptions,
  draw: (p: BoardPainter) => void,
): BoardArt {
  const hit = artCache.get(key);
  if (hit) return hit;

  const maxPx = opts.maxPx ?? 2048;
  const s = Math.min(32, maxPx / Math.max(wMm, dMm));
  const W = Math.max(8, Math.round(wMm * s));
  const H = Math.max(8, Math.round(dMm * s));
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return c;
  };
  const colorCanvas = mk();
  const ormCanvas = mk();
  const bumpCanvas = mk();
  const cx = colorCanvas.getContext('2d');
  const ox = ormCanvas.getContext('2d');
  const bx = bumpCanvas.getContext('2d');
  if (!cx || !ox || !bx) throw new Error('2D canvas unavailable');

  const silk = opts.silk ?? '#f2f2ee';
  const under = opts.copperUnderMask ?? tint(opts.mask, 0.16);

  // Base: solder mask (satin), flat bump
  cx.fillStyle = opts.mask;
  cx.fillRect(0, 0, W, H);
  ox.fillStyle = 'rgb(255,120,0)';
  ox.fillRect(0, 0, W, H);
  bx.fillStyle = 'rgb(110,110,110)';
  bx.fillRect(0, 0, W, H);

  // Very fine mask texture so large boards are not a flat colour (glass weave shows through thin mask)
  const grain = cx.createImageData(W, H);
  for (let i = 0; i < grain.data.length; i += 4) {
    const v = (Math.random() - 0.5) * 7;
    grain.data[i] = v > 0 ? 255 : 0;
    grain.data[i + 1] = v > 0 ? 255 : 0;
    grain.data[i + 2] = v > 0 ? 255 : 0;
    grain.data[i + 3] = Math.abs(v);
  }
  const tmp = mk();
  tmp.getContext('2d')?.putImageData(grain, 0, 0);
  cx.drawImage(tmp, 0, 0);

  const P = (v: number) => v * s;
  const strokePath = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<readonly [number, number]>, closed = false) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(P(x), P(y)) : ctx.lineTo(P(x), P(y))));
    if (closed) ctx.closePath();
  };

  const painter: BoardPainter = {
    wMm,
    dMm,
    trace(points, widthMm, clearanceMm) {
      if (clearanceMm) {
        for (const [ctx, style] of [
          [cx, opts.mask],
          [bx, 'rgb(110,110,110)'],
        ] as const) {
          ctx.strokeStyle = style;
          ctx.lineWidth = Math.max(1, P(widthMm + clearanceMm * 2));
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          strokePath(ctx, points);
          ctx.stroke();
        }
      }
      for (const [ctx, style] of [
        [cx, under],
        [bx, 'rgb(150,150,150)'],
      ] as const) {
        ctx.strokeStyle = style;
        ctx.lineWidth = Math.max(1, P(widthMm));
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        strokePath(ctx, points);
        ctx.stroke();
      }
    },
    pour(x, y, w, h) {
      cx.fillStyle = tint(opts.mask, 0.07);
      cx.fillRect(P(x), P(y), P(w), P(h));
      bx.fillStyle = 'rgb(125,125,125)';
      bx.fillRect(P(x), P(y), P(w), P(h));
    },
    pad(x, y, w, h, o) {
      const finish = o?.finish ?? 'gold';
      const draw1 = (ctx: CanvasRenderingContext2D, style: string) => {
        ctx.fillStyle = style;
        ctx.beginPath();
        if (o?.round) ctx.ellipse(P(x), P(y), P(w / 2), P(h / 2), 0, 0, Math.PI * 2);
        else if (o?.radiusMm) ctx.roundRect(P(x - w / 2), P(y - h / 2), P(w), P(h), P(o.radiusMm));
        else ctx.rect(P(x - w / 2), P(y - h / 2), P(w), P(h));
        ctx.fill();
      };
      draw1(cx, FINISH_COLOR[finish]);
      draw1(ox, `rgb(255,${FINISH_ROUGH[finish]},255)`);
      draw1(bx, 'rgb(165,165,165)');
    },
    ring(x, y, outerMm, holeMm, o) {
      const finish = o?.finish ?? 'gold';
      for (const [ctx, style] of [
        [cx, FINISH_COLOR[finish]],
        [ox, `rgb(255,${FINISH_ROUGH[finish]},255)`],
        [bx, 'rgb(170,170,170)'],
      ] as const) {
        ctx.fillStyle = style;
        ctx.beginPath();
        if (o?.square) ctx.rect(P(x - outerMm / 2), P(y - outerMm / 2), P(outerMm), P(outerMm));
        else ctx.arc(P(x), P(y), P(outerMm / 2), 0, Math.PI * 2);
        ctx.fill();
      }
      // drilled hole: dark, rough, recessed
      cx.fillStyle = '#16120c';
      ox.fillStyle = 'rgb(255,240,0)';
      bx.fillStyle = 'rgb(20,20,20)';
      for (const ctx of [cx, ox, bx]) {
        ctx.beginPath();
        ctx.arc(P(x), P(y), P(holeMm / 2), 0, Math.PI * 2);
        ctx.fill();
      }
    },
    via(x, y, dMm = 0.6) {
      cx.fillStyle = under;
      cx.beginPath();
      cx.arc(P(x), P(y), P(dMm / 2), 0, Math.PI * 2);
      cx.fill();
      cx.fillStyle = tint(opts.mask, -0.25);
      cx.beginPath();
      cx.arc(P(x), P(y), P(dMm / 5), 0, Math.PI * 2);
      cx.fill();
      bx.fillStyle = 'rgb(150,150,150)';
      bx.beginPath();
      bx.arc(P(x), P(y), P(dMm / 2), 0, Math.PI * 2);
      bx.fill();
    },
    silkText(text, x, y, sizeMm, o) {
      const weight = o?.weight ?? 700;
      const font = o?.font ?? '"Arial Narrow", "Roboto Condensed", Arial, sans-serif';
      for (const [ctx, style] of [
        [cx, o?.color ?? silk],
        [ox, 'rgb(255,215,0)'],
        [bx, 'rgb(135,135,135)'],
      ] as const) {
        ctx.save();
        ctx.translate(P(x), P(y));
        if (o?.rot) ctx.rotate(o.rot);
        ctx.fillStyle = style;
        ctx.font = `${weight} ${P(sizeMm)}px ${font}`;
        ctx.textAlign = o?.align ?? 'center';
        ctx.textBaseline = o?.baseline ?? 'middle';
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }
    },
    silkLine(points, widthMm = 0.15, closed = false) {
      for (const [ctx, style] of [
        [cx, silk],
        [ox, 'rgb(255,215,0)'],
        [bx, 'rgb(135,135,135)'],
      ] as const) {
        ctx.strokeStyle = style;
        ctx.lineWidth = Math.max(1, P(widthMm));
        ctx.lineJoin = 'miter';
        strokePath(ctx, points, closed);
        ctx.stroke();
      }
    },
    silkRect(x, y, w, h, widthMm = 0.15, fill = false) {
      for (const [ctx, style] of [
        [cx, silk],
        [ox, 'rgb(255,215,0)'],
        [bx, 'rgb(135,135,135)'],
      ] as const) {
        if (fill) {
          ctx.fillStyle = style;
          ctx.fillRect(P(x), P(y), P(w), P(h));
        } else {
          ctx.strokeStyle = style;
          ctx.lineWidth = Math.max(1, P(widthMm));
          ctx.strokeRect(P(x), P(y), P(w), P(h));
        }
      }
    },
    silkCircle(x, y, rMm, widthMm = 0.15, fill = false) {
      for (const [ctx, style] of [
        [cx, silk],
        [ox, 'rgb(255,215,0)'],
        [bx, 'rgb(135,135,135)'],
      ] as const) {
        ctx.beginPath();
        ctx.arc(P(x), P(y), P(rMm), 0, Math.PI * 2);
        if (fill) {
          ctx.fillStyle = style;
          ctx.fill();
        } else {
          ctx.strokeStyle = style;
          ctx.lineWidth = Math.max(1, P(widthMm));
          ctx.stroke();
        }
      }
    },
    copperArt(path, widthMm, finish = 'gold') {
      for (const [ctx, style] of [
        [cx, FINISH_COLOR[finish]],
        [ox, `rgb(255,${FINISH_ROUGH[finish]},255)`],
        [bx, 'rgb(160,160,160)'],
      ] as const) {
        ctx.strokeStyle = style;
        ctx.lineWidth = Math.max(1, P(widthMm));
        ctx.lineCap = 'square';
        ctx.lineJoin = 'miter';
        strokePath(ctx, path);
        ctx.stroke();
      }
    },
  };

  draw(painter);

  const finish = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return markShared(t);
  };
  const art: BoardArt = { map: finish(colorCanvas, true), orm: finish(ormCanvas, false), bump: finish(bumpCanvas, false) };
  artCache.set(key, art);
  return art;
}

/** Relative luminance (0..255) of a #rrggbb colour. */
export function hexLuminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}

/**
 * A material for a board top built from its artwork. Dark masks get a lower base reflectance: in the bright studio
 * environment a full 4 % reflection plus the clear coat turns a black board mid-grey, which real boards never look.
 */
export function boardTopMaterial(art: BoardArt, clearcoat = 0.5, maskHex = '#1a7a3a'): THREE.MeshPhysicalMaterial {
  const dark = hexLuminance(maskHex) < 70;
  return new THREE.MeshPhysicalMaterial({
    map: art.map,
    roughnessMap: art.orm,
    metalnessMap: art.orm,
    roughness: 1,
    metalness: 1,
    bumpMap: art.bump,
    bumpScale: 0.6,
    clearcoat: dark ? clearcoat * 0.55 : clearcoat,
    clearcoatRoughness: 0.3,
    specularIntensity: dark ? 0.45 : 0.85,
  });
}

const labelCache = new Map<string, THREE.CanvasTexture>();

/**
 * Small text texture for laser-etched IC markings, printed labels and stickers. Transparent background,
 * cached by its content.
 */
export function labelTexture(
  lines: readonly string[],
  opts: { wPx?: number; hPx?: number; color?: string; bg?: string; font?: string; weight?: number; sizes?: readonly number[] } = {},
): THREE.CanvasTexture {
  const key = JSON.stringify([lines, opts]);
  const hit = labelCache.get(key);
  if (hit) return hit;
  const w = opts.wPx ?? 256;
  const h = opts.hPx ?? 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx) {
    if (opts.bg) {
      ctx.fillStyle = opts.bg;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.fillStyle = opts.color ?? 'rgba(205,208,212,0.85)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((line, i) => {
      const size = opts.sizes?.[i] ?? h / (n + 1.2);
      ctx.font = `${opts.weight ?? 600} ${size}px ${opts.font ?? '"Arial Narrow", Arial, sans-serif'}`;
      // maxWidth condenses a long line to fit instead of letting it run off the part
      ctx.fillText(line, w / 2, (h * (i + 1)) / (n + 1), w * 0.94);
    });
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  markShared(t);
  labelCache.set(key, t);
  return t;
}
