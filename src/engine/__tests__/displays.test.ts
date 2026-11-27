import { describe, expect, it } from 'vitest';
import { createPresetProject } from '../../catalog/presets';
import { createActuatorLibraries } from '../actuatorLibs';
import { analyzeCircuit } from '../circuit';
import { MonoGfx, SSD1306_WHITE } from '../displays/gfx';
import { createDisplayLibraries } from '../displays/libraries';
import { DisplayBench, Hd44780Panel, type I2cDeviceWiring, type Ssd1306Panel } from '../displays/panels';
import { HAL_CLASSES, halEntry } from '../halApi';
import { decodeSketchText } from '../printFormat';
import { VirtualEsp32Runtime, type SerialEntry } from '../runtime';
import { transpileArduinoSketch } from '../sketchTranspiler';

const OLED: I2cDeviceWiring = { componentId: 'oled_1', kind: 'oled_ssd1306', address: 0x3c, powered: true, supplyV: 3.3, sdaGpio: 32, sclGpio: 33 };
const LCD: I2cDeviceWiring = { componentId: 'lcd_1', kind: 'lcd1602_i2c', address: 0x27, powered: true, supplyV: 5.2, sdaGpio: 32, sclGpio: 33 };

function benchWith(...devices: I2cDeviceWiring[]): DisplayBench {
  const b = new DisplayBench();
  b.sync(devices);
  return b;
}

/** Runs a sketch on a fake clock until setup() and a few loops are done; returns the Serial lines. */
async function run(sketch: string, bench: DisplayBench): Promise<{ log: SerialEntry[]; errors: string[] }> {
  const log: SerialEntry[] = [];
  const errors: string[] = [];
  let t = 0;
  const rt = new VirtualEsp32Runtime({
    isEsp32Powered: () => true,
    isMpuReady: () => true,
    isUltrasonicReady: () => false,
    readUltrasonicCm: () => null,
    readYawDeg: () => 0,
    readYawRateDegPerSec: () => 0,
    zeroYaw: () => undefined,
    onSerial: (e) => log.push(e),
    onRuntimeError: (m, l) => errors.push(`${l ?? '?'}: ${m}`),
    displays: () => bench,
    clock: {
      nowMs: () => t,
      sleep: async (ms) => {
        t += ms;
        await new Promise((r) => setTimeout(r, 0));
      },
    },
  });
  const res = rt.start(sketch);
  if (!res.ok) throw new Error(res.error);
  await new Promise((r) => setTimeout(r, 30));
  rt.stop();
  await rt.waitUntilStopped();
  return { log, errors };
}

function oledRows(p: Ssd1306Panel, y0: number, y1: number): string[] {
  const rows: string[] = [];
  for (let y = y0; y < y1; y += 1) {
    let r = '';
    for (let x = 0; x < 128; x += 1) r += p.lit(x, y, 0) ? '#' : '.';
    rows.push(r);
  }
  return rows;
}

function litCount(p: Ssd1306Panel): number {
  let n = 0;
  for (let y = 0; y < 64; y += 1) for (let x = 0; x < 128; x += 1) if (p.lit(x, y, 0)) n += 1;
  return n;
}

/** Text the LCD shows on a row (ROM characters only), by matching each cell against the character ROM. */
function lcdRowText(p: Hd44780Panel, row: number): string {
  let s = '';
  for (let c = 0; c < p.cols; c += 1) {
    const code = p.ddram[p.addressAt(row, c)] ?? 0x20;
    s += code >= 0x20 && code < 0x7f ? String.fromCharCode(code) : `{${code}}`;
  }
  return s;
}

const OLED_HEADER = `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
Adafruit_SSD1306 display(128, 64, &Wire, -1);
`;

describe('Adafruit_GFX drawing', () => {
  it('draws lines, rectangles and circles on the same pixels as the library', () => {
    const g = new MonoGfx(128, 64);
    g._alloc();
    g.drawLine(0, 0, 10, 5, SSD1306_WHITE);
    g.drawRect(20, 20, 10, 6, SSD1306_WHITE);
    g.drawCircle(64, 32, 5, SSD1306_WHITE);
    const f = g._frame();
    const on = (x: number, y: number) => f[y * 128 + x] === 1;
    // Bresenham: both ends and a middle point
    expect(on(0, 0) && on(10, 5) && on(5, 2)).toBe(true);
    // rectangle outline, hollow inside
    expect(on(20, 20) && on(29, 25) && on(20, 25) && on(29, 20)).toBe(true);
    expect(on(24, 22)).toBe(false);
    // circle: the four extreme points, empty centre
    expect(on(64, 27) && on(64, 37) && on(59, 32) && on(69, 32)).toBe(true);
    expect(on(64, 32)).toBe(false);
  });

  it('draws text only once a text colour is set (the SSD1306 driver ignores the default 0xFFFF)', () => {
    const g = new MonoGfx(128, 64);
    g._alloc();
    g.print('HELLO');
    expect(g._frame().some((v) => v === 1)).toBe(false);
    g.setTextColor(SSD1306_WHITE);
    g.setCursor(0, 0);
    g.print('A');
    const f = g._frame();
    // 'A' in the 5x7 font: columns 7E 11 11 11 7E -> the left column is lit from row 1 to row 6
    for (let y = 1; y <= 6; y += 1) expect(f[y * 128]).toBe(1);
    expect(f[0]).toBe(0);
    // the cursor advanced one 6-pixel cell
    expect(g.getCursorX()).toBe(6);
  });

  it('scales text, wraps at the right edge and honours rotation', () => {
    const g = new MonoGfx(128, 64);
    g._alloc();
    g.setTextColor(SSD1306_WHITE);
    g.setTextSize(2);
    g.print('ABCDEFGHIJK'); // 11 x 12 px = 132 > 128: the 11th character wraps
    expect(g.getCursorY()).toBe(16);
    g.setRotation(1);
    expect(g.width()).toBe(64);
    expect(g.height()).toBe(128);
  });
});

describe('Adafruit_SSD1306 on the virtual ESP32', () => {
  it('shows what the sketch draws only after display(), on the right bus and address', async () => {
    const bench = benchWith(OLED);
    const { log, errors } = await run(
      `${OLED_HEADER}
void setup() {
  Wire.begin(32, 33);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("Hi");
  display.fillRect(0, 40, 20, 10, SSD1306_WHITE);
  display.display();
}
void loop() { delay(10); }`,
      bench,
    );
    expect(errors).toEqual([]);
    expect(log.filter((e) => e.level === 'warn')).toEqual([]);
    const p = bench.panel('oled_1') as Ssd1306Panel;
    expect(p.on).toBe(true);
    // the filled rectangle: 20 x 10 = 200 pixels plus the two letters
    expect(litCount(p)).toBeGreaterThan(200);
    expect(oledRows(p, 45, 46)[0]!.slice(0, 22)).toBe('#'.repeat(20) + '..');
  });

  it('stays dark without display(), and says why', async () => {
    const bench = benchWith(OLED);
    const { log } = await run(
      `${OLED_HEADER}
void setup() { Wire.begin(32, 33); display.begin(SSD1306_SWITCHCAPVCC, 0x3C); display.fillRect(0, 0, 10, 10, SSD1306_WHITE); }
void loop() { delay(2000); }`,
      bench,
    );
    expect(litCount(bench.panel('oled_1') as Ssd1306Panel)).toBe(0);
    expect(log.some((e) => e.level === 'warn' && e.text.includes('display.display() was never called'))).toBe(true);
  });

  it('explains a wrong address and pins that are not the bus pins, and the screen stays dark', async () => {
    const wrongAddr = benchWith(OLED);
    const a = await run(`${OLED_HEADER}
void setup() { Wire.begin(32, 33); display.begin(SSD1306_SWITCHCAPVCC, 0x3D); display.setTextColor(WHITE); display.print("x"); display.display(); }
void loop() { delay(10); }`, wrongAddr);
    expect(a.log.some((e) => e.text.includes('this module is at 0x3C'))).toBe(true);
    expect(litCount(wrongAddr.panel('oled_1') as Ssd1306Panel)).toBe(0);

    const defaultPins = benchWith(OLED);
    const b = await run(`${OLED_HEADER}
void setup() { display.begin(SSD1306_SWITCHCAPVCC, 0x3C); }
void loop() { delay(10); }`, defaultPins);
    expect(b.log.some((e) => e.text.includes('Call Wire.begin(32, 33)'))).toBe(true);

    const swapped = benchWith(OLED);
    const c = await run(`${OLED_HEADER}
void setup() { Wire.begin(33, 32); display.begin(SSD1306_SWITCHCAPVCC, 0x3C); }
void loop() { delay(10); }`, swapped);
    expect(c.log.some((e) => e.text.includes('SDA and SCL look swapped'))).toBe(true);
  });

  it('keeps the simple oled helper working on the bench OLED', async () => {
    const bench = benchWith(OLED);
    await run(`void setup() { oled.clear(); oled.println("ROBOFORGE"); }
void loop() { delay(10); }`, bench);
    const p = bench.panel('oled_1') as Ssd1306Panel;
    expect(p.on).toBe(true);
    expect(litCount(p)).toBeGreaterThan(20);
  });
});

describe('LiquidCrystal_I2C on the virtual ESP32', () => {
  const LCD_HEADER = `#include <Wire.h>
#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(0x27, 16, 2);
`;

  it('starts with blocks on the first line, then prints where setCursor says', async () => {
    const bench = benchWith(LCD);
    const p = bench.panel('lcd_1') as Hd44780Panel;
    expect(p.initialised).toBe(false);
    expect(p.backlight).toBe(true);
    expect(p.cellRows(0, 0, 0)?.every((r) => r === 0x1f)).toBe(true);
    expect(p.cellRows(1, 0, 0)).toBeNull();

    await run(`${LCD_HEADER}
void setup() {
  Wire.begin(32, 33);
  lcd.init();
  lcd.setCursor(2, 1);
  lcd.print("Temp ");
  lcd.print(21.5, 1);
  lcd.write(223);
}
void loop() { delay(10); }`, bench);
    expect(p.initialised).toBe(true);
    // the library leaves the backlight off until backlight() is called
    expect(p.backlight).toBe(false);
    expect(lcdRowText(p, 0)).toBe(' '.repeat(16));
    expect(lcdRowText(p, 1)).toBe('  Temp 21.5{223}    ');
  });

  it('draws custom characters, B-constants included, and turns the backlight on', async () => {
    const bench = benchWith(LCD);
    await run(`${LCD_HEADER}
byte smile[8] = { B00000, B01010, B00000, B00000, B10001, B01110, B00000, B00000 };
void setup() { Wire.begin(32, 33); lcd.init(); lcd.backlight(); lcd.createChar(3, smile); lcd.home(); lcd.write(3); }
void loop() { delay(10); }`, bench);
    const p = bench.panel('lcd_1') as Hd44780Panel;
    expect(p.backlight).toBe(true);
    expect(Array.from(p.cellRows(0, 0, 0) ?? [])).toEqual([0, 0b01010, 0, 0, 0b10001, 0b01110, 0, 0]);
  });

  it('continues row 0 of a 20x4 on row 2 and warns about println', async () => {
    const bench = benchWith({ ...LCD, componentId: 'lcd_4', kind: 'lcd2004_i2c' });
    const { log } = await run(`#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(0x27, 20, 4);
void setup() { Wire.begin(32, 33); lcd.init(); lcd.print("ABCDEFGHIJKLMNOPQRSTUVWXY"); lcd.setCursor(0, 3); lcd.println("x"); }
void loop() { delay(10); }`, bench);
    const p = bench.panel('lcd_4') as Hd44780Panel;
    expect(lcdRowText(p, 0)).toBe('ABCDEFGHIJKLMNOPQRST');
    expect(lcdRowText(p, 2).slice(0, 5)).toBe('UVWXY');
    expect(log.some((e) => e.text.includes('println() also sends the line-end characters'))).toBe(true);
  });

  it('dims a 5 V LCD run from 3.3 V', () => {
    const bench = benchWith({ ...LCD, supplyV: 3.3 });
    const p = bench.panel('lcd_1') as Hd44780Panel;
    expect(p.contrast()).toBeLessThan(0.5);
    expect(benchWith(LCD).panel('lcd_1')!.type).toBe('lcd');
  });
});

describe('Wire, strings and the library declarations', () => {
  it('finds the wired devices with an I2C scan', async () => {
    const bench = benchWith(OLED, LCD, { componentId: 'mpu_1', kind: 'mpu6050', address: 0x68, powered: true, supplyV: 3.3, sdaGpio: 32, sclGpio: 33 });
    const { log } = await run(`#include <Wire.h>
void setup() {
  Serial.begin(115200);
  Wire.begin(32, 33);
  for (int a = 1; a < 127; a++) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() == 0) { Serial.println(a, HEX); }
  }
}
void loop() { delay(10); }`, bench);
    expect(log.filter((e) => e.level === 'info').map((e) => e.text)).toEqual(expect.arrayContaining(['27', '3C', '68']));
  });

  it('stores non-ASCII text as UTF-8 bytes, which Serial shows as typed', async () => {
    const res = transpileArduinoSketch('void setup() { Serial.println("25°C"); }');
    expect(res.ok && res.jsSource.includes('25\\xc2\\xb0C')).toBe(true);
    expect(decodeSketchText('25Â°C')).toBe('25°C');
    const { log } = await run('void setup() { Serial.println("25°C"); }\nvoid loop() { delay(10); }', benchWith());
    expect(log.some((e) => e.text === '25°C')).toBe(true);
  });

  it('accepts the usual display sketch forms and reports what a compiler would', () => {
    const ok = transpileArduinoSketch(`#include <Wire.h>
#include <Adafruit_SSD1306.h>
#include <Fonts/FreeSans9pt7b.h>
#define WHITE SSD1306_WHITE
#define OLED_RESET -1
static const unsigned char PROGMEM logo[] = { 0xFF, 0x81 };
Adafruit_SSD1306 oled = Adafruit_SSD1306(128, 64, &Wire, OLED_RESET);
void setup() { oled.begin(SSD1306_SWITCHCAPVCC, 0x3C); oled.setFont(&FreeSans9pt7b); oled.drawBitmap(0, 0, logo, 8, 2, WHITE); oled.display(); }
void loop() {}`);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.warnings).toEqual([]);

    const badMember = transpileArduinoSketch(`#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(0x27, 16, 2);
void setup() { lcd.printText("x"); }`);
    expect(!badMember.ok && badMember.problems[0]!.message).toContain("'lcd' has no member named 'printText'");

    const bounds = transpileArduinoSketch(`#include <Adafruit_SSD1306.h>
Adafruit_SSD1306 display(128, 64, &Wire, -1);
int16_t x1, y1; uint16_t w, h;
void setup() { display.getTextBounds("Hi", 0, 0, &x1, &y1, &w, &h); }`);
    expect(!bounds.ok && bounds.problems.map((x) => x.message).join(' | ')).toContain('returns its results through pointers');

    const unknown = transpileArduinoSketch(`#include <U8g2lib.h>
void setup() {}`);
    expect(unknown.ok && unknown.warnings[0]!.message).toContain('U8g2 is not modelled');
  });

  it('lists every library member the runtime objects really have', () => {
    const libs = createDisplayLibraries({ bench: () => null, nowMs: () => 0, hint: () => undefined, checkStop: () => undefined });
    const acts = createActuatorLibraries({
      checkStop: () => undefined,
      nowMs: () => 0,
      hint: () => undefined,
      assertOutput: () => undefined,
      setServoPulse: () => undefined,
      setTone: () => undefined,
      clearTone: () => undefined,
      readDht: () => null,
    });
    const objects: Record<string, object> = {
      Adafruit_SSD1306: libs.Adafruit_SSD1306(128, 64, libs.Wire, -1),
      LiquidCrystal_I2C: libs.LiquidCrystal_I2C(0x27, 16, 2),
      Servo: acts.Servo(),
      DHT: acts.DHT(4, 22),
    };
    for (const cls of HAL_CLASSES) {
      for (const m of cls.members ?? []) expect(typeof (objects[cls.name] as Record<string, unknown>)[m.name], `${cls.name}.${m.name}`).toBe('function');
    }
    for (const m of halEntry('Wire')?.members ?? []) expect(typeof (libs.Wire as unknown as Record<string, unknown>)[m.name], `Wire.${m.name}`).toBe('function');
  });
});

describe('display parts in the circuit', () => {
  it('reports the Display Lab devices on the default I2C pins, powered, at their addresses', () => {
    const analysis = analyzeCircuit(createPresetProject('display_lab'));
    const byKind = Object.fromEntries(analysis.sensors.i2cDevices.map((d) => [d.kind, d]));
    expect(byKind.oled_ssd1306).toMatchObject({ address: 0x3c, powered: true, sdaGpio: 21, sclGpio: 22 });
    expect(byKind.lcd1602_i2c).toMatchObject({ address: 0x27, powered: true, sdaGpio: 21, sclGpio: 22 });
    expect(analysis.hasCriticalFault).toBe(false);
  });

  it('warns when the LCD is powered from 3.3 V', () => {
    const project = createPresetProject('display_lab');
    project.wires = project.wires.map((w) => (w.id === 'd5' ? { ...w, from: { componentId: 'esp32_1', pinId: '3V3' } } : w));
    const analysis = analyzeCircuit(project);
    expect(analysis.diagnostics.some((d) => d.id.startsWith('lcd-low-supply'))).toBe(true);
  });
});
