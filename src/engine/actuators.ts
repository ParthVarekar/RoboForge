import { servoAngleOf } from './actuatorLibs';
import type { SensorWiringStatus } from './circuit';

/** What the servos, buzzers and relays on the bench are doing this frame. */
export interface ActuatorFrame {
  /** Commanded horn angle (0-180) of each servo that gets pulses and enough power; others hold where they are. */
  servoTargets: Map<string, number>;
  /** Pitch (Hz) of each buzzer that sounds. */
  buzzers: Map<string, number>;
  /** Relays whose coil is energised. */
  relaysOn: Set<string>;
}

export const EMPTY_ACTUATORS: ActuatorFrame = { servoTargets: new Map(), buzzers: new Map(), relaysOn: new Set() };

/** The KY-012's own pitch when its signal is simply HIGH. */
export const ACTIVE_BUZZER_HZ = 2300;

/**
 * Resolves the parts from the circuit (which GPIO each one is on, whether it is powered) and the sketch's outputs
 * (pin levels, servo pulses, tones). Nothing moves or sounds while the controller is unpowered.
 */
export function resolveActuators(
  sensors: SensorWiringStatus,
  pinPwm: ReadonlyMap<number, number>,
  servoPulses: ReadonlyMap<number, number>,
  tones: ReadonlyMap<number, number>,
): ActuatorFrame {
  const frame: ActuatorFrame = { servoTargets: new Map(), buzzers: new Map(), relaysOn: new Set() };
  if (!sensors.controllerPowered) return frame;
  const high = (gpio: number) => (pinPwm.get(gpio) ?? 0) >= 128;
  for (const s of sensors.servos) {
    if (!s.powered || s.gpio === null) continue;
    const us = servoPulses.get(s.gpio);
    if (us !== undefined) frame.servoTargets.set(s.componentId, servoAngleOf(us));
  }
  for (const b of sensors.buzzers) {
    if (!b.powered || b.gpio === null) continue;
    const tone = tones.get(b.gpio);
    if (tone !== undefined) frame.buzzers.set(b.componentId, tone);
    else if (high(b.gpio)) frame.buzzers.set(b.componentId, ACTIVE_BUZZER_HZ);
  }
  for (const r of sensors.relays) {
    if (r.powered && r.gpio !== null && high(r.gpio)) frame.relaysOn.add(r.componentId);
  }
  return frame;
}

/** Whether an LED switched by a relay contact is lit. */
export function relayLedLit(frame: ActuatorFrame, relay: { componentId: string; closedWhenOn: boolean }): boolean {
  return frame.relaysOn.has(relay.componentId) === relay.closedWhenOn;
}
