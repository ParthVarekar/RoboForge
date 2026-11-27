import type { ComponentKind, Vec3 } from '../schema/projectSchema';
import { MM, PCB_T_MM } from './boardGeometry';
import {
  A4988_MODULE,
  AMS1117_MODULE,
  ARDUINO_NANO,
  BATTERY_4AA,
  BME280_MODULE,
  BUZZER_MODULE,
  DHT22,
  DS3231_MODULE,
  GPS_NEO6M,
  HC05_MODULE,
  JOYSTICK_KY023,
  L298N_MODULE,
  LINE_TCRT5000,
  MAX7219_MODULE,
  MG996R,
  MICROSD_MODULE,
  MT3608_MODULE,
  NRF24_MODULE,
  PIR_HCSR501,
  RELAY_1CH,
  RELAY_TERMINALS,
  ROCKER,
  RPI_PICO,
  SERVO_PINS,
  SG90,
  TB6612_MODULE,
  TM1637_MODULE,
  TO220_FEET,
  TO92_FEET,
  TP4056_MODULE,
  ULN2003_BOARD,
  VL53L0X_MODULE,
  WS2812_STICK,
  AXIAL_LEAD_END,
  battery4aaPinTip,
  dht22PinTip,
  l298nTerminalTip,
  moduleHeaderPins,
  modulePadTip,
  moduleTip,
  n20PinTip,
  pirPinTip,
  potPinTip,
  relayTerminalTip,
  rockerPinTip,
  servoPinTip,
  type ModuleGeom,
  type ServoGeom,
} from './moduleGeometry';
import type { PartCategory, PartSpec, PinRole, PinSpec } from './partsCatalog';

/**
 * The extended parts library: modules, controllers, actuators and passives used in small robot builds. Most are
 * "wiring only": the circuit check powers and checks them (voltage ratings, shared ground, I2C, one jumper per pin)
 * but the simulator does not run their behaviour yet. Dimensions and sources: moduleGeometry.ts and
 * docs/06_COMPONENT_REFERENCES.md.
 */

export type ExtraKind =
  | 'servo_sg90'
  | 'servo_mg996r'
  | 'dht22'
  | 'gps_neo6m'
  | 'buzzer_active'
  | 'relay_1ch'
  | 'line_tcrt5000'
  | 'ws2812_stick8'
  | 'l298n'
  | 'tb6612fng'
  | 'a4988'
  | 'mt3608_boost'
  | 'tp4056_charger'
  | 'ams1117_3v3'
  | 'battery_4aa'
  | 'rocker_switch'
  | 'arduino_nano'
  | 'rpi_pico'
  | 'hc05_bt'
  | 'nrf24l01'
  | 'rtc_ds3231'
  | 'microsd_module'
  | 'bme280'
  | 'vl53l0x'
  | 'pir_hcsr501'
  | 'joystick_ky023'
  | 'pot_10k'
  | 'max7219_matrix'
  | 'tm1637_4digit'
  | 'stepper_28byj48'
  | 'n20_motor'
  | 'diode_1n4007'
  | 'npn_2n2222'
  | 'mosfet_irlz44n'
  | 'cap_100nf';

interface PinDef {
  label?: string;
  role: PinRole;
  vNom?: number;
  vMax?: number;
}

const P = (role: PinRole, vMax?: number, label?: string, vNom?: number): PinDef => ({ role, vMax, label, vNom });
const GND: PinDef = { role: 'gnd', vNom: 0 };

/** Pin specs for every header pin and pad of a module, in board order, from one definition table. */
function modulePins(g: ModuleGeom, defs: Record<string, PinDef>): PinSpec[] {
  const out: PinSpec[] = [];
  for (const h of moduleHeaderPins(g)) {
    const d = defs[h.id];
    if (!d) throw new Error(`${g.key}: no pin definition for ${h.id}`);
    out.push({ id: h.id, label: d.label ?? h.silk, role: d.role, localPos: moduleTip(g, h.id), nominalVoltage: d.vNom, maxVoltage: d.vMax });
  }
  for (const pad of g.pads ?? []) {
    const d = defs[pad.id];
    if (!d) throw new Error(`${g.key}: no pad definition for ${pad.id}`);
    out.push({ id: pad.id, label: d.label ?? pad.silk ?? pad.id, role: d.role, localPos: modulePadTip(g, pad.id), contact: 'lead', nominalVoltage: d.vNom, maxVoltage: d.vMax });
  }
  return out;
}

const boardSize = (g: ModuleGeom, heightCm: number): Vec3 => [g.wMm * MM, heightCm, g.dMm * MM];

interface Common {
  name: string;
  shortName: string;
  category: PartCategory;
  description: string;
  massGrams: number;
  unitPriceUsd: number;
  idleCurrentMa: number;
  peakCurrentMa: number;
  sizeCm: Vec3;
  defaultColor: string;
  simulated?: boolean;
}

function spec(kind: ExtraKind, c: Common, pins: PinSpec[], internal?: ReadonlyArray<readonly string[]>): PartSpec {
  return { kind: kind as ComponentKind, simulated: c.simulated ?? false, roboforgePartId: kind, pins, internal, ...c };
}

function servoPins(g: ServoGeom, vMax: number): PinSpec[] {
  const labels = ['GND (brown)', `V+ (red, 4.8-${vMax} V)`, 'Signal (orange, PWM)'];
  return SERVO_PINS.map((id, i) => ({
    id,
    label: labels[i]!,
    role: (id === 'GND' ? 'gnd' : id === 'VCC' ? 'power_in' : 'passive') as PinRole,
    localPos: servoPinTip(g, i),
    dir: [1, 0, 0] as Vec3,
    nominalVoltage: id === 'GND' ? 0 : undefined,
    maxVoltage: id === 'VCC' ? vMax : id === 'SIG' ? 5.5 : undefined,
  }));
}

const lead = (id: string, label: string, role: PinRole, localPos: Vec3, dir?: Vec3, vMax?: number, vNom?: number): PinSpec => ({
  id,
  label,
  role,
  localPos,
  dir,
  contact: 'lead',
  maxVoltage: vMax,
  nominalVoltage: vNom,
});

export const EXTRA_PARTS: Record<ExtraKind, PartSpec> = {
  /* ---------------------------------------------------------------- actuators */
  servo_sg90: spec(
    'servo_sg90',
    {
      name: 'SG90 Micro Servo (9 g)',
      shortName: 'SG90 Servo',
      category: 'Actuators',
      description: '180-degree micro servo, about 1.8 kg-cm. 50 Hz PWM, 1-2 ms pulses. Its lead ends in a 3-pin header adapter for jumpers. Power it from 5 V, not from the ESP32 3V3.',
      massGrams: 9,
      unitPriceUsd: 2.0,
      idleCurrentMa: 10,
      peakCurrentMa: 650,
      sizeCm: [7.5, 3.2, 3.3],
      defaultColor: '#2a62c9',
    },
    servoPins(SG90, 6.0),
  ),
  servo_mg996r: spec(
    'servo_mg996r',
    {
      name: 'MG996R Metal-Gear Servo',
      shortName: 'MG996R Servo',
      category: 'Actuators',
      description: 'Standard-size metal-gear servo, about 10 kg-cm at 6 V. Draws up to 2.5 A when stalled: give it its own 5-6 V supply with common GND.',
      massGrams: 55,
      unitPriceUsd: 5.5,
      idleCurrentMa: 10,
      peakCurrentMa: 2500,
      sizeCm: [9.5, 4.8, 5.4],
      defaultColor: '#17181b',
    },
    servoPins(MG996R, 7.2),
  ),
  stepper_28byj48: spec(
    'stepper_28byj48',
    {
      name: '28BYJ-48 Stepper + ULN2003 Driver',
      shortName: '28BYJ-48',
      category: 'Actuators',
      description: '5 V unipolar geared stepper (about 2048 steps per turn in full-step mode) plugged into its ULN2003 Darlington board. IN1-IN4 from four GPIOs; motor power 5 V.',
      massGrams: 45,
      unitPriceUsd: 3.0,
      idleCurrentMa: 5,
      peakCurrentMa: 240,
      sizeCm: [ULN2003_BOARD.wMm * MM, 2.1, 7.2],
      defaultColor: '#1a7a3a',
    },
    modulePins(ULN2003_BOARD, { IN1: P('passive', 5.5), IN2: P('passive', 5.5), IN3: P('passive', 5.5), IN4: P('passive', 5.5), GND, VCC: P('power_in', 12, 'VCC (5 V motor)') }),
  ),
  n20_motor: spec(
    'n20_motor',
    {
      name: 'N20 Micro Gearmotor (6 V)',
      shortName: 'N20 Motor',
      category: 'Actuators',
      description: 'Tiny metal-gear DC motor with a 3 mm D-shaft, for small robots and mechanisms. Needs a motor driver; about 100-300 mA running.',
      massGrams: 10,
      unitPriceUsd: 3.5,
      idleCurrentMa: 0,
      peakCurrentMa: 600,
      sizeCm: [3.6, 1.0, 1.2],
      defaultColor: '#c9a24f',
    },
    [lead('M_POS', 'M+', 'passive', n20PinTip(true), [1, 0, 0]), lead('M_NEG', 'M-', 'passive', n20PinTip(false), [1, 0, 0])],
  ),
  buzzer_active: spec(
    'buzzer_active',
    {
      name: 'Active Buzzer Module (KY-012)',
      shortName: 'Buzzer',
      category: 'Actuators',
      description: 'Beeps at about 2.3 kHz while its signal pin is driven HIGH; no tone() needed. 3.3-5 V.',
      massGrams: 2,
      unitPriceUsd: 0.8,
      idleCurrentMa: 0,
      peakCurrentMa: 30,
      sizeCm: boardSize(BUZZER_MODULE, 1.4),
      defaultColor: '#18191c',
    },
    modulePins(BUZZER_MODULE, { SIG: P('passive', 5.5, 'S (signal)'), VCC: P('power_in', 5.5, 'VCC (+)'), GND }),
  ),
  relay_1ch: spec(
    'relay_1ch',
    {
      name: '1-Channel 5 V Relay Module',
      shortName: 'Relay 5V',
      category: 'Actuators',
      description: 'SRD-05VDC relay with transistor driver and flyback diode. Switches a separate circuit through COM/NO/NC (10 A at 30 V DC). Coil from 5 V; IN from a GPIO.',
      massGrams: 15,
      unitPriceUsd: 1.6,
      idleCurrentMa: 2,
      peakCurrentMa: 75,
      sizeCm: boardSize(RELAY_1CH, 1.9),
      defaultColor: '#1d55b0',
    },
    [
      ...modulePins(RELAY_1CH, { VCC: P('power_in', 5.5, 'DC+ (5 V)'), GND, IN: P('passive', 5.5, 'IN (signal)') }),
      ...RELAY_TERMINALS.map((id, i) => lead(id, id === 'COM' ? 'COM (common)' : id === 'NO' ? 'NO (normally open)' : 'NC (normally closed)', 'passive', relayTerminalTip(i), [1, 0, 0])),
    ],
  ),

  /* ---------------------------------------------------------------- sensors */
  dht22: spec(
    'dht22',
    {
      name: 'DHT22 / AM2302 Temperature & Humidity',
      shortName: 'DHT22',
      category: 'Sensors',
      description: 'Digital temperature (-40-80 C) and humidity sensor on one data line; needs a 10 k pull-up on DATA. 3.3-6 V. One reading every 2 s.',
      massGrams: 3,
      unitPriceUsd: 3.5,
      idleCurrentMa: 0.05,
      peakCurrentMa: 1.5,
      sizeCm: [1.6, 3.3, 1.6],
      defaultColor: '#f2f0ea',
    },
    DHT22.pins.map((id, i) =>
      lead(id, id === 'VCC' ? 'VCC (3.3-6 V)' : id === 'DATA' ? 'DATA (needs 10k pull-up)' : id === 'NC' ? 'NC (not connected)' : 'GND', id === 'GND' ? 'gnd' : id === 'VCC' ? 'power_in' : 'passive', dht22PinTip(i), [0, 0, 1], id === 'VCC' ? 6 : id === 'DATA' ? 5.5 : undefined, id === 'GND' ? 0 : undefined),
    ),
  ),
  gps_neo6m: spec(
    'gps_neo6m',
    {
      name: 'NEO-6M GPS Module (GY-NEO6MV2)',
      shortName: 'GPS NEO-6M',
      category: 'Sensors',
      description: 'u-blox NEO-6M GPS with ceramic patch antenna and backup cell. 9600 baud serial (TX/RX at 3.3 V logic). Needs open sky to get a fix.',
      massGrams: 18,
      unitPriceUsd: 7.0,
      idleCurrentMa: 45,
      peakCurrentMa: 67,
      sizeCm: [7.9, 1.0, GPS_NEO6M.dMm * MM],
      defaultColor: '#1d55b0',
    },
    modulePins(GPS_NEO6M, { VCC: P('power_in', 5.5, 'VCC (3.3-5 V)'), RX: P('passive', 3.6, 'RX (3.3 V logic)'), TX: P('passive', 3.6, 'TX (3.3 V logic)'), GND }),
  ),
  line_tcrt5000: spec(
    'line_tcrt5000',
    {
      name: 'TCRT5000 IR Line / Obstacle Sensor',
      shortName: 'Line IR',
      category: 'Sensors',
      description: 'Reflective IR pair with an LM393 comparator: DO goes LOW over a white surface (threshold set by the trimmer), AO gives the raw level. Mount 2-10 mm above the floor.',
      massGrams: 3,
      unitPriceUsd: 0.7,
      idleCurrentMa: 15,
      peakCurrentMa: 25,
      sizeCm: boardSize(LINE_TCRT5000, 1.6),
      defaultColor: '#1d55b0',
    },
    modulePins(LINE_TCRT5000, { VCC: P('power_in', 5.5, 'VCC (3.3-5 V)'), GND, DO: P('passive', 5.5, 'DO (digital out)'), AO: P('passive', 5.5, 'AO (analog out)') }),
  ),
  bme280: spec(
    'bme280',
    {
      name: 'BME280 Temp / Humidity / Pressure (3.3 V)',
      shortName: 'BME280',
      category: 'Sensors',
      description: 'Bosch environmental sensor on I2C (0x76). This 4-pin board has no regulator: 3.3 V only.',
      massGrams: 1,
      unitPriceUsd: 4.0,
      idleCurrentMa: 0.004,
      peakCurrentMa: 0.7,
      sizeCm: boardSize(BME280_MODULE, 1.2),
      defaultColor: '#5b2d91',
    },
    modulePins(BME280_MODULE, { VIN: P('power_in', 3.6, 'VIN (3.3 V only)'), GND, SCL: P('i2c_scl', 3.6), SDA: P('i2c_sda', 3.6) }),
  ),
  vl53l0x: spec(
    'vl53l0x',
    {
      name: 'VL53L0X Time-of-Flight Distance (GY-VL53L0XV2)',
      shortName: 'VL53L0X ToF',
      category: 'Sensors',
      description: 'Laser time-of-flight ranging up to about 2 m on I2C (0x29). Regulator on board, so 3.3-5 V. XSHUT lets several share one bus.',
      massGrams: 1,
      unitPriceUsd: 3.8,
      idleCurrentMa: 6,
      peakCurrentMa: 19,
      sizeCm: boardSize(VL53L0X_MODULE, 1.2),
      defaultColor: '#5b2d91',
    },
    modulePins(VL53L0X_MODULE, { VIN: P('power_in', 5.5, 'VIN (3.3-5 V)'), GND, SCL: P('i2c_scl', 5.5), SDA: P('i2c_sda', 5.5), GPIO1: P('passive', 3.6, 'GPIO1 (interrupt)'), XSHUT: P('passive', 3.6, 'XSHUT (shutdown)') }),
  ),
  pir_hcsr501: spec(
    'pir_hcsr501',
    {
      name: 'HC-SR501 PIR Motion Sensor',
      shortName: 'PIR Motion',
      category: 'Sensors',
      description: 'Passive infrared motion detector, about 7 m and 110 degrees. OUT goes HIGH (3.3 V) on motion for a time set by a trimmer. Supply 5-20 V.',
      massGrams: 7,
      unitPriceUsd: 1.5,
      idleCurrentMa: 0.065,
      peakCurrentMa: 0.1,
      sizeCm: [PIR_HCSR501.wMm * MM, 2.3, (PIR_HCSR501.dMm + 9) * MM],
      defaultColor: '#2a6e3a',
    },
    PIR_HCSR501.pins.map((id, i) => ({
      id,
      label: id === 'VCC' ? 'VCC (5-20 V)' : id === 'OUT' ? 'OUT (3.3 V high on motion)' : 'GND',
      role: (id === 'GND' ? 'gnd' : id === 'VCC' ? 'power_in' : 'passive') as PinRole,
      localPos: pirPinTip(i),
      dir: [0, 0, 1] as Vec3,
      maxVoltage: id === 'VCC' ? 20 : undefined,
      nominalVoltage: id === 'GND' ? 0 : undefined,
    })),
  ),

  /* ---------------------------------------------------------------- displays and inputs */
  ws2812_stick8: spec(
    'ws2812_stick8',
    {
      name: 'WS2812B RGB LED Stick (8 LEDs)',
      shortName: 'RGB Stick 8',
      category: 'Displays',
      description: 'Eight addressable RGB LEDs on one data line (NeoPixel style), chainable from DOUT. Up to 60 mA per LED at full white; 5 V.',
      massGrams: 3,
      unitPriceUsd: 2.0,
      idleCurrentMa: 8,
      peakCurrentMa: 480,
      sizeCm: boardSize(WS2812_STICK, 0.35),
      defaultColor: '#131417',
    },
    modulePins(WS2812_STICK, { GND, DIN: P('passive', 5.5, 'DIN (data in)'), '5V': P('power_in', 5.5, '5V'), GND_OUT: { role: 'gnd', vNom: 0, label: 'GND (out)' }, DOUT: P('passive', 5.5, 'DOUT (to the next strip)'), '5V_OUT': P('power_in', 5.5, '5V (out)') }),
    [['5V', '5V_OUT']],
  ),
  tm1637_4digit: spec(
    'tm1637_4digit',
    {
      name: 'TM1637 4-Digit 7-Segment Display',
      shortName: '7-Seg x4',
      category: 'Displays',
      description: '0.36" four-digit display with colon, driven by a TM1637 over two wires (CLK, DIO). 3.3-5 V.',
      massGrams: 6,
      unitPriceUsd: 1.5,
      idleCurrentMa: 10,
      peakCurrentMa: 80,
      sizeCm: boardSize(TM1637_MODULE, 1.0),
      defaultColor: '#1d55b0',
    },
    modulePins(TM1637_MODULE, { CLK: P('passive', 5.5), DIO: P('passive', 5.5), VCC: P('power_in', 5.5, 'VCC (3.3-5 V)'), GND }),
  ),
  max7219_matrix: spec(
    'max7219_matrix',
    {
      name: 'MAX7219 8x8 LED Matrix Module',
      shortName: 'Matrix 8x8',
      category: 'Displays',
      description: '64 red LEDs driven by a MAX7219 over SPI-style DIN/CS/CLK; chain modules from the output header. 5 V.',
      massGrams: 15,
      unitPriceUsd: 2.5,
      idleCurrentMa: 10,
      peakCurrentMa: 320,
      sizeCm: boardSize(MAX7219_MODULE, 1.9),
      defaultColor: '#1d55b0',
    },
    modulePins(MAX7219_MODULE, {
      VCC: P('power_in', 5.5, 'VCC (5 V)'),
      GND,
      DIN: P('passive', 5.5),
      CS: P('passive', 5.5),
      CLK: P('passive', 5.5),
      VCC_OUT: P('power_in', 5.5, 'VCC (out)'),
      GND_OUT: { role: 'gnd', vNom: 0, label: 'GND (out)' },
      DOUT: P('passive', 5.5, 'DOUT (to the next module)'),
      CS_OUT: P('passive', 5.5, 'CS (out)'),
      CLK_OUT: P('passive', 5.5, 'CLK (out)'),
    }),
    [
      ['VCC', 'VCC_OUT'],
      ['CS', 'CS_OUT'],
      ['CLK', 'CLK_OUT'],
    ],
  ),
  joystick_ky023: spec(
    'joystick_ky023',
    {
      name: 'Analog Joystick (KY-023)',
      shortName: 'Joystick',
      category: 'Input',
      description: 'Two-axis thumbstick (two 10 k pots) with a push switch. VRx and VRy are analog; SW pulls LOW when pressed. Analog inputs are not simulated yet.',
      massGrams: 12,
      unitPriceUsd: 1.5,
      idleCurrentMa: 1,
      peakCurrentMa: 1,
      sizeCm: boardSize(JOYSTICK_KY023, 3.3),
      defaultColor: '#18191c',
    },
    modulePins(JOYSTICK_KY023, { GND, '5V': P('power_in', 5.5, '+5V (3.3 V works too)'), VRX: P('passive', 5.5, 'VRx (analog X)'), VRY: P('passive', 5.5, 'VRy (analog Y)'), SW: P('passive', 5.5, 'SW (LOW when pressed)') }),
  ),
  pot_10k: spec(
    'pot_10k',
    {
      name: '10 kOhm Potentiometer (9 mm)',
      shortName: 'Pot 10k',
      category: 'Input',
      description: 'Linear (B10K) rotary pot: ends to 3V3 and GND, wiper to an analog pin. Analog inputs are not simulated yet.',
      massGrams: 2,
      unitPriceUsd: 0.4,
      idleCurrentMa: 0,
      peakCurrentMa: 0,
      sizeCm: [1.0, 2.2, 2.0],
      defaultColor: '#1a1b1e',
    },
    ['A', 'W', 'B'].map((id, i) => lead(id, id === 'W' ? 'Wiper (middle)' : `End ${id}`, 'passive', potPinTip(i), [0, 0, 1])),
  ),
  rocker_switch: spec(
    'rocker_switch',
    {
      name: 'Rocker Power Switch (KCD1)',
      shortName: 'Power Switch',
      category: 'Power',
      description: 'Panel rocker switch (6 A at 250 V AC) in a printed holder, for the main battery line. Shown switched on: its two tabs are joined.',
      massGrams: 6,
      unitPriceUsd: 0.5,
      idleCurrentMa: 0,
      peakCurrentMa: 0,
      sizeCm: [ROCKER.blockW * MM, ROCKER.blockH * MM, (ROCKER.blockD + 15) * MM],
      defaultColor: '#16171a',
    },
    [lead('IN', 'Tab 1 (from battery +)', 'passive', rockerPinTip(0), [0, 0, 1], 30), lead('OUT', 'Tab 2 (to the load)', 'passive', rockerPinTip(1), [0, 0, 1], 30)],
    [['IN', 'OUT']],
  ),

  /* ---------------------------------------------------------------- drivers and power */
  l298n: spec(
    'l298n',
    {
      name: 'L298N Dual H-Bridge Motor Driver',
      shortName: 'L298N',
      category: 'Drivers',
      description: 'Classic 2 A per channel bipolar driver with heatsink and onboard 5 V regulator (jumper on). Drops about 2 V, so motors see less than the battery. ENA/ENB take PWM; IN1-IN4 set direction.',
      massGrams: 30,
      unitPriceUsd: 3.0,
      idleCurrentMa: 36,
      peakCurrentMa: 4000,
      sizeCm: [L298N_MODULE.wMm * MM + 0.4, 2.8, L298N_MODULE.dMm * MM + 0.4],
      defaultColor: '#b3262a',
    },
    [
      ...modulePins(L298N_MODULE, { ENA: P('motor_in', 7, 'ENA (PWM A)'), IN1: P('motor_in', 7), IN2: P('motor_in', 7), IN3: P('motor_in', 7), IN4: P('motor_in', 7), ENB: P('motor_in', 7, 'ENB (PWM B)') }),
      lead('OUT1', 'OUT1 (motor A)', 'motor_out', l298nTerminalTip('OUT1'), [-1, 0, 0]),
      lead('OUT2', 'OUT2 (motor A)', 'motor_out', l298nTerminalTip('OUT2'), [-1, 0, 0]),
      lead('OUT3', 'OUT3 (motor B)', 'motor_out', l298nTerminalTip('OUT3'), [1, 0, 0]),
      lead('OUT4', 'OUT4 (motor B)', 'motor_out', l298nTerminalTip('OUT4'), [1, 0, 0]),
      lead('VS', '+12V (motor supply, up to 35 V)', 'power_in', l298nTerminalTip('VS'), [0, 0, 1], 35),
      lead('GND', 'GND', 'gnd', l298nTerminalTip('GND'), [0, 0, 1], undefined, 0),
      lead('V5', '+5V (regulator out with the jumper on)', 'power_out', l298nTerminalTip('V5'), [0, 0, 1], 5.5, 5.0),
    ],
  ),
  tb6612fng: spec(
    'tb6612fng',
    {
      name: 'TB6612FNG Dual Motor Driver',
      shortName: 'TB6612FNG',
      category: 'Drivers',
      description: 'Efficient MOSFET H-bridges, 1.2 A per channel (3.2 A peak), motor supply 4.5-13.5 V. PWMA/PWMB for speed, AIN/BIN for direction, STBY HIGH to run.',
      massGrams: 2,
      unitPriceUsd: 2.5,
      idleCurrentMa: 2,
      peakCurrentMa: 3200,
      sizeCm: boardSize(TB6612_MODULE, 1.2),
      defaultColor: '#5b2d91',
    },
    modulePins(TB6612_MODULE, {
      PWMA: P('motor_in', 5.5),
      AIN2: P('motor_in', 5.5),
      AIN1: P('motor_in', 5.5),
      STBY: P('passive', 5.5, 'STBY (HIGH to run)'),
      BIN1: P('motor_in', 5.5),
      BIN2: P('motor_in', 5.5),
      PWMB: P('motor_in', 5.5),
      GND,
      VM: P('power_in', 15, 'VM (motor supply 4.5-13.5 V)'),
      VCC: P('power_in', 5.5, 'VCC (logic 2.7-5.5 V)'),
      GND_2: GND,
      AO1: P('motor_out'),
      AO2: P('motor_out'),
      BO2: P('motor_out'),
      BO1: P('motor_out'),
      GND_3: GND,
    }),
  ),
  a4988: spec(
    'a4988',
    {
      name: 'A4988 Stepper Driver',
      shortName: 'A4988',
      category: 'Drivers',
      description: 'Bipolar stepper driver up to about 1 A per coil without cooling (2 A with heatsink and airflow), 8-35 V motor supply, microstepping to 1/16 with MS1-MS3. Set the current with the trimmer first.',
      massGrams: 2,
      unitPriceUsd: 1.5,
      idleCurrentMa: 5,
      peakCurrentMa: 2000,
      sizeCm: boardSize(A4988_MODULE, 1.2),
      defaultColor: '#1a7a3a',
    },
    modulePins(A4988_MODULE, {
      EN: P('passive', 5.5, 'EN (LOW enables)'),
      MS1: P('passive', 5.5),
      MS2: P('passive', 5.5),
      MS3: P('passive', 5.5),
      RST: P('passive', 5.5, 'RST (tie to SLP)'),
      SLP: P('passive', 5.5, 'SLP (tie to RST)'),
      STEP: P('passive', 5.5),
      DIR: P('passive', 5.5),
      VMOT: P('power_in', 35, 'VMOT (8-35 V, 100 uF across it)'),
      GND,
      '2B': P('motor_out'),
      '2A': P('motor_out'),
      '1A': P('motor_out'),
      '1B': P('motor_out'),
      VDD: P('power_in', 5.5, 'VDD (logic 3-5.5 V)'),
      GND_2: GND,
    }),
  ),
  mt3608_boost: spec(
    'mt3608_boost',
    {
      name: 'MT3608 Boost Converter (set to 5.0 V)',
      shortName: 'MT3608 Boost',
      category: 'Power',
      description: 'Step-up from 2-24 V to up to 28 V, about 1 A at 5 V from one Li-ion cell. Turn the trimmer to set the output; shown set to 5.0 V.',
      massGrams: 3,
      unitPriceUsd: 0.9,
      idleCurrentMa: 2,
      peakCurrentMa: 0,
      sizeCm: boardSize(MT3608_MODULE, 1.4),
      defaultColor: '#1d55b0',
    },
    modulePins(MT3608_MODULE, { VIN_POS: P('power_in', 24, 'VIN+ (2-24 V)'), VIN_NEG: GND, VOUT_POS: P('power_out', 28, 'VOUT+ (5.0 V as set)', 5.0), VOUT_NEG: GND }),
  ),
  tp4056_charger: spec(
    'tp4056_charger',
    {
      name: 'TP4056 Li-ion Charger with Protection (USB-C)',
      shortName: 'TP4056',
      category: 'Power',
      description: 'Charges one 3.7 V Li-ion cell at 1 A from USB-C; the DW01A protection cuts off at about 2.5 V and on shorts. Load on OUT+/OUT-, cell on B+/B-.',
      massGrams: 2,
      unitPriceUsd: 0.6,
      idleCurrentMa: 0,
      peakCurrentMa: 1000,
      sizeCm: boardSize(TP4056_MODULE, 0.5),
      defaultColor: '#1d55b0',
    },
    modulePins(TP4056_MODULE, { OUT_POS: P('passive', 4.3, 'OUT+ (to the load)'), B_POS: P('passive', 4.3, 'B+ (cell +)'), B_NEG: { role: 'gnd', vNom: 0, label: 'B- (cell -)' }, OUT_NEG: { role: 'gnd', vNom: 0, label: 'OUT- (load -)' } }),
    [['B_POS', 'OUT_POS']],
  ),
  ams1117_3v3: spec(
    'ams1117_3v3',
    {
      name: 'AMS1117-3.3 Regulator Module',
      shortName: 'AMS1117 3.3V',
      category: 'Power',
      description: 'Linear 3.3 V regulator, up to 800 mA, needs at least 4.5 V in (about 1.1 V dropout). Gets warm: the difference times the current is turned into heat.',
      massGrams: 2,
      unitPriceUsd: 0.5,
      idleCurrentMa: 5,
      peakCurrentMa: 800,
      sizeCm: boardSize(AMS1117_MODULE, 1.2),
      defaultColor: '#1d55b0',
    },
    modulePins(AMS1117_MODULE, { VIN: P('power_in', 15, 'IN (4.5-12 V)'), GND, VOUT: P('power_out', 3.6, '3V3 out', 3.3) }),
  ),
  battery_4aa: spec(
    'battery_4aa',
    {
      name: '4 x AA Battery Holder (NiMH, 4.8 V)',
      shortName: '4xAA Pack',
      category: 'Power',
      description: 'Four AA cells in series: 4.8 V with NiMH (about 2000 mAh), 6 V with fresh alkalines. Fine for small motors and 5 V logic through a regulator.',
      massGrams: 120,
      unitPriceUsd: 6.0,
      idleCurrentMa: 0,
      peakCurrentMa: 0,
      sizeCm: [BATTERY_4AA.w * MM, BATTERY_4AA.h * MM, (BATTERY_4AA.d + 20) * MM],
      defaultColor: '#16171a',
    },
    [lead('BAT_POS', 'BAT+ (4.8 V NiMH)', 'power_out', battery4aaPinTip(true), [0, 0, 1], undefined, 4.8), lead('GND', 'GND (-)', 'gnd', battery4aaPinTip(false), [0, 0, 1], undefined, 0)],
  ),

  /* ---------------------------------------------------------------- controllers and communication */
  arduino_nano: spec(
    'arduino_nano',
    {
      name: 'Arduino Nano V3 (ATmega328P, USB-C clone)',
      shortName: 'Arduino Nano',
      category: 'Controllers',
      description: '5 V 16 MHz ATmega328P board with CH340 USB serial. VIN 7-12 V or 5 V on the 5V pin. Wiring only: the simulator runs ESP32 sketches, not AVR code.',
      massGrams: 7,
      unitPriceUsd: 4.0,
      idleCurrentMa: 19,
      peakCurrentMa: 200,
      sizeCm: [ARDUINO_NANO.wMm * MM, 1.5, (ARDUINO_NANO.dMm + 1.2) * MM],
      defaultColor: '#1f4fa3',
    },
    modulePins(ARDUINO_NANO, {
      ...Object.fromEntries(['D13', 'D12', 'D11', 'D10', 'D9', 'D8', 'D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5'].map((id) => [id, P('passive', 5.5)])),
      A6: P('passive', 5.5, 'A6 (analog in only)'),
      A7: P('passive', 5.5, 'A7 (analog in only)'),
      '3V3': P('power_out', 3.6, '3V3 (50 mA out)', 3.3),
      AREF: P('passive', 5.5),
      '5V': P('power_out', 5.5, '5V', 5.0),
      RST: P('passive', 5.5),
      RST_2: P('passive', 5.5, 'RST'),
      GND,
      GND_2: GND,
      VIN: P('power_in', 20, 'VIN (7-12 V)'),
      D0: P('passive', 5.5, 'RX0 / D0'),
      D1: P('passive', 5.5, 'TX1 / D1'),
    }),
  ),
  rpi_pico: spec(
    'rpi_pico',
    {
      name: 'Raspberry Pi Pico (RP2040)',
      shortName: 'Pi Pico',
      category: 'Controllers',
      description: 'Dual-core RP2040 at 133 MHz, 26 GPIO at 3.3 V (not 5 V tolerant), 3 ADC inputs. Power from USB (VBUS) or 1.8-5.5 V on VSYS. Wiring only in the simulator.',
      massGrams: 3,
      unitPriceUsd: 4.0,
      idleCurrentMa: 25,
      peakCurrentMa: 100,
      sizeCm: [RPI_PICO.wMm * MM, 1.4, RPI_PICO.dMm * MM + 0.1],
      defaultColor: '#1a6e3a',
    },
    modulePins(RPI_PICO, {
      ...Object.fromEntries(
        ['GP0', 'GP1', 'GP2', 'GP3', 'GP4', 'GP5', 'GP6', 'GP7', 'GP8', 'GP9', 'GP10', 'GP11', 'GP12', 'GP13', 'GP14', 'GP15', 'GP16', 'GP17', 'GP18', 'GP19', 'GP20', 'GP21', 'GP22', 'GP26', 'GP27', 'GP28'].map((id) => [id, P('passive', 3.6)]),
      ),
      ...Object.fromEntries(['GND_3', 'GND_8', 'GND_13', 'GND_18', 'GND_23', 'GND_28', 'GND_38', 'AGND'].map((id) => [id, { ...GND, label: id === 'AGND' ? 'AGND' : 'GND' }])),
      VBUS: P('power_in', 5.5, 'VBUS (USB 5 V)'),
      VSYS: P('power_in', 5.5, 'VSYS (1.8-5.5 V in)'),
      '3V3_EN': P('passive', 3.6, '3V3_EN'),
      '3V3': P('power_out', 3.6, '3V3 (out)', 3.3),
      ADC_VREF: P('passive', 3.6, 'ADC_VREF'),
      RUN: P('passive', 3.6, 'RUN (LOW resets)'),
    }),
  ),
  hc05_bt: spec(
    'hc05_bt',
    {
      name: 'HC-05 Bluetooth Serial Module',
      shortName: 'HC-05 BT',
      category: 'Communication',
      description: 'Classic Bluetooth serial link (SPP, default 9600 baud). VCC 3.6-6 V, but RXD is 3.3 V logic: from a 5 V board use a divider. Hold EN for AT mode.',
      massGrams: 4,
      unitPriceUsd: 4.0,
      idleCurrentMa: 8,
      peakCurrentMa: 40,
      sizeCm: boardSize(HC05_MODULE, 1.2),
      defaultColor: '#1d55b0',
    },
    modulePins(HC05_MODULE, { STATE: P('passive', 3.6), RXD: P('passive', 3.6, 'RXD (3.3 V logic)'), TXD: P('passive', 3.6, 'TXD (3.3 V logic)'), GND, VCC: P('power_in', 6, 'VCC (3.6-6 V)'), EN: P('passive', 3.6, 'EN (AT mode)') }),
  ),
  nrf24l01: spec(
    'nrf24l01',
    {
      name: 'nRF24L01+ 2.4 GHz Transceiver',
      shortName: 'nRF24L01+',
      category: 'Communication',
      description: '2.4 GHz packet radio on SPI, up to 2 Mbps. Supply 1.9-3.6 V only (5 V destroys it); the signal pins tolerate 5 V. Put a 10 uF cap across VCC-GND.',
      massGrams: 2,
      unitPriceUsd: 1.5,
      idleCurrentMa: 0.9,
      peakCurrentMa: 14,
      sizeCm: boardSize(NRF24_MODULE, 1.1),
      defaultColor: '#1a6e3a',
    },
    modulePins(NRF24_MODULE, { GND, VCC: P('power_in', 3.6, 'VCC (3.3 V only)'), CE: P('passive', 5.25), CSN: P('passive', 5.25), SCK: P('passive', 5.25), MOSI: P('passive', 5.25), MISO: P('passive', 5.25), IRQ: P('passive', 5.25) }),
  ),
  rtc_ds3231: spec(
    'rtc_ds3231',
    {
      name: 'DS3231 Real-Time Clock (ZS-042)',
      shortName: 'RTC DS3231',
      category: 'Sensors',
      description: 'Temperature-compensated clock (about 2 ppm) with a CR2032 backup and a 32 kbit EEPROM, on I2C (0x68 and 0x57). 3.3-5 V. Note: 0x68 is also the MPU6050 address.',
      massGrams: 8,
      unitPriceUsd: 2.5,
      idleCurrentMa: 0.2,
      peakCurrentMa: 0.6,
      sizeCm: boardSize(DS3231_MODULE, 1.6),
      defaultColor: '#1d55b0',
    },
    modulePins(DS3231_MODULE, {
      '32K': P('passive', 5.5, '32K (32.768 kHz out)'),
      SQW: P('passive', 5.5, 'SQW (alarm / square wave)'),
      SCL: P('i2c_scl', 5.5),
      SDA: P('i2c_sda', 5.5),
      VCC: P('power_in', 5.5, 'VCC (3.3-5 V)'),
      GND,
      SCL_2: P('i2c_scl', 5.5, 'SCL (pass-through)'),
      SDA_2: P('i2c_sda', 5.5, 'SDA (pass-through)'),
      VCC_2: P('power_in', 5.5, 'VCC (pass-through)'),
      GND_2: { ...GND, label: 'GND (pass-through)' },
    }),
    [
      ['SCL', 'SCL_2'],
      ['SDA', 'SDA_2'],
      ['VCC', 'VCC_2'],
    ],
  ),
  microsd_module: spec(
    'microsd_module',
    {
      name: 'MicroSD Card Module (SPI)',
      shortName: 'MicroSD',
      category: 'Communication',
      description: 'MicroSD socket with 3.3 V regulator and level shifter, on SPI. Needs 5 V on VCC (the regulator drops about 1 V). For logging sensor data.',
      massGrams: 4,
      unitPriceUsd: 1.0,
      idleCurrentMa: 1,
      peakCurrentMa: 100,
      sizeCm: [MICROSD_MODULE.wMm * MM + 0.3, 1.0, MICROSD_MODULE.dMm * MM],
      defaultColor: '#1d55b0',
    },
    modulePins(MICROSD_MODULE, { GND, VCC: P('power_in', 5.5, 'VCC (5 V)'), MISO: P('passive', 5.5), MOSI: P('passive', 5.5), SCK: P('passive', 5.5), CS: P('passive', 5.5) }),
  ),

  /* ---------------------------------------------------------------- discretes */
  diode_1n4007: spec(
    'diode_1n4007',
    {
      name: '1N4007 Rectifier Diode',
      shortName: '1N4007',
      category: 'Passives',
      description: '1 A, 1000 V general-purpose diode (DO-41): reverse-polarity protection, flyback across relay or motor coils. The band marks the cathode.',
      massGrams: 0.4,
      unitPriceUsd: 0.05,
      idleCurrentMa: 0,
      peakCurrentMa: 0,
      sizeCm: [2.2, 0.4, 0.4],
      defaultColor: '#16171a',
    },
    [lead('A', 'Anode', 'passive', [-AXIAL_LEAD_END, 0.135, 0], [-1, 0, 0]), lead('K', 'Cathode (band)', 'passive', [AXIAL_LEAD_END, 0.135, 0], [1, 0, 0])],
  ),
  npn_2n2222: spec(
    'npn_2n2222',
    {
      name: 'PN2222A NPN Transistor (TO-92)',
      shortName: '2N2222',
      category: 'Passives',
      description: 'General-purpose NPN switch, up to 600 mA: drives a relay coil, buzzer or LED strip from a GPIO through a 1 k base resistor. Flat face toward you: E, B, C.',
      massGrams: 0.2,
      unitPriceUsd: 0.05,
      idleCurrentMa: 0,
      peakCurrentMa: 0,
      sizeCm: [0.6, 0.9, 1.0],
      defaultColor: '#16171a',
    },
    TO92_FEET.map(([id, x]) => lead(id, id === 'E' ? 'Emitter' : id === 'B' ? 'Base' : 'Collector', 'passive', [x, 0.03, 0.45], [0, 0, 1])),
  ),
  mosfet_irlz44n: spec(
    'mosfet_irlz44n',
    {
      name: 'IRLZ44N Logic-Level MOSFET (TO-220)',
      shortName: 'IRLZ44N',
      category: 'Passives',
      description: 'N-channel MOSFET that switches fully on at 5 V and works (less fully) at 3.3 V gate drive: motors, LED strips, solenoids. Gate, drain, source from the left; tab is drain.',
      massGrams: 2,
      unitPriceUsd: 0.6,
      idleCurrentMa: 0,
      peakCurrentMa: 0,
      sizeCm: [1.1, 2.0, 1.0],
      defaultColor: '#16171a',
    },
    TO220_FEET.map(([id, x]) => lead(id, id === 'G' ? 'Gate' : id === 'D' ? 'Drain' : 'Source', 'passive', [x, 0.03, 0.55], [0, 0, 1])),
  ),
  cap_100nf: spec(
    'cap_100nf',
    {
      name: '100 nF Ceramic Capacitor',
      shortName: '100nF Cap',
      category: 'Passives',
      description: 'Decoupling capacitor ("104"), 50 V: one across the supply pins of each module, as close as possible.',
      massGrams: 0.1,
      unitPriceUsd: 0.02,
      idleCurrentMa: 0,
      peakCurrentMa: 0,
      sizeCm: [0.6, 0.6, 1.0],
      defaultColor: '#d9b44a',
    },
    [lead('A', 'Lead 1', 'passive', [-0.127, 0.03, 0.45], [0, 0, 1], 50), lead('B', 'Lead 2', 'passive', [0.127, 0.03, 0.45], [0, 0, 1], 50)],
  ),
};

/** Board-top height of a module (cm), for builders placing parts on it. */
export const moduleTopCm = (g: ModuleGeom): number => (g.boardBottomMm + PCB_T_MM) * MM;
