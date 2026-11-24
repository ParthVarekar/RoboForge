import { formatPrintValue, textBytes } from '../printFormat';
import { MonoGfx, SSD1306_WHITE } from './gfx';
import { DisplayBench, Hd44780Panel, Ssd1306Panel } from './panels';

/**
 * The Arduino libraries a sketch uses to drive the displays, emulated at the level the sketch sees them: `Wire`
 * (the ESP32 I2C bus), `Adafruit_SSD1306` (with Adafruit_GFX) and `LiquidCrystal_I2C`. They talk to the modules on
 * the bench through the bus, so wiring, pins and addresses matter as on the real board, and the hints they print
 * explain what a real board would only show as a blank screen.
 */

/** What the libraries need from the runtime. */
export interface DisplayHost {
  bench: () => DisplayBench | null;
  nowMs: () => number;
  /** A one-time hint in the Serial tab (the same text is shown once per run). */
  hint: (text: string) => void;
  checkStop: () => void;
}

const INPUT_ONLY = new Set([34, 35, 36, 39]);
const hex = (a: number) => `0x${a.toString(16).toUpperCase().padStart(2, '0')}`;

/* ================================================================== Wire (ESP32 I2C bus 0) */

export class SketchWire {
  /** Pins in use once begin() ran; -1 before. ESP32 defaults: SDA 21, SCL 22. */
  private sda = -1;
  private scl = -1;
  private started = false;
  private clockHz = 100000;
  private txAddress: number | null = null;
  private readonly host: DisplayHost;

  constructor(host: DisplayHost) {
    this.host = host;
  }

  /** Wire.begin(), Wire.begin(sda, scl) or Wire.begin(sda, scl, frequency). Calling it again keeps the pins. */
  begin(sda?: number, scl?: number, frequency?: number): boolean {
    this.host.checkStop();
    const s = sda === undefined || Number(sda) < 0 ? (this.started ? this.sda : 21) : Math.trunc(Number(sda));
    const c = scl === undefined || Number(scl) < 0 ? (this.started ? this.scl : 22) : Math.trunc(Number(scl));
    if (INPUT_ONLY.has(s) || INPUT_ONLY.has(c)) {
      this.host.hint(`Wire.begin(${s}, ${c}): GPIO34-39 are input-only and cannot drive an I2C bus; choose other pins (21/22 are the usual ones).`);
      return false;
    }
    if (s === c) {
      this.host.hint(`Wire.begin(${s}, ${c}): SDA and SCL need two different pins.`);
      return false;
    }
    this.sda = s;
    this.scl = c;
    this.started = true;
    if (frequency) this.clockHz = Number(frequency);
    return true;
  }

  setClock(hz: number): void {
    this.clockHz = Number(hz) || this.clockHz;
  }

  getClock(): number {
    return this.clockHz;
  }

  beginTransmission(address: number): void {
    this.host.checkStop();
    this.txAddress = Math.trunc(Number(address)) & 0x7f;
  }

  write(_value: unknown): number {
    return 1;
  }

  /** 0 when a device acknowledged its address, 2 when nothing answered (what I2C scanner sketches test). */
  endTransmission(_stop?: boolean): number {
    this.host.checkStop();
    const addr = this.txAddress;
    this.txAddress = null;
    if (addr === null) return 4;
    if (!this.started) this.begin();
    const bench = this.host.bench();
    return bench?.deviceAt(addr, this.sda, this.scl) ? 0 : 2;
  }

  /** The bus pins, starting the bus on the default pins the way a library's begin() does. */
  _pins(): { sda: number; scl: number } {
    if (!this.started) this.begin();
    return { sda: this.sda, scl: this.scl };
  }
}

/* ================================================================== Adafruit_SSD1306 */

const SSD1306_SWITCHCAPVCC = 0x02;

export class SketchSsd1306 extends MonoGfx {
  private readonly host: DisplayHost;
  private readonly wire: SketchWire;
  private panel: Ssd1306Panel | null = null;
  private began = false;
  private shown = false;
  private dirtySince: number | null = null;
  private hintedNoBegin = false;

  constructor(host: DisplayHost, wire: SketchWire, args: unknown[]) {
    // Adafruit_SSD1306(w, h, &Wire, rst, ...), the deprecated Adafruit_SSD1306(rst) / (), or an SPI form
    const numeric = args.filter((a) => typeof a === 'number').length;
    if (args.length >= 6 && numeric === args.length) {
      throw new Error('Adafruit_SSD1306: this constructor is for an SPI OLED (7 pins). The simulator has the 4-pin I2C module: use Adafruit_SSD1306 display(128, 64, &Wire, -1);');
    }
    const twoNumbers = typeof args[0] === 'number' && typeof args[1] === 'number';
    super(twoNumbers ? Number(args[0]) : 128, twoNumbers ? Number(args[1]) : 64);
    this.host = host;
    this.wire = args[2] instanceof SketchWire ? args[2] : wire;
    this._onDraw = () => this.touched();
  }

  private touched(): void {
    this.host.checkStop();
    if (!this._buf && !this.hintedNoBegin) {
      this.hintedNoBegin = true;
      this.host.hint('OLED: drawing before display.begin(...) does nothing. Call display.begin(SSD1306_SWITCHCAPVCC, 0x3C) in setup() first.');
    }
    if (this.dirtySince === null) this.dirtySince = this.host.nowMs();
  }

  /** Hints for the two classic "blank screen" mistakes, checked between loop() runs. */
  _tick(now: number): void {
    if (this.began && !this.shown && this.dirtySince !== null && now - this.dirtySince > 1500) {
      this.host.hint('OLED: the drawing is in the display buffer but display.display() was never called, so the screen stays dark (as on a real board).');
      this.dirtySince = null;
    }
  }

  /** begin(vccstate, address, reset, periphBegin): true once the buffer is allocated, as in the library. */
  begin(vcc: number = SSD1306_SWITCHCAPVCC, address: number = 0, _reset = true, periphBegin = true): boolean {
    this.host.checkStop();
    if (this._w * this._h > 128 * 64 * 4) return false;
    this._buf = new Uint8Array(this._w * this._h);
    this.began = true;
    const addr = Math.trunc(Number(address)) || (this._h === 32 ? 0x3c : 0x3d);
    if (periphBegin) this.wire._pins();
    const { sda, scl } = this.wire._pins();
    const bench = this.host.bench();
    const dev = bench?.deviceAt(addr, sda, scl);
    const p = dev ? bench?.panel(dev.componentId) : undefined;
    this.panel = p && p.type === 'oled' ? p : null;
    if (!this.panel) {
      this.host.hint(bench ? bench.explainMissing(['oled_ssd1306'], addr, sda, scl, `OLED begin(${hex(addr)})`) : 'OLED: no display is connected.');
    } else {
      this.panel.on = true;
      this.panel.inverted = false;
      this.panel.muxRows = this._h <= 32 ? 32 : 64;
      this.panel.scroll = null;
      this.panel.version += 1;
      if (this._w !== 128 || this._h !== 64) {
        this.host.hint(`OLED: the sketch sets the screen up as ${this._w} x ${this._h}, but this module is 128 x 64; use SCREEN_WIDTH 128 and SCREEN_HEIGHT 64.`);
      }
    }
    if (vcc !== SSD1306_SWITCHCAPVCC && vcc !== 0x01) this.host.hint('OLED: begin() expects SSD1306_SWITCHCAPVCC as its first argument.');
    return true;
  }

  /** Sends the buffer to the screen. */
  display(): void {
    this.host.checkStop();
    if (!this._buf) return;
    this.shown = true;
    this.dirtySince = null;
    if (!this._textColorUsed && this.drewTextWithoutColour) {
      this.host.hint('OLED: text is drawn in the default colour 0xFFFF, which the SSD1306 driver ignores, so nothing appears. Call display.setTextColor(SSD1306_WHITE) first.');
    }
    if (this.panel?.powered) this.panel.load(this._buf, this._w, this._h);
  }

  private drewTextWithoutColour = false;

  override print(value: unknown = '', format?: number): number {
    if (!this._textColorUsed) this.drewTextWithoutColour = true;
    return super.print(value, format);
  }

  override write(value: unknown): number {
    if (!this._textColorUsed) this.drewTextWithoutColour = true;
    return super.write(value);
  }

  /** Clears the buffer only; like the library, it leaves the text cursor where it was. */
  clearDisplay(): void {
    this.host.checkStop();
    this._buf?.fill(0);
  }

  invertDisplay(i: boolean): void {
    if (!this.panel) return;
    this.panel.inverted = Boolean(i);
    this.panel.version += 1;
  }

  dim(d: boolean): void {
    if (!this.panel) return;
    this.panel.dimmed = Boolean(d);
    this.panel.version += 1;
  }

  /** The commands sketches send directly: display off/on and normal/inverse. */
  ssd1306_command(c: number): void {
    if (!this.panel) return;
    const cmd = Number(c) & 0xff;
    if (cmd === 0xae) this.panel.on = false;
    else if (cmd === 0xaf) this.panel.on = true;
    else if (cmd === 0xa6) this.panel.inverted = false;
    else if (cmd === 0xa7) this.panel.inverted = true;
    this.panel.version += 1;
  }

  private startScroll(dir: 1 | -1, start: number, stop: number): void {
    if (!this.panel) return;
    this.panel.scroll = { dir, startPage: Math.max(0, Math.trunc(start)) & 7, stopPage: Math.max(0, Math.trunc(stop)) & 7, t0: this.host.nowMs(), stepMs: 48 };
    this.panel.version += 1;
  }

  startscrollright(start: number, stop: number): void {
    this.startScroll(1, start, stop);
  }

  startscrollleft(start: number, stop: number): void {
    this.startScroll(-1, start, stop);
  }

  /** Diagonal scrolls are shown as the horizontal part of the movement. */
  startscrolldiagright(start: number, stop: number): void {
    this.startScroll(1, start, stop);
  }

  startscrolldiagleft(start: number, stop: number): void {
    this.startScroll(-1, start, stop);
  }

  stopscroll(): void {
    if (!this.panel) return;
    this.panel.scroll = null;
    this.panel.version += 1;
  }
}

/* ================================================================== LiquidCrystal_I2C (PCF8574 backpack) */

export class SketchLcdI2c {
  private readonly host: DisplayHost;
  private readonly wire: SketchWire;
  private readonly address: number;
  private cols: number;
  private rows: number;
  private panel: Hd44780Panel | null = null;
  private began = false;
  private backlightOn = false;
  private displayOn = true;
  private cursorOn = false;
  private blinkOn = false;
  private increment = true;
  private autoShift = false;
  private hintedNoInit = false;
  private hintedPrintln = false;

  constructor(host: DisplayHost, wire: SketchWire, args: unknown[]) {
    this.host = host;
    this.wire = wire;
    this.address = Math.trunc(Number(args[0] ?? 0x27)) & 0x7f;
    this.cols = Math.max(1, Math.trunc(Number(args[1] ?? 16)) || 16);
    this.rows = Math.max(1, Math.trunc(Number(args[2] ?? 2)) || 2);
  }

  private dev(): Hd44780Panel | null {
    this.host.checkStop();
    if (!this.began) {
      if (!this.hintedNoInit) {
        this.hintedNoInit = true;
        this.host.hint('LCD: call lcd.init() (or lcd.begin()) in setup() before using the display; until then a real LCD ignores what is sent.');
      }
      return null;
    }
    return this.panel?.powered ? this.panel : null;
  }

  /** init() / begin(): starts the bus, finds the backpack and sets the LCD up (backlight off until backlight()). */
  init(): void {
    this.host.checkStop();
    const { sda, scl } = this.wire._pins();
    const bench = this.host.bench();
    const dev = bench?.deviceAt(this.address, sda, scl);
    const p = dev ? bench?.panel(dev.componentId) : undefined;
    this.panel = p && p.type === 'lcd' ? p : null;
    this.began = true;
    this.backlightOn = false;
    this.displayOn = true;
    this.cursorOn = false;
    this.blinkOn = false;
    this.increment = true;
    this.autoShift = false;
    if (!this.panel) {
      this.host.hint(bench ? bench.explainMissing(['lcd1602_i2c', 'lcd2004_i2c'], this.address, sda, scl, `LCD init(${hex(this.address)})`) : 'LCD: no display is connected.');
      return;
    }
    const p2 = this.panel;
    p2.functionSet(this.rows > 1);
    p2.displayControl(true, false, false);
    p2.clear();
    p2.entryMode(true, false);
    p2.home();
    p2.backlight = false;
    if (p2.cols !== this.cols || p2.rows !== this.rows) {
      this.host.hint(`LCD: the sketch sets up a ${this.cols} x ${this.rows} display, but the module on the bench is ${p2.cols} x ${p2.rows}. Use LiquidCrystal_I2C lcd(${hex(this.address)}, ${p2.cols}, ${p2.rows});`);
    }
    if (p2.supplyV < 4.5) this.host.hint(`LCD: the module runs from ${p2.supplyV.toFixed(1)} V; these LCDs are made for 5 V, so the characters are faint.`);
  }

  begin(cols?: number, rows?: number): void {
    if (cols !== undefined) this.cols = Math.max(1, Math.trunc(Number(cols)) || this.cols);
    if (rows !== undefined) this.rows = Math.max(1, Math.trunc(Number(rows)) || this.rows);
    this.init();
  }

  clear(): void {
    this.dev()?.clear();
  }

  home(): void {
    this.dev()?.home();
  }

  /** setCursor(col, row) with the library's row offsets 0x00, 0x40, 0x14, 0x54. */
  setCursor(col: number, row: number): void {
    const d = this.dev();
    if (!d) return;
    const offsets = [0x00, 0x40, 0x14, 0x54];
    let r = Math.max(0, Math.trunc(Number(row)) || 0);
    // the library's own check (row > lines) lets row == lines through, as on the real board
    if (r > this.rows) r = this.rows - 1;
    d.setDdram(Math.max(0, Math.trunc(Number(col)) || 0) + (offsets[r & 3] ?? 0));
  }

  private control(): void {
    this.dev()?.displayControl(this.displayOn, this.cursorOn, this.blinkOn);
  }

  display(): void {
    this.displayOn = true;
    this.control();
  }

  noDisplay(): void {
    this.displayOn = false;
    this.control();
  }

  cursor(): void {
    this.cursorOn = true;
    this.control();
  }

  noCursor(): void {
    this.cursorOn = false;
    this.control();
  }

  blink(): void {
    this.blinkOn = true;
    this.control();
  }

  noBlink(): void {
    this.blinkOn = false;
    this.control();
  }

  cursor_on(): void {
    this.cursor();
  }

  cursor_off(): void {
    this.noCursor();
  }

  blink_on(): void {
    this.blink();
  }

  blink_off(): void {
    this.noBlink();
  }

  scrollDisplayLeft(): void {
    this.dev()?.shiftDisplay(-1);
  }

  scrollDisplayRight(): void {
    this.dev()?.shiftDisplay(1);
  }

  private entry(): void {
    this.dev()?.entryMode(this.increment, this.autoShift);
  }

  leftToRight(): void {
    this.increment = true;
    this.entry();
  }

  rightToLeft(): void {
    this.increment = false;
    this.entry();
  }

  autoscroll(): void {
    this.autoShift = true;
    this.entry();
  }

  noAutoscroll(): void {
    this.autoShift = false;
    this.entry();
  }

  /** createChar(slot, rows[8]): defines custom character 0-7 (leaves the address in CGRAM, as the library does). */
  createChar(location: number, charmap: unknown): void {
    const d = this.dev();
    if (!d) return;
    const rows = Array.isArray(charmap) ? (charmap as unknown[]) : [];
    d.setCgram((Math.trunc(Number(location)) & 7) << 3);
    for (let i = 0; i < 8; i += 1) d.writeData(Number(rows[i] ?? 0));
  }

  load_custom_character(location: number, charmap: unknown): void {
    this.createChar(location, charmap);
  }

  backlight(): void {
    this.backlightOn = true;
    const d = this.dev();
    if (d) {
      d.backlight = true;
      d.version += 1;
    }
  }

  noBacklight(): void {
    this.backlightOn = false;
    const d = this.dev();
    if (d) {
      d.backlight = false;
      d.version += 1;
    }
  }

  setBacklight(value: number): void {
    if (Number(value)) this.backlight();
    else this.noBacklight();
  }

  getBacklight(): boolean {
    return this.backlightOn;
  }

  write(value: unknown): number {
    const d = this.dev();
    const bytes = typeof value === 'string' ? textBytes(value) : [Number(value) & 0xff];
    if (d) for (const b of bytes) d.writeData(b);
    return bytes.length;
  }

  print(value: unknown = '', format?: number): number {
    const bytes = textBytes(formatPrintValue(value, format));
    const d = this.dev();
    if (d) for (const b of bytes) d.writeData(b);
    return bytes.length;
  }

  /** println also sends CR and LF, which an LCD shows as two stray characters (custom characters 5 and 2). */
  println(value: unknown = '', format?: number): number {
    const n = this.print(value, format);
    if (!this.hintedPrintln) {
      this.hintedPrintln = true;
      this.host.hint('LCD: println() also sends the line-end characters, which an LCD shows as two odd symbols. Use lcd.print() and lcd.setCursor(0, row) for the next line.');
    }
    this.write(13);
    this.write(10);
    return n + 2;
  }

  printstr(text: unknown): void {
    this.print(String(text));
  }
}

/** The library objects a sketch can create, by class name (also what the translator and the editor know about). */
export function createDisplayLibraries(host: DisplayHost) {
  const wire = new SketchWire(host);
  const objects: Array<SketchSsd1306 | SketchLcdI2c> = [];
  return {
    Wire: wire,
    Adafruit_SSD1306: (...args: unknown[]) => {
      const o = new SketchSsd1306(host, wire, args);
      objects.push(o);
      return o;
    },
    LiquidCrystal_I2C: (...args: unknown[]) => {
      const o = new SketchLcdI2c(host, wire, args);
      objects.push(o);
      return o;
    },
    tick: (now: number) => {
      for (const o of objects) if (o instanceof SketchSsd1306) o._tick(now);
    },
    constants: {
      SSD1306_BLACK: 0,
      SSD1306_WHITE,
      SSD1306_INVERSE: 2,
      BLACK: 0,
      WHITE: 1,
      INVERSE: 2,
      SSD1306_SWITCHCAPVCC,
      SSD1306_EXTERNALVCC: 0x01,
      SSD1306_DISPLAYOFF: 0xae,
      SSD1306_DISPLAYON: 0xaf,
      SSD1306_NORMALDISPLAY: 0xa6,
      SSD1306_INVERTDISPLAY: 0xa7,
    },
  };
}
