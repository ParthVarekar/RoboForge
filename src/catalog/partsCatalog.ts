import type { ComponentKind, Vec3 } from '../schema/projectSchema';
import {
  DRV8833_HW627,
  drv8833PinTip,
  ESP32_CAM,
  esp32CamPinTip,
  fcStackPad,
  LM2596_MODULE,
  lm2596PadTip,
  ttTerminalTip,
  ESP32_DEVKIT,
  esp32PinTip,
  GY521,
  gy521PinTip,
  hcsr04PinTip,
  MM,
  LCD1602_I2C,
  LCD2004_I2C,
  lcdPinTip,
  type LcdModuleGeometry,
  OLED_096,
  oledPinTip,
} from './boardGeometry';
import { EXTRA_PARTS } from './partsCatalogExtra';

export type PinRole =
  | 'power_out'
  | 'power_in'
  | 'gnd'
  | 'gpio'
  | 'gpio_input_only'
  | 'motor_in'
  | 'motor_out'
  | 'i2c_sda'
  | 'i2c_scl'
  | 'sensor_trig'
  | 'sensor_echo'
  | 'passive'
  | 'led_anode'
  | 'led_cathode'
  | 'cap_pos'
  | 'cap_neg'
  | 'esc_phase';

export interface PinSpec {
  id: string;
  label: string;
  role: PinRole;
  localPos: Vec3;
  nominalVoltage?: number;
  maxVoltage?: number;
  gpioNumber?: number;
  bootStrapping?: boolean;
  /**
   * How a wire attaches: 'header' = a 2.54 mm pin that takes a DuPont socket (default); 'lead' = soldered to a
   * component lead, a solder tab or a pad (shown with a solder joint and heat-shrink).
   */
  contact?: 'header' | 'lead';
  /** Direction the pin points in the part frame (unit vector); straight up when omitted. */
  dir?: Vec3;
}

export type PartCategory =
  | 'Controllers'
  | 'Drivers'
  | 'Sensors'
  | 'Displays'
  | 'Input'
  | 'Communication'
  | 'Actuators'
  | 'Power'
  | 'Passives'
  | 'Drone / Frame'
  | 'CAD Shapes';

export interface PartSpec {
  kind: ComponentKind;
  name: string;
  shortName: string;
  category: PartCategory;
  description: string;
  massGrams: number;
  unitPriceUsd: number;
  simulated: boolean;
  idleCurrentMa: number;
  peakCurrentMa: number;
  sizeCm: Vec3;
  defaultColor: string;
  roboforgePartId: string;
  pins: PinSpec[];
  /** Pins joined inside the part (a closed switch, pass-through headers); GND pins are always joined. */
  internal?: ReadonlyArray<readonly string[]>;
}

/**
 * The real 30-pin DOIT ESP32 DevKit V1 header, in board order from the antenna end (see boardGeometry.ts).
 * Pin ids are stable (wires and tests refer to them); positions and the added pins follow the real board.
 */
function makeEsp32Pins(): PinSpec[] {
  type Spec = { id: string; label: string; role: PinRole; gpio?: number; vNom?: number; vMax?: number; boot?: boolean };
  const leftSpecs: Spec[] = [
    { id: 'EN', label: 'EN (Reset, pulled up)', role: 'passive', vMax: 3.6 },
    { id: 'GPIO36', label: 'VP / GPIO36 (In-Only)', role: 'gpio_input_only', gpio: 36, vMax: 3.6 },
    { id: 'GPIO39', label: 'VN / GPIO39 (In-Only)', role: 'gpio_input_only', gpio: 39, vMax: 3.6 },
    { id: 'GPIO34', label: 'D34 / GPIO34 (In-Only)', role: 'gpio_input_only', gpio: 34, vMax: 3.6 },
    { id: 'GPIO35', label: 'D35 / GPIO35 (In-Only)', role: 'gpio_input_only', gpio: 35, vMax: 3.6 },
    { id: 'GPIO32', label: 'D32 / GPIO32 (SDA)', role: 'gpio', gpio: 32, vMax: 3.6 },
    { id: 'GPIO33', label: 'D33 / GPIO33 (SCL)', role: 'gpio', gpio: 33, vMax: 3.6 },
    { id: 'GPIO25', label: 'D25 / GPIO25 (PWM)', role: 'gpio', gpio: 25, vMax: 3.6 },
    { id: 'GPIO26', label: 'D26 / GPIO26 (PWM)', role: 'gpio', gpio: 26, vMax: 3.6 },
    { id: 'GPIO27', label: 'D27 / GPIO27 (PWM)', role: 'gpio', gpio: 27, vMax: 3.6 },
    { id: 'GPIO14', label: 'D14 / GPIO14 (PWM)', role: 'gpio', gpio: 14, vMax: 3.6 },
    { id: 'GPIO12', label: 'D12 / GPIO12 (Boot)', role: 'gpio', gpio: 12, vMax: 3.6, boot: true },
    { id: 'GPIO13', label: 'D13 / GPIO13', role: 'gpio', gpio: 13, vMax: 3.6 },
    { id: 'GND_L', label: 'GND', role: 'gnd', vNom: 0 },
    { id: 'VIN', label: 'VIN (5V In)', role: 'power_in', vMax: 5.8 },
  ];
  const rightSpecs: Spec[] = [
    { id: 'GPIO23', label: 'D23 / GPIO23', role: 'gpio', gpio: 23, vMax: 3.6 },
    { id: 'GPIO22', label: 'D22 / GPIO22 (SCL)', role: 'gpio', gpio: 22, vMax: 3.6 },
    { id: 'GPIO1', label: 'TX0 / GPIO1 (USB serial)', role: 'gpio', gpio: 1, vMax: 3.6 },
    { id: 'GPIO3', label: 'RX0 / GPIO3 (USB serial)', role: 'gpio', gpio: 3, vMax: 3.6 },
    { id: 'GPIO21', label: 'D21 / GPIO21 (SDA)', role: 'gpio', gpio: 21, vMax: 3.6 },
    { id: 'GPIO19', label: 'D19 / GPIO19', role: 'gpio', gpio: 19, vMax: 3.6 },
    { id: 'GPIO18', label: 'D18 / GPIO18', role: 'gpio', gpio: 18, vMax: 3.6 },
    { id: 'GPIO5', label: 'D5 / GPIO5 (Boot)', role: 'gpio', gpio: 5, vMax: 3.6, boot: true },
    { id: 'GPIO17', label: 'TX2 / GPIO17', role: 'gpio', gpio: 17, vMax: 3.6 },
    { id: 'GPIO16', label: 'RX2 / GPIO16', role: 'gpio', gpio: 16, vMax: 3.6 },
    { id: 'GPIO4', label: 'D4 / GPIO4', role: 'gpio', gpio: 4, vMax: 3.6 },
    { id: 'GPIO2', label: 'D2 / GPIO2 (LED, Boot)', role: 'gpio', gpio: 2, vMax: 3.6, boot: true },
    { id: 'GPIO15', label: 'D15 / GPIO15 (Boot)', role: 'gpio', gpio: 15, vMax: 3.6, boot: true },
    { id: 'GND_R', label: 'GND', role: 'gnd', vNom: 0 },
    { id: '3V3', label: '3V3 (Out)', role: 'power_out', vNom: 3.3, vMax: 3.6 },
  ];

  const toPin = (p: Spec, side: 'left' | 'right', idx: number): PinSpec => ({
    id: p.id,
    label: p.label,
    role: p.role,
    localPos: esp32PinTip(side, idx),
    nominalVoltage: p.vNom,
    maxVoltage: p.vMax,
    gpioNumber: p.gpio,
    bootStrapping: p.boot,
  });
  return [...leftSpecs.map((p, i) => toPin(p, 'left', i)), ...rightSpecs.map((p, i) => toPin(p, 'right', i))];
}

/** A character LCD with the PCF8574 backpack: four pins on the right-angle header pointing west. */
function lcdSpec(
  kind: 'lcd1602_i2c' | 'lcd2004_i2c',
  g: LcdModuleGeometry,
  o: Pick<PartSpec, 'name' | 'shortName' | 'description' | 'massGrams' | 'unitPriceUsd' | 'roboforgePartId'>,
): PartSpec {
  const west: [number, number, number] = [-1, 0, 0];
  return {
    kind,
    category: 'Displays',
    simulated: true,
    // logic and backpack about 2 mA; the white LED backlight draws most of it
    idleCurrentMa: 25,
    peakCurrentMa: 30,
    sizeCm: [g.wMm * MM, (g.boardBottomMm + PCB_T_MM_CAT + g.bezel.h) * MM, g.dMm * MM],
    defaultColor: '#1f7a3a',
    ...o,
    pins: [
      { id: 'GND', label: 'GND', role: 'gnd', localPos: lcdPinTip(g, 0), dir: west, nominalVoltage: 0 },
      { id: 'VCC', label: 'VCC (5V)', role: 'power_in', localPos: lcdPinTip(g, 1), dir: west, maxVoltage: 5.5 },
      { id: 'SDA', label: 'SDA (pulled up to VCC)', role: 'i2c_sda', localPos: lcdPinTip(g, 2), dir: west, maxVoltage: 5.5 },
      { id: 'SCL', label: 'SCL (pulled up to VCC)', role: 'i2c_scl', localPos: lcdPinTip(g, 3), dir: west, maxVoltage: 5.5 },
    ],
  };
}

const PCB_T_MM_CAT = 1.6;

export const PARTS_CATALOG: Record<ComponentKind, PartSpec> = {
  ...EXTRA_PARTS,
  esp32_devkit: {
    kind: 'esp32_devkit',
    name: 'ESP32 DevKit V1',
    shortName: 'ESP32',
    category: 'Controllers',
    description: 'Dual-core Wi-Fi MCU (3.3 V logic, 5 V VIN). Runs RoboForge virtual HAL sketches.',
    massGrams: 12,
    unitPriceUsd: 8.0,
    simulated: true,
    idleCurrentMa: 90,
    peakCurrentMa: 240,
    sizeCm: [ESP32_DEVKIT.wMm * MM, 1.3, ESP32_DEVKIT.dMm * MM],
    defaultColor: '#16181d',
    roboforgePartId: 'esp32_devkit',
    pins: makeEsp32Pins(),
  },
  fc_esc_stack: {
    kind: 'fc_esc_stack',
    name: 'F7 FC + 45A 4-in-1 ESC Stack',
    shortName: 'FC/ESC Stack',
    category: 'Controllers',
    description: '30.5x30.5 mm drone flight controller + 4-in-1 BLHeli32 ESC stack (3S–6S LiPo, 5V BEC).',
    massGrams: 24,
    unitPriceUsd: 68.0,
    simulated: true,
    idleCurrentMa: 110,
    peakCurrentMa: 1800,
    sizeCm: [3.6, 1.5, 3.6],
    defaultColor: '#111827',
    roboforgePartId: 'fc_f7_esc_45a',
    // solder pads: battery at the ESC's rear edge, three phase pads per motor on its side edges, 5V on the FC
    pins: [
      { id: 'BAT_POS', label: 'BAT+ (3S-6S)', role: 'power_in', localPos: fcStackPad('BAT_POS'), contact: 'lead', maxVoltage: 26.0 },
      { id: 'GND', label: 'GND', role: 'gnd', localPos: fcStackPad('GND'), contact: 'lead', nominalVoltage: 0 },
      { id: '5V_BEC', label: '5V BEC Out', role: 'power_out', localPos: fcStackPad('5V_BEC'), contact: 'lead', nominalVoltage: 5.0, maxVoltage: 5.5 },
      { id: 'M1', label: 'ESC M1 (FL)', role: 'esc_phase', localPos: fcStackPad('M1'), contact: 'lead', gpioNumber: 25 },
      { id: 'M2', label: 'ESC M2 (FR)', role: 'esc_phase', localPos: fcStackPad('M2'), contact: 'lead', gpioNumber: 26 },
      { id: 'M3', label: 'ESC M3 (RL)', role: 'esc_phase', localPos: fcStackPad('M3'), contact: 'lead', gpioNumber: 27 },
      { id: 'M4', label: 'ESC M4 (RR)', role: 'esc_phase', localPos: fcStackPad('M4'), contact: 'lead', gpioNumber: 14 },
    ],
  },
  drv8833: {
    kind: 'drv8833',
    name: 'DRV8833 Dual Motor Driver',
    shortName: 'DRV8833',
    category: 'Drivers',
    description: 'Dual H-Bridge DC driver (2.7–10.8 V VM, 1.5 A/ch). Drives left and right motors via PWM.',
    massGrams: 6,
    unitPriceUsd: 3.5,
    simulated: true,
    idleCurrentMa: 5,
    peakCurrentMa: 1500,
    sizeCm: [DRV8833_HW627.wMm * MM, 1.2, DRV8833_HW627.dMm * MM],
    defaultColor: '#b3141f',
    roboforgePartId: 'drv8833',
    // HW-627 layout: west row IN4, IN3, GND, VCC, IN2, IN1; east row EEP, OUT1-OUT4, ULT (from the north end)
    pins: [
      { id: 'IN4', label: 'IN4 (R-)', role: 'motor_in', localPos: drv8833PinTip('in', 0), maxVoltage: 5.5 },
      { id: 'IN3', label: 'IN3 (R+)', role: 'motor_in', localPos: drv8833PinTip('in', 1), maxVoltage: 5.5 },
      { id: 'GND', label: 'GND', role: 'gnd', localPos: drv8833PinTip('in', 2), nominalVoltage: 0 },
      { id: 'VM', label: 'VCC / VM (Motor V+)', role: 'power_in', localPos: drv8833PinTip('in', 3), maxVoltage: 10.8 },
      { id: 'IN2', label: 'IN2 (L-)', role: 'motor_in', localPos: drv8833PinTip('in', 4), maxVoltage: 5.5 },
      { id: 'IN1', label: 'IN1 (L+)', role: 'motor_in', localPos: drv8833PinTip('in', 5), maxVoltage: 5.5 },
      { id: 'EEP', label: 'EEP (nSLEEP, tied high by J2)', role: 'passive', localPos: drv8833PinTip('out', 0), maxVoltage: 5.75 },
      { id: 'OUT1', label: 'OUT1 (L+)', role: 'motor_out', localPos: drv8833PinTip('out', 1) },
      { id: 'OUT2', label: 'OUT2 (L-)', role: 'motor_out', localPos: drv8833PinTip('out', 2) },
      { id: 'OUT3', label: 'OUT3 (R+)', role: 'motor_out', localPos: drv8833PinTip('out', 3) },
      { id: 'OUT4', label: 'OUT4 (R-)', role: 'motor_out', localPos: drv8833PinTip('out', 4) },
      { id: 'ULT', label: 'ULT (nFAULT, open drain)', role: 'passive', localPos: drv8833PinTip('out', 5), maxVoltage: 5.75 },
    ],
  },
  mpu6050: {
    kind: 'mpu6050',
    name: 'MPU6050 6-Axis IMU',
    shortName: 'MPU6050',
    category: 'Sensors',
    description: 'I2C gyro + accelerometer (3.3 V power, AD0 to GND). Provides live heading yaw & rate.',
    massGrams: 3,
    unitPriceUsd: 3.2,
    simulated: true,
    idleCurrentMa: 4,
    peakCurrentMa: 5,
    sizeCm: [GY521.wMm * MM, 1.2, GY521.dMm * MM],
    defaultColor: '#1f56b8',
    roboforgePartId: 'mpu6050',
    pins: [
      { id: 'VCC', label: 'VCC (3.3-5V)', role: 'power_in', localPos: gy521PinTip(0), maxVoltage: 5.5 },
      { id: 'GND', label: 'GND', role: 'gnd', localPos: gy521PinTip(1), nominalVoltage: 0 },
      { id: 'SCL', label: 'SCL', role: 'i2c_scl', localPos: gy521PinTip(2), maxVoltage: 3.6 },
      { id: 'SDA', label: 'SDA', role: 'i2c_sda', localPos: gy521PinTip(3), maxVoltage: 3.6 },
      { id: 'XDA', label: 'XDA (aux I2C data)', role: 'passive', localPos: gy521PinTip(4), maxVoltage: 3.6 },
      { id: 'XCL', label: 'XCL (aux I2C clock)', role: 'passive', localPos: gy521PinTip(5), maxVoltage: 3.6 },
      { id: 'AD0', label: 'AD0 (GND = 0x68)', role: 'passive', localPos: gy521PinTip(6), maxVoltage: 3.6 },
      { id: 'INT', label: 'INT (interrupt out)', role: 'passive', localPos: gy521PinTip(7), maxVoltage: 3.6 },
    ],
  },
  hcsr04: {
    kind: 'hcsr04',
    name: 'HC-SR04 Ultrasonic Sensor',
    shortName: 'HC-SR04',
    category: 'Sensors',
    description: 'Forward rangefinder (2–400 cm). 5 V ECHO requires a resistor divider into 3.3 V ESP32 pins.',
    massGrams: 9,
    unitPriceUsd: 2.5,
    simulated: true,
    idleCurrentMa: 15,
    peakCurrentMa: 20,
    sizeCm: [4.5, 2.0, 1.6],
    defaultColor: '#1b5fa8',
    roboforgePartId: 'hcsr04',
    // straight header leaving the back of the board (transducers face north)
    pins: [
      { id: 'VCC', label: 'VCC (5V)', role: 'power_in', localPos: hcsr04PinTip(0), dir: [0, 0, 1], maxVoltage: 5.5 },
      { id: 'TRIG', label: 'TRIG', role: 'sensor_trig', localPos: hcsr04PinTip(1), dir: [0, 0, 1], maxVoltage: 5.5 },
      { id: 'ECHO', label: 'ECHO (5V Out)', role: 'sensor_echo', localPos: hcsr04PinTip(2), dir: [0, 0, 1] },
      { id: 'GND', label: 'GND', role: 'gnd', localPos: hcsr04PinTip(3), dir: [0, 0, 1], nominalVoltage: 0 },
    ],
  },
  oled_ssd1306: {
    kind: 'oled_ssd1306',
    name: '0.96" OLED I2C Display',
    shortName: 'OLED 0.96"',
    category: 'Displays',
    description: '128x64 SSD1306 I2C screen at address 0x3C (yellow top band, blue below). Shows what the sketch draws with the Adafruit_SSD1306 library, or the oled.println() shortcut.',
    massGrams: 5,
    unitPriceUsd: 4.5,
    simulated: true,
    idleCurrentMa: 18,
    peakCurrentMa: 30,
    sizeCm: [OLED_096.wMm * MM, 1.2, OLED_096.dMm * MM],
    defaultColor: '#1d4f9e',
    roboforgePartId: 'oled_ssd1306_i2c',
    pins: [
      { id: 'GND', label: 'GND', role: 'gnd', localPos: oledPinTip(0), nominalVoltage: 0 },
      { id: 'VCC', label: 'VCC (3.3V)', role: 'power_in', localPos: oledPinTip(1), maxVoltage: 5.5 },
      { id: 'SCL', label: 'SCL', role: 'i2c_scl', localPos: oledPinTip(2), maxVoltage: 3.6 },
      { id: 'SDA', label: 'SDA', role: 'i2c_sda', localPos: oledPinTip(3), maxVoltage: 3.6 },
    ],
  },
  lcd1602_i2c: lcdSpec('lcd1602_i2c', LCD1602_I2C, {
    name: '16x2 Character LCD (I2C backpack)',
    shortName: 'LCD 16x2',
    description: 'HD44780 1602 LCD, blue with white backlight, on a PCF8574T I2C backpack at 0x27. Made for 5 V. Drive it with LiquidCrystal_I2C: lcd.init(), lcd.backlight(), lcd.print().',
    massGrams: 35,
    unitPriceUsd: 3.2,
    roboforgePartId: 'lcd1602_i2c',
  }),
  lcd2004_i2c: lcdSpec('lcd2004_i2c', LCD2004_I2C, {
    name: '20x4 Character LCD (I2C backpack)',
    shortName: 'LCD 20x4',
    description: 'HD44780 2004 LCD, blue with white backlight, on a PCF8574T I2C backpack at 0x27. Made for 5 V. Rows 0-3; text past column 19 of row 0 continues on row 2, as on the real controller.',
    massGrams: 62,
    unitPriceUsd: 5.5,
    roboforgePartId: 'lcd2004_i2c',
  }),
  esp32_cam: {
    kind: 'esp32_cam',
    name: 'ESP32-CAM (GC2145)',
    shortName: 'ESP32-CAM',
    category: 'Sensors',
    description: 'Wi-Fi camera board (5 V & GND only). Unlocks live First-Person Rover Camera PiP in Arena.',
    massGrams: 11,
    unitPriceUsd: 9.5,
    simulated: true,
    idleCurrentMa: 160,
    peakCurrentMa: 310,
    sizeCm: [ESP32_CAM.wMm * MM, 1.3, ESP32_CAM.dMm * MM],
    defaultColor: '#16171a',
    roboforgePartId: 'esp32_cam_gc2145',
    // AI-Thinker header (camera end north). Only 5V and GND matter to the simulation; the IO pins belong to the
    // camera board's own ESP32, so they carry no ESP32 DevKit GPIO number.
    pins: [
      { id: '5V', label: '5V', role: 'power_in', localPos: esp32CamPinTip('left', 0), maxVoltage: 5.5 },
      { id: 'GND', label: 'GND', role: 'gnd', localPos: esp32CamPinTip('left', 1), nominalVoltage: 0 },
      { id: 'IO12', label: 'IO12 (SD DATA2)', role: 'passive', localPos: esp32CamPinTip('left', 2), maxVoltage: 3.6 },
      { id: 'IO13', label: 'IO13 (SD DATA3)', role: 'passive', localPos: esp32CamPinTip('left', 3), maxVoltage: 3.6 },
      { id: 'IO15', label: 'IO15 (SD CMD)', role: 'passive', localPos: esp32CamPinTip('left', 4), maxVoltage: 3.6 },
      { id: 'IO14', label: 'IO14 (SD CLK)', role: 'passive', localPos: esp32CamPinTip('left', 5), maxVoltage: 3.6 },
      { id: 'IO2', label: 'IO2 (SD DATA0)', role: 'passive', localPos: esp32CamPinTip('left', 6), maxVoltage: 3.6 },
      { id: 'IO4', label: 'IO4 (SD DATA1, flash LED)', role: 'passive', localPos: esp32CamPinTip('left', 7), maxVoltage: 3.6 },
      { id: '3V3', label: '3V3', role: 'passive', localPos: esp32CamPinTip('right', 0), maxVoltage: 3.6 },
      { id: 'IO16', label: 'IO16 (PSRAM)', role: 'passive', localPos: esp32CamPinTip('right', 1), maxVoltage: 3.6 },
      { id: 'IO0', label: 'IO0 (low = flash mode)', role: 'passive', localPos: esp32CamPinTip('right', 2), maxVoltage: 3.6 },
      { id: 'GND_2', label: 'GND', role: 'gnd', localPos: esp32CamPinTip('right', 3), nominalVoltage: 0 },
      { id: 'VCC', label: 'VCC (3.3V or 5V out)', role: 'passive', localPos: esp32CamPinTip('right', 4), maxVoltage: 5.5 },
      { id: 'U0R', label: 'U0R / IO3 (serial RX)', role: 'passive', localPos: esp32CamPinTip('right', 5), maxVoltage: 3.6 },
      { id: 'U0T', label: 'U0T / IO1 (serial TX)', role: 'passive', localPos: esp32CamPinTip('right', 6), maxVoltage: 3.6 },
      { id: 'GND_3', label: 'GND', role: 'gnd', localPos: esp32CamPinTip('right', 7), nominalVoltage: 0 },
    ],
  },
  tactile_button: {
    kind: 'tactile_button',
    name: 'Tactile Push Button (6mm)',
    shortName: 'Button',
    category: 'Sensors',
    description: 'Momentary switch — click in 3D while running to trigger digitalRead() on its wired GPIO.',
    massGrams: 1,
    unitPriceUsd: 0.15,
    simulated: true,
    idleCurrentMa: 0,
    peakCurrentMa: 1,
    sizeCm: [1.0, 0.9, 1.0],
    defaultColor: '#334155',
    roboforgePartId: 'tactile_switch_6mm',
    // 6 x 6 mm switch on its legs: A and B are the two legs on the south side (4.5 mm apart), switched by the plunger
    pins: [
      { id: 'A', label: 'Pin A', role: 'passive', localPos: [-0.225, 0.17, 0.345], contact: 'lead', dir: [0, 0, 1] },
      { id: 'B', label: 'Pin B', role: 'passive', localPos: [0.225, 0.17, 0.345], contact: 'lead', dir: [0, 0, 1] },
    ],
  },
  dc_motor: {
    kind: 'dc_motor',
    name: 'TT DC Gearmotor + Wheel',
    shortName: 'TT Motor',
    category: 'Actuators',
    description: '6 V brushed gearmotor with 65 mm treaded tire. Spins visually on bench and drives rover in Arena.',
    massGrams: 48,
    unitPriceUsd: 4.0,
    simulated: true,
    idleCurrentMa: 0,
    peakCurrentMa: 650,
    sizeCm: [5.6, 6.5, 7.0],
    defaultColor: '#f2c21b',
    roboforgePartId: 'tt_gearmotor_6v',
    // solder tabs on the motor's end cap
    pins: [
      { id: 'M_POS', label: 'M+', role: 'passive', localPos: ttTerminalTip(-1), contact: 'lead', dir: [0, 0, 1] },
      { id: 'M_NEG', label: 'M-', role: 'passive', localPos: ttTerminalTip(1), contact: 'lead', dir: [0, 0, 1] },
    ],
  },
  brushless_2207: {
    kind: 'brushless_2207',
    name: '2207 1950KV Motor + 5" Prop',
    shortName: '2207 Motor',
    category: 'Actuators',
    description: 'Brushless FPV motor with visible copper stator, blue M5 locknut & 5" 3-blade prop.',
    massGrams: 34,
    unitPriceUsd: 16.5,
    simulated: true,
    idleCurrentMa: 0,
    peakCurrentMa: 28000,
    sizeCm: [2.8, 3.2, 2.8],
    defaultColor: '#24272d',
    roboforgePartId: 'motor_2207_1950kv',
    // ends of the three phase wires leaving the base toward the frame centre
    pins: [
      { id: 'PHASE', label: 'ESC Phase', role: 'esc_phase', localPos: [0, 0.12, 2.3], contact: 'lead', dir: [0, 0, 1] },
    ],
  },
  battery_2s: {
    kind: 'battery_2s',
    name: '2S Li-Ion Pack (7.4V 2200mAh)',
    shortName: '2S Li-Ion',
    category: 'Power',
    description: '2-cell 18650 pack (7.4 V nominal). Wire through LM2596 buck before 5 V electronics.',
    massGrams: 95,
    unitPriceUsd: 12.0,
    simulated: true,
    idleCurrentMa: 0,
    peakCurrentMa: 4400,
    sizeCm: [3.8, 1.9, 6.8],
    defaultColor: '#0284c7',
    roboforgePartId: 'battery_2s_2200',
    // tinned ends of the red/black leads
    pins: [
      { id: 'BAT_POS', label: 'BAT+ (7.4V)', role: 'power_out', localPos: [-0.45, 0.45, 4.6], contact: 'lead', dir: [0, 0, 1], nominalVoltage: 7.4 },
      { id: 'GND', label: 'GND (-)', role: 'gnd', localPos: [0.45, 0.45, 4.6], contact: 'lead', dir: [0, 0, 1], nominalVoltage: 0 },
    ],
  },
  battery_6s_lipo: {
    kind: 'battery_6s_lipo',
    name: '6S LiPo 1100mAh (22.2V XT60)',
    shortName: '6S LiPo',
    category: 'Power',
    description: 'High-discharge 6S 100C FPV flight pack with yellow XT60 connector and battery strap.',
    massGrams: 195,
    unitPriceUsd: 28.0,
    simulated: true,
    idleCurrentMa: 0,
    peakCurrentMa: 110000,
    sizeCm: [3.6, 3.4, 7.2],
    defaultColor: '#1e293b',
    roboforgePartId: 'lipo_6s_1100',
    // XT60 contacts (7.2 mm apart) at the end of the 12 AWG leads
    pins: [
      { id: 'BAT_POS', label: 'XT60 + (22.2V)', role: 'power_out', localPos: [-0.36, 0.9, 6.9], contact: 'lead', dir: [0, 0, 1], nominalVoltage: 22.2 },
      { id: 'GND', label: 'XT60 - (GND)', role: 'gnd', localPos: [0.36, 0.9, 6.9], contact: 'lead', dir: [0, 0, 1], nominalVoltage: 0 },
    ],
  },
  lm2596_buck: {
    kind: 'lm2596_buck',
    name: 'LM2596 Buck Converter (5.2V)',
    shortName: 'LM2596',
    category: 'Power',
    description: 'Step-down regulator set to 5.2 V output (up to 3 A) from the 2S Li-ion pack.',
    massGrams: 12,
    unitPriceUsd: 2.2,
    simulated: true,
    idleCurrentMa: 10,
    peakCurrentMa: 3000,
    sizeCm: [LM2596_MODULE.wMm * MM, 1.4, LM2596_MODULE.dMm * MM],
    defaultColor: '#1f4fa8',
    roboforgePartId: 'lm2596_buck',
    // corner solder pads
    pins: [
      { id: 'IN_POS', label: 'IN+', role: 'power_in', localPos: lm2596PadTip('IN_POS'), contact: 'lead', maxVoltage: 35 },
      { id: 'IN_NEG', label: 'IN- (GND)', role: 'gnd', localPos: lm2596PadTip('IN_NEG'), contact: 'lead', nominalVoltage: 0 },
      { id: 'OUT_POS', label: 'OUT+ (5.2V)', role: 'power_out', localPos: lm2596PadTip('OUT_POS'), contact: 'lead', nominalVoltage: 5.2 },
      { id: 'OUT_NEG', label: 'OUT- (GND)', role: 'gnd', localPos: lm2596PadTip('OUT_NEG'), contact: 'lead', nominalVoltage: 0 },
    ],
  },
  resistor_10k: {
    kind: 'resistor_10k',
    name: 'Resistor 10 kOhm (1/4W)',
    shortName: '10k Res',
    category: 'Passives',
    description: 'Axial 10 kOhm resistor for LED current limiting or HC-SR04 5V->3.3V ECHO voltage divider.',
    massGrams: 1,
    unitPriceUsd: 0.05,
    simulated: true,
    idleCurrentMa: 0,
    peakCurrentMa: 1,
    sizeCm: [2.2, 0.5, 0.6],
    defaultColor: '#d4a373',
    roboforgePartId: 'resistor_10k',
    pins: [
      { id: 'A', label: 'Lead A', role: 'passive', localPos: [-1.05, 0.115, 0], contact: 'lead', dir: [-1, 0, 0] },
      { id: 'B', label: 'Lead B', role: 'passive', localPos: [1.05, 0.115, 0], contact: 'lead', dir: [1, 0, 0] },
    ],
  },
  led_5mm: {
    kind: 'led_5mm',
    name: '5mm Status LED',
    shortName: '5mm LED',
    category: 'Passives',
    description: 'Visual indicator LED. Glows proportionally to GPIO PWM; requires a series resistor.',
    massGrams: 1,
    unitPriceUsd: 0.1,
    simulated: true,
    idleCurrentMa: 0,
    peakCurrentMa: 20,
    sizeCm: [1.0, 1.4, 1.0],
    defaultColor: '#22c55e',
    roboforgePartId: 'led_5mm',
    // standing on its legs, bent out into feet at the bench (anode is the longer leg, cathode under the flat)
    pins: [
      { id: 'ANODE', label: 'Anode (+, long leg)', role: 'led_anode', localPos: [-0.527, 0.07, 0], contact: 'lead', dir: [-1, 0, 0], maxVoltage: 3.6 },
      { id: 'CATHODE', label: 'Cathode (-, flat side)', role: 'led_cathode', localPos: [0.527, 0.07, 0], contact: 'lead', dir: [1, 0, 0] },
    ],
  },
  wire_splice: {
    kind: 'wire_splice',
    name: 'Solder Splice (heat-shrink)',
    shortName: 'Splice',
    category: 'Passives',
    description: 'Joins several wires into one: the jumpers are soldered together and covered with heat-shrink. Use it to share a signal or a supply (I2C, 3V3, GND), since a header pin takes only one jumper.',
    massGrams: 0.3,
    unitPriceUsd: 0.05,
    simulated: true,
    idleCurrentMa: 0,
    peakCurrentMa: 0,
    sizeCm: [1.4, 0.36, 0.4],
    defaultColor: '#1f2937',
    roboforgePartId: 'wire_splice',
    // one soldered joint on top of the sleeve: every wire lands on it
    pins: [{ id: 'J', label: 'Splice (soldered joint)', role: 'passive', localPos: [0, 0.36, 0], contact: 'lead' }],
  },
  cap_1000uf: {
    kind: 'cap_1000uf',
    name: '1000uF 16V Electrolytic Cap',
    shortName: '1000uF Cap',
    category: 'Passives',
    description: 'Bulk decoupling capacitor across DRV8833 VM/GND to suppress motor startup brownouts.',
    massGrams: 4,
    unitPriceUsd: 0.35,
    simulated: true,
    idleCurrentMa: 0,
    peakCurrentMa: 0,
    sizeCm: [1.0, 2.25, 1.0],
    defaultColor: '#1f2b48',
    roboforgePartId: 'cap_1000uf',
    // 10 x 20 mm can on 5 mm lead spacing, leads bent out into feet; the negative lead is under the sleeve stripe
    pins: [
      { id: 'POS', label: 'Pos (+)', role: 'cap_pos', localPos: [-0.65, 0.07, 0], contact: 'lead', dir: [-1, 0, 0], maxVoltage: 16 },
      { id: 'NEG', label: 'Neg (-, stripe)', role: 'cap_neg', localPos: [0.65, 0.07, 0], contact: 'lead', dir: [1, 0, 0] },
    ],
  },
  chassis_2wd: {
    kind: 'chassis_2wd',
    name: '2WD Carbon Rover Chassis Deck',
    shortName: '2WD Chassis',
    category: 'Drone / Frame',
    description: '3 mm twill carbon 2WD deck with TT motor brackets, M3 hole grid, slots and red anodised standoffs.',
    massGrams: 115,
    unitPriceUsd: 14.0,
    simulated: true,
    idleCurrentMa: 0,
    peakCurrentMa: 0,
    sizeCm: [14.4, 0.45, 19.2],
    defaultColor: '#262b33',
    roboforgePartId: 'chassis_2wd_carbon',
    pins: [],
  },
  frame_quad_5in: {
    kind: 'frame_quad_5in',
    name: '5-Inch Carbon Freestyle X-Frame',
    shortName: '5" X-Frame',
    category: 'Drone / Frame',
    description: 'True-X 5-inch carbon-fiber quadcopter frame with red anodized aluminum standoffs & top plate.',
    massGrams: 118,
    unitPriceUsd: 42.0,
    simulated: true,
    idleCurrentMa: 0,
    peakCurrentMa: 0,
    sizeCm: [22.0, 3.2, 22.0],
    defaultColor: '#22262e',
    roboforgePartId: 'frame_quad_5in_cf',
    pins: [],
  },
  vtx_antenna: {
    kind: 'vtx_antenna',
    name: '5.8GHz FPV Antenna + TPU Mount',
    shortName: 'FPV Antenna',
    category: 'Drone / Frame',
    description: 'Circularly polarized pagoda VTX antenna in a 3D-printed bright orange TPU tail mount.',
    massGrams: 11,
    unitPriceUsd: 14.5,
    simulated: true,
    idleCurrentMa: 180,
    peakCurrentMa: 350,
    sizeCm: [1.8, 6.2, 1.8],
    defaultColor: '#f97316',
    roboforgePartId: 'vtx_antenna_5g8',
    // ends of the VTX power leads running forward out of the mount
    pins: [
      { id: '5V', label: '5V In', role: 'power_in', localPos: [-0.12, 0.2, -1.4], contact: 'lead', dir: [0, 0, -1], maxVoltage: 5.5 },
      { id: 'GND', label: 'GND', role: 'gnd', localPos: [0.12, 0.2, -1.4], contact: 'lead', dir: [0, 0, -1], nominalVoltage: 0 },
    ],
  },
  cad_box: {
    kind: 'cad_box',
    name: 'Custom Mount Block (Box)',
    shortName: 'Box',
    category: 'CAD Shapes',
    description: '3D-printable structural mounting block / enclosure primitive. Move, lift, and rotate freely.',
    massGrams: 14,
    unitPriceUsd: 0.5,
    simulated: false,
    idleCurrentMa: 0,
    peakCurrentMa: 0,
    sizeCm: [3.0, 1.6, 3.0],
    defaultColor: '#64748b',
    roboforgePartId: 'cad_box',
    pins: [],
  },
  cad_cylinder: {
    kind: 'cad_cylinder',
    name: 'Structural Cylinder / Spacer',
    shortName: 'Cylinder',
    category: 'CAD Shapes',
    description: 'Cylindrical spacer, bumper post, or sensor housing primitive.',
    massGrams: 8,
    unitPriceUsd: 0.3,
    simulated: false,
    idleCurrentMa: 0,
    peakCurrentMa: 0,
    sizeCm: [2.2, 2.0, 2.2],
    defaultColor: '#94a3b8',
    roboforgePartId: 'cad_cylinder',
    pins: [],
  },
  cad_standoff: {
    kind: 'cad_standoff',
    name: 'M3 Red Aluminum Standoff (28mm)',
    shortName: 'M3 Standoff',
    category: 'CAD Shapes',
    description: 'Knurled anodized aluminum M3 hex standoff for stacking dual chassis or flight decks.',
    massGrams: 3,
    unitPriceUsd: 0.4,
    simulated: false,
    idleCurrentMa: 0,
    peakCurrentMa: 0,
    sizeCm: [0.58, 2.8, 0.58],
    defaultColor: '#c4161c',
    roboforgePartId: 'standoff_m3_28mm',
    pins: [],
  },
  cad_plate: {
    kind: 'cad_plate',
    name: 'Carbon Mounting Plate (60x40mm)',
    shortName: 'CF Plate',
    category: 'CAD Shapes',
    description: '2 mm matte carbon-fiber top plate for mounting batteries, cameras, or upper decks.',
    massGrams: 12,
    unitPriceUsd: 2.5,
    simulated: false,
    idleCurrentMa: 0,
    peakCurrentMa: 0,
    sizeCm: [6.0, 0.25, 4.0],
    defaultColor: '#27272a',
    roboforgePartId: 'plate_cf_60x40',
    pins: [],
  },
};

export const PART_CATEGORIES: PartCategory[] = [
  'Controllers',
  'Drivers',
  'Sensors',
  'Displays',
  'Input',
  'Communication',
  'Actuators',
  'Power',
  'Passives',
  'Drone / Frame',
  'CAD Shapes',
];

/**
 * Retrieves the catalog specification for a given component kind.
 */
export function getPartSpec(kind: ComponentKind): PartSpec {
  return PARTS_CATALOG[kind];
}

/**
 * Looks up a specific pin specification on a component kind, or undefined if absent.
 */
export function getPinSpec(kind: ComponentKind, pinId: string): PinSpec | undefined {
  return PARTS_CATALOG[kind].pins.find((p) => p.id === pinId);
}
