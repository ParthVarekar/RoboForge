import type { ComponentKind } from '../../schema/projectSchema';
import { buildEsp32Devkit } from './controllers';
import { buildCap1000uf, buildLed5mm, buildResistor, buildTactileButton } from './discretes';
import { buildCadBox, buildCadCylinder, buildCadPlate, buildCadStandoff, buildChassis2wd, buildFcStack, buildQuadFrame, buildVtxAntenna } from './frames';
import { buildDrv8833, buildEsp32Cam, buildHcsr04, buildMpu6050, buildOled } from './modules';
import { buildBattery2s, buildBrushless2207, buildLipo6s, buildLm2596, buildTtMotor } from './power';
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
  esp32_cam: buildEsp32Cam,
  tactile_button: buildTactileButton,
  dc_motor: buildTtMotor,
  brushless_2207: buildBrushless2207,
  battery_2s: buildBattery2s,
  battery_6s_lipo: buildLipo6s,
  lm2596_buck: buildLm2596,
  resistor_10k: buildResistor,
  led_5mm: buildLed5mm,
  cap_1000uf: buildCap1000uf,
  chassis_2wd: buildChassis2wd,
  frame_quad_5in: buildQuadFrame,
  vtx_antenna: buildVtxAntenna,
  cad_box: buildCadBox,
  cad_cylinder: buildCadCylinder,
  cad_standoff: buildCadStandoff,
  cad_plate: buildCadPlate,
};
