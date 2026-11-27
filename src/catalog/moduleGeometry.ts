import { HEADER_PITCH_MM, HEADER_TIP_ABOVE_BOARD_MM, MM, PCB_T_MM, modulePinTip, type ModuleBoard } from './boardGeometry';

/**
 * Real dimensions and pin positions of the extended parts library (modules, controllers, actuators, passives), shared
 * by the catalog (pin positions the wiring and the circuit check use) and the 3D builders, so a wire always lands on
 * the drawn pin. Same conventions as boardGeometry.ts: millimetres here, centimetres in the exported pin tips; board
 * x from the left edge, y from the north edge; the part origin at the board centre on the bench.
 * Sources and what is approximate: docs/06_COMPONENT_REFERENCES.md ("Extended library").
 */

export interface HeaderRow {
  /** Pin ids in physical order. */
  ids: readonly string[];
  /** Silkscreen text per pin (defaults to the id). */
  silk?: readonly string[];
  /** First pin position, board mm. */
  x: number;
  y: number;
  /** The direction the pin index runs along. */
  axis: 'x' | 'y';
  pitch?: number;
  /** Which side of the row its labels go. */
  silkSide?: 'n' | 's' | 'e' | 'w';
}

/** A solder pad a wire is soldered to (contact 'lead'). */
export interface PadSpec {
  id: string;
  x: number;
  y: number;
  silk?: string;
}

export interface ModuleGeom extends ModuleBoard {
  key: string;
  mask: string;
  cornerMm?: number;
  rows: readonly HeaderRow[];
  pads?: readonly PadSpec[];
  holes?: ReadonlyArray<{ x: number; y: number; d: number }>;
}

const row = (ids: readonly string[], x: number, y: number, axis: 'x' | 'y', extra: Partial<HeaderRow> = {}): HeaderRow => ({ ids, x, y, axis, ...extra });

export function rowPinXY(r: HeaderRow, i: number): [number, number] {
  const step = (r.pitch ?? HEADER_PITCH_MM) * i;
  return r.axis === 'x' ? [r.x + step, r.y] : [r.x, r.y + step];
}

/** Every header pin of a module with its board position (mm). */
export function moduleHeaderPins(g: ModuleGeom): Array<{ id: string; silk: string; x: number; y: number; row: HeaderRow }> {
  const out: Array<{ id: string; silk: string; x: number; y: number; row: HeaderRow }> = [];
  for (const r of g.rows) {
    r.ids.forEach((id, i) => {
      const [x, y] = rowPinXY(r, i);
      out.push({ id, silk: r.silk?.[i] ?? id, x, y, row: r });
    });
  }
  return out;
}

/** Tip of an upright header pin (cm, part frame). */
export function moduleTip(g: ModuleGeom, id: string): [number, number, number] {
  const p = moduleHeaderPins(g).find((h) => h.id === id);
  if (!p) throw new Error(`${g.key}: no header pin ${id}`);
  return modulePinTip(g, p.x, p.y);
}

/** Point on a solder pad where a wire's joint sits (cm, part frame). */
export function modulePadTip(g: ModuleGeom, id: string): [number, number, number] {
  const p = g.pads?.find((h) => h.id === id);
  if (!p) throw new Error(`${g.key}: no pad ${id}`);
  const r = (v: number) => Number(v.toFixed(4));
  return [r((p.x - g.wMm / 2) * MM), r((g.boardBottomMm + PCB_T_MM + 0.4) * MM), r((p.y - g.dMm / 2) * MM)];
}

/** Four corner holes `inset` mm from the edges. */
const corners = (w: number, d: number, inset: number, dia: number) => [
  { x: inset, y: inset, d: dia },
  { x: w - inset, y: inset, d: dia },
  { x: inset, y: d - inset, d: dia },
  { x: w - inset, y: d - inset, d: dia },
];

/* ================================================================== sensors and outputs */

/** Active buzzer module (KY-012 style): 18.5 x 15 mm, 12 mm buzzer, 3 pins along the south edge. */
export const BUZZER_MODULE: ModuleGeom = {
  key: 'buzzer-module',
  wMm: 18.5,
  dMm: 15,
  boardBottomMm: 1.8,
  mask: '#18191c',
  rows: [row(['SIG', 'VCC', 'GND'], 6.71, 13.2, 'x', { silk: ['S', '+', '-'], silkSide: 'n' })],
  holes: [{ x: 2.2, y: 2.2, d: 2.2 }],
};

/** 1-channel 5 V relay module: 50 x 26 mm, SRD-05VDC relay, 3-pin input header west, 3-way screw terminal east. */
export const RELAY_1CH: ModuleGeom = {
  key: 'relay-1ch',
  wMm: 50,
  dMm: 26,
  boardBottomMm: 1.8,
  mask: '#1d55b0',
  rows: [row(['VCC', 'GND', 'IN'], 2.6, 10.46, 'y', { silk: ['DC+', 'DC-', 'IN'], silkSide: 'e' })],
  holes: corners(50, 26, 2.8, 3.1),
};
/** Screw-terminal contacts of the relay (wire entries face east), from north to south. */
export const RELAY_TERMINALS = ['NO', 'COM', 'NC'] as const;
export function relayTerminalTip(index: number): [number, number, number] {
  const g = RELAY_1CH;
  const y = g.dMm / 2 + (index - 1) * 5.08;
  const r = (v: number) => Number(v.toFixed(4));
  return [r((g.wMm / 2 + 1.0) * MM), r((g.boardBottomMm + PCB_T_MM + 3.4) * MM), r((y - g.dMm / 2) * MM)];
}

/** TCRT5000 reflective IR line sensor module: 32 x 14 mm, LM393, 4 pins at the west end, sensor at the east end. */
export const LINE_TCRT5000: ModuleGeom = {
  key: 'tcrt5000',
  wMm: 32,
  dMm: 14,
  boardBottomMm: 1.8,
  mask: '#1d55b0',
  rows: [row(['VCC', 'GND', 'DO', 'AO'], 2.5, 3.19, 'y', { silkSide: 'e' })],
  holes: [{ x: 14.5, y: 7, d: 3.1 }],
};

/** 8 x WS2812B (5050) stick, 53 x 10 mm, solder pads at both ends (in at the west, out at the east). */
export const WS2812_STICK: ModuleGeom = {
  key: 'ws2812-stick',
  wMm: 53,
  dMm: 10.2,
  boardBottomMm: 0.6,
  mask: '#131417',
  rows: [],
  pads: [
    { id: 'GND', x: 1.6, y: 2.2, silk: 'G' },
    { id: 'DIN', x: 1.6, y: 5.1, silk: 'DI' },
    { id: '5V', x: 1.6, y: 8.0, silk: '5V' },
    { id: 'GND_OUT', x: 51.4, y: 2.2, silk: 'G' },
    { id: 'DOUT', x: 51.4, y: 5.1, silk: 'DO' },
    { id: '5V_OUT', x: 51.4, y: 8.0, silk: '5V' },
  ],
};

/** GY-NEO6MV2 GPS: 25 x 35 mm board, 4 pins at the south edge; 25 x 25 mm ceramic antenna on its lead beside it. */
export const GPS_NEO6M: ModuleGeom = {
  key: 'gps-neo6m',
  wMm: 25,
  dMm: 35,
  boardBottomMm: 1.8,
  mask: '#1d55b0',
  rows: [row(['VCC', 'RX', 'TX', 'GND'], 8.69, 32.8, 'x', { silkSide: 'n' })],
  holes: corners(25, 35, 2.6, 3.1),
};

/** GY-BME280 (4-pin, 3.3 V): 11.5 x 14 mm purple board. */
export const BME280_MODULE: ModuleGeom = {
  key: 'bme280',
  wMm: 11.5,
  dMm: 14,
  boardBottomMm: 1.8,
  mask: '#5b2d91',
  rows: [row(['VIN', 'GND', 'SCL', 'SDA'], 1.94, 12.4, 'x', { silkSide: 'n' })],
  holes: [{ x: 5.75, y: 3.0, d: 2.6 }],
};

/** GY-VL53L0XV2 time-of-flight distance sensor: 25 x 10.7 mm, 6 pins along the south edge. */
export const VL53L0X_MODULE: ModuleGeom = {
  key: 'vl53l0x',
  wMm: 25,
  dMm: 10.7,
  boardBottomMm: 1.8,
  mask: '#5b2d91',
  rows: [row(['VIN', 'GND', 'SCL', 'SDA', 'GPIO1', 'XSHUT'], 6.15, 9.1, 'x', { silkSide: 'n' })],
  holes: [
    { x: 2.0, y: 4.0, d: 2.2 },
    { x: 23.0, y: 4.0, d: 2.2 },
  ],
};

/**
 * HC-SR501 PIR motion sensor: 32 x 24 mm board, 23 mm Fresnel dome on top; the BISS0001, two trimmers and the
 * pins are underneath. The board rests on its parts; the three pins are bent to point south under the board.
 */
export const PIR_HCSR501 = {
  wMm: 32.3,
  dMm: 24.3,
  boardBottomMm: 8.0,
  domeD: 23,
  domeH: 13,
  pins: ['VCC', 'OUT', 'GND'] as const,
};
export function pirPinTip(index: number): [number, number, number] {
  const g = PIR_HCSR501;
  const r = (v: number) => Number(v.toFixed(4));
  return [r((index - 1) * 2.54 * MM), r((g.boardBottomMm - 1.6) * MM), r((g.dMm / 2 + 4.5) * MM)];
}

/** TM1637 four-digit display module: 42 x 24 mm, 0.36" display, 4 pins at the west end. */
export const TM1637_MODULE: ModuleGeom = {
  key: 'tm1637',
  wMm: 42,
  dMm: 24,
  boardBottomMm: 1.8,
  mask: '#1d55b0',
  rows: [row(['CLK', 'DIO', 'VCC', 'GND'], 2.4, 8.19, 'y', { silkSide: 'e' })],
  holes: corners(42, 24, 2.2, 2.2),
};

/** MAX7219 8 x 8 dot-matrix module: 50 x 32 mm, matrix raised on its sockets, 5-pin in (west) and out (east). */
export const MAX7219_MODULE: ModuleGeom = {
  key: 'max7219',
  wMm: 50,
  dMm: 32,
  boardBottomMm: 1.8,
  mask: '#1d55b0',
  rows: [
    row(['VCC', 'GND', 'DIN', 'CS', 'CLK'], 2.6, 10.92, 'y', { silkSide: 'e' }),
    row(['VCC_OUT', 'GND_OUT', 'DOUT', 'CS_OUT', 'CLK_OUT'], 47.4, 10.92, 'y', { silk: ['VCC', 'GND', 'DOUT', 'CS', 'CLK'], silkSide: 'w' }),
  ],
  holes: corners(50, 32, 2.5, 3.1),
};

/** KY-023 joystick: 34 x 26 mm board, PS2-style two-axis stick, 5 pins at the west end. */
export const JOYSTICK_KY023: ModuleGeom = {
  key: 'ky023',
  wMm: 34,
  dMm: 26,
  boardBottomMm: 1.8,
  mask: '#18191c',
  rows: [row(['GND', '5V', 'VRX', 'VRY', 'SW'], 2.5, 7.92, 'y', { silk: ['GND', '+5V', 'VRx', 'VRy', 'SW'], silkSide: 'e' })],
  holes: corners(34, 26, 2.6, 3.1),
};

/* ================================================================== drivers and power modules */

/** L298N dual H-bridge module: 43 x 43 mm red board, heatsink north, screw terminals west/east/south, 6-pin header. */
export const L298N_MODULE: ModuleGeom = {
  key: 'l298n',
  wMm: 43,
  dMm: 43,
  boardBottomMm: 1.8,
  mask: '#b3262a',
  rows: [row(['ENA', 'IN1', 'IN2', 'IN3', 'IN4', 'ENB'], 22.5, 40.5, 'x', { silkSide: 'n' })],
  holes: corners(43, 43, 3, 3.1),
};
/** Screw-terminal contacts of the L298N: [id, x (mm), y (mm), direction the entry faces]. */
export const L298N_TERMINALS: ReadonlyArray<readonly [string, number, number, readonly [number, number, number]]> = [
  ['OUT1', 0, 16.0, [-1, 0, 0]],
  ['OUT2', 0, 21.1, [-1, 0, 0]],
  ['OUT3', 43, 21.1, [1, 0, 0]],
  ['OUT4', 43, 16.0, [1, 0, 0]],
  ['VS', 7.0, 43, [0, 0, 1]],
  ['GND', 12.08, 43, [0, 0, 1]],
  ['V5', 17.16, 43, [0, 0, 1]],
];
export function l298nTerminalTip(id: string): [number, number, number] {
  const g = L298N_MODULE;
  const t = L298N_TERMINALS.find((x) => x[0] === id)!;
  const r = (v: number) => Number(v.toFixed(4));
  return [r((t[1] - g.wMm / 2 + t[3][0] * 1.0) * MM), r((g.boardBottomMm + PCB_T_MM + 3.4) * MM), r((t[2] - g.dMm / 2 + t[3][2] * 1.0) * MM)];
}

/** TB6612FNG dual driver breakout: 20.5 x 20.5 mm, two rows of 8, 15.24 mm apart. */
export const TB6612_MODULE: ModuleGeom = {
  key: 'tb6612',
  wMm: 20.5,
  dMm: 20.5,
  boardBottomMm: 1.8,
  mask: '#5b2d91',
  rows: [
    row(['PWMA', 'AIN2', 'AIN1', 'STBY', 'BIN1', 'BIN2', 'PWMB', 'GND'], 2.63, 1.36, 'y', { silkSide: 'e' }),
    row(['VM', 'VCC', 'GND_2', 'AO1', 'AO2', 'BO2', 'BO1', 'GND_3'], 17.87, 1.36, 'y', { silk: ['VM', 'VCC', 'GND', 'AO1', 'AO2', 'BO2', 'BO1', 'GND'], silkSide: 'w' }),
  ],
};

/** A4988 stepper driver carrier (Pololu size): 15.24 x 20.32 mm, two rows of 8, 12.7 mm apart. */
export const A4988_MODULE: ModuleGeom = {
  key: 'a4988',
  wMm: 15.24,
  dMm: 20.32,
  boardBottomMm: 1.8,
  mask: '#1a7a3a',
  rows: [
    row(['EN', 'MS1', 'MS2', 'MS3', 'RST', 'SLP', 'STEP', 'DIR'], 1.27, 1.27, 'y', { silkSide: 'e' }),
    row(['VMOT', 'GND', '2B', '2A', '1A', '1B', 'VDD', 'GND_2'], 13.97, 1.27, 'y', { silk: ['VMOT', 'GND', '2B', '2A', '1A', '1B', 'VDD', 'GND'], silkSide: 'w' }),
  ],
};

/** MT3608 boost converter: 36 x 17 mm, input pads west, output pads east. */
export const MT3608_MODULE: ModuleGeom = {
  key: 'mt3608',
  wMm: 36,
  dMm: 17,
  boardBottomMm: 1.8,
  mask: '#1d55b0',
  rows: [],
  pads: [
    { id: 'VIN_POS', x: 2.2, y: 3.0, silk: 'VIN+' },
    { id: 'VIN_NEG', x: 2.2, y: 14.0, silk: 'VIN-' },
    { id: 'VOUT_POS', x: 33.8, y: 3.0, silk: 'VOUT+' },
    { id: 'VOUT_NEG', x: 33.8, y: 14.0, silk: 'VOUT-' },
  ],
  holes: [
    { x: 2.2, y: 3.0, d: 1.6 },
    { x: 2.2, y: 14.0, d: 1.6 },
    { x: 33.8, y: 3.0, d: 1.6 },
    { x: 33.8, y: 14.0, d: 1.6 },
  ],
};

/** TP4056 Li-ion charger with protection (USB-C): 28 x 17 mm, battery pads B+/B-, load pads OUT+/OUT-. */
export const TP4056_MODULE: ModuleGeom = {
  key: 'tp4056',
  wMm: 28,
  dMm: 17,
  boardBottomMm: 1.8,
  mask: '#1d55b0',
  rows: [],
  pads: [
    { id: 'OUT_POS', x: 26.0, y: 2.4, silk: 'OUT+' },
    { id: 'B_POS', x: 26.0, y: 6.6, silk: 'B+' },
    { id: 'B_NEG', x: 26.0, y: 10.4, silk: 'B-' },
    { id: 'OUT_NEG', x: 26.0, y: 14.6, silk: 'OUT-' },
  ],
};

/** AMS1117-3.3 regulator module: 22 x 17 mm, 3-pin header at the south edge. */
export const AMS1117_MODULE: ModuleGeom = {
  key: 'ams1117',
  wMm: 22,
  dMm: 17,
  boardBottomMm: 1.8,
  mask: '#1d55b0',
  rows: [row(['VIN', 'GND', 'VOUT'], 8.46, 15.2, 'x', { silk: ['IN', 'GND', '3V3'], silkSide: 'n' })],
  holes: [
    { x: 2.4, y: 2.4, d: 2.2 },
    { x: 19.6, y: 2.4, d: 2.2 },
  ],
};

/** 28BYJ-48 stepper on its ULN2003 board: board 35 x 32 mm (IN1-IN4 west, power south, motor plug north). */
export const ULN2003_BOARD: ModuleGeom = {
  key: 'uln2003',
  wMm: 35,
  dMm: 32,
  boardBottomMm: 1.8,
  mask: '#1a7a3a',
  rows: [
    row(['IN1', 'IN2', 'IN3', 'IN4'], 2.6, 11.19, 'y', { silkSide: 'e' }),
    row(['GND', 'VCC'], 22.0, 29.6, 'x', { silk: ['-', '+'], silkSide: 'n' }),
  ],
  holes: corners(35, 32, 2.6, 3.1),
};

/* ================================================================== controllers and communication */

/** Arduino Nano V3 (USB-C clone): 18 x 45 mm, 2 x 15 pins 15.24 mm apart, USB at the north end. */
export const NANO_PINS_LEFT = ['D13', '3V3', 'AREF', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', '5V', 'RST', 'GND', 'VIN'] as const;
export const NANO_PINS_RIGHT = ['D12', 'D11', 'D10', 'D9', 'D8', 'D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'GND_2', 'RST_2', 'D0', 'D1'] as const;
export const ARDUINO_NANO: ModuleGeom = {
  key: 'arduino-nano',
  wMm: 18,
  dMm: 45,
  boardBottomMm: 1.8,
  mask: '#1f4fa3',
  rows: [
    row(NANO_PINS_LEFT, 1.38, 4.7, 'y', { silk: ['D13', '3V3', 'REF', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', '5V', 'RST', 'GND', 'VIN'], silkSide: 'e' }),
    row(NANO_PINS_RIGHT, 16.62, 4.7, 'y', { silk: ['D12', 'D11', 'D10', 'D9', 'D8', 'D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'GND', 'RST', 'RX0', 'TX1'], silkSide: 'w' }),
  ],
};

/** Raspberry Pi Pico: 21 x 51 mm, 2 x 20 castellated pins 17.78 mm apart, USB at the north end. */
export const PICO_LEFT = ['GP0', 'GP1', 'GND_3', 'GP2', 'GP3', 'GP4', 'GP5', 'GND_8', 'GP6', 'GP7', 'GP8', 'GP9', 'GND_13', 'GP10', 'GP11', 'GP12', 'GP13', 'GND_18', 'GP14', 'GP15'] as const;
export const PICO_RIGHT = ['VBUS', 'VSYS', 'GND_38', '3V3_EN', '3V3', 'ADC_VREF', 'GP28', 'AGND', 'GP27', 'GP26', 'RUN', 'GP22', 'GND_28', 'GP21', 'GP20', 'GP19', 'GP18', 'GND_23', 'GP17', 'GP16'] as const;
export const RPI_PICO: ModuleGeom = {
  key: 'rpi-pico',
  wMm: 21,
  dMm: 51,
  boardBottomMm: 1.8,
  mask: '#1a6e3a',
  rows: [
    row(PICO_LEFT, 1.61, 1.37, 'y', { silk: PICO_LEFT.map((s) => s.replace(/_\d+$/, '')), silkSide: 'e' }),
    row(PICO_RIGHT, 19.39, 1.37, 'y', { silk: PICO_RIGHT.map((s) => s.replace(/_\d+$/, '').replace('ADC_VREF', 'VREF')), silkSide: 'w' }),
  ],
  holes: [
    { x: 4.8, y: 2.0, d: 2.1 },
    { x: 16.2, y: 2.0, d: 2.1 },
    { x: 4.8, y: 49.0, d: 2.1 },
    { x: 16.2, y: 49.0, d: 2.1 },
  ],
};

/** HC-05 Bluetooth module on its base board: 16 x 37 mm, 6 pins at the south end. */
export const HC05_MODULE: ModuleGeom = {
  key: 'hc05',
  wMm: 16,
  dMm: 37,
  boardBottomMm: 1.8,
  mask: '#1d55b0',
  rows: [row(['STATE', 'RXD', 'TXD', 'GND', 'VCC', 'EN'], 1.65, 35.0, 'x', { silkSide: 'n' })],
};

/** nRF24L01+ with PCB antenna: 15 x 29 mm, 2 x 4 header at the west end. */
export const NRF24_MODULE: ModuleGeom = {
  key: 'nrf24',
  wMm: 29,
  dMm: 15,
  boardBottomMm: 1.8,
  mask: '#1a6e3a',
  rows: [
    row(['GND', 'CE', 'SCK', 'MISO'], 2.0, 3.69, 'y', { silkSide: 'e' }),
    row(['VCC', 'CSN', 'MOSI', 'IRQ'], 4.54, 3.69, 'y', { silkSide: 'e' }),
  ],
};

/** DS3231 RTC (ZS-042): 38 x 22 mm, 6-pin header west, 4-pin pass-through east, CR2032 holder underneath. */
export const DS3231_MODULE: ModuleGeom = {
  key: 'ds3231',
  wMm: 38,
  dMm: 22,
  boardBottomMm: 5.0,
  mask: '#1d55b0',
  rows: [
    row(['32K', 'SQW', 'SCL', 'SDA', 'VCC', 'GND'], 2.5, 4.65, 'y', { silkSide: 'e' }),
    row(['SCL_2', 'SDA_2', 'VCC_2', 'GND_2'], 35.5, 7.19, 'y', { silk: ['SCL', 'SDA', 'VCC', 'GND'], silkSide: 'w' }),
  ],
  holes: [
    { x: 9.0, y: 11, d: 3.1 },
    { x: 29.0, y: 11, d: 3.1 },
  ],
};

/** MicroSD card module (SPI, with 3.3 V regulator and level shifter): 42 x 24 mm, 6 pins at the west end. */
export const MICROSD_MODULE: ModuleGeom = {
  key: 'microsd',
  wMm: 42,
  dMm: 24,
  boardBottomMm: 1.8,
  mask: '#1d55b0',
  rows: [row(['GND', 'VCC', 'MISO', 'MOSI', 'SCK', 'CS'], 2.5, 5.65, 'y', { silkSide: 'e' })],
  holes: [
    { x: 21, y: 2.6, d: 3.1 },
    { x: 21, y: 21.4, d: 3.1 },
  ],
};

/* ================================================================== loose parts (no board) */

/** Hobby servos standing on their base, output shaft up; the lead ends in a 3-pin header adapter pointing east. */
export interface ServoGeom {
  bodyL: number;
  bodyW: number;
  caseH: number;
  tabSpan: number;
  tabT: number;
  tabTop: number;
  bossD: number;
  bossH: number;
  shaftFromEnd: number;
  color: number;
  hornLen: number;
  /** x (mm) where the connector's pins end. */
  pinTipX: number;
}
export const SG90: ServoGeom = { bodyL: 22.4, bodyW: 11.8, caseH: 22.7, tabSpan: 32.2, tabT: 2.5, tabTop: 18.4, bossD: 11.8, bossH: 4.0, shaftFromEnd: 5.9, color: 0x2a62c9, hornLen: 15, pinTipX: 52 };
export const MG996R: ServoGeom = { bodyL: 40.7, bodyW: 19.7, caseH: 37.2, tabSpan: 54.0, tabT: 2.8, tabTop: 29.6, bossD: 19.7, bossH: 5.7, shaftFromEnd: 10.2, color: 0x17181b, hornLen: 22, pinTipX: 70 };
export const SERVO_PINS = ['GND', 'VCC', 'SIG'] as const;
export function servoPinTip(g: ServoGeom, index: number): [number, number, number] {
  const r = (v: number) => Number(v.toFixed(4));
  return [r(g.pinTipX * MM), r(1.4 * MM), r((index - 1) * 2.54 * MM)];
}

/** DHT22 / AM2302 standing on its four legs, grille facing north; the legs are bent back into feet. */
export const DHT22 = { w: 15.1, h: 25.0, d: 7.7, legLift: 7.0, pins: ['VCC', 'DATA', 'NC', 'GND'] as const };
export function dht22PinTip(index: number): [number, number, number] {
  const r = (v: number) => Number(v.toFixed(4));
  return [r((index - 1.5) * 2.54 * MM), r(0.04), r(5.5 * MM)];
}

/** 4 x AA holder (62 x 58 x 15 mm) with red and black leads leaving the south end. */
export const BATTERY_4AA = { w: 62.5, d: 57.5, h: 15.2 };
export function battery4aaPinTip(pos: boolean): [number, number, number] {
  const r = (v: number) => Number(v.toFixed(4));
  return [r((pos ? -0.45 : 0.45) * 10 * MM), r(0.45), r((BATTERY_4AA.d / 2 + 18) * MM)];
}

/** KCD1 rocker switch in a printed holder block, rocker facing up, its two quick-connect tabs pointing south. */
export const ROCKER = { blockW: 26, blockD: 22, blockH: 16 };
export function rockerPinTip(index: number): [number, number, number] {
  const r = (v: number) => Number(v.toFixed(4));
  return [r((index === 0 ? -3.5 : 3.5) * MM), r(6 * MM), r((ROCKER.blockD / 2 + 7.5) * MM)];
}

/** 9 mm rotary potentiometer standing on three legs bent into feet (pointing south). */
export function potPinTip(index: number): [number, number, number] {
  const r = (v: number) => Number(v.toFixed(4));
  return [r((index - 1) * 2.5 * MM), r(0.04), r(9.5 * MM)];
}

/** N20 gearmotor lying on its side: 12 x 10 mm section, 24 mm long body, terminals at the east end. */
export const N20 = { w: 12, h: 10, motorL: 15, gearL: 9.3, shaftL: 10 };
export function n20PinTip(pos: boolean): [number, number, number] {
  const r = (v: number) => Number(v.toFixed(4));
  return [r((N20.motorL - 1.5) * MM), r(5 * MM), r((pos ? -2.5 : 2.5) * MM)];
}

/** Axial and radial loose parts: [pin, x (cm), z (cm)] where the formed lead ends rest on the bench. */
export const AXIAL_LEAD_END = 1.05;
export const TO92_FEET: ReadonlyArray<readonly [string, number]> = [
  ['E', -0.127],
  ['B', 0],
  ['C', 0.127],
];
export const TO220_FEET: ReadonlyArray<readonly [string, number]> = [
  ['G', -0.254],
  ['D', 0],
  ['S', 0.254],
];

export { HEADER_TIP_ABOVE_BOARD_MM };
