import { describe, expect, it } from 'vitest';
import {
  BAG_PASS_SKETCH,
  CALIBRATION_SWEEP_SKETCH,
  QUAD_SPIN_TEST_SKETCH,
  ROOM_MAPPING_SKETCH,
  TELEMETRY_SERIAL_SKETCH,
} from '../../catalog/presets';
import { transpileArduinoSketch } from '../sketchTranspiler';
import { VirtualEsp32Runtime, type SerialEntry } from '../runtime';

describe('Arduino sketch transpiler & VirtualEsp32Runtime', () => {
  it('compiles all five built-in sketch templates cleanly', () => {
    for (const code of [
      BAG_PASS_SKETCH,
      ROOM_MAPPING_SKETCH,
      QUAD_SPIN_TEST_SKETCH,
      CALIBRATION_SWEEP_SKETCH,
      TELEMETRY_SERIAL_SKETCH,
    ]) {
      const res = transpileArduinoSketch(code);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.hasSetup).toBe(true);
        expect(res.hasLoop).toBe(true);
      }
    }
  });

  it('executes setup() and loop(), drives PWM pins, reads ultrasonic & IMU, and logs to Serial', async () => {
    const logs: SerialEntry[] = [];
    const errors: string[] = [];

    const rt = new VirtualEsp32Runtime({
      isEsp32Powered: () => true,
      isMpuReady: () => true,
      isUltrasonicReady: (trig, echo) => trig === 13 && echo === 35,
      readUltrasonicCm: () => 42.5,
      readYawDeg: () => -3.5,
      readYawRateDegPerSec: () => 0.2,
      zeroYaw: () => {},
      onSerial: (e) => logs.push(e),
      onRuntimeError: (m) => errors.push(m),
    });

    const sketch = `
      const int L_FWD = 25;
      void setup() {
        Serial.begin(115200);
        pinMode(L_FWD, OUTPUT);
        imu.begin();
        float d = ultrasonicReadCm(13, 35);
        Serial.print("DIST=");
        Serial.println(d);
        analogWrite(L_FWD, 190);
      }
      void loop() {
        delay(20);
      }
    `;

    const started = rt.start(sketch);
    expect(started.ok).toBe(true);

    await new Promise((r) => setTimeout(r, 60));
    expect(rt.getPinPwmMap().get(25)).toBe(190);
    expect(logs.some((l) => l.text === 'DIST=42.5')).toBe(true);
    expect(errors).toHaveLength(0);

    rt.stop();
    await rt.waitUntilStopped();
    expect(rt.getPinPwmMap().size).toBe(0);
  });

  it('raises a runtime fault if code calls pinMode(35, OUTPUT) on an ESP32 input-only pin', async () => {
    const errors: string[] = [];
    const rt = new VirtualEsp32Runtime({
      isEsp32Powered: () => true,
      isMpuReady: () => true,
      isUltrasonicReady: () => true,
      readUltrasonicCm: () => 100,
      readYawDeg: () => 0,
      readYawRateDegPerSec: () => 0,
      zeroYaw: () => {},
      onSerial: () => {},
      onRuntimeError: (m) => errors.push(m),
    });

    rt.start(`void setup() { pinMode(35, OUTPUT); } void loop() {}`);
    await rt.waitUntilStopped();
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('input-only');
  });

  it('updates live 0.96" OLED text buffer and records 4-channel oscilloscope samples', async () => {
    let latestOled: string[] = [];
    const rt = new VirtualEsp32Runtime({
      isEsp32Powered: () => true,
      isMpuReady: () => true,
      isOledReady: () => true,
      isUltrasonicReady: () => true,
      readUltrasonicCm: () => 55,
      readYawDeg: () => 12.5,
      readYawRateDegPerSec: () => 0,
      zeroYaw: () => {},
      onOledUpdate: (lines) => {
        latestOled = lines;
      },
      onSerial: () => {},
      onRuntimeError: () => {},
    });

    rt.start(`
      void setup() {
        oled.clear();
        oled.println("ROBOFORGE");
        oled.println("OK 55cm");
        analogWrite(25, 180);
      }
      void loop() { delay(20); }
    `);
    await new Promise((r) => setTimeout(r, 60));
    rt.recordSignalSample();

    expect(latestOled).toEqual(['ROBOFORGE', 'OK 55cm']);
    expect(rt.getSignalHistory().length).toBeGreaterThanOrEqual(1);
    expect(rt.getSignalHistory()[0]?.pwm25).toBe(180);
    expect(rt.getSignalHistory()[0]?.distCm).toBe(55);

    rt.stop();
    await rt.waitUntilStopped();
  });

  it('transpiles typed C++ arrays, scalar casts, and object method calls without corrupting dot calls', async () => {
    const logs: SerialEntry[] = [];
    const errors: string[] = [];
    const rt = new VirtualEsp32Runtime({
      isEsp32Powered: () => true,
      isMpuReady: () => true,
      isUltrasonicReady: () => true,
      readUltrasonicCm: () => 50,
      readYawDeg: () => 0,
      readYawRateDegPerSec: () => 0,
      zeroYaw: () => {},
      onSerial: (e) => logs.push(e),
      onRuntimeError: (m) => errors.push(m),
    });

    const sketch = `
      int vals[] = {10, 20, 30};
      float buf[3];
      int begin(int x) { return x + 1; }
      void setup() {
        Serial.begin(115200);
        buf[0] = (float)begin(vals[1]) + 0.5f;
        Serial.println((int)buf[0]);
      }
    `;
    const started = rt.start(sketch);
    expect(started.ok).toBe(true);
    await rt.waitUntilStopped();
    expect(errors).toEqual([]);
    expect(logs.some((l) => l.text === '21')).toBe(true);
    expect(rt.isRunning()).toBe(false);
  });
});
