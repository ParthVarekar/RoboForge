import { getPartSpec } from '../catalog/partsCatalog';
import type { StudioProject } from '../schema/projectSchema';
import type { CircuitAnalysis } from './circuit';

export interface RoboForgeBridgeSpec {
  schema: 'roboforge-studio-bridge/v1';
  projectName: string;
  parts: Array<{ roboforgePartId: string; kind: string; label: string; massGrams: number }>;
  pinMap: {
    leftMotor: [number | null, number | null];
    rightMotor: [number | null, number | null];
    mpu6050Sda: number | null;
    mpu6050Scl: number | null;
    hcsr04Trig: number | null;
    hcsr04Echo: number | null;
    hcsr04HasDivider: boolean;
  };
  powerBudget: CircuitAnalysis['budget'];
  twinModelParams: {
    sideGain: [number, number];
    startPwm: number;
    gyroDriftDegPerSec: number;
    floorFriction: number;
  };
  diagnosticsSummary: {
    critical: number;
    error: number;
    warning: number;
    info: number;
  };
  note: string;
}

/**
 * Generates a RoboForge-compatible specification payload from the wired Studio project,
 * ready to bridge into simlab/parts, simlab/twin, and firmware/roboforge_rover.
 */
export function buildRoboForgeBridgeSpec(
  project: StudioProject,
  analysis: CircuitAnalysis,
): RoboForgeBridgeSpec {
  const left = analysis.motors.find((m) => m.side === 'left');
  const right = analysis.motors.find((m) => m.side === 'right');

  return {
    schema: 'roboforge-studio-bridge/v1',
    projectName: project.name,
    parts: project.components.map((c) => {
      const spec = getPartSpec(c.kind);
      return {
        roboforgePartId: spec.roboforgePartId,
        kind: c.kind,
        label: c.label,
        massGrams: spec.massGrams,
      };
    }),
    pinMap: {
      leftMotor: [left?.inPosGpio ?? null, left?.inNegGpio ?? null],
      rightMotor: [right?.inPosGpio ?? null, right?.inNegGpio ?? null],
      mpu6050Sda: analysis.sensors.mpuSdaGpio,
      mpu6050Scl: analysis.sensors.mpuSclGpio,
      hcsr04Trig: analysis.sensors.hcsr04TrigGpio,
      hcsr04Echo: analysis.sensors.hcsr04EchoGpio,
      hcsr04HasDivider: analysis.sensors.hcsr04HasDivider,
    },
    powerBudget: analysis.budget,
    twinModelParams: {
      sideGain: [project.faults.leftMotorScale, project.faults.rightMotorScale],
      startPwm: project.faults.minStartPwm,
      gyroDriftDegPerSec: project.faults.gyroDriftDegPerSec,
      floorFriction: project.faults.floorFriction,
    },
    diagnosticsSummary: {
      critical: analysis.diagnostics.filter((d) => d.severity === 'critical').length,
      error: analysis.diagnostics.filter((d) => d.severity === 'error').length,
      warning: analysis.diagnostics.filter((d) => d.severity === 'warning').length,
      info: analysis.diagnostics.filter((d) => d.severity === 'info').length,
    },
    note: 'Simulated design estimates from RoboForge Studio Trial; verify pinout and motor trim on physical hardware before driving.',
  };
}
