/**
 * Real mechanical dimensions of the modules, shared by the parts catalog (pin positions the circuit and wiring use)
 * and the 3D builders (the geometry you see), so a wire always lands on the pin that is drawn.
 *
 * Units: millimetres in the constants (as in datasheets), centimetres in the exported helpers (scene units).
 * Board frame: x across the board (left to right), y along it from the north edge, the part origin at the board
 * centre on the bench. Sources are listed in docs/06_COMPONENT_REFERENCES.md.
 */

export const MM = 0.1;
export const HEADER_PITCH_MM = 2.54;
/** A 2.54 mm male header standing on a board: 2.5 mm plastic spacer + 6 mm pin above it. */
export const HEADER_TIP_ABOVE_BOARD_MM = 8.5;
export const PCB_T_MM = 1.6;

/** ESP32 DevKit V1 (DOIT, 30 pins): 51.5 x 28.3 mm, 2 x 15 pins, rows 25.4 mm apart, strips offset 5.6 mm from the antenna end. */
export const ESP32_DEVKIT = {
  wMm: 28.3,
  dMm: 51.5,
  rowSpacingMm: 25.4,
  firstPinFromNorthMm: 5.6,
  pinsPerSide: 15,
  /** Underside of the board above the part origin (the board rests on its trimmed pins and solder joints). */
  boardBottomMm: 1.8,
  left: ['EN', 'VP', 'VN', 'D34', 'D35', 'D32', 'D33', 'D25', 'D26', 'D27', 'D14', 'D12', 'D13', 'GND', 'VIN'],
  right: ['D23', 'D22', 'TX0', 'RX0', 'D21', 'D19', 'D18', 'D5', 'TX2', 'RX2', 'D4', 'D2', 'D15', 'GND', '3V3'],
} as const;

/** A small module board: outline in mm, underside height above the bench (it rests on its trimmed pins). */
export interface ModuleBoard {
  wMm: number;
  dMm: number;
  boardBottomMm: number;
}

export function moduleTopCm(b: ModuleBoard): number {
  return (b.boardBottomMm + PCB_T_MM) * MM;
}

/** Header pin tip (cm, part frame) for a pin at board-mm (x from the left edge, y from the north edge). */
export function modulePinTip(b: ModuleBoard, xMm: number, yMm: number, aboveMm = HEADER_TIP_ABOVE_BOARD_MM): [number, number, number] {
  const r = (v: number) => Number(v.toFixed(4));
  return [r((xMm - b.wMm / 2) * MM), r(moduleTopCm(b) + aboveMm * MM), r((yMm - b.dMm / 2) * MM)];
}

/** HW-627 DRV8833 module: 18.5 x 16 mm red board, two rows of 6 pins 15.24 mm apart (KiCad HW-627 footprint). */
export const DRV8833_HW627 = {
  wMm: 18.5,
  dMm: 16,
  boardBottomMm: 1.8,
  rowSpacingMm: 15.24,
  firstPinFromNorthMm: 1.65,
  /** West row, from the north end (IN4 sits opposite EEP). */
  inputs: ['IN4', 'IN3', 'GND', 'VCC', 'IN2', 'IN1'],
  /** East row, from the north end. */
  outputs: ['EEP', 'OUT1', 'OUT2', 'OUT3', 'OUT4', 'ULT'],
} as const;

export function drv8833PinTip(side: 'in' | 'out', index: number): [number, number, number] {
  const g = DRV8833_HW627;
  const x = side === 'in' ? (g.wMm - g.rowSpacingMm) / 2 : (g.wMm + g.rowSpacingMm) / 2;
  return modulePinTip(g, x, g.firstPinFromNorthMm + index * HEADER_PITCH_MM);
}

/** GY-521 (MPU-6050) breakout: about 21.2 x 16.4 mm blue board, 8-pin header along the south edge, two 3 mm holes. */
export const GY521 = {
  wMm: 21.2,
  dMm: 16.4,
  boardBottomMm: 1.8,
  pinRowFromNorthMm: 14.9,
  pins: ['VCC', 'GND', 'SCL', 'SDA', 'XDA', 'XCL', 'AD0', 'INT'],
  holes: [
    { x: 2.6, y: 2.6, d: 3.0 },
    { x: 18.6, y: 2.6, d: 3.0 },
  ],
} as const;

export function gy521PinTip(index: number): [number, number, number] {
  const g = GY521;
  return modulePinTip(g, g.wMm / 2 + (index - (g.pins.length - 1) / 2) * HEADER_PITCH_MM, g.pinRowFromNorthMm);
}

/** 0.96" SSD1306 I2C OLED module: 27.3 x 27.8 mm board, 4-pin header on the north edge, 2 mm holes in the corners. */
export const OLED_096 = {
  wMm: 27.3,
  dMm: 27.8,
  boardBottomMm: 1.8,
  pinRowFromNorthMm: 1.6,
  pins: ['GND', 'VCC', 'SCL', 'SDA'],
  /** Glass panel 26.7 x 19.26 mm; active area 21.74 x 10.86 mm. */
  glass: { w: 26.7, d: 19.26, t: 1.45, yTop: 4.6, activeW: 21.74, activeD: 10.86 },
  holes: [
    { x: 2.0, y: 2.0, d: 2.0 },
    { x: 25.3, y: 2.0, d: 2.0 },
    { x: 2.0, y: 25.8, d: 2.0 },
    { x: 25.3, y: 25.8, d: 2.0 },
  ],
} as const;

export function oledPinTip(index: number): [number, number, number] {
  const g = OLED_096;
  return modulePinTip(g, g.wMm / 2 + (index - (g.pins.length - 1) / 2) * HEADER_PITCH_MM, g.pinRowFromNorthMm);
}

/**
 * AI-Thinker ESP32-CAM: 27 x 40.5 mm, two rows of 8 pins 22.86 mm apart toward the south end (row offsets are not in
 * the datasheet; 5V and 3V3 sit at the south end). The camera end is north.
 */
export const ESP32_CAM = {
  wMm: 27,
  dMm: 40.5,
  boardBottomMm: 1.8,
  rowSpacingMm: 22.86,
  /** South-most pin centre, measured from the south edge. */
  lastPinFromSouthMm: 1.7,
  /** From the south end. */
  left: ['5V', 'GND', 'IO12', 'IO13', 'IO15', 'IO14', 'IO2', 'IO4'],
  right: ['3V3', 'IO16', 'IO0', 'GND', 'VCC', 'U0R', 'U0T', 'GND'],
} as const;

export function esp32CamPinTip(side: 'left' | 'right', indexFromSouth: number): [number, number, number] {
  const g = ESP32_CAM;
  const x = side === 'left' ? (g.wMm - g.rowSpacingMm) / 2 : (g.wMm + g.rowSpacingMm) / 2;
  return modulePinTip(g, x, g.dMm - g.lastPinFromSouthMm - indexFromSouth * HEADER_PITCH_MM);
}

/**
 * HC-SR04: 45 x 20 mm board standing on its long edge, transducers (16 mm) facing north, 26 mm apart, a 4-pin header
 * at the bottom centre. Drawn with a straight header pointing back (south) so wires attach from behind; many boards
 * ship with right-angle pins pointing down instead.
 */
export const HCSR04 = {
  wMm: 45,
  hMm: 20,
  /** Board plane: front face (transducer side) at z = -boardZMm/2 .. back face. */
  canDMm: 16,
  canHMm: 12.2,
  canSpacingMm: 26,
  /** Height of the 4-pin row above the bench (the board stands on its lower edge). */
  pinRowHeightMm: 2.2,
  pins: ['VCC', 'TRIG', 'ECHO', 'GND'],
} as const;

/**
 * z of the board's back face (mm, part frame). Transducers plus board are centred on the origin, so the cans' front
 * faces are at -backZ and the header sticks out behind.
 */
export const HCSR04_BACK_Z_MM = (HCSR04.canHMm + PCB_T_MM) / 2;

/** HC-SR04 pin tip (cm): straight pins leaving the back face, pointing south. */
export function hcsr04PinTip(index: number): [number, number, number] {
  const r = (v: number) => Number(v.toFixed(4));
  // read left to right from the front (north), which is world +X to -X
  const x = ((HCSR04.pins.length - 1) / 2 - index) * HEADER_PITCH_MM;
  return [r(x * MM), r(HCSR04.pinRowHeightMm * MM), r((HCSR04_BACK_Z_MM + HEADER_TIP_ABOVE_BOARD_MM) * MM)];
}

/**
 * Yellow TT gearmotor with the common 65 x 26 mm wheel (part frame in cm): gearbox 22.5 mm tall and 18.8 mm thick
 * along the axle, output shaft 32.5 mm up (the wheel radius) near the front (-z), 130-size motor out of the back.
 */
export const TT_MOTOR = {
  gearboxHMm: 22.5,
  gearboxTMm: 18.8,
  axleY: 3.25,
  axleZ: -0.85,
  gearboxRearZ: 2.6,
  /** M3 through-holes along the gearbox centreline (cm, part frame z). */
  mountHoleZ: [1.1, 2.0],
  motorLenCm: 2.4,
  terminalX: 0.55,
  wheelDMm: 65,
  wheelWMm: 26,
  /** Wheel centre from the gearbox centre plane: half gearbox + 2 mm gap + half wheel. */
  wheelOffsetX: 0.94 + 0.2 + 1.3,
} as const;

/** Tip of a TT motor solder tab (sign -1 = M+, +1 = M-), pointing out of the motor's back (+z). */
export function ttTerminalTip(sign: -1 | 1): [number, number, number] {
  const t = TT_MOTOR;
  const capZ = t.gearboxRearZ - 0.4 + t.motorLenCm;
  return [sign * t.terminalX, t.axleY, Number((capZ + 0.65).toFixed(3))];
}

/** Blue LM2596S buck module: 43.2 x 21 mm, solder pads in the four corners, two 3 mm holes. */
export const LM2596_MODULE = {
  wMm: 43.2,
  dMm: 21,
  boardBottomMm: 1.0,
  pads: [
    { id: 'IN_POS', x: 1.9, y: 3.2 },
    { id: 'IN_NEG', x: 1.9, y: 17.8 },
    { id: 'OUT_POS', x: 41.3, y: 3.2 },
    { id: 'OUT_NEG', x: 41.3, y: 17.8 },
  ],
  holes: [
    { x: 6.0, y: 18.4, d: 3.0 },
    { x: 40.6, y: 10.5, d: 3.0 },
  ],
} as const;

/** Top of an LM2596 corner pad (cm, part frame), where the wire's solder joint sits. */
export function lm2596PadTip(id: 'IN_POS' | 'IN_NEG' | 'OUT_POS' | 'OUT_NEG'): [number, number, number] {
  const g = LM2596_MODULE;
  const p = g.pads.find((x) => x.id === id) ?? g.pads[0];
  return modulePinTip(g, p.x, p.y, 0.15);
}

/**
 * 30.5 x 30.5 mm FPV stack (36 mm boards): 4-in-1 ESC at the bottom, FC above on 7.5 mm spacers. Motor phase pads in
 * groups of three on the side edges, battery pads at the rear edge, FC solder pads along its rear edge.
 */
export const FC_STACK = {
  boardMm: 36,
  holesMm: [
    [2.75, 2.75],
    [33.25, 2.75],
    [2.75, 33.25],
    [33.25, 33.25],
  ] as ReadonlyArray<readonly [number, number]>,
  escBottomCm: 0.1,
  fcBottomCm: 0.85,
  motorPadXMm: 2.0,
  motorPadDyMm: 9.0,
  batPadDxMm: 5.0,
  batPadFromRearMm: 2.2,
  fcPadX0Mm: 7.0,
  fcPadFromRearMm: 3.4,
} as const;

/** Solder-pad position (cm, part frame) of a stack connection; the wire's joint sits on the pad. */
export function fcStackPad(id: 'M1' | 'M2' | 'M3' | 'M4' | 'BAT_POS' | 'GND' | '5V_BEC'): [number, number, number] {
  const g = FC_STACK;
  const c = g.boardMm / 2;
  const esc = { wMm: g.boardMm, dMm: g.boardMm, boardBottomMm: g.escBottomCm / MM };
  const fc = { wMm: g.boardMm, dMm: g.boardMm, boardBottomMm: g.fcBottomCm / MM };
  switch (id) {
    case 'M1':
      return modulePinTip(esc, g.motorPadXMm, c - g.motorPadDyMm, 0.1);
    case 'M2':
      return modulePinTip(esc, g.boardMm - g.motorPadXMm, c - g.motorPadDyMm, 0.1);
    case 'M3':
      return modulePinTip(esc, g.motorPadXMm, c + g.motorPadDyMm, 0.1);
    case 'M4':
      return modulePinTip(esc, g.boardMm - g.motorPadXMm, c + g.motorPadDyMm, 0.1);
    case 'BAT_POS':
      return modulePinTip(esc, c - g.batPadDxMm, g.boardMm - g.batPadFromRearMm, 0.1);
    case 'GND':
      return modulePinTip(esc, c + g.batPadDxMm, g.boardMm - g.batPadFromRearMm, 0.1);
    case '5V_BEC':
      return modulePinTip(fc, g.fcPadX0Mm, g.boardMm - g.fcPadFromRearMm, 0.1);
  }
}

/** 2WD carbon deck (cm): 3 mm plate on 1.5 mm rubber feet, motor brackets at the side edges centred on motorZ. */
export const CHASSIS_2WD = {
  wCm: 14.4,
  dCm: 19.2,
  plateCm: 0.3,
  plateBottomCm: 0.15,
  motorZ: 1.2,
  standoffs: [
    [-6.2, -8.4],
    [6.2, -8.4],
    [-6.2, 8.6],
    [6.2, 8.6],
  ] as ReadonlyArray<readonly [number, number]>,
} as const;

export function esp32BoardTopCm(): number {
  return (ESP32_DEVKIT.boardBottomMm + PCB_T_MM) * MM;
}

/** Pin tip (x, y, z) in cm for the ESP32 DevKit, `side` = 'left' | 'right', `index` from the antenna end. */
export function esp32PinTip(side: 'left' | 'right', index: number): [number, number, number] {
  const g = ESP32_DEVKIT;
  const x = ((side === 'left' ? -1 : 1) * g.rowSpacingMm * 0.5) * MM;
  const z = (g.firstPinFromNorthMm + index * HEADER_PITCH_MM - g.dMm / 2) * MM;
  const y = esp32BoardTopCm() + HEADER_TIP_ABOVE_BOARD_MM * MM;
  return [Number(x.toFixed(4)), Number(y.toFixed(4)), Number(z.toFixed(4))];
}
