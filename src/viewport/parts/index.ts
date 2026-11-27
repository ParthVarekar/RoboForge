import type { ComponentKind } from '../../schema/projectSchema';
import { buildEsp32Devkit } from './controllers';
import { buildCap1000uf, buildLed5mm, buildResistor, buildTactileButton, buildWireSplice } from './discretes';
import { buildCadBox, buildCadCylinder, buildCadPlate, buildCadStandoff, buildChassis2wd, buildFcStack, buildQuadFrame, buildVtxAntenna } from './frames';
import { buildLcd1602, buildLcd2004 } from './displays';
import { buildDrv8833, buildEsp32Cam, buildHcsr04, buildMpu6050, buildOled } from './modules';
import { buildBattery2s, buildBrushless2207, buildLipo6s, buildLm2596, buildTtMotor } from './power';
import { buildN20, buildServoMg996r, buildServoSg90, buildStepper28byj48 } from './actuatorsExtra';
import { buildBuzzerActive, buildRelay1ch, buildWs2812Stick8 } from './outputsExtra';
import { buildA4988, buildAms1117, buildBattery4aa, buildL298n, buildMt3608, buildRockerSwitch, buildTb6612, buildTp4056 } from './powerExtra';
import { buildArduinoNano, buildDs3231, buildHc05, buildMicrosd, buildNrf24, buildRpiPico } from './controllersExtra';
import { buildCap100nf, buildDiode1n4007, buildMosfetIrlz44n, buildNpn2n2222 } from './discretesExtra';
import { buildJoystick, buildMax7219, buildPot10k, buildTm1637 } from './inputsExtra';
import { buildBme280, buildPirHcsr501, buildVl53l0x } from './sensorsExtra2';
import { buildDht22, buildGpsNeo6m, buildLineTcrt5000 } from './sensorsExtra';
import type { PartBuilder } from './types';

export type { PartBuildContext, PartBuildResult, PartBuilder } from './types';

/**
 * One builder per catalog part, each modelled from datasheet dimensions and reference photos
 * (sources in docs/06_COMPONENT_REFERENCES.md).
 */
export const PART_BUILDERS: Record<ComponentKind, PartBuilder> = {
  esp32_devkit: buildEsp32Devkit,
  fc_esc_stack: buildFcStack,
  drv8833: buildDrv8833,
  mpu6050: buildMpu6050,
  hcsr04: buildHcsr04,
  oled_ssd1306: buildOled,
  lcd1602_i2c: buildLcd1602,
  lcd2004_i2c: buildLcd2004,
  esp32_cam: buildEsp32Cam,
  tactile_button: buildTactileButton,
  dc_motor: buildTtMotor,
  brushless_2207: buildBrushless2207,
  battery_2s: buildBattery2s,
  battery_6s_lipo: buildLipo6s,
  lm2596_buck: buildLm2596,
  resistor_10k: buildResistor,
  led_5mm: buildLed5mm,
  wire_splice: buildWireSplice,
  cap_1000uf: buildCap1000uf,
  chassis_2wd: buildChassis2wd,
  frame_quad_5in: buildQuadFrame,
  vtx_antenna: buildVtxAntenna,
  cad_box: buildCadBox,
  cad_cylinder: buildCadCylinder,
  cad_standoff: buildCadStandoff,
  cad_plate: buildCadPlate,
  // extended library (moduleGeometry.ts / partsCatalogExtra.ts)
  servo_sg90: buildServoSg90,
  servo_mg996r: buildServoMg996r,
  stepper_28byj48: buildStepper28byj48,
  n20_motor: buildN20,
  buzzer_active: buildBuzzerActive,
  relay_1ch: buildRelay1ch,
  dht22: buildDht22,
  gps_neo6m: buildGpsNeo6m,
  line_tcrt5000: buildLineTcrt5000,
  ws2812_stick8: buildWs2812Stick8,
  l298n: buildL298n,
  tb6612fng: buildTb6612,
  a4988: buildA4988,
  mt3608_boost: buildMt3608,
  tp4056_charger: buildTp4056,
  ams1117_3v3: buildAms1117,
  battery_4aa: buildBattery4aa,
  rocker_switch: buildRockerSwitch,
  arduino_nano: buildArduinoNano,
  rpi_pico: buildRpiPico,
  hc05_bt: buildHc05,
  nrf24l01: buildNrf24,
  rtc_ds3231: buildDs3231,
  microsd_module: buildMicrosd,
  bme280: buildBme280,
  vl53l0x: buildVl53l0x,
  pir_hcsr501: buildPirHcsr501,
  joystick_ky023: buildJoystick,
  pot_10k: buildPot10k,
  max7219_matrix: buildMax7219,
  tm1637_4digit: buildTm1637,
  diode_1n4007: buildDiode1n4007,
  npn_2n2222: buildNpn2n2222,
  mosfet_irlz44n: buildMosfetIrlz44n,
  cap_100nf: buildCap100nf,
};
