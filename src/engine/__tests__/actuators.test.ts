import { describe, expect, it } from 'vitest';
import { ACTUATOR_LAB_SKETCH, createPresetProject } from '../../catalog/presets';
import { servoAngleOf } from '../actuatorLibs';
import { relayLedLit, resolveActuators } from '../actuators';
import { analyzeCircuit } from '../circuit';
import { VirtualEsp32Runtime, type SerialEntry } from '../runtime';
import type { DhtReading } from '../actuatorLibs';
import { transpileArduinoSketch } from '../sketchTranspiler';

/** A runtime on a bench where only the given DHT answers. */
function bench(dht: (pin: number) => DhtReading | null = () => null) {
  const logs: SerialEntry[] = [];
  const errors: string[] = [];
  const rt = new VirtualEsp32Runtime({
    isEsp32Powered: () => true,
    isMpuReady: () => false,
    isUltrasonicReady: () => false,
    readUltrasonicCm: () => null,
    readYawDeg: () => 0,
    readYawRateDegPerSec: () => 0,
    zeroYaw: () => {},
    readDht: dht,
    onSerial: (e) => logs.push(e),
    onRuntimeError: (m) => errors.push(m),
  });
  return { rt, logs, errors };
}

const settle = (ms = 80) => new Promise((r) => setTimeout(r, ms));

describe('servo, buzzer, relay and DHT22 in sketches', () => {
  it('translates the usual ESP32Servo and DHT sketches without warnings', () => {
    const res = transpileArduinoSketch(`
      #include <ESP32Servo.h>
      #include <DHT.h>
      #define DHTPIN 4
      #define DHTTYPE DHT22
      Servo myservo;
      DHT dht(DHTPIN, DHTTYPE);
      void setup() {
        ESP32PWM::allocateTimer(0);
        myservo.setPeriodHertz(50);
        myservo.attach(18, 500, 2400);
        dht.begin();
      }
      void loop() {
        float t = dht.readTemperature();
        if (isnan(t)) return;
        myservo.write(map(t, 0, 40, 0, 180));
        tone(19, 2000, 100);
        delay(2000);
      }
    `);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.warnings).toEqual([]);
  });

  it('reports a member the Servo class does not have', () => {
    const res = transpileArduinoSketch('Servo s;\nvoid setup() { s.attach(18); s.turn(90); }\nvoid loop() {}');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain("'s' has no member named 'turn'");
  });

  it('sends servo pulses for write() and writeMicroseconds(), and nothing before attach()', async () => {
    const { rt, logs, errors } = bench();
    const ok = rt.start(`
      Servo a;
      Servo b;
      void setup() {
        b.write(45);
        a.attach(18);
        a.write(90);
        b.attach(19);
        b.writeMicroseconds(2400);
        Serial.println(a.read());
      }
      void loop() { delay(50); }
    `);
    expect(ok.ok).toBe(true);
    await settle();
    expect(servoAngleOf(rt.getServoPulses().get(18)!)).toBeCloseTo(90, 0);
    expect(servoAngleOf(rt.getServoPulses().get(19)!)).toBeCloseTo(180, 0);
    expect(logs.some((l) => l.text === '90')).toBe(true);
    expect(logs.some((l) => l.text.includes('write() before attach()'))).toBe(true);
    expect(errors).toEqual([]);
    rt.stop();
    await rt.waitUntilStopped();
    expect(rt.getServoPulses().size).toBe(0);
  });

  it('refuses a servo on an input-only pin', async () => {
    const { rt, errors } = bench();
    rt.start('Servo s;\nvoid setup() { s.attach(34); }\nvoid loop() { delay(50); }');
    await settle();
    expect(errors[0]).toContain('GPIO34 is input-only');
  });

  it('keeps a timed tone() for its duration and stops it with noTone()', async () => {
    const { rt } = bench();
    rt.start(`
      void setup() {
        tone(19, 2500, 60);
        tone(21, 1000);
      }
      void loop() {
        delay(150);
        noTone(21);
      }
    `);
    await settle(20);
    expect(rt.getActiveTones().get(19)).toBe(2500);
    expect(rt.getActiveTones().get(21)).toBe(1000);
    await settle(220);
    expect(rt.getActiveTones().has(19)).toBe(false);
    expect(rt.getActiveTones().has(21)).toBe(false);
    rt.stop();
    await rt.waitUntilStopped();
  });

  it('reads the DHT22 that answers on the pin, and NaN with a hint when none does or the type is wrong', async () => {
    const { rt, logs } = bench((pin) => (pin === 4 ? { tempC: 24.5, humidity: 41, type: 22 } : null));
    rt.start(`
      DHT good(4, DHT22);
      DHT missing(5, DHT22);
      DHT wrong(4, DHT11);
      void setup() {
        good.begin(); missing.begin(); wrong.begin();
        float t = good.readTemperature();
        float h = good.readHumidity();
        Serial.println(t, 1);
        Serial.println(h, 0);
        Serial.println(isnan(missing.readTemperature()) ? "nan" : "number");
        Serial.println(isnan(wrong.readHumidity()) ? "nan" : "number");
        Serial.println(good.readTemperature(true), 0);
      }
      void loop() { delay(50); }
    `);
    await settle();
    const lines = logs.map((l) => l.text);
    const t = Number(lines.find((x) => /^2[0-9]\.\d$/.test(x)));
    expect(t).toBeGreaterThan(24.3);
    expect(t).toBeLessThan(24.7);
    expect(lines).toContain('41');
    expect(lines.filter((x) => x === 'nan')).toHaveLength(2);
    expect(lines).toContain('76');
    expect(lines.some((x) => x.includes('no answer on GPIO5'))).toBe(true);
    expect(lines.some((x) => x.includes('is a DHT22, but the sketch says DHT11'))).toBe(true);
    rt.stop();
    await rt.waitUntilStopped();
  });
});

describe('actuator wiring on the bench', () => {
  it('finds every part of the Actuator Lab on its GPIO, powered, with no circuit problems', () => {
    const project = createPresetProject('actuator_lab');
    const a = analyzeCircuit(project);
    expect(a.diagnostics).toEqual([]);
    expect(a.sensors.servos).toEqual([{ componentId: 'servo_1', kind: 'servo_sg90', gpio: 18, powered: true }]);
    expect(a.sensors.buzzers).toEqual([{ componentId: 'buzzer_1', gpio: 19, powered: true }]);
    expect(a.sensors.relays).toEqual([{ componentId: 'relay_1', gpio: 23, powered: true }]);
    expect(a.sensors.dhts).toEqual([{ componentId: 'dht_1', gpio: 4, powered: true, pullUp: true }]);
    expect(a.sensors.ledPins[0]?.relay).toEqual({ componentId: 'relay_1', closedWhenOn: true });
    const t = transpileArduinoSketch(ACTUATOR_LAB_SKETCH);
    expect(t.ok && t.warnings).toEqual([]);
  });

  it('turns pin levels, pulses and tones into servo angles, sound and relay state', () => {
    const { sensors } = analyzeCircuit(createPresetProject('actuator_lab'));
    const frame = resolveActuators(sensors, new Map([[23, 255], [19, 255]]), new Map([[18, 1472]]), new Map());
    expect(frame.servoTargets.get('servo_1')).toBeCloseTo(90, 0);
    expect(frame.buzzers.get('buzzer_1')).toBe(2300);
    expect(frame.relaysOn.has('relay_1')).toBe(true);
    expect(relayLedLit(frame, { componentId: 'relay_1', closedWhenOn: true })).toBe(true);
    expect(relayLedLit(frame, { componentId: 'relay_1', closedWhenOn: false })).toBe(false);
    const toned = resolveActuators(sensors, new Map(), new Map(), new Map([[19, 1000]]));
    expect(toned.buzzers.get('buzzer_1')).toBe(1000);
    expect(toned.relaysOn.size).toBe(0);
    // nothing happens while the controller has no power
    const dead = resolveActuators({ ...sensors, controllerPowered: false }, new Map([[23, 255]]), new Map([[18, 1500]]), new Map());
    expect(dead.servoTargets.size + dead.buzzers.size + dead.relaysOn.size).toBe(0);
  });

  it('warns when the servo or the relay coil runs from 3.3 V, and when the DHT22 has no pull-up', () => {
    const project = createPresetProject('actuator_lab');
    const swap = (wireId: string, componentId: string, pinId: string) => {
      const w = project.wires.find((x) => x.id === wireId)!;
      w.from = { componentId, pinId };
    };
    // servo and relay VCC from the 3V3 splice instead of 5 V; pull-up resistor removed
    swap('a7', 'sp_3v3', 'J');
    swap('a13', 'sp_3v3', 'J');
    project.wires = project.wires.filter((w) => w.id !== 'a22' && w.id !== 'a23');
    const a = analyzeCircuit(project);
    const ids = a.diagnostics.map((d) => d.id);
    expect(ids).toContain('servo-low-supply-servo_1');
    expect(ids).toContain('relay-low-supply-relay_1');
    expect(ids).toContain('dht-no-pullup-dht_1');
    expect(a.sensors.servos[0]?.powered).toBe(false);
    expect(a.sensors.relays[0]?.powered).toBe(false);
    expect(a.sensors.dhts[0]).toMatchObject({ powered: true, pullUp: false });
  });

  it('refuses a servo signal on an input-only pin', () => {
    const project = createPresetProject('actuator_lab');
    project.wires.find((x) => x.id === 'a9')!.from = { componentId: 'esp32_1', pinId: 'GPIO34' };
    const a = analyzeCircuit(project);
    expect(a.diagnostics.find((d) => d.id === 'servo_sg90-input-only-servo_1')?.severity).toBe('error');
    expect(a.sensors.servos[0]?.gpio).toBeNull();
  });
});
