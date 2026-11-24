import { formatPrintValue, textBytes } from '../printFormat';
import { gfxGlyph } from './font5x7';

/** SSD1306 colours: anything else (including Adafruit_GFX's default 0xFFFF) draws nothing, as in the real driver. */
export const SSD1306_BLACK = 0;
export const SSD1306_WHITE = 1;
export const SSD1306_INVERSE = 2;

const i16 = (v: unknown): number => (Math.trunc(Number(v) || 0) << 16) >> 16;

/** Point size of a GFX font named like FreeSans9pt7b, for the built-in font stand-in. */
function fontPoints(name: string): number {
  const m = /(\d+)pt/.exec(name);
  return m ? Number(m[1]) : 9;
}

/**
 * Adafruit_GFX drawing on a 1-bit frame buffer (`width x height`, one byte per pixel), with the algorithms of the
 * library (Bresenham lines, midpoint circles, rounded rectangles, scan-line triangle fill) so shapes land on the same
 * pixels as on a real display, plus the built-in 6 x 8 font with text size, wrap, background colour and rotation.
 *
 * Members without a leading underscore are the library's own names and are what a sketch can call.
 */
export class MonoGfx {
  protected readonly _w: number;
  protected readonly _h: number;
  /** Allocated by begin(), as the library does; drawing before it does nothing. */
  protected _buf: Uint8Array | null = null;
  protected _rotation = 0;
  protected _cursorX = 0;
  protected _cursorY = 0;
  protected _textColor = 0xffff;
  protected _textBg = 0xffff;
  protected _sizeX = 1;
  protected _sizeY = 1;
  protected _wrap = true;
  protected _cp437 = false;
  /** Name of a custom GFX font set with setFont(&Font), drawn with the built-in font scaled to about its size. */
  protected _font: string | null = null;
  /** Called once per drawing call (the facade uses it for its hints). */
  protected _onDraw: (() => void) | null = null;
  protected _textColorUsed = false;

  constructor(width: number, height: number) {
    this._w = Math.max(1, Math.min(256, Math.trunc(width) || 128));
    this._h = Math.max(1, Math.min(256, Math.trunc(height) || 64));
  }

  /** A fresh, cleared frame buffer (for the simulator's own drawing; sketches use begin()). */
  _alloc(): void {
    this._buf = new Uint8Array(this._w * this._h);
    this._cursorX = 0;
    this._cursorY = 0;
  }

  /** The frame buffer (empty before it is allocated). */
  _frame(): Uint8Array {
    return this._buf ?? new Uint8Array(this._w * this._h);
  }

  /* ---------------------------------------------------------------- geometry */

  width(): number {
    return this._rotation & 1 ? this._h : this._w;
  }

  height(): number {
    return this._rotation & 1 ? this._w : this._h;
  }

  setRotation(r: number): void {
    this._rotation = i16(r) & 3;
  }

  getRotation(): number {
    return this._rotation;
  }

  /* ---------------------------------------------------------------- pixels */

  drawPixel(x: number, y: number, color: number): void {
    this._onDraw?.();
    this._pixel(i16(x), i16(y), color);
  }

  getPixel(x: number, y: number): boolean {
    let px = i16(x);
    let py = i16(y);
    if (!this._buf || px < 0 || py < 0 || px >= this.width() || py >= this.height()) return false;
    [px, py] = this._unrotate(px, py);
    return this._buf[py * this._w + px] === 1;
  }

  protected _unrotate(x: number, y: number): [number, number] {
    switch (this._rotation) {
      case 1:
        return [this._w - y - 1, x];
      case 2:
        return [this._w - x - 1, this._h - y - 1];
      case 3:
        return [y, this._h - x - 1];
      default:
        return [x, y];
    }
  }

  protected _pixel(x: number, y: number, color: number): void {
    if (!this._buf || x < 0 || y < 0 || x >= this.width() || y >= this.height()) return;
    const [px, py] = this._unrotate(x, y);
    const i = py * this._w + px;
    if (color === SSD1306_WHITE) this._buf[i] = 1;
    else if (color === SSD1306_BLACK) this._buf[i] = 0;
    else if (color === SSD1306_INVERSE) this._buf[i] = this._buf[i] ? 0 : 1;
  }

  protected _vline(x: number, y: number, h: number, color: number): void {
    for (let j = 0; j < h; j += 1) this._pixel(x, y + j, color);
  }

  protected _hline(x: number, y: number, w: number, color: number): void {
    for (let i = 0; i < w; i += 1) this._pixel(x + i, y, color);
  }

  protected _fillRect(x: number, y: number, w: number, h: number, color: number): void {
    for (let j = 0; j < h; j += 1) this._hline(x, y + j, w, color);
  }

  /* ---------------------------------------------------------------- shapes */

  drawFastHLine(x: number, y: number, w: number, color: number): void {
    this._onDraw?.();
    let xx = i16(x);
    let ww = i16(w);
    if (ww < 0) {
      xx += ww + 1;
      ww = -ww;
    }
    this._hline(xx, i16(y), ww, color);
  }

  drawFastVLine(x: number, y: number, h: number, color: number): void {
    this._onDraw?.();
    let yy = i16(y);
    let hh = i16(h);
    if (hh < 0) {
      yy += hh + 1;
      hh = -hh;
    }
    this._vline(i16(x), yy, hh, color);
  }

  fillRect(x: number, y: number, w: number, h: number, color: number): void {
    this._onDraw?.();
    this._fillRect(i16(x), i16(y), i16(w), i16(h), color);
  }

  fillScreen(color: number): void {
    this._onDraw?.();
    this._fillRect(0, 0, this.width(), this.height(), color);
  }

  drawRect(x: number, y: number, w: number, h: number, color: number): void {
    this._onDraw?.();
    const [xx, yy, ww, hh] = [i16(x), i16(y), i16(w), i16(h)];
    if (ww <= 0 || hh <= 0) return;
    this._hline(xx, yy, ww, color);
    this._hline(xx, yy + hh - 1, ww, color);
    this._vline(xx, yy, hh, color);
    this._vline(xx + ww - 1, yy, hh, color);
  }

  protected _line(x0: number, y0: number, x1: number, y1: number, color: number): void {
    const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
    if (steep) {
      [x0, y0] = [y0, x0];
      [x1, y1] = [y1, x1];
    }
    if (x0 > x1) {
      [x0, x1] = [x1, x0];
      [y0, y1] = [y1, y0];
    }
    const dx = x1 - x0;
    const dy = Math.abs(y1 - y0);
    let err = Math.trunc(dx / 2);
    const ystep = y0 < y1 ? 1 : -1;
    for (; x0 <= x1; x0 += 1) {
      if (steep) this._pixel(y0, x0, color);
      else this._pixel(x0, y0, color);
      err -= dy;
      if (err < 0) {
        y0 += ystep;
        err += dx;
      }
    }
  }

  drawLine(x0: number, y0: number, x1: number, y1: number, color: number): void {
    this._onDraw?.();
    this._line(i16(x0), i16(y0), i16(x1), i16(y1), color);
  }

  drawCircle(x0: number, y0: number, r: number, color: number): void {
    this._onDraw?.();
    const cx = i16(x0);
    const cy = i16(y0);
    const rr = i16(r);
    let f = 1 - rr;
    let ddx = 1;
    let ddy = -2 * rr;
    let x = 0;
    let y = rr;
    this._pixel(cx, cy + rr, color);
    this._pixel(cx, cy - rr, color);
    this._pixel(cx + rr, cy, color);
    this._pixel(cx - rr, cy, color);
    while (x < y) {
      if (f >= 0) {
        y -= 1;
        ddy += 2;
        f += ddy;
      }
      x += 1;
      ddx += 2;
      f += ddx;
      this._pixel(cx + x, cy + y, color);
      this._pixel(cx - x, cy + y, color);
      this._pixel(cx + x, cy - y, color);
      this._pixel(cx - x, cy - y, color);
      this._pixel(cx + y, cy + x, color);
      this._pixel(cx - y, cy + x, color);
      this._pixel(cx + y, cy - x, color);
      this._pixel(cx - y, cy - x, color);
    }
  }

  protected _circleHelper(x0: number, y0: number, r: number, corner: number, color: number): void {
    let f = 1 - r;
    let ddx = 1;
    let ddy = -2 * r;
    let x = 0;
    let y = r;
    while (x < y) {
      if (f >= 0) {
        y -= 1;
        ddy += 2;
        f += ddy;
      }
      x += 1;
      ddx += 2;
      f += ddx;
      if (corner & 4) {
        this._pixel(x0 + x, y0 + y, color);
        this._pixel(x0 + y, y0 + x, color);
      }
      if (corner & 2) {
        this._pixel(x0 + x, y0 - y, color);
        this._pixel(x0 + y, y0 - x, color);
      }
      if (corner & 8) {
        this._pixel(x0 - y, y0 + x, color);
        this._pixel(x0 - x, y0 + y, color);
      }
      if (corner & 1) {
        this._pixel(x0 - y, y0 - x, color);
        this._pixel(x0 - x, y0 - y, color);
      }
    }
  }

  protected _fillCircleHelper(x0: number, y0: number, r: number, corners: number, delta: number, color: number): void {
    let f = 1 - r;
    let ddx = 1;
    let ddy = -2 * r;
    let x = 0;
    let y = r;
    let px = x;
    let py = y;
    const d = delta + 1;
    while (x < y) {
      if (f >= 0) {
        y -= 1;
        ddy += 2;
        f += ddy;
      }
      x += 1;
      ddx += 2;
      f += ddx;
      if (x < y + 1) {
        if (corners & 1) this._vline(x0 + x, y0 - y, 2 * y + d, color);
        if (corners & 2) this._vline(x0 - x, y0 - y, 2 * y + d, color);
      }
      if (y !== py) {
        if (corners & 1) this._vline(x0 + py, y0 - px, 2 * px + d, color);
        if (corners & 2) this._vline(x0 - py, y0 - px, 2 * px + d, color);
        py = y;
      }
      px = x;
    }
  }

  fillCircle(x0: number, y0: number, r: number, color: number): void {
    this._onDraw?.();
    const cx = i16(x0);
    const cy = i16(y0);
    const rr = i16(r);
    this._vline(cx, cy - rr, 2 * rr + 1, color);
    this._fillCircleHelper(cx, cy, rr, 3, 0, color);
  }

  drawRoundRect(x: number, y: number, w: number, h: number, r: number, color: number): void {
    this._onDraw?.();
    const [xx, yy, ww, hh] = [i16(x), i16(y), i16(w), i16(h)];
    let rr = i16(r);
    const maxR = Math.trunc((ww < hh ? ww : hh) / 2);
    if (rr > maxR) rr = maxR;
    this._hline(xx + rr, yy, ww - 2 * rr, color);
    this._hline(xx + rr, yy + hh - 1, ww - 2 * rr, color);
    this._vline(xx, yy + rr, hh - 2 * rr, color);
    this._vline(xx + ww - 1, yy + rr, hh - 2 * rr, color);
    this._circleHelper(xx + rr, yy + rr, rr, 1, color);
    this._circleHelper(xx + ww - rr - 1, yy + rr, rr, 2, color);
    this._circleHelper(xx + ww - rr - 1, yy + hh - rr - 1, rr, 4, color);
    this._circleHelper(xx + rr, yy + hh - rr - 1, rr, 8, color);
  }

  fillRoundRect(x: number, y: number, w: number, h: number, r: number, color: number): void {
    this._onDraw?.();
    const [xx, yy, ww, hh] = [i16(x), i16(y), i16(w), i16(h)];
    let rr = i16(r);
    const maxR = Math.trunc((ww < hh ? ww : hh) / 2);
    if (rr > maxR) rr = maxR;
    this._fillRect(xx + rr, yy, ww - 2 * rr, hh, color);
    this._fillCircleHelper(xx + ww - rr - 1, yy + rr, rr, 1, hh - 2 * rr - 1, color);
    this._fillCircleHelper(xx + rr, yy + rr, rr, 2, hh - 2 * rr - 1, color);
  }

  drawTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, color: number): void {
    this._onDraw?.();
    const p = [x0, y0, x1, y1, x2, y2].map(i16) as [number, number, number, number, number, number];
    this._line(p[0], p[1], p[2], p[3], color);
    this._line(p[2], p[3], p[4], p[5], color);
    this._line(p[4], p[5], p[0], p[1], color);
  }

  fillTriangle(ax0: number, ay0: number, ax1: number, ay1: number, ax2: number, ay2: number, color: number): void {
    this._onDraw?.();
    let [x0, y0, x1, y1, x2, y2] = [ax0, ay0, ax1, ay1, ax2, ay2].map(i16) as [number, number, number, number, number, number];
    if (y0 > y1) {
      [y0, y1] = [y1, y0];
      [x0, x1] = [x1, x0];
    }
    if (y1 > y2) {
      [y2, y1] = [y1, y2];
      [x2, x1] = [x1, x2];
    }
    if (y0 > y1) {
      [y0, y1] = [y1, y0];
      [x0, x1] = [x1, x0];
    }
    if (y0 === y2) {
      let a = x0;
      let b = x0;
      if (x1 < a) a = x1;
      else if (x1 > b) b = x1;
      if (x2 < a) a = x2;
      else if (x2 > b) b = x2;
      this._hline(a, y0, b - a + 1, color);
      return;
    }
    const dx01 = x1 - x0;
    const dy01 = y1 - y0;
    const dx02 = x2 - x0;
    const dy02 = y2 - y0;
    const dx12 = x2 - x1;
    const dy12 = y2 - y1;
    let sa = 0;
    let sb = 0;
    const last = y1 === y2 ? y1 : y1 - 1;
    let y = y0;
    for (; y <= last; y += 1) {
      let a = x0 + Math.trunc(sa / dy01);
      let b = x0 + Math.trunc(sb / dy02);
      sa += dx01;
      sb += dx02;
      if (a > b) [a, b] = [b, a];
      this._hline(a, y, b - a + 1, color);
    }
    sa = dx12 * (y - y1);
    sb = dx02 * (y - y0);
    for (; y <= y2; y += 1) {
      let a = x1 + Math.trunc(sa / dy12);
      let b = x0 + Math.trunc(sb / dy02);
      sa += dx12;
      sb += dx02;
      if (a > b) [a, b] = [b, a];
      this._hline(a, y, b - a + 1, color);
    }
  }

  /** 1-bit bitmap, rows padded to whole bytes, most significant bit first (the format image2cpp exports). */
  drawBitmap(x: number, y: number, bitmap: unknown, w: number, h: number, color: number, bg?: number): void {
    this._onDraw?.();
    const data = Array.isArray(bitmap) ? (bitmap as unknown[]) : [];
    const [xx, yy, ww, hh] = [i16(x), i16(y), i16(w), i16(h)];
    const byteWidth = Math.trunc((ww + 7) / 8);
    for (let j = 0; j < hh; j += 1) {
      for (let i = 0; i < ww; i += 1) {
        const byte = Number(data[j * byteWidth + (i >> 3)] ?? 0) & 0xff;
        if (byte & (0x80 >> (i & 7))) this._pixel(xx + i, yy + j, color);
        else if (bg !== undefined) this._pixel(xx + i, yy + j, bg);
      }
    }
  }

  /** XBM bitmap (least significant bit first), as exported by GIMP. */
  drawXBitmap(x: number, y: number, bitmap: unknown, w: number, h: number, color: number): void {
    this._onDraw?.();
    const data = Array.isArray(bitmap) ? (bitmap as unknown[]) : [];
    const [xx, yy, ww, hh] = [i16(x), i16(y), i16(w), i16(h)];
    const byteWidth = Math.trunc((ww + 7) / 8);
    for (let j = 0; j < hh; j += 1) {
      for (let i = 0; i < ww; i += 1) {
        const byte = Number(data[j * byteWidth + (i >> 3)] ?? 0) & 0xff;
        if (byte & (1 << (i & 7))) this._pixel(xx + i, yy + j, color);
      }
    }
  }

  /* ---------------------------------------------------------------- text */

  setCursor(x: number, y: number): void {
    this._cursorX = i16(x);
    this._cursorY = i16(y);
  }

  getCursorX(): number {
    return this._cursorX;
  }

  getCursorY(): number {
    return this._cursorY;
  }

  setTextSize(sx: number, sy?: number): void {
    this._sizeX = Math.max(1, Math.trunc(Number(sx) || 1));
    this._sizeY = Math.max(1, Math.trunc(Number(sy ?? sx) || 1));
  }

  setTextColor(c: number, bg?: number): void {
    this._textColorUsed = true;
    this._textColor = Number(c);
    this._textBg = bg === undefined ? Number(c) : Number(bg);
  }

  setTextWrap(w: boolean): void {
    this._wrap = Boolean(w);
  }

  cp437(on: boolean = true): void {
    this._cp437 = Boolean(on);
  }

  /** setFont(&FreeSans9pt7b) arrives as the font's name; setFont() or setFont(NULL) goes back to the built-in font. */
  setFont(font?: unknown): void {
    this._font = typeof font === 'string' && font ? font : null;
  }

  /** Text size the built-in font is drawn at for the current font (custom fonts are approximated by their size). */
  protected _scale(): [number, number] {
    if (!this._font) return [this._sizeX, this._sizeY];
    const k = Math.max(1, Math.round(fontPoints(this._font) / 7));
    return [this._sizeX * k, this._sizeY * k];
  }

  drawChar(x: number, y: number, c: unknown, color: number, bg: number, sizeX: number, sizeY?: number): void {
    this._onDraw?.();
    const code = typeof c === 'string' ? (c.charCodeAt(0) || 0) : Number(c) || 0;
    this._char(i16(x), i16(y), code, Number(color), Number(bg), Math.max(1, Math.trunc(sizeX) || 1), Math.max(1, Math.trunc(sizeY ?? sizeX) || 1));
  }

  protected _char(x: number, y: number, code: number, color: number, bg: number, sx: number, sy: number): void {
    if (x >= this.width() || y >= this.height() || x + 6 * sx - 1 < 0 || y + 8 * sy - 1 < 0) return;
    let c = code & 0xff;
    if (!this._cp437 && c >= 176) c += 1;
    const cols = gfxGlyph(c);
    for (let i = 0; i < 5; i += 1) {
      let line = cols[i] ?? 0;
      for (let j = 0; j < 8; j += 1, line >>= 1) {
        if (line & 1) {
          if (sx === 1 && sy === 1) this._pixel(x + i, y + j, color);
          else this._fillRect(x + i * sx, y + j * sy, sx, sy, color);
        } else if (bg !== color) {
          if (sx === 1 && sy === 1) this._pixel(x + i, y + j, bg);
          else this._fillRect(x + i * sx, y + j * sy, sx, sy, bg);
        }
      }
    }
    if (bg !== color) {
      if (sx === 1 && sy === 1) this._vline(x + 5, y, 8, bg);
      else this._fillRect(x + 5 * sx, y, sx, 8 * sy, bg);
    }
  }

  /** One byte through the text engine (Print::write): newline, carriage return, wrap, then the character. */
  protected _writeByte(byte: number): void {
    const [sx, sy] = this._scale();
    const custom = this._font !== null;
    const lineH = custom ? 8 * sy + 2 * this._sizeY : 8 * sy;
    if (byte === 10) {
      this._cursorX = 0;
      this._cursorY += lineH;
      return;
    }
    if (byte === 13) return;
    if (this._wrap && this._cursorX + sx * 6 > this.width()) {
      this._cursorX = 0;
      this._cursorY += lineH;
    }
    // a custom font's cursor is its baseline; the built-in font hangs below the cursor
    const top = custom ? this._cursorY - 7 * sy : this._cursorY;
    this._char(this._cursorX, top, byte, this._textColor, custom ? this._textColor : this._textBg, sx, sy);
    this._cursorX += sx * 6;
  }

  write(value: unknown): number {
    this._onDraw?.();
    if (typeof value === 'string') {
      const bytes = textBytes(value);
      for (const b of bytes) this._writeByte(b);
      return bytes.length;
    }
    this._writeByte(Number(value) & 0xff);
    return 1;
  }

  print(value: unknown = '', format?: number): number {
    this._onDraw?.();
    const bytes = textBytes(formatPrintValue(value, format));
    for (const b of bytes) this._writeByte(b);
    return bytes.length;
  }

  println(value: unknown = '', format?: number): number {
    const n = this.print(value, format);
    this._writeByte(13);
    this._writeByte(10);
    return n + 2;
  }
}
