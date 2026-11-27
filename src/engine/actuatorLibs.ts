/**
 * The Servo (ESP32Servo / Servo.h) and DHT (Adafruit DHT sensor library) classes a sketch can use, plus tone() and
 * noTone(). They behave like the real libraries where a sketch can tell the difference:
 * - Servo.write() takes an angle (values of 500 and up are taken as microseconds, as ESP32Servo does); pulses are
 *   544-2400 us by default; nothing moves before attach().
 * - DHT reads give NaN when the sensor does not answer (not wired, not powered, wrong type); readings are refreshed
 *   at most every 2 s, as the library does for the DHT22.
 */

/** Default pulse range of Servo.h and ESP32Servo. */
export const SERVO_MIN_US = 544;
export const SERVO_MAX_US = 2400;

/** Servo angle (0-180) for a pulse with the default range. */
export function servoAngleOf(us: number): number {
  return Math.max(0, Math.min(180, ((us - SERVO_MIN_US) / (SERVO_MAX_US - SERVO_MIN_US)) * 180));
}

export interface DhtReading {
  tempC: number;
  humidity: number;
  /** The sensor on that pin: 22 for a DHT22 / AM2302. */
  type: number;
}

export interface ActuatorHost {
  checkStop: () => void;
  nowMs: () => number;
  /** Shown once per run in the Serial tab. */
  hint: (text: string) => void;
  /** Throws for pins that cannot drive an output (GPIO34-39). */
  assertOutput: (pin: number, what: string) => void;
  setServoPulse: (pin: number, us: number | null) => void;
  setTone: (pin: number, freq: number, untilMs: number | null) => void;
  clearTone: (pin: number) => void;
  /** The DHT on this pin as wired and powered on the bench, or null if none answers there. */
  readDht: (pin: number) => DhtReading | null;
}

const num = (v: unknown, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

class SketchServo {
  private pin = -1;
  private minUs = SERVO_MIN_US;
  private maxUs = SERVO_MAX_US;
  private us = 1500;

  constructor(private readonly host: ActuatorHost) {}

  attach(pin: unknown, min?: unknown, max?: unknown): number {
    this.host.checkStop();
    const p = Math.trunc(num(pin, -1));
    this.host.assertOutput(p, 'Servo.attach()');
    this.pin = p;
    if (min !== undefined) this.minUs = Math.max(200, num(min, SERVO_MIN_US));
    if (max !== undefined) this.maxUs = Math.min(3000, Math.max(this.minUs + 100, num(max, SERVO_MAX_US)));
    return 0;
  }

  attached(): boolean {
    return this.pin >= 0;
  }

  detach(): void {
    if (this.pin >= 0) this.host.setServoPulse(this.pin, null);
    this.pin = -1;
  }

  setPeriodHertz(_hz: unknown): void {
    this.host.checkStop();
  }

  write(value: unknown): void {
    this.host.checkStop();
    const v = num(value);
    if (v >= 500) {
      this.writeMicroseconds(v);
      return;
    }
    const angle = Math.max(0, Math.min(180, v));
    this.writeMicroseconds(this.minUs + ((this.maxUs - this.minUs) * angle) / 180);
  }

  writeMicroseconds(value: unknown): void {
    this.host.checkStop();
    this.us = Math.max(this.minUs, Math.min(this.maxUs, num(value, 1500)));
    if (this.pin < 0) {
      this.host.hint('Servo: write() before attach() does nothing; call myservo.attach(pin) in setup() first.');
      return;
    }
    // the servo itself maps the pulse with the standard range, whatever range the sketch attached with
    this.host.setServoPulse(this.pin, this.us);
  }

  read(): number {
    return Math.round(((this.us - this.minUs) / (this.maxUs - this.minUs)) * 180);
  }

  readMicroseconds(): number {
    return Math.round(this.us);
  }
}

class SketchDht {
  private readonly pin: number;
  private readonly type: number;
  private began = false;
  private lastRead = -1e9;
  private last: { t: number; h: number } | null = null;

  constructor(
    private readonly host: ActuatorHost,
    pin: unknown,
    type: unknown,
  ) {
    this.pin = Math.trunc(num(pin, -1));
    this.type = Math.trunc(num(type, 22));
  }

  begin(_pullTimeUs?: unknown): void {
    this.host.checkStop();
    this.began = true;
  }

  /** One bus transaction (at most every 2 s; in between, the last reading is returned). */
  read(force?: unknown): boolean {
    this.host.checkStop();
    if (!this.began) this.host.hint('DHT: call dht.begin() in setup() before reading.');
    const now = this.host.nowMs();
    if (!force && now - this.lastRead < 2000 && this.lastRead > -1e9) return this.last !== null;
    this.lastRead = now;
    const r = this.host.readDht(this.pin);
    if (!r) {
      this.last = null;
      this.host.hint(`DHT: no answer on GPIO${this.pin}. Check that DATA is wired to GPIO${this.pin} and that VCC and GND are wired; the reading is NaN.`);
      return false;
    }
    if (r.type !== this.type && !(r.type === 22 && this.type === 21)) {
      this.last = null;
      this.host.hint(`DHT: the sensor on GPIO${this.pin} is a DHT${r.type}, but the sketch says DHT${this.type}; the reading is NaN. Use DHT${r.type} in the DHT declaration.`);
      return false;
    }
    // the DHT22 reports 0.1 C and 0.1 % steps, with a little noise
    const jitter = () => (Math.random() - 0.5) * 0.2;
    this.last = {
      t: Math.round((r.tempC + jitter()) * 10) / 10,
      h: Math.round(Math.max(0, Math.min(100, r.humidity + jitter() * 2)) * 10) / 10,
    };
    return true;
  }

  readTemperature(isFahrenheit?: unknown, force?: unknown): number {
    if (!this.read(force) || !this.last) return Number.NaN;
    return isFahrenheit ? this.last.t * 1.8 + 32 : this.last.t;
  }

  readHumidity(force?: unknown): number {
    if (!this.read(force) || !this.last) return Number.NaN;
    return this.last.h;
  }

  convertCtoF(c: unknown): number {
    return num(c) * 1.8 + 32;
  }

  convertFtoC(f: unknown): number {
    return (num(f) - 32) * 0.55555;
  }

  /** Heat index as the Adafruit library computes it (Rothfusz regression with its adjustments). */
  computeHeatIndex(temperature: unknown, humidity: unknown, isFahrenheit: unknown = true): number {
    const t = num(temperature, Number.NaN);
    const h = num(humidity, Number.NaN);
    const tf = isFahrenheit ? t : t * 1.8 + 32;
    let hi = 0.5 * (tf + 61.0 + (tf - 68.0) * 1.2 + h * 0.094);
    if (hi > 79) {
      hi = -42.379 + 2.04901523 * tf + 10.14333127 * h - 0.22475541 * tf * h - 0.00683783 * tf * tf - 0.05481717 * h * h + 0.00122874 * tf * tf * h + 0.00085282 * tf * h * h - 0.00000199 * tf * tf * h * h;
      if (h < 13 && tf >= 80 && tf <= 112) hi -= ((13 - h) * 0.25) * Math.sqrt((17 - Math.abs(tf - 95)) * 0.05882);
      else if (h > 85 && tf >= 80 && tf <= 87) hi += ((h - 85) * 0.1) * ((87 - tf) * 0.2);
    }
    return isFahrenheit ? hi : (hi - 32) * 0.55555;
  }
}

export function createActuatorLibraries(host: ActuatorHost) {
  return {
    Servo: () => new SketchServo(host),
    DHT: (pin: unknown, type: unknown, _count?: unknown) => new SketchDht(host, pin, type),
    tone: (pin: unknown, freq: unknown, durationMs?: unknown) => {
      host.checkStop();
      const p = Math.trunc(num(pin, -1));
      host.assertOutput(p, 'tone()');
      const f = Math.max(0, num(freq));
      if (f <= 0) {
        host.clearTone(p);
        return;
      }
      const d = durationMs === undefined ? 0 : num(durationMs);
      host.setTone(p, f, d > 0 ? host.nowMs() + d : null);
    },
    noTone: (pin: unknown) => {
      host.checkStop();
      host.clearTone(Math.trunc(num(pin, -1)));
    },
    constants: { DHT11: 11, DHT12: 12, DHT21: 21, DHT22: 22, AM2301: 21 },
  };
}
