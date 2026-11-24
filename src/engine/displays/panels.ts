import { lcdGlyphRows } from './font5x7';

/**
 * The display modules themselves: what each one is showing, independent of the sketch. They live as long as the part
 * is on the bench (a display keeps its picture while the ESP32 restarts, as on the real board), are powered from the
 * circuit check, and are what the 3D view paints.
 */

export type DisplayPartKind = 'oled_ssd1306' | 'lcd1602_i2c' | 'lcd2004_i2c';

/** One device on the I2C bus, as wired on the bench (from the circuit check). */
export interface I2cDeviceWiring {
  componentId: string;
  kind: string;
  /** 7-bit address the module answers to. */
  address: number;
  powered: boolean;
  /** Supply voltage on its VCC pin when known. */
  supplyV: number | null;
  sdaGpio: number | null;
  sclGpio: number | null;
}

export function isDisplayKind(kind: string): kind is DisplayPartKind {
  return kind === 'oled_ssd1306' || kind === 'lcd1602_i2c' || kind === 'lcd2004_i2c';
}

/** Module default addresses (OLED: SA0 strapped low; LCD backpack: PCF8574T with A0-A2 open). */
export const DEFAULT_I2C_ADDRESS: Readonly<Record<string, number>> = {
  oled_ssd1306: 0x3c,
  lcd1602_i2c: 0x27,
  lcd2004_i2c: 0x27,
  mpu6050: 0x68,
};

/* ================================================================== SSD1306 128 x 64 OLED */

export interface OledScroll {
  /** +1 scrolls right, -1 left. */
  dir: 1 | -1;
  startPage: number;
  stopPage: number;
  /** Clock time the scroll started (ms) and time per one-pixel step. */
  t0: number;
  stepMs: number;
}

export class Ssd1306Panel {
  readonly type = 'oled' as const;
  readonly width = 128;
  readonly height = 64;
  readonly componentId: string;
  powered = false;
  /** Panel switched on by the driver (DISPLAYON); off after power-up until a sketch starts it. */
  on = false;
  inverted = false;
  dimmed = false;
  /** Rows the driver was set up for (begin with a 32-row height drives every other row of this 64-row panel). */
  muxRows = 64;
  /** Display RAM, one byte per pixel: what the panel lights. */
  readonly ram = new Uint8Array(128 * 64);
  scroll: OledScroll | null = null;
  version = 0;

  constructor(componentId: string) {
    this.componentId = componentId;
  }

  powerOn(): void {
    this.powered = true;
    this.on = false;
    this.inverted = false;
    this.dimmed = false;
    this.muxRows = 64;
    this.scroll = null;
    this.ram.fill(0);
    this.version += 1;
  }

  powerOff(): void {
    this.powered = false;
    this.on = false;
    this.scroll = null;
    this.version += 1;
  }

  /** display(): copies a sketch frame buffer (width x height, one byte per pixel) into the panel's RAM. */
  load(buf: Uint8Array, w: number, h: number): void {
    if (!this.powered) return;
    this.ram.fill(0);
    const rows = Math.min(h, this.height);
    const cols = Math.min(w, this.width);
    // a 128 x 32 set-up on this 64-row glass lights every other row, so the picture looks stretched with gaps
    const step = h <= 32 && this.muxRows <= 32 ? 2 : 1;
    for (let y = 0; y < rows && y * step < this.height; y += 1) {
      this.ram.set(buf.subarray(y * w, y * w + cols), y * step * this.width);
    }
    this.scroll = null;
    this.version += 1;
  }

  /** Is pixel (x, y) lit right now (after inversion and hardware scroll)? */
  lit(x: number, y: number, nowMs: number): boolean {
    if (!this.powered || !this.on) return false;
    let sx = x;
    const s = this.scroll;
    if (s) {
      const page = y >> 3;
      if (page >= s.startPage && page <= s.stopPage) {
        const off = Math.floor(Math.max(0, nowMs - s.t0) / s.stepMs) % this.width;
        sx = (((x - s.dir * off) % this.width) + this.width) % this.width;
      }
    }
    const v = this.ram[y * this.width + sx] === 1;
    return this.inverted ? !v : v;
  }
}

/* ================================================================== HD44780 character LCD (PCF8574 backpack) */

/** Blinking cursor half-period of the HD44780 (409.6 ms at its nominal clock). */
export const LCD_BLINK_MS = 410;

export class Hd44780Panel {
  readonly type = 'lcd' as const;
  readonly componentId: string;
  readonly cols: number;
  readonly rows: number;
  powered = false;
  supplyV = 5;
  /** Backlight transistor on the backpack (on at power-up, as the PCF8574 outputs start high). */
  backlight = false;
  /** Set by the sketch's init(); before that the controller is in its power-up state (one-line mode, blocks). */
  initialised = false;
  twoLine = false;
  displayOn = false;
  cursorOn = false;
  blinkOn = false;
  increment = true;
  autoShift = false;
  /** Display shift in characters (scrollDisplayLeft adds one). */
  shift = 0;
  /** Address counter and whether it points into character-generator RAM (after createChar). */
  ac = 0;
  acInCgram = false;
  readonly ddram = new Uint8Array(0x80).fill(0x20);
  readonly cgram = new Uint8Array(64);
  version = 0;
  /** Clock time of the last change, so the blink phase restarts when the cursor moves (as on the chip). */
  blinkT0 = 0;

  constructor(componentId: string, cols: number, rows: number) {
    this.componentId = componentId;
    this.cols = cols;
    this.rows = rows;
  }

  private bump(): void {
    this.version += 1;
  }

  powerOn(supplyV: number | null): void {
    this.powered = true;
    this.supplyV = supplyV ?? 5;
    this.backlight = true;
    this.initialised = false;
    this.twoLine = false;
    this.displayOn = false;
    this.cursorOn = false;
    this.blinkOn = false;
    this.increment = true;
    this.autoShift = false;
    this.shift = 0;
    this.ac = 0;
    this.acInCgram = false;
    this.ddram.fill(0x20);
    // character-generator RAM is not cleared at power-up: unset custom characters show as stray bars
    for (let i = 0; i < 64; i += 1) this.cgram[i] = i % 2 === 0 ? 0x1f : 0;
    this.bump();
  }

  powerOff(): void {
    this.powered = false;
    this.backlight = false;
    this.bump();
  }

  setSupply(v: number | null): void {
    const next = v ?? 5;
    if (Math.abs(next - this.supplyV) > 1e-3) {
      this.supplyV = next;
      this.bump();
    }
  }

  /* ---------------------------------------------------------------- instructions (as the library sends them) */

  functionSet(twoLine: boolean): void {
    this.twoLine = twoLine;
    this.initialised = true;
    this.bump();
  }

  clear(): void {
    this.ddram.fill(0x20);
    this.ac = 0;
    this.acInCgram = false;
    this.shift = 0;
    this.increment = true;
    this.bump();
  }

  home(): void {
    this.ac = 0;
    this.acInCgram = false;
    this.shift = 0;
    this.bump();
  }

  entryMode(increment: boolean, autoShift: boolean): void {
    this.increment = increment;
    this.autoShift = autoShift;
    this.bump();
  }

  displayControl(on: boolean, cursor: boolean, blink: boolean): void {
    this.displayOn = on;
    this.cursorOn = cursor;
    this.blinkOn = blink;
    this.bump();
  }

  /** Shifts the whole display one place (dir -1 = text moves left). */
  shiftDisplay(dir: -1 | 1): void {
    const span = this.twoLine ? 40 : 80;
    this.shift = (((this.shift - dir) % span) + span) % span;
    this.bump();
  }

  setDdram(addr: number): void {
    this.ac = this.wrapAddr(addr & 0x7f);
    this.acInCgram = false;
    this.bump();
  }

  setCgram(addr: number): void {
    this.ac = addr & 0x3f;
    this.acInCgram = true;
    this.bump();
  }

  writeData(byte: number): void {
    const b = byte & 0xff;
    if (this.acInCgram) {
      this.cgram[this.ac & 0x3f] = b & 0x1f;
      this.ac = (this.ac + (this.increment ? 1 : -1)) & 0x3f;
    } else {
      this.ddram[this.ac] = b;
      this.ac = this.step(this.ac, this.increment ? 1 : -1);
      if (this.autoShift) this.shiftDisplay(this.increment ? -1 : 1);
    }
    this.bump();
  }

  /** Valid DDRAM addresses: 0x00-0x27 and 0x40-0x67 with two lines, 0x00-0x4F with one. */
  private wrapAddr(a: number): number {
    if (!this.twoLine) return a % 0x50;
    if (a >= 0x28 && a < 0x40) return 0x40;
    if (a >= 0x68) return 0x00;
    return a;
  }

  private step(a: number, d: 1 | -1): number {
    if (!this.twoLine) return (a + d + 0x50) % 0x50;
    if (d > 0) return a === 0x27 ? 0x40 : a === 0x67 ? 0x00 : a + 1;
    return a === 0x40 ? 0x27 : a === 0x00 ? 0x67 : a - 1;
  }

  /* ---------------------------------------------------------------- what the glass shows */

  /** DDRAM address shown at (row, col), with the display shift. */
  addressAt(row: number, col: number): number {
    if (!this.twoLine) {
      // one-line mode: rows 0 (and 2 on a four-row glass) are the only line driven
      const pos = col + (row >= 2 ? this.cols : 0);
      return (pos + this.shift) % 0x50;
    }
    const line = this.rows === 4 ? row % 2 : row;
    const pos = col + (this.rows === 4 && row >= 2 ? this.cols : 0);
    return (line ? 0x40 : 0) + ((pos + this.shift) % 40);
  }

  /** Five-bit pixel rows of the character code (custom characters 0-7, mirrored at 8-15, come from CGRAM). */
  glyphRows(code: number): Uint8Array {
    if (code < 16) return this.cgram.subarray((code & 7) * 8, (code & 7) * 8 + 8);
    return lcdGlyphRows(code);
  }

  /**
   * Eight pixel rows of the cell at (row, col) as the glass shows it at `nowMs`: blocks on the driven line before
   * initialisation, the character, the underline cursor and the blinking block.
   */
  cellRows(row: number, col: number, nowMs: number): Uint8Array | null {
    if (!this.powered) return null;
    if (!this.initialised) {
      // power-up state: one-line mode with the contrast showing every dot of the driven line
      return row % 2 === 0 ? FULL_CELL : null;
    }
    if (!this.displayOn) return null;
    if (!this.twoLine && row % 2 === 1) return null;
    const addr = this.addressAt(row, col);
    const rows = Uint8Array.from(this.glyphRows(this.ddram[addr] ?? 0x20));
    if (!this.acInCgram && addr === this.ac) {
      if (this.cursorOn) rows[7] = 0x1f;
      if (this.blinkOn && Math.floor(Math.max(0, nowMs - this.blinkT0) / LCD_BLINK_MS) % 2 === 0) rows.fill(0x1f);
    }
    return rows;
  }

  /** Text contrast: full at 4.5 V and up; a 5 V LCD run from 3.3 V shows its characters faintly. */
  contrast(): number {
    if (!this.powered) return 0;
    return Math.max(0.12, Math.min(1, (this.supplyV - 2.7) / 1.8));
  }

  /** Whether the picture changes with time (blinking cursor), so the 3D view repaints it on a timer. */
  animated(): boolean {
    return this.powered && this.initialised && this.displayOn && this.blinkOn;
  }
}

const FULL_CELL = new Uint8Array(8).fill(0x1f);

export type DisplayPanel = Ssd1306Panel | Hd44780Panel;

/* ================================================================== all displays on the bench */

/** The display modules on the bench, kept in step with the circuit and shared by the runtime and the 3D view. */
export class DisplayBench {
  private readonly panels = new Map<string, DisplayPanel>();
  private devices: I2cDeviceWiring[] = [];
  /** Bumps whenever any panel or the wiring changes. */
  version = 0;

  /** Brings the panels in line with the circuit check: new parts, removed parts, power on and off. */
  sync(devices: readonly I2cDeviceWiring[]): void {
    this.devices = [...devices];
    const seen = new Set<string>();
    for (const d of devices) {
      if (!isDisplayKind(d.kind)) continue;
      seen.add(d.componentId);
      let p = this.panels.get(d.componentId);
      const wantLcd = d.kind !== 'oled_ssd1306';
      const cols = d.kind === 'lcd2004_i2c' ? 20 : 16;
      const rows = d.kind === 'lcd2004_i2c' ? 4 : 2;
      if (!p || (p.type === 'lcd') !== wantLcd || (p.type === 'lcd' && (p.cols !== cols || p.rows !== rows))) {
        p = wantLcd ? new Hd44780Panel(d.componentId, cols, rows) : new Ssd1306Panel(d.componentId);
        this.panels.set(d.componentId, p);
      }
      if (d.powered && !p.powered) {
        if (p.type === 'lcd') p.powerOn(d.supplyV);
        else p.powerOn();
      } else if (!d.powered && p.powered) {
        p.powerOff();
      } else if (p.type === 'lcd' && d.powered) {
        p.setSupply(d.supplyV);
      }
    }
    for (const id of [...this.panels.keys()]) if (!seen.has(id)) this.panels.delete(id);
    this.version += 1;
  }

  panel(componentId: string): DisplayPanel | undefined {
    return this.panels.get(componentId);
  }

  allPanels(): DisplayPanel[] {
    return [...this.panels.values()];
  }

  wiring(): readonly I2cDeviceWiring[] {
    return this.devices;
  }

  /** The device answering at `address` on the bus with these pins, if one is powered and wired there. */
  deviceAt(address: number, sda: number, scl: number): I2cDeviceWiring | null {
    return this.devices.find((d) => d.powered && d.address === address && d.sdaGpio === sda && d.sclGpio === scl) ?? null;
  }

  /** Every powered device reachable on these pins (what an I2C scanner finds). */
  devicesOn(sda: number, scl: number): I2cDeviceWiring[] {
    return this.devices.filter((d) => d.powered && d.sdaGpio === sda && d.sclGpio === scl);
  }

  /**
   * Why nothing answers at `address` for a library that drives `kinds`, in plain words, naming the likely fix.
   */
  explainMissing(kinds: readonly string[], address: number, sda: number, scl: number, what: string): string {
    const hex = `0x${address.toString(16).toUpperCase()}`;
    const mine = this.devices.filter((d) => kinds.includes(d.kind));
    if (mine.length === 0) return `${what}: no such display is on the bench, so nothing answers at ${hex}.`;
    const d = mine[0]!;
    const dHex = `0x${d.address.toString(16).toUpperCase()}`;
    if (!d.powered) return `${what}: the display has no power. Wire its VCC and GND to the 3V3 or 5V rail and GND.`;
    if (d.sdaGpio === null || d.sclGpio === null) return `${what}: the display's SDA and SCL are not both wired to ESP32 pins.`;
    if (d.sdaGpio === scl && d.sclGpio === sda) {
      return `${what}: SDA and SCL look swapped. The display's SDA goes to GPIO${d.sdaGpio} but the sketch's I2C bus uses GPIO${sda} for SDA. Swap the two wires or call Wire.begin(${d.sdaGpio}, ${d.sclGpio}).`;
    }
    if (d.sdaGpio !== sda || d.sclGpio !== scl) {
      return `${what}: the display is wired to GPIO${d.sdaGpio} (SDA) and GPIO${d.sclGpio} (SCL), but the I2C bus is on GPIO${sda}/GPIO${scl}. Call Wire.begin(${d.sdaGpio}, ${d.sclGpio}) before starting the display.`;
    }
    if (d.address !== address) return `${what}: nothing answers at ${hex}; this module is at ${dHex}. Use ${dHex} in the sketch.`;
    return `${what}: nothing answers at ${hex}.`;
  }
}
