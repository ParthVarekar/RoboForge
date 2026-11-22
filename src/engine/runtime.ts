import { SKETCH_SOURCE_URL, transpileArduinoSketch, type SketchProblem } from './sketchTranspiler';

export type PinModeValue = 'INPUT' | 'OUTPUT' | 'INPUT_PULLUP';

export interface SerialEntry {
  id: number;
  timeMs: number;
  text: string;
  level: 'info' | 'warn' | 'error' | 'rx';
}

export interface SignalSample {
  timeMs: number;
  pwm25: number;
  pwm27: number;
  distCm: number;
  yawDeg: number;
}

export interface HardwareEnvironmentHooks {
  isEsp32Powered: () => boolean;
  isMpuReady: () => boolean;
  isOledReady?: () => boolean;
  isUltrasonicReady: (trigPin: number, echoPin: number) => boolean;
  readUltrasonicCm: () => number | null;
  readYawDeg: () => number;
  readYawRateDegPerSec: () => number;
  zeroYaw: () => void;
  readExternalPinHigh?: (pin: number) => boolean;
  onOledUpdate?: (lines: string[]) => void;
  onSerial: (entry: SerialEntry) => void;
  /** A fault while the sketch runs; `line` is the sketch line when it can be found from the stack. */
  onRuntimeError: (message: string, line?: number) => void;
  onRunningChange?: (running: boolean) => void;
  clock?: {
    nowMs: () => number;
    sleep: (ms: number, isStopped: () => boolean) => Promise<void>;
  };
  /** Stop a loop that runs this long (real time) without delay()/yield(). Default 8000 ms. */
  watchdogMs?: number;
}

export type StartResult =
  | { ok: true; warnings: SketchProblem[] }
  | { ok: false; error: string; line?: number; problems: SketchProblem[] };

const INPUT_ONLY_PINS = new Set([34, 35, 36, 39]);

class StopSignal extends Error {
  constructor() {
    super('STOP_SIGNAL');
  }
}

class WatchdogError extends Error {
  constructor(line: number | undefined, seconds: number) {
    super(
      `watchdog: the loop${line ? ` on line ${line}` : ''} ran for ${seconds} s without delay() or yield(), so the simulator stopped the sketch. Add a delay() inside long-running loops.`,
    );
  }
}

let wrapperOffset: number | null = null;

/**
 * Lines the engine adds in front of code built with new Function (the "function anonymous(...) {" header), measured
 * once so stack-trace line numbers can be mapped back to sketch lines on any browser.
 */
function functionWrapperOffset(): number {
  if (wrapperOffset !== null) return wrapperOffset;
  wrapperOffset = 0;
  try {
    (new Function('__hal', '"use strict";\nthrow new Error("probe");\n//# sourceURL=__roboforge_probe.js') as (h: unknown) => void)(null);
  } catch (err) {
    const m = /__roboforge_probe\.js:(\d+)/.exec(err instanceof Error ? (err.stack ?? '') : '');
    if (m) wrapperOffset = Number(m[1]) - 2;
  }
  return wrapperOffset;
}

const SKETCH_FRAME = new RegExp(`${SKETCH_SOURCE_URL.split('.').join('\\.')}:(\\d+):\\d+`);

/** Sketch line of the innermost sketch frame in an error's stack, if there is one. */
function sketchLineOf(err: unknown, lineOffset: number): number | undefined {
  const m = SKETCH_FRAME.exec(err instanceof Error ? (err.stack ?? '') : '');
  if (!m) return undefined;
  const line = Number(m[1]) - functionWrapperOffset() - lineOffset;
  return line >= 1 ? line : undefined;
}

/** JavaScript error text in the words a C++ programmer expects. */
function friendlyRuntimeMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const undef = /^(\w+) is not defined$/.exec(msg);
  if (undef) return `'${undef[1]}' was not declared in this scope`;
  const notFn = /^(.+) is not a function$/.exec(msg);
  if (notFn) return `'${notFn[1]}' is not a function`;
  if (/Assignment to constant variable/.test(msg)) return 'assignment to a const variable';
  return msg;
}

/**
 * In-browser virtual ESP32/FC HAL runtime executing transpiled sketches against live
 * GPIO/PWM registers, serial console buffers, 0.96" OLED frame buffer, tactile button inputs,
 * oscilloscope signal samples, and wired sensor hooks.
 */
export class VirtualEsp32Runtime {
  private pinModes = new Map<number, PinModeValue>();
  private pinPwm = new Map<number, number>();
  private running = false;
  private stopRequested = false;
  private startPerfMs = 0;
  private serialSeq = 1;
  private serialRxQueue: string[] = [];
  private serialLineBuf = '';
  private oledLines: string[] = ['ROBOFORGE', 'READY'];
  private oledCurLine = '';
  private signalHistory: SignalSample[] = [];
  private lastSampleMs = -100;
  private guardTicks = 0;
  private lastYieldReal = 0;
  private lastPauseReal = 0;
  private lineOffset = 2;
  private ledcChannels = new Map<number, number>();
  private loopPromise: Promise<void> | null = null;
  private readonly hooks: HardwareEnvironmentHooks;

  constructor(hooks: HardwareEnvironmentHooks) {
    this.hooks = hooks;
  }

  /**
   * Returns a read-only snapshot of all GPIO PWM values (0..255).
   */
  public getPinPwmMap(): ReadonlyMap<number, number> {
    return this.pinPwm;
  }

  /**
   * Returns the rolling time-series signal history for the live oscilloscope plotter.
   */
  public getSignalHistory(): readonly SignalSample[] {
    return this.signalHistory;
  }

  /**
   * Returns the current text lines displayed on the virtual 0.96" OLED I2C display.
   */
  public getOledLines(): readonly string[] {
    return this.oledLines;
  }

  /**
   * Returns whether the sketch loop is currently executing.
   */
  public isRunning(): boolean {
    return this.running;
  }

  /**
   * Queues an incoming serial command line for `Serial.available()` / `Serial.readStringUntil()`.
   */
  public pushSerialInput(line: string): void {
    this.serialRxQueue.push(line);
    this.emitSerial(`> ${line}`, 'rx');
  }

  /**
   * Appends a telemetry sample to the oscilloscope ring buffer (throttled to ~25 Hz).
   */
  private nowMs(): number {
    return this.hooks.clock ? this.hooks.clock.nowMs() : performance.now();
  }

  public recordSignalSample(): void {
    if (!this.running) return;
    const now = Math.max(0, Math.round(this.nowMs() - this.startPerfMs));
    if (now - this.lastSampleMs < 40) return;
    this.lastSampleMs = now;
    const dist = this.hooks.readUltrasonicCm();
    this.signalHistory.push({
      timeMs: now,
      pwm25: this.pinPwm.get(25) ?? 0,
      pwm27: this.pinPwm.get(27) ?? 0,
      distCm: dist !== null ? Math.min(200, Math.max(0, dist)) : 0,
      yawDeg: this.hooks.readYawDeg(),
    });
    if (this.signalHistory.length > 220) {
      this.signalHistory.shift();
    }
  }

  /**
   * Compiles and starts running an Arduino/ESP32 sketch asynchronously.
   */
  public start(source: string): StartResult {
    this.stop();
    const compiled = transpileArduinoSketch(source);
    if (!compiled.ok) {
      return { ok: false, error: compiled.message, line: compiled.line, problems: compiled.problems };
    }
    this.lineOffset = compiled.lineOffset;
    this.ledcChannels.clear();

    this.pinModes.clear();
    this.pinPwm.clear();
    this.serialLineBuf = '';
    this.oledLines = [];
    this.oledCurLine = '';
    this.signalHistory = [];
    this.lastSampleMs = -100;
    this.stopRequested = false;
    this.running = true;
    this.hooks.onRunningChange?.(true);
    this.startPerfMs = this.nowMs();
    this.guardTicks = 0;
    this.lastYieldReal = performance.now();
    this.lastPauseReal = this.lastYieldReal;

    const hal = this.createHal();
    let exportsObj: { setup: (() => Promise<void>) | null; loop: (() => Promise<void>) | null };
    try {
      const factory = new Function('__hal', compiled.jsSource) as (
        h: typeof hal,
      ) => { setup: (() => Promise<void>) | null; loop: (() => Promise<void>) | null };
      exportsObj = factory(hal);
    } catch (err) {
      this.running = false;
      this.hooks.onRunningChange?.(false);
      const msg = friendlyRuntimeMessage(err);
      const line = sketchLineOf(err, this.lineOffset);
      this.hooks.onRuntimeError(msg, line);
      const problem: SketchProblem = { line: line ?? 1, column: 1, message: msg, severity: 'error' };
      return { ok: false, error: line ? `Line ${line}: ${msg}` : msg, line, problems: [problem] };
    }

    this.loopPromise = this.runLifecycle(exportsObj.setup, exportsObj.loop);
    return { ok: true, warnings: compiled.warnings };
  }

  /**
   * Immediately halts execution and zeroes all GPIO PWM outputs.
   */
  public stop(): void {
    this.stopRequested = true;
    this.running = false;
    this.pinPwm.clear();
    this.hooks.onRunningChange?.(false);
  }

  /**
   * Waits for the currently executing async loop task to settle (used primarily in tests).
   */
  public async waitUntilStopped(): Promise<void> {
    if (this.loopPromise) {
      await this.loopPromise;
    }
  }

  private async runLifecycle(
    setupFn: (() => Promise<void>) | null,
    loopFn: (() => Promise<void>) | null,
  ): Promise<void> {
    try {
      if (!this.hooks.isEsp32Powered()) {
        this.emitSerial('Controller unpowered: connect regulated power & common GND.', 'warn');
        this.running = false;
        this.hooks.onRunningChange?.(false);
        return;
      }
      if (setupFn) await setupFn();
      while (!this.stopRequested && loopFn) {
        if (!this.hooks.isEsp32Powered()) {
          this.emitSerial('Controller power lost — MCU halted.', 'error');
          break;
        }
        await loopFn();
        // the board's loop task pauses between loop() calls, which also feeds the watchdog
        this.lastPauseReal = performance.now();
        await this.sleep(16);
      }
    } catch (err) {
      if (!(err instanceof StopSignal)) {
        const msg = friendlyRuntimeMessage(err);
        const line = sketchLineOf(err, this.lineOffset);
        this.emitSerial(`Runtime fault${line ? ` (line ${line})` : ''}: ${msg}`, 'error');
        this.hooks.onRuntimeError(msg, line);
      }
    } finally {
      this.running = false;
      this.pinPwm.clear();
      this.hooks.onRunningChange?.(false);
    }
  }

  private emitSerial(text: string, level: SerialEntry['level'] = 'info'): void {
    this.hooks.onSerial({
      id: this.serialSeq++,
      timeMs: Math.round(this.nowMs() - this.startPerfMs),
      text,
      level,
    });
  }

  private sleep(ms: number): Promise<void> {
    if (this.stopRequested) return Promise.reject(new StopSignal());
    if (this.hooks.clock) {
      return this.hooks.clock.sleep(ms, () => this.stopRequested).then(() => {
        if (this.stopRequested) throw new StopSignal();
      });
    }
    const clamped = Math.max(0, Math.min(30_000, ms));
    return new Promise((resolve, reject) => {
      const start = performance.now();
      const step = () => {
        if (this.stopRequested) {
          reject(new StopSignal());
          return;
        }
        if (performance.now() - start >= clamped) {
          resolve();
          return;
        }
        setTimeout(step, Math.min(15, Math.max(1, clamped - (performance.now() - start))));
      };
      setTimeout(step, Math.min(15, clamped));
    });
  }

  private createHal() {
    const checkStop = () => {
      if (this.stopRequested) throw new StopSignal();
    };

    const writePwm = (pin: number, value: number) => {
      checkStop();
      if (INPUT_ONLY_PINS.has(pin)) {
        throw new Error(`GPIO${pin} is input-only on ESP32 and cannot drive output.`);
      }
      const clamped = Math.max(0, Math.min(255, Math.round(value)));
      this.pinPwm.set(pin, clamped);
    };

    /** Arduino-style printing: HEX/BIN/OCT/DEC for whole numbers, decimal places otherwise; bools print 1/0. */
    const formatValue = (val: unknown, format?: number): string => {
      if (typeof val === 'number' && typeof format === 'number') {
        if (Number.isInteger(val) && (format === 2 || format === 8 || format === 16)) return (val >>> 0).toString(format).toUpperCase();
        if (Number.isInteger(val) && format === 10) return String(val);
        return val.toFixed(Math.max(0, Math.min(10, Math.round(format))));
      }
      if (typeof val === 'boolean') return val ? '1' : '0';
      return String(val);
    };
    /** delay()/yield(): sleeps and restarts the watchdog window. */
    const userPause = (ms: number) => {
      this.lastPauseReal = performance.now();
      return this.sleep(ms).then(() => {
        this.lastPauseReal = performance.now();
      });
    };
    const watchdogMs = this.hooks.watchdogMs ?? 8000;

    return {
      OUTPUT: 'OUTPUT' as PinModeValue,
      INPUT: 'INPUT' as PinModeValue,
      INPUT_PULLUP: 'INPUT_PULLUP' as PinModeValue,
      HIGH: 1,
      LOW: 0,
      PI: Math.PI,
      LED_BUILTIN: 2,
      BIN: 2,
      OCT: 8,
      DEC: 10,
      HEX: 16,
      pinMode: (pin: number, mode: PinModeValue) => {
        checkStop();
        if (mode === 'OUTPUT' && INPUT_ONLY_PINS.has(pin)) {
          throw new Error(`pinMode(GPIO${pin}, OUTPUT) invalid: GPIO34–39 are input-only on ESP32.`);
        }
        this.pinModes.set(pin, mode);
      },
      digitalWrite: (pin: number, val: number | boolean) => writePwm(pin, val ? 255 : 0),
      digitalRead: (pin: number) => {
        checkStop();
        if (this.hooks.readExternalPinHigh?.(pin)) return 1;
        return (this.pinPwm.get(pin) ?? 0) >= 128 ? 1 : 0;
      },
      analogWrite: (pin: number, pwm: number) => writePwm(pin, pwm),
      ledcWrite: (pinOrChannel: number, pwm: number) => writePwm(this.ledcChannels.get(pinOrChannel) ?? pinOrChannel, pwm),
      ledcSetup: (_channel: number, freq: number, _bits: number) => freq,
      ledcAttachPin: (pin: number, channel: number) => {
        checkStop();
        this.ledcChannels.set(channel, pin);
      },
      ledcAttach: (_pin: number, _freq: number, _bits: number) => true,
      millis: () => Math.max(0, Math.round(this.nowMs() - this.startPerfMs)),
      micros: () => Math.max(0, Math.round((this.nowMs() - this.startPerfMs) * 1000)),
      delay: (ms: number) => userPause(ms),
      delayMicroseconds: (us: number) => userPause(Math.ceil(Math.max(0, us) / 1000)),
      yieldTask: () => userPause(0),
      /**
       * Called from every loop condition. Every 64 passes it looks at the clock: it gives the page a moment every
       * ~12 ms (so a busy loop never freezes the tab) and stops a loop that ran watchdogMs without delay().
       */
      guard: async (line?: number) => {
        checkStop();
        this.guardTicks += 1;
        if ((this.guardTicks & 63) !== 0) return;
        const now = performance.now();
        if (now - this.lastPauseReal > watchdogMs) throw new WatchdogError(line, Math.round(watchdogMs / 1000));
        if (now - this.lastYieldReal >= 12) {
          this.lastYieldReal = now;
          await this.sleep(0);
        }
      },
      ultrasonicReadCm: (trigPin: number, echoPin: number): number => {
        checkStop();
        if (!this.hooks.isUltrasonicReady(trigPin, echoPin)) return -1;
        const dist = this.hooks.readUltrasonicCm();
        return dist === null ? -1 : Number(dist.toFixed(1));
      },
      pulseIn: (echoPin: number, _state: number): number => {
        checkStop();
        if (!this.hooks.isUltrasonicReady(-1, echoPin)) return 0;
        const dist = this.hooks.readUltrasonicCm();
        return dist === null ? 0 : Math.round(dist * 58.2);
      },
      abs: Math.abs,
      min: Math.min,
      max: Math.max,
      sq: (x: number) => x * x,
      sqrt: Math.sqrt,
      pow: Math.pow,
      sin: Math.sin,
      cos: Math.cos,
      tan: Math.tan,
      isnan: (x: number) => Number.isNaN(x),
      atan2: Math.atan2,
      hypot: Math.hypot,
      fmod: (a: number, b: number) => a % b,
      floor: Math.floor,
      ceil: Math.ceil,
      round: Math.round,
      random: (a: number, b?: number) =>
        b === undefined ? Math.floor(Math.random() * a) : Math.floor(a + Math.random() * (b - a)),
      randomSeed: (_seed: number) => undefined,
      bitRead: (x: number, n: number) => (x >>> n) & 1,
      bitSet: (x: number, n: number) => x | (1 << n),
      bitClear: (x: number, n: number) => x & ~(1 << n),
      bitWrite: (x: number, n: number, b: number) => (b ? x | (1 << n) : x & ~(1 << n)),
      highByte: (x: number) => (x >>> 8) & 0xff,
      lowByte: (x: number) => x & 0xff,
      toInt: (str: unknown) => {
        const n = parseInt(String(str).trim(), 10);
        return Number.isNaN(n) ? 0 : n;
      },
      toFloat: (str: unknown) => {
        const n = parseFloat(String(str).trim());
        return Number.isNaN(n) ? 0 : n;
      },
      strEquals: (a: unknown, b: unknown) => String(a) === String(b),
      strEqualsIgnoreCase: (a: unknown, b: unknown) => String(a).toLowerCase() === String(b).toLowerCase(),
      radians: (deg: number) => (deg * Math.PI) / 180,
      degrees: (rad: number) => (rad * 180) / Math.PI,
      constrain: (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x)),
      map: (x: number, inMin: number, inMax: number, outMin: number, outMax: number) =>
        ((x - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin,
      Serial: {
        begin: (baud: number) => this.emitSerial(`Serial ready at ${baud} baud.`, 'info'),
        print: (val: unknown, format?: number) => {
          this.serialLineBuf += formatValue(val, format);
        },
        println: (val: unknown = '', format?: number) => {
          const line = this.serialLineBuf + formatValue(val, format);
          this.serialLineBuf = '';
          this.emitSerial(line, 'info');
        },
        available: () => this.serialRxQueue.length,
        readStringUntil: (_delim = '\n') => this.serialRxQueue.shift() ?? '',
      },
      imu: {
        begin: () => {
          if (!this.hooks.isMpuReady()) {
            this.emitSerial('MPU6050 not detected — check VCC, GND, SDA, and SCL wiring.', 'warn');
            return false;
          }
          this.hooks.zeroYaw();
          this.emitSerial('MPU6050 ready (yaw zeroed).', 'info');
          return true;
        },
        readYawDeg: () => (this.hooks.isMpuReady() ? this.hooks.readYawDeg() : 0),
        readYawRate: () => (this.hooks.isMpuReady() ? this.hooks.readYawRateDegPerSec() : 0),
        zero: () => {
          if (this.hooks.isMpuReady()) this.hooks.zeroYaw();
        },
        ready: () => this.hooks.isMpuReady(),
      },
      oled: {
        clear: () => {
          this.oledLines = [];
          this.oledCurLine = '';
          if (this.hooks.isOledReady?.() !== false) this.hooks.onOledUpdate?.([]);
        },
        print: (val: unknown, format?: number) => {
          this.oledCurLine += formatValue(val, format);
        },
        println: (val: unknown = '', format?: number) => {
          const line = this.oledCurLine + formatValue(val, format);
          this.oledCurLine = '';
          this.oledLines = [...this.oledLines.slice(-4), line];
          if (this.hooks.isOledReady?.() !== false) this.hooks.onOledUpdate?.(this.oledLines);
        },
      },
    };
  }
}
