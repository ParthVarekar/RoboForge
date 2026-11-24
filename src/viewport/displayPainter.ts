import type * as THREE from 'three';
import { LCD_BLINK_MS, type DisplayBench, type DisplayPanel, type Hd44780Panel, type Ssd1306Panel } from '../engine/displays/panels';

/**
 * Paints what each display module shows onto its 3D screen: the OLED's 128 x 64 dot matrix and the LCD's character
 * cells, from the panel state the sketch drives (see engine/displays). Screens repaint only when their panel changes,
 * or on the blink / scroll clock while one of those is running.
 */

/** Where the LCD's characters sit on its screen canvas (mm on the glass; the canvas covers the viewing area). */
export interface LcdCanvasLayout {
  pxPerMm: number;
  viewW: number;
  viewD: number;
  cols: number;
  rows: number;
  charW: number;
  charD: number;
  pitchX: number;
  pitchY: number;
}

export interface DisplaySurface {
  type: 'oled' | 'lcd';
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  material: THREE.MeshStandardMaterial;
  lcd?: LcdCanvasLayout;
}

export interface PlacedDisplaySurface {
  componentId: string;
  surface: DisplaySurface;
}

/* ================================================================== OLED */

const OLED_YELLOW: [number, number, number] = [255, 210, 58];
const OLED_BLUE: [number, number, number] = [76, 200, 255];

/**
 * A 0.96" two-colour SSD1306: top 16 rows yellow, the rest sky blue, each lit pixel a square with the thin dark gap
 * between OLED pixels. Unpowered or switched off it is plain black.
 */
export function paintOled(canvas: HTMLCanvasElement, panel: Ssd1306Panel | undefined, nowMs: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const img = ctx.createImageData(W, H);
  const px = new Uint32Array(img.data.buffer);
  px.fill(0xff000000);
  if (panel && panel.powered && panel.on) {
    const sx = W / 128;
    const sy = H / 64;
    const k = panel.dimmed ? 0.5 : 1;
    const pack = (c: [number, number, number], f: number) =>
      (0xff << 24) | (Math.round(c[2] * f * k) << 16) | (Math.round(c[1] * f * k) << 8) | Math.round(c[0] * f * k);
    const yellow = pack(OLED_YELLOW, 1);
    const blue = pack(OLED_BLUE, 1);
    const yellowGap = pack(OLED_YELLOW, 0.28);
    const blueGap = pack(OLED_BLUE, 0.28);
    for (let y = 0; y < 64; y += 1) {
      const full = y < 16 ? yellow : blue;
      const gap = y < 16 ? yellowGap : blueGap;
      const y0 = Math.floor(y * sy);
      const y1 = Math.floor((y + 1) * sy);
      for (let x = 0; x < 128; x += 1) {
        if (!panel.lit(x, y, nowMs)) continue;
        const x0 = Math.floor(x * sx);
        const x1 = Math.floor((x + 1) * sx);
        for (let yy = y0; yy < y1; yy += 1) {
          const edgeY = yy === y1 - 1;
          const row = yy * W;
          for (let xx = x0; xx < x1; xx += 1) px[row + xx] = edgeY || xx === x1 - 1 ? gap : full;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

/* ================================================================== LCD */

type Rgb = [number, number, number];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: Rgb) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

/**
 * A blue STN character LCD: with the backlight on, white dots on blue (the unlit dots just visible); with it off the
 * glass is dark and the characters faint. Before the sketch initialises it, the first line shows solid blocks.
 */
export function paintLcd(canvas: HTMLCanvasElement, layout: LcdCanvasLayout, panel: Hd44780Panel | undefined, nowMs: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const powered = Boolean(panel?.powered);
  const lit = powered && Boolean(panel?.backlight);
  const bg: Rgb = lit ? [38, 86, 228] : powered ? [20, 36, 82] : [18, 30, 66];
  const offDot: Rgb = lit ? [33, 78, 214] : [19, 34, 78];
  const onFull: Rgb = lit ? [236, 244, 255] : [78, 96, 140];

  // glass with the backlight's light falling off toward the ends
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, css(mix(bg, [0, 0, 0], lit ? 0.12 : 0.05)));
  grad.addColorStop(0.5, css(bg));
  grad.addColorStop(1, css(mix(bg, [0, 0, 0], lit ? 0.12 : 0.05)));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  if (!panel || !powered) return;

  const on = mix(offDot, onFull, panel.contrast());
  const s = layout.pxPerMm;
  const activeW = layout.cols * layout.pitchX - (layout.pitchX - layout.charW);
  const activeD = layout.rows * layout.pitchY - (layout.pitchY - layout.charD);
  const ox = (layout.viewW - activeW) / 2;
  const oy = (layout.viewD - activeD) / 2;
  const dotPX = layout.charW / 5;
  const dotPY = layout.charD / 8;
  const dw = dotPX * 0.9 * s;
  const dh = dotPY * 0.9 * s;
  const onCss = css(on);
  const offCss = css(offDot);
  for (let r = 0; r < layout.rows; r += 1) {
    for (let c = 0; c < layout.cols; c += 1) {
      const cell = panel.cellRows(r, c, nowMs);
      const cx = (ox + c * layout.pitchX) * s;
      const cy = (oy + r * layout.pitchY) * s;
      for (let j = 0; j < 8; j += 1) {
        const bits = cell ? (cell[j] ?? 0) : 0;
        for (let i = 0; i < 5; i += 1) {
          ctx.fillStyle = (bits >> (4 - i)) & 1 ? onCss : offCss;
          ctx.fillRect(cx + i * dotPX * s, cy + j * dotPY * s, dw, dh);
        }
      }
    }
  }
}

/* ================================================================== driving the surfaces */

const painted = new WeakMap<DisplaySurface, string>();

/** What would change the picture: the panel's version and, while blinking or scrolling, the animation step. */
function paintKey(panel: DisplayPanel | undefined, nowMs: number): string {
  if (!panel) return 'none';
  if (panel.type === 'lcd') return `${panel.version}:${panel.animated() ? Math.floor(nowMs / LCD_BLINK_MS) : 0}`;
  const s = panel.scroll;
  return `${panel.version}:${s && panel.on ? Math.floor((nowMs - s.t0) / s.stepMs) : 0}`;
}

/** Repaints every screen whose panel changed since it was last painted. Cheap when nothing changed. */
export function paintDisplays(surfaces: readonly PlacedDisplaySurface[], bench: DisplayBench | null, nowMs: number): void {
  for (const { componentId, surface } of surfaces) {
    const panel = bench?.panel(componentId);
    const key = paintKey(panel, nowMs);
    if (painted.get(surface) === key) continue;
    painted.set(surface, key);
    if (surface.type === 'oled') {
      paintOled(surface.canvas, panel?.type === 'oled' ? panel : undefined, nowMs);
    } else if (surface.lcd) {
      const lcd = panel?.type === 'lcd' ? panel : undefined;
      paintLcd(surface.canvas, surface.lcd, lcd, nowMs);
      // the backlit glass glows; unlit it only reflects the room
      surface.material.emissiveIntensity = lcd?.powered && lcd.backlight ? 1.15 : 0.45;
    }
    surface.texture.needsUpdate = true;
  }
}
