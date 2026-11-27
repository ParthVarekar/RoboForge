import { getPartSpec, getPinSpec, type PinSpec } from '../catalog/partsCatalog';
import { DEFAULT_I2C_ADDRESS, type I2cDeviceWiring } from './displays/panels';
import { overloadedPins } from './pinCapacity';
import { SOCKET_RISE_CM, wireLengthCm } from './wireLength';
import type { ComponentInstance, ComponentKind, StudioProject, Vec3, WireConnection, WirePinRef } from '../schema/projectSchema';

export type DiagnosticSeverity = 'critical' | 'error' | 'warning' | 'info';

export interface CircuitDiagnostic {
  id: string;
  severity: DiagnosticSeverity;
  title: string;
  detail: string;
  fix: string;
  componentIds: string[];
}

export interface NetInfo {
  id: string;
  pins: Array<{ componentId: string; pinId: string; spec: PinSpec }>;
  voltage: number | null;
  isGround: boolean;
  gpioNumbers: number[];
}

export interface PowerBudget {
  totalMassGrams: number;
  totalCostUsd: number;
  idleCurrentMa: number;
  peakCurrentMa: number;
  batteryCapacityMah: number;
  estimatedRuntimeMin: number | null;
  comCm: Vec3;
}

export interface SensorWiringStatus {
  esp32Powered: boolean;
  fcPowered: boolean;
  controllerPowered: boolean;
  driverPowered: boolean;
  mpu6050Ready: boolean;
  mpuSdaGpio: number | null;
  mpuSclGpio: number | null;
  hcsr04Ready: boolean;
  hcsr04TrigGpio: number | null;
  hcsr04EchoGpio: number | null;
  hcsr04HasDivider: boolean;
  oledReady: boolean;
  /** Devices on I2C (OLED, LCDs, MPU6050) with their power, address and the ESP32 pins their SDA/SCL reach. */
  i2cDevices: I2cDeviceWiring[];
  camPowered: boolean;
  /**
   * LEDs: lit from a GPIO (`gpio`), or switched by a relay contact (`relay`: lit while the relay is on for NO, off
   * for NC) when the relay's COM is on a powered rail.
   */
  ledPins: Array<{ componentId: string; gpio: number | null; hasSeriesResistor: boolean; relay?: { componentId: string; closedWhenOn: boolean } }>;
  buttonPins: Array<{ componentId: string; gpio: number | null }>;
  /** Hobby servos: SIG on `gpio`; `powered` means enough voltage to move (4 V or more, within the rating). */
  servos: Array<{ componentId: string; kind: ComponentKind; gpio: number | null; powered: boolean }>;
  /** Active buzzers: sound while SIG is HIGH (or carries a tone()). */
  buzzers: Array<{ componentId: string; gpio: number | null; powered: boolean }>;
  /** 5 V relay modules: on while IN is HIGH; `powered` means the coil gets enough voltage to pull in. */
  relays: Array<{ componentId: string; gpio: number | null; powered: boolean }>;
  /** DHT22 sensors: DATA on `gpio`; `pullUp` when a resistor ties DATA to a powered rail. */
  dhts: Array<{ componentId: string; gpio: number | null; powered: boolean; pullUp: boolean }>;
}

export interface MotorChannelMapping {
  motorComponentId: string;
  kind: 'dc' | 'brushless';
  side: 'left' | 'right' | 'center';
  inPosGpio: number | null;
  inNegGpio: number | null;
  polaritySign: 1 | -1;
  driverPowered: boolean;
}

export interface WireMetric {
  wireId: string;
  routedMm: number;
  cutMm: number;
}

export interface ChecklistTask {
  id: string;
  label: string;
  done: boolean;
  hint: string;
}

export interface CircuitAnalysis {
  nets: NetInfo[];
  pinToNet: Map<string, NetInfo>;
  diagnostics: CircuitDiagnostic[];
  hasCriticalFault: boolean;
  hasError: boolean;
  faultyComponentIds: Set<string>;
  budget: PowerBudget;
  sensors: SensorWiringStatus;
  motors: MotorChannelMapping[];
  wireMetrics: Map<string, WireMetric>;
  checklist: ChecklistTask[];
}

export interface MotorDriveOutput {
  motorComponentId: string;
  kind: 'dc' | 'brushless';
  side: 'left' | 'right' | 'center';
  /** Normalized motor drive command from -1.0 (full reverse) to +1.0 (full forward). */
  command: number;
  pwmMagnitude: number;
}

/**
 * Formats a unique lookup key for a pin on a specific component instance.
 */
export function pinKey(ref: WirePinRef): string {
  return `${ref.componentId}:${ref.pinId}`;
}

/**
 * Computes the world-space coordinate (in cm) of a pin on a placed component instance.
 */
export function getPinWorldPositionCm(comp: ComponentInstance, pinId: string): Vec3 | null {
  const pin = getPinSpec(comp.kind, pinId);
  if (!pin) return null;
  const cos = Math.cos(comp.rotationY);
  const sin = Math.sin(comp.rotationY);
  const lx = pin.localPos[0];
  const ly = pin.localPos[1];
  const lz = pin.localPos[2];
  return [
    comp.position[0] + lx * cos + lz * sin,
    comp.position[1] + ly,
    comp.position[2] - lx * sin + lz * cos,
  ];
}

/**
 * Computes the routed cable length and recommended physical cut length (including strip/slack allowance) in mm.
 */
export function computeWireMetric(
  wire: WireConnection,
  compById: ReadonlyMap<string, ComponentInstance>,
): WireMetric {
  const cA = compById.get(wire.from.componentId);
  const cB = compById.get(wire.to.componentId);
  const pA = cA ? getPinWorldPositionCm(cA, wire.from.pinId) : null;
  const pB = cB ? getPinWorldPositionCm(cB, wire.to.pinId) : null;
  if (!pA || !pB) return { wireId: wire.id, routedMm: 0, cutMm: 0 };

  // the same rule the 3D wire is laid with: straight span (through any tie points) plus the socket rise at each end
  // and the style's slack
  const pts: Array<readonly [number, number, number]> = [pA, ...(wire.waypoints ?? []), pB];
  let span = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const u = pts[i]!;
    const v = pts[i + 1]!;
    span += Math.hypot(v[0] - u[0], v[1] - u[1], v[2] - u[2]);
  }
  const lengthCm = wireLengthCm(span, wire.style ?? 'routed', wire.clearanceCm ?? 0.45) + 2 * SOCKET_RISE_CM;

  const routedMm = Math.max(12, Math.round(lengthCm * 10));
  const cutMm = Math.ceil((routedMm + 30) / 5) * 5; // +30 mm stripping & solder slack, rounded to 5 mm
  return { wireId: wire.id, routedMm, cutMm };
}

class UnionFind {
  private parent = new Map<string, string>();

  add(key: string): void {
    if (!this.parent.has(key)) this.parent.set(key, key);
  }

  find(key: string): string {
    const p = this.parent.get(key);
    if (!p || p === key) return key;
    const root = this.find(p);
    this.parent.set(key, root);
    return root;
  }

  union(a: string, b: string): void {
    this.add(a);
    this.add(b);
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function buildNets(project: StudioProject): { nets: NetInfo[]; pinToNet: Map<string, NetInfo> } {
  const uf = new UnionFind();
  const compById = new Map(project.components.map((c) => [c.id, c]));

  for (const comp of project.components) {
    const spec = getPartSpec(comp.kind);
    const gndPins: string[] = [];
    for (const pin of spec.pins) {
      const k = pinKey({ componentId: comp.id, pinId: pin.id });
      uf.add(k);
      if (pin.role === 'gnd') gndPins.push(k);
    }
    for (let i = 1; i < gndPins.length; i += 1) {
      const first = gndPins[0];
      const curr = gndPins[i];
      if (first && curr) uf.union(first, curr);
    }
    // pins the part joins itself (a closed switch, a pass-through header)
    for (const group of spec.internal ?? []) {
      for (let i = 1; i < group.length; i += 1) uf.union(pinKey({ componentId: comp.id, pinId: group[0]! }), pinKey({ componentId: comp.id, pinId: group[i]! }));
    }
  }

  for (const wire of project.wires) {
    const cFrom = compById.get(wire.from.componentId);
    const cTo = compById.get(wire.to.componentId);
    if (!cFrom || !cTo) continue;
    if (!getPinSpec(cFrom.kind, wire.from.pinId) || !getPinSpec(cTo.kind, wire.to.pinId)) continue;
    uf.union(pinKey(wire.from), pinKey(wire.to));
  }

  const groups = new Map<string, Array<{ componentId: string; pinId: string; spec: PinSpec }>>();
  for (const comp of project.components) {
    for (const pin of getPartSpec(comp.kind).pins) {
      const k = pinKey({ componentId: comp.id, pinId: pin.id });
      const root = uf.find(k);
      const list = groups.get(root) ?? [];
      list.push({ componentId: comp.id, pinId: pin.id, spec: pin });
      groups.set(root, list);
    }
  }

  const nets: NetInfo[] = [];
  const pinToNet = new Map<string, NetInfo>();
  let idx = 1;

  for (const pins of groups.values()) {
    const isGround = pins.some((p) => p.spec.role === 'gnd');
    const sourceVoltages = pins
      .filter((p) => p.spec.role === 'power_out' && typeof p.spec.nominalVoltage === 'number')
      .map((p) => p.spec.nominalVoltage as number);
    const voltage = sourceVoltages.length > 0 ? Math.max(...sourceVoltages) : isGround ? 0 : null;
    const gpioNumbers = pins
      .filter((p) => typeof p.spec.gpioNumber === 'number')
      .map((p) => p.spec.gpioNumber as number);

    const net: NetInfo = { id: `N${idx++}`, pins, voltage, isGround, gpioNumbers };
    nets.push(net);
    for (const p of pins) {
      pinToNet.set(pinKey({ componentId: p.componentId, pinId: p.pinId }), net);
    }
  }

  return { nets, pinToNet };
}

function getResistorNeighborNets(
  project: StudioProject,
  pinToNet: Map<string, NetInfo>,
  startNetId: string,
): Array<{ resistorId: string; otherNet: NetInfo }> {
  const results: Array<{ resistorId: string; otherNet: NetInfo }> = [];
  for (const comp of project.components) {
    if (comp.kind !== 'resistor_10k') continue;
    const netA = pinToNet.get(pinKey({ componentId: comp.id, pinId: 'A' }));
    const netB = pinToNet.get(pinKey({ componentId: comp.id, pinId: 'B' }));
    if (!netA || !netB) continue;
    if (netA.id === startNetId && netB.id !== startNetId) {
      results.push({ resistorId: comp.id, otherNet: netB });
    } else if (netB.id === startNetId && netA.id !== startNetId) {
      results.push({ resistorId: comp.id, otherNet: netA });
    }
  }
  return results;
}

function isPoweredByNet(
  comp: ComponentInstance,
  powerPinId: string,
  gndPinId: string,
  pinToNet: Map<string, NetInfo>,
  minV: number,
  maxV: number,
): boolean {
  const pNet = pinToNet.get(pinKey({ componentId: comp.id, pinId: powerPinId }));
  const gNet = pinToNet.get(pinKey({ componentId: comp.id, pinId: gndPinId }));
  if (!pNet || !gNet || !gNet.isGround || pNet.voltage === null) return false;
  return pNet.voltage >= minV && pNet.voltage <= maxV && !pNet.isGround;
}

/** Drivers and converters pass their load's current through; counting them as well would count it twice. */
const PASS_THROUGH_KINDS: ReadonlySet<string> = new Set([
  'lm2596_buck',
  'drv8833',
  'l298n',
  'tb6612fng',
  'a4988',
  'mt3608_boost',
  'tp4056_charger',
  'ams1117_3v3',
  'rocker_switch',
]);

function computeBudget(project: StudioProject): PowerBudget {
  let totalMassGrams = 0;
  let totalCostUsd = 0;
  let idleCurrentMa = 0;
  let peakCurrentMa = 0;
  let batteryCapacityMah = 0;
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;

  for (const comp of project.components) {
    const spec = getPartSpec(comp.kind);
    totalMassGrams += spec.massGrams;
    totalCostUsd += spec.unitPriceUsd;
    sumX += comp.position[0] * spec.massGrams;
    sumY += (comp.position[1] + spec.sizeCm[1] * 0.5) * spec.massGrams;
    sumZ += comp.position[2] * spec.massGrams;
    idleCurrentMa += spec.idleCurrentMa;
    if (comp.kind === 'battery_2s') {
      batteryCapacityMah += 2200;
    } else if (comp.kind === 'battery_6s_lipo') {
      batteryCapacityMah += 1100;
    } else if (comp.kind === 'battery_4aa') {
      batteryCapacityMah += 2000;
    } else if (!PASS_THROUGH_KINDS.has(comp.kind)) {
      peakCurrentMa += spec.peakCurrentMa;
    }
  }

  const cruiseFactor = project.components.some((c) => c.kind === 'brushless_2207') ? 0.14 : 0.45;
  const cruiseCurrentMa = idleCurrentMa + (peakCurrentMa - idleCurrentMa) * cruiseFactor;
  const estimatedRuntimeMin =
    batteryCapacityMah > 0 && cruiseCurrentMa > 0
      ? Math.round(((batteryCapacityMah * 0.85) / cruiseCurrentMa) * 60)
      : null;

  const comCm: Vec3 =
    totalMassGrams > 0
      ? [
          Number((sumX / totalMassGrams).toFixed(2)),
          Number((sumY / totalMassGrams).toFixed(2)),
          Number((sumZ / totalMassGrams).toFixed(2)),
        ]
      : [0, 0, 0];

  return {
    totalMassGrams: Math.round(totalMassGrams),
    totalCostUsd: Number(totalCostUsd.toFixed(2)),
    idleCurrentMa: Math.round(idleCurrentMa),
    peakCurrentMa: Math.round(peakCurrentMa),
    batteryCapacityMah,
    estimatedRuntimeMin,
    comCm,
  };
}

function resolveMotors(
  project: StudioProject,
  pinToNet: Map<string, NetInfo>,
): MotorChannelMapping[] {
  const drivers = project.components.filter((c) => c.kind === 'drv8833');
  const fcStacks = project.components.filter((c) => c.kind === 'fc_esc_stack');
  const mappings: MotorChannelMapping[] = [];

  // Brushed DC motors via DRV8833
  for (const motor of project.components.filter((c) => c.kind === 'dc_motor')) {
    const mPosNet = pinToNet.get(pinKey({ componentId: motor.id, pinId: 'M_POS' }));
    const mNegNet = pinToNet.get(pinKey({ componentId: motor.id, pinId: 'M_NEG' }));
    let mapped: MotorChannelMapping = {
      motorComponentId: motor.id,
      kind: 'dc',
      side: motor.side ?? 'center',
      inPosGpio: null,
      inNegGpio: null,
      polaritySign: 1,
      driverPowered: false,
    };

    for (const drv of drivers) {
      const powered = isPoweredByNet(drv, 'VM', 'GND', pinToNet, 2.7, 10.8);
      const channels = [
        { outA: 'OUT1', outB: 'OUT2', inA: 'IN1', inB: 'IN2' },
        { outA: 'OUT3', outB: 'OUT4', inA: 'IN3', inB: 'IN4' },
      ];
      for (const ch of channels) {
        const netOutA = pinToNet.get(pinKey({ componentId: drv.id, pinId: ch.outA }));
        const netOutB = pinToNet.get(pinKey({ componentId: drv.id, pinId: ch.outB }));
        const netInA = pinToNet.get(pinKey({ componentId: drv.id, pinId: ch.inA }));
        const netInB = pinToNet.get(pinKey({ componentId: drv.id, pinId: ch.inB }));
        if (!netOutA || !netOutB || !mPosNet || !mNegNet) continue;

        const direct = netOutA.id === mPosNet.id && netOutB.id === mNegNet.id;
        const swapped = netOutA.id === mNegNet.id && netOutB.id === mPosNet.id;
        if (direct || swapped) {
          mapped = {
            motorComponentId: motor.id,
            kind: 'dc',
            side: motor.side ?? 'center',
            inPosGpio: netInA?.gpioNumbers[0] ?? null,
            inNegGpio: netInB?.gpioNumbers[0] ?? null,
            polaritySign: direct ? 1 : -1,
            driverPowered: powered,
          };
        }
      }
    }
    mappings.push(mapped);
  }

  // Brushless drone motors via 4-in-1 ESC Stack
  for (const bMotor of project.components.filter((c) => c.kind === 'brushless_2207')) {
    const phaseNet = pinToNet.get(pinKey({ componentId: bMotor.id, pinId: 'PHASE' }));
    let mapped: MotorChannelMapping = {
      motorComponentId: bMotor.id,
      kind: 'brushless',
      side: bMotor.side ?? 'center',
      inPosGpio: null,
      inNegGpio: null,
      polaritySign: 1,
      driverPowered: false,
    };

    for (const fc of fcStacks) {
      const powered = isPoweredByNet(fc, 'BAT_POS', 'GND', pinToNet, 10.5, 26.0);
      if (phaseNet && phaseNet.gpioNumbers.length > 0) {
        mapped = {
          motorComponentId: bMotor.id,
          kind: 'brushless',
          side: bMotor.side ?? 'center',
          inPosGpio: phaseNet.gpioNumbers[0] ?? null,
          inNegGpio: null,
          polaritySign: bMotor.side === 'right' ? -1 : 1,
          driverPowered: powered,
        };
      }
    }
    mappings.push(mapped);
  }

  return mappings;
}

function checkPowerAndVoltage(
  nets: NetInfo[],
  diagnostics: CircuitDiagnostic[],
  faultyComponentIds: Set<string>,
): void {
  for (const net of nets) {
    const powerSources = net.pins.filter((p) => p.spec.role === 'power_out');
    if (net.isGround && powerSources.length > 0) {
      const comps = [...new Set(net.pins.map((p) => p.componentId))];
      comps.forEach((id) => faultyComponentIds.add(id));
      diagnostics.push({
        id: `short-${net.id}`,
        severity: 'critical',
        title: `Direct power-to-ground short on net ${net.id}`,
        detail: `${powerSources.map((p) => p.spec.label).join(', ')} is shorted straight to GND.`,
        fix: 'Disconnect the wire bridging the power rail to GND before running.',
        componentIds: comps,
      });
    }

    if (net.voltage !== null && net.voltage > 0) {
      for (const pin of net.pins) {
        if (pin.spec.maxVoltage !== undefined && net.voltage > pin.spec.maxVoltage + 0.05) {
          faultyComponentIds.add(pin.componentId);
          diagnostics.push({
            id: `overvolt-${pin.componentId}-${pin.pinId}`,
            severity: 'critical',
            title: `Overvoltage on ${pin.componentId}.${pin.pinId} (${net.voltage.toFixed(1)} V)`,
            detail: `Pin ${pin.spec.label} is rated up to ${pin.spec.maxVoltage} V but receives ${net.voltage.toFixed(1)} V.`,
            fix: 'Route high-voltage battery power through an appropriate buck converter or BEC regulator.',
            componentIds: [pin.componentId],
          });
        }
      }
    }
  }
}

function checkPinRolesAndCommonGround(
  project: StudioProject,
  pinToNet: Map<string, NetInfo>,
  diagnostics: CircuitDiagnostic[],
): void {
  const wiredComps = new Set<string>();
  for (const w of project.wires) {
    wiredComps.add(w.from.componentId);
    wiredComps.add(w.to.componentId);
  }

  const groundNetIds = new Set<string>();
  for (const comp of project.components) {
    if (!wiredComps.has(comp.id)) continue;
    const gndPin = getPartSpec(comp.kind).pins.find((p) => p.role === 'gnd');
    if (!gndPin) continue;
    const net = pinToNet.get(pinKey({ componentId: comp.id, pinId: gndPin.id }));
    if (net) groundNetIds.add(net.id);
  }
  if (groundNetIds.size > 1) {
    diagnostics.push({
      id: 'split-ground',
      severity: 'warning',
      title: 'Split ground rails detected',
      detail: `Active modules are split across ${groundNetIds.size} disconnected GND nets. Signals need one shared ground reference.`,
      fix: 'Connect GND pins of the battery, regulator, controller, driver, and sensors to one common GND.',
      componentIds: [...wiredComps],
    });
  }

  for (const comp of project.components) {
    if (comp.kind === 'drv8833') {
      for (const inPin of ['IN1', 'IN2', 'IN3', 'IN4']) {
        const net = pinToNet.get(pinKey({ componentId: comp.id, pinId: inPin }));
        if (!net) continue;
        for (const p of net.pins) {
          if (p.spec.role === 'gpio_input_only') {
            diagnostics.push({
              id: `input-only-${p.componentId}-${p.pinId}`,
              severity: 'error',
              title: `Input-only pin ${p.spec.label} wired to motor input ${inPin}`,
              detail: 'ESP32 GPIO34–39 are input-only and cannot output PWM to a motor driver.',
              fix: 'Move the motor control wire to GPIO25, 26, 27, or 14.',
              componentIds: [p.componentId, comp.id],
            });
          }
          if (p.spec.bootStrapping) {
            diagnostics.push({
              id: `boot-pin-${p.componentId}-${p.pinId}`,
              severity: 'warning',
              title: `Boot-strapping pin ${p.spec.label} used for motor ${inPin}`,
              detail: 'Pulling boot-strapping pins (GPIO0/2/12/15) during power-up can block ESP32 boot or twitch motors.',
              fix: 'Prefer GPIO25, 26, 27, or 14 for DRV8833 inputs.',
              componentIds: [p.componentId, comp.id],
            });
          }
        }
      }

      const vmNet = pinToNet.get(pinKey({ componentId: comp.id, pinId: 'VM' }));
      const gndNet = pinToNet.get(pinKey({ componentId: comp.id, pinId: 'GND' }));
      const hasCap =
        vmNet &&
        gndNet &&
        project.components.some((cap) => {
          if (cap.kind !== 'cap_1000uf') return false;
          const pos = pinToNet.get(pinKey({ componentId: cap.id, pinId: 'POS' }));
          const neg = pinToNet.get(pinKey({ componentId: cap.id, pinId: 'NEG' }));
          return pos?.id === vmNet.id && neg?.id === gndNet.id;
        });
      if (vmNet && vmNet.voltage !== null && vmNet.voltage > 0 && !hasCap) {
        diagnostics.push({
          id: `missing-cap-${comp.id}`,
          severity: 'info',
          title: 'Motor power rail lacks a bulk decoupling capacitor',
          detail: 'Motor startup spikes on DRV8833 VM can brown out the ESP32 on battery power.',
          fix: 'Place a 1000uF capacitor across DRV8833 VM (+) and GND (-).',
          componentIds: [comp.id],
        });
      }
    }
  }
}

function resolveSensorsAndCheck(
  project: StudioProject,
  pinToNet: Map<string, NetInfo>,
  diagnostics: CircuitDiagnostic[],
): SensorWiringStatus {
  const esp32 = project.components.find((c) => c.kind === 'esp32_devkit');
  const esp32Powered = esp32
    ? isPoweredByNet(esp32, 'VIN', 'GND_R', pinToNet, 4.5, 5.8) ||
      isPoweredByNet(esp32, 'VIN', 'GND_L', pinToNet, 4.5, 5.8)
    : false;

  const fc = project.components.find((c) => c.kind === 'fc_esc_stack');
  const fcPowered = fc ? isPoweredByNet(fc, 'BAT_POS', 'GND', pinToNet, 10.5, 26.0) : false;

  const drv = project.components.find((c) => c.kind === 'drv8833');
  const driverPowered = drv ? isPoweredByNet(drv, 'VM', 'GND', pinToNet, 2.7, 10.8) : fcPowered;

  // MPU6050 (note: F7 FC has an internal gyro so mpu6050Ready is also true when FC is powered!)
  let mpu6050Ready = fcPowered;
  let mpuSdaGpio: number | null = null;
  let mpuSclGpio: number | null = null;
  const mpu = project.components.find((c) => c.kind === 'mpu6050');
  if (mpu) {
    const powered = isPoweredByNet(mpu, 'VCC', 'GND', pinToNet, 3.0, 5.5);
    const sdaNet = pinToNet.get(pinKey({ componentId: mpu.id, pinId: 'SDA' }));
    const sclNet = pinToNet.get(pinKey({ componentId: mpu.id, pinId: 'SCL' }));
    mpuSdaGpio = sdaNet?.gpioNumbers[0] ?? null;
    mpuSclGpio = sclNet?.gpioNumbers[0] ?? null;
    mpu6050Ready = powered && mpuSdaGpio !== null && mpuSclGpio !== null && mpuSdaGpio !== mpuSclGpio;
  }

  // OLED SSD1306
  const oled = project.components.find((c) => c.kind === 'oled_ssd1306');
  let oledReady = false;
  if (oled) {
    const powered = isPoweredByNet(oled, 'VCC', 'GND', pinToNet, 3.0, 5.5);
    const sdaNet = pinToNet.get(pinKey({ componentId: oled.id, pinId: 'SDA' }));
    const sclNet = pinToNet.get(pinKey({ componentId: oled.id, pinId: 'SCL' }));
    oledReady = Boolean(powered && sdaNet?.gpioNumbers.length && sclNet?.gpioNumbers.length);
  }

  // devices on the I2C bus, for the display libraries (which need the right pins and address) and Wire scans
  const i2cDevices: I2cDeviceWiring[] = [];
  for (const comp of project.components) {
    const address = DEFAULT_I2C_ADDRESS[comp.kind];
    if (address === undefined) continue;
    const isLcd = comp.kind === 'lcd1602_i2c' || comp.kind === 'lcd2004_i2c';
    const vccNet = pinToNet.get(pinKey({ componentId: comp.id, pinId: 'VCC' }));
    const sdaNet = pinToNet.get(pinKey({ componentId: comp.id, pinId: 'SDA' }));
    const sclNet = pinToNet.get(pinKey({ componentId: comp.id, pinId: 'SCL' }));
    const powered = isPoweredByNet(comp, 'VCC', 'GND', pinToNet, isLcd ? 2.7 : 3.0, 5.5);
    const dev: I2cDeviceWiring = {
      componentId: comp.id,
      kind: comp.kind,
      address,
      powered,
      supplyV: vccNet?.voltage ?? null,
      sdaGpio: sdaNet?.gpioNumbers[0] ?? null,
      sclGpio: sclNet?.gpioNumbers[0] ?? null,
    };
    i2cDevices.push(dev);
    if (!isLcd || !powered) continue;
    const name = comp.kind === 'lcd2004_i2c' ? 'LCD 20x4' : 'LCD 16x2';
    const v = dev.supplyV ?? 5;
    if (v < 4.5) {
      diagnostics.push({
        id: `lcd-low-supply-${comp.id}`,
        severity: 'warning',
        title: `${name} runs from ${v.toFixed(1)} V`,
        detail: 'These character LCDs are made for 5 V. From 3.3 V the characters are very faint even with the contrast trimmer turned fully.',
        fix: 'Power the LCD VCC from the 5 V rail (the buck output) and keep GND common.',
        componentIds: [comp.id],
      });
    } else if (dev.sdaGpio !== null || dev.sclGpio !== null) {
      diagnostics.push({
        id: `lcd-5v-pullups-${comp.id}`,
        severity: 'info',
        title: `${name} backpack pulls SDA/SCL up to ${v.toFixed(1)} V`,
        detail: 'The PCF8574 backpack has 4.7 kOhm pull-ups to its VCC, so the ESP32 I2C pins sit at about 5 V when idle, above their 3.6 V rating. Many builds work like this, but it is outside the ESP32 specification.',
        fix: 'Put a 3.3 V / 5 V I2C level shifter between the backpack and the ESP32, or remove the backpack pull-ups and use 3.3 V ones.',
        componentIds: [comp.id],
      });
    }
  }
  const seenAddr = new Map<string, I2cDeviceWiring>();
  for (const d of i2cDevices) {
    if (!d.powered || d.sdaGpio === null || d.sclGpio === null) continue;
    const key = `${d.sdaGpio}/${d.sclGpio}/${d.address}`;
    const other = seenAddr.get(key);
    if (other) {
      diagnostics.push({
        id: `i2c-address-clash-${d.componentId}`,
        severity: 'warning',
        title: `Two I2C devices answer at 0x${d.address.toString(16).toUpperCase()}`,
        detail: `Both are on GPIO${d.sdaGpio}/GPIO${d.sclGpio}; the sketch can only talk to one of them at that address.`,
        fix: "Remove one of them, or change one module's address with its address jumpers (the simulator models the default addresses only).",
        componentIds: [other.componentId, d.componentId],
      });
    } else seenAddr.set(key, d);
  }

  // HC-SR04
  let hcsr04Ready = false;
  let hcsr04TrigGpio: number | null = null;
  let hcsr04EchoGpio: number | null = null;
  let hcsr04HasDivider = false;
  const us = project.components.find((c) => c.kind === 'hcsr04');
  if (us) {
    const vccNet = pinToNet.get(pinKey({ componentId: us.id, pinId: 'VCC' }));
    const powered = isPoweredByNet(us, 'VCC', 'GND', pinToNet, 3.0, 5.5);
    const trigNet = pinToNet.get(pinKey({ componentId: us.id, pinId: 'TRIG' }));
    const echoNet = pinToNet.get(pinKey({ componentId: us.id, pinId: 'ECHO' }));

    if (trigNet) {
      hcsr04TrigGpio = trigNet.gpioNumbers[0] ?? null;
      const inputOnly = trigNet.pins.find((p) => p.spec.role === 'gpio_input_only');
      if (inputOnly) {
        diagnostics.push({
          id: `us-trig-input-only-${us.id}`,
          severity: 'error',
          title: `HC-SR04 TRIG wired to input-only pin ${inputOnly.spec.label}`,
          detail: 'TRIG requires a 10 us output pulse, which GPIO34–39 cannot drive.',
          fix: 'Wire HC-SR04 TRIG to GPIO13 (or another output-capable GPIO).',
          componentIds: [us.id, inputOnly.componentId],
        });
      }
    }

    if (echoNet) {
      if (echoNet.gpioNumbers.length > 0) {
        hcsr04EchoGpio = echoNet.gpioNumbers[0] ?? null;
        const vccV = vccNet?.voltage ?? 5.0;
        if (vccV > 3.6) {
          diagnostics.push({
            id: `us-echo-5v-${us.id}`,
            severity: 'warning',
            title: 'HC-SR04 5V ECHO wired directly to 3.3V ESP32 pin',
            detail: `ECHO outputs ~${vccV.toFixed(1)} V directly into GPIO${hcsr04EchoGpio}, exceeding the ESP32 3.6 V logic ceiling.`,
            fix: 'Insert a 10 kOhm / 10 kOhm voltage divider between ECHO, GPIO35, and GND.',
            componentIds: [us.id],
          });
        }
      } else {
        const hops = getResistorNeighborNets(project, pinToNet, echoNet.id);
        for (const hop of hops) {
          if (hop.otherNet.gpioNumbers.length > 0) {
            hcsr04EchoGpio = hop.otherNet.gpioNumbers[0] ?? null;
            const secondHops = getResistorNeighborNets(project, pinToNet, hop.otherNet.id);
            hcsr04HasDivider = secondHops.some((h) => h.resistorId !== hop.resistorId && h.otherNet.isGround);
            if (!hcsr04HasDivider && (vccNet?.voltage ?? 5.0) > 3.6) {
              diagnostics.push({
                id: `us-echo-half-divider-${us.id}`,
                severity: 'warning',
                title: 'HC-SR04 ECHO divider missing lower resistor to GND',
                detail: 'A single series resistor alone does not halve the 5 V ECHO pulse.',
                fix: `Add a second 10 kOhm resistor from GPIO${hcsr04EchoGpio} to GND.`,
                componentIds: [us.id, hop.resistorId],
              });
            }
          }
        }
      }
    }

    const trigValid = hcsr04TrigGpio !== null && !trigNet?.pins.some((p) => p.spec.role === 'gpio_input_only');
    hcsr04Ready = powered && trigValid && hcsr04EchoGpio !== null;
  }

  // ESP32-CAM
  const cam = project.components.find((c) => c.kind === 'esp32_cam');
  const camPowered = cam ? isPoweredByNet(cam, '5V', 'GND', pinToNet, 4.5, 5.6) : false;

  // Tactile buttons
  const buttonPins: SensorWiringStatus['buttonPins'] = [];
  for (const btn of project.components.filter((c) => c.kind === 'tactile_button')) {
    const netA = pinToNet.get(pinKey({ componentId: btn.id, pinId: 'A' }));
    const netB = pinToNet.get(pinKey({ componentId: btn.id, pinId: 'B' }));
    const gpio = netA?.gpioNumbers[0] ?? netB?.gpioNumbers[0] ?? null;
    buttonPins.push({ componentId: btn.id, gpio });
  }

  // LEDs
  const kindOf = new Map(project.components.map((c) => [c.id, c.kind]));
  const ledPins: SensorWiringStatus['ledPins'] = [];
  for (const led of project.components.filter((c) => c.kind === 'led_5mm')) {
    const anodeNet = pinToNet.get(pinKey({ componentId: led.id, pinId: 'ANODE' }));
    const cathodeNet = pinToNet.get(pinKey({ componentId: led.id, pinId: 'CATHODE' }));
    let gpio: number | null = anodeNet?.gpioNumbers[0] ?? null;
    let hasSeriesResistor = false;

    if (anodeNet && gpio === null) {
      const hops = getResistorNeighborNets(project, pinToNet, anodeNet.id);
      const gpioHop = hops.find((h) => h.otherNet.gpioNumbers.length > 0);
      if (gpioHop) {
        gpio = gpioHop.otherNet.gpioNumbers[0] ?? null;
        hasSeriesResistor = true;
      }
    }
    if (cathodeNet && !cathodeNet.isGround) {
      const hops = getResistorNeighborNets(project, pinToNet, cathodeNet.id);
      if (hops.some((h) => h.otherNet.isGround)) hasSeriesResistor = true;
    }

    const cathodeGrounded =
      Boolean(cathodeNet?.isGround) ||
      (cathodeNet ? getResistorNeighborNets(project, pinToNet, cathodeNet.id).some((h) => h.otherNet.isGround) : false);

    if (gpio !== null && cathodeGrounded && !hasSeriesResistor) {
      diagnostics.push({
        id: `led-no-res-${led.id}`,
        severity: 'warning',
        title: `LED (${led.label}) wired without a current-limiting resistor`,
        detail: `GPIO${gpio} drives ${led.label} directly to GND without a resistor in series.`,
        fix: 'Insert a resistor in series with the LED anode or cathode.',
        componentIds: [led.id],
      });
    }
    // no GPIO: an LED fed from a relay contact whose COM sits on a powered rail is switched by that relay
    let relay: { componentId: string; closedWhenOn: boolean } | undefined;
    if (gpio === null && anodeNet && cathodeGrounded) {
      const feeds = [anodeNet, ...getResistorNeighborNets(project, pinToNet, anodeNet.id).map((h) => h.otherNet)];
      for (const net of feeds) {
        const contact = net.pins.find((p) => kindOf.get(p.componentId) === 'relay_1ch' && (p.pinId === 'NO' || p.pinId === 'NC'));
        if (!contact) continue;
        const com = pinToNet.get(pinKey({ componentId: contact.componentId, pinId: 'COM' }));
        if (com && !com.isGround && (com.voltage ?? 0) >= 1.8) {
          relay = { componentId: contact.componentId, closedWhenOn: contact.pinId === 'NO' };
          if (net !== anodeNet) hasSeriesResistor = true;
          if (!hasSeriesResistor) {
            diagnostics.push({
              id: `led-no-res-${led.id}`,
              severity: 'warning',
              title: `LED (${led.label}) switched by a relay without a current-limiting resistor`,
              detail: `The relay connects ${led.label} straight to the ${(com.voltage ?? 0).toFixed(1)} V rail.`,
              fix: 'Insert a resistor in series with the LED anode or cathode.',
              componentIds: [led.id],
            });
          }
          break;
        }
      }
    }
    ledPins.push({ componentId: led.id, gpio: cathodeGrounded ? gpio : null, hasSeriesResistor, ...(relay ? { relay } : {}) });
  }

  /** The GPIO a signal pin reaches directly, with an error when it is an input-only pin and the part needs a driven output. */
  const outputGpio = (comp: ComponentInstance, pinId: string, partName: string): number | null => {
    const net = pinToNet.get(pinKey({ componentId: comp.id, pinId }));
    if (!net) return null;
    const inputOnly = net.pins.find((p) => p.spec.role === 'gpio_input_only');
    if (inputOnly) {
      diagnostics.push({
        id: `${comp.kind}-input-only-${comp.id}`,
        severity: 'error',
        title: `${partName} ${pinId} wired to input-only pin ${inputOnly.spec.label}`,
        detail: `${partName} ${pinId} needs a signal the ESP32 drives, and GPIO34-39 can only read.`,
        fix: `Move the ${pinId} wire to an output-capable GPIO such as GPIO18 or GPIO19.`,
        componentIds: [comp.id, inputOnly.componentId],
      });
      return null;
    }
    return net.gpioNumbers[0] ?? null;
  };
  const supplyV = (comp: ComponentInstance, pinId: string): number | null => {
    const net = pinToNet.get(pinKey({ componentId: comp.id, pinId }));
    return net && !net.isGround ? net.voltage : null;
  };

  // servos: they need about 4.8-6 V to move; 3.3 V makes them twitch or not move at all
  const servos: SensorWiringStatus['servos'] = [];
  for (const sv of project.components.filter((c) => c.kind === 'servo_sg90' || c.kind === 'servo_mg996r')) {
    const name = sv.kind === 'servo_mg996r' ? 'MG996R servo' : 'SG90 servo';
    const gpio = outputGpio(sv, 'SIG', name);
    const inRange = isPoweredByNet(sv, 'VCC', 'GND', pinToNet, 3.0, 7.5);
    const v = supplyV(sv, 'VCC');
    if (inRange && v !== null && v < 4.0) {
      diagnostics.push({
        id: `servo-low-supply-${sv.id}`,
        severity: 'warning',
        title: `${name} (${sv.label}) gets only ${v.toFixed(1)} V`,
        detail: 'Hobby servos are made for 4.8-6 V. From 3.3 V they twitch or do not move, and their current pulls the ESP32 rail down.',
        fix: 'Power the servo red wire from the 5 V rail (the buck output or a separate 5 V supply) and keep GND common.',
        componentIds: [sv.id],
      });
    }
    servos.push({ componentId: sv.id, kind: sv.kind, gpio, powered: inRange && v !== null && v >= 4.0 });
  }

  const buzzers: SensorWiringStatus['buzzers'] = [];
  for (const bz of project.components.filter((c) => c.kind === 'buzzer_active')) {
    buzzers.push({ componentId: bz.id, gpio: outputGpio(bz, 'SIG', 'Buzzer'), powered: isPoweredByNet(bz, 'VCC', 'GND', pinToNet, 3.0, 5.5) });
  }

  // relays: the SRD-05VDC coil pulls in at about 3.75 V, so the module needs its 5 V
  const relays: SensorWiringStatus['relays'] = [];
  for (const rl of project.components.filter((c) => c.kind === 'relay_1ch')) {
    const gpio = outputGpio(rl, 'IN', 'Relay');
    const inRange = isPoweredByNet(rl, 'VCC', 'GND', pinToNet, 3.0, 5.5);
    const v = supplyV(rl, 'VCC');
    if (inRange && v !== null && v < 4.5) {
      diagnostics.push({
        id: `relay-low-supply-${rl.id}`,
        severity: 'warning',
        title: `Relay (${rl.label}) coil gets only ${v.toFixed(1)} V`,
        detail: 'The SRD-05VDC relay needs about 3.75 V to pull in and is made for 5 V; from 3.3 V it does not switch.',
        fix: 'Power the relay module DC+ from the 5 V rail and keep GND common; IN can stay on a 3.3 V GPIO.',
        componentIds: [rl.id],
      });
    }
    relays.push({ componentId: rl.id, gpio, powered: inRange && v !== null && v >= 4.5 });
  }

  // DHT22: one data line with a pull-up to VCC (the library also turns on the ESP32's weak internal pull-up)
  const dhts: SensorWiringStatus['dhts'] = [];
  for (const dh of project.components.filter((c) => c.kind === 'dht22')) {
    const dataNet = pinToNet.get(pinKey({ componentId: dh.id, pinId: 'DATA' }));
    const gpio = dataNet?.gpioNumbers[0] ?? null;
    const powered = isPoweredByNet(dh, 'VCC', 'GND', pinToNet, 3.0, 6.0);
    const pullUp = dataNet ? getResistorNeighborNets(project, pinToNet, dataNet.id).some((h) => !h.otherNet.isGround && (h.otherNet.voltage ?? 0) >= 3.0) : false;
    if (powered && gpio !== null && !pullUp) {
      diagnostics.push({
        id: `dht-no-pullup-${dh.id}`,
        severity: 'info',
        title: `DHT22 (${dh.label}) DATA has no pull-up resistor`,
        detail: "The DHT library turns on the ESP32's internal pull-up, which is weak (about 45 kOhm): it works with short wires but readings can fail with long ones.",
        fix: 'Add a 10 kOhm resistor from DATA to VCC, as the DHT22 datasheet shows.',
        componentIds: [dh.id],
      });
    }
    dhts.push({ componentId: dh.id, gpio, powered, pullUp });
  }

  return {
    esp32Powered,
    fcPowered,
    controllerPowered: esp32Powered || fcPowered,
    driverPowered,
    mpu6050Ready,
    mpuSdaGpio,
    mpuSclGpio,
    hcsr04Ready,
    hcsr04TrigGpio,
    hcsr04EchoGpio,
    hcsr04HasDivider,
    oledReady,
    i2cDevices,
    camPowered,
    ledPins,
    buttonPins,
    servos,
    buzzers,
    relays,
    dhts,
  };
}

function buildChecklist(
  project: StudioProject,
  diagnostics: CircuitDiagnostic[],
  sensors: SensorWiringStatus,
  motors: MotorChannelMapping[],
): ChecklistTask[] {
  const isDrone = project.components.some((c) => c.kind === 'frame_quad_5in' || c.kind === 'fc_esc_stack');
  const activeMotors = motors.filter((m) => m.driverPowered && m.inPosGpio !== null).length;

  if (isDrone) {
    return [
      { id: 't_pwr', label: '6S LiPo wired to FC/ESC BAT+ & GND', done: sensors.fcPowered, hint: 'Connect XT60+ to BAT+ and XT60- to GND.' },
      { id: 't_short', label: 'Zero shorts or overvoltage faults', done: !diagnostics.some((d) => d.severity === 'critical'), hint: 'Resolve critical circuit checks.' },
      { id: 't_m4', label: 'All 4 brushless ESC phases wired', done: activeMotors >= 4, hint: 'Route M1–M4 pads to all four 2207 motors.' },
      { id: 't_vtx', label: '5V BEC feeding VTX antenna mount', done: project.components.some((c) => c.kind === 'vtx_antenna'), hint: 'Wire FC 5V BEC to VTX 5V & GND.' },
      { id: 't_clean', label: 'All circuit checks clear', done: diagnostics.length === 0, hint: 'Clear remaining warnings in Circuit Checks.' },
    ];
  }

  return [
    { id: 't_pwr', label: 'Regulated 5.2 V power to ESP32 VIN', done: sensors.esp32Powered, hint: 'Wire 2S pack -> LM2596 -> ESP32 VIN.' },
    { id: 't_short', label: 'Zero shorts or overvoltage faults', done: !diagnostics.some((d) => d.severity === 'critical'), hint: 'Fix critical shorts or overvoltage rails.' },
    { id: 't_drv', label: 'DRV8833 powered & driving 2 motors', done: sensors.driverPowered && activeMotors >= 2, hint: 'Wire DRV8833 VM/GND, IN1-4, and OUT1-4.' },
    { id: 't_cap', label: 'Bulk 1000 uF capacitor on motor rail', done: !diagnostics.some((d) => d.id.startsWith('missing-cap')), hint: 'Add 1000 uF cap across DRV8833 VM & GND.' },
    { id: 't_imu', label: 'MPU6050 I2C wired (SDA/SCL + 3V3)', done: sensors.mpu6050Ready, hint: 'Wire 3V3, GND, GPIO32 (SDA), GPIO33 (SCL).' },
    { id: 't_us', label: 'HC-SR04 wired with 10k/10k divider', done: sensors.hcsr04Ready && sensors.hcsr04HasDivider, hint: 'Wire TRIG=13 and ECHO via two 10k resistors to GPIO35.' },
    { id: 't_cam', label: 'ESP32-CAM powered (enables Arena PiP)', done: sensors.camPowered, hint: 'Wire ESP32-CAM 5V and GND to 5.2 V rail.' },
    { id: 't_clean', label: 'All circuit checks clear', done: diagnostics.length === 0, hint: 'Clear all items in Circuit Checks.' },
  ];
}

/**
 * Resolves all electrical nets, wire cut lengths, power/mass/cost/CoM budgets,
 * sensor wiring, motor channels, bringup checklist, and plain-language diagnostics.
 */
export function analyzeCircuit(project: StudioProject): CircuitAnalysis {
  const { nets, pinToNet } = buildNets(project);
  const diagnostics: CircuitDiagnostic[] = [];
  const faultyComponentIds = new Set<string>();
  const compById = new Map(project.components.map((c) => [c.id, c]));

  checkPowerAndVoltage(nets, diagnostics, faultyComponentIds);
  checkPinRolesAndCommonGround(project, pinToNet, diagnostics);
  const sensors = resolveSensorsAndCheck(project, pinToNet, diagnostics);
  for (const over of overloadedPins(project)) {
    const comp = project.components.find((c) => c.id === over.ref.componentId);
    const label = comp ? (getPinSpec(comp.kind, over.ref.pinId)?.label ?? over.ref.pinId) : over.ref.pinId;
    diagnostics.push({
      id: `pin-overloaded-${over.ref.componentId}-${over.ref.pinId}`,
      severity: 'error',
      title: `${over.wireIds.length} jumpers on ${comp?.label ?? over.ref.componentId} ${label}`,
      detail: 'A 2.54 mm header pin takes one DuPont socket, so only one jumper fits; the others could not be plugged in on the real board.',
      fix: 'Keep one jumper on the pin, run it to a solder splice (Passives) and branch the other wires from the splice.',
      componentIds: comp ? [comp.id] : [],
    });
  }
  const motors = resolveMotors(project, pinToNet);
  const budget = computeBudget(project);

  const wireMetrics = new Map<string, WireMetric>();
  for (const w of project.wires) {
    wireMetrics.set(w.id, computeWireMetric(w, compById));
  }

  const checklist = buildChecklist(project, diagnostics, sensors, motors);
  const hasCriticalFault = diagnostics.some((d) => d.severity === 'critical');
  const hasError = diagnostics.some((d) => d.severity === 'error');

  return {
    nets,
    pinToNet,
    diagnostics,
    hasCriticalFault,
    hasError,
    faultyComponentIds,
    budget,
    sensors,
    motors,
    wireMetrics,
    checklist,
  };
}

/**
 * Converts virtual MCU GPIO PWM values (0..255) through the wired DRV8833 H-bridge
 * or 4-in-1 ESC channels into normalized motor drive outputs (-1..+1).
 */
export function resolveMotorDrives(
  analysis: CircuitAnalysis,
  pinPwm: ReadonlyMap<number, number>,
): MotorDriveOutput[] {
  return analysis.motors.map((m) => {
    if (!analysis.sensors.controllerPowered || !m.driverPowered || m.inPosGpio === null) {
      return { motorComponentId: m.motorComponentId, kind: m.kind, side: m.side, command: 0, pwmMagnitude: 0 };
    }
    if (m.kind === 'brushless') {
      const pwm = Math.max(0, Math.min(255, pinPwm.get(m.inPosGpio) ?? 0));
      return {
        motorComponentId: m.motorComponentId,
        kind: 'brushless',
        side: m.side,
        command: (pwm / 255) * m.polaritySign,
        pwmMagnitude: pwm,
      };
    }
    if (m.inNegGpio === null) {
      return { motorComponentId: m.motorComponentId, kind: 'dc', side: m.side, command: 0, pwmMagnitude: 0 };
    }
    const posPwm = Math.max(0, Math.min(255, pinPwm.get(m.inPosGpio) ?? 0));
    const negPwm = Math.max(0, Math.min(255, pinPwm.get(m.inNegGpio) ?? 0));
    const netPwm = (posPwm - negPwm) * m.polaritySign;
    return {
      motorComponentId: m.motorComponentId,
      kind: 'dc',
      side: m.side,
      command: netPwm / 255,
      pwmMagnitude: Math.abs(netPwm),
    };
  });
}
