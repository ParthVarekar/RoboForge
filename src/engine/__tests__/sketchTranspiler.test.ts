import { describe, expect, it } from 'vitest';
import { SKETCH_TEMPLATES, STUDIO_PRESETS, createPresetProject } from '../../catalog/presets';
import { VirtualEsp32Runtime, type SerialEntry } from '../runtime';
import { transpileArduinoSketch, type TranspileError } from '../sketchTranspiler';

interface Run {
  logs: string[];
  errors: Array<{ message: string; line?: number }>;
  rt: VirtualEsp32Runtime;
}

function makeRuntime(watchdogMs = 8000): Run {
  const logs: string[] = [];
  const errors: Array<{ message: string; line?: number }> = [];
  const rt = new VirtualEsp32Runtime({
    isEsp32Powered: () => true,
    isMpuReady: () => true,
    isUltrasonicReady: () => true,
    readUltrasonicCm: () => 50,
    readYawDeg: () => 0,
    readYawRateDegPerSec: () => 0,
    zeroYaw: () => {},
    onSerial: (e: SerialEntry) => logs.push(e.text),
    onRuntimeError: (message, line) => errors.push({ message, line }),
    watchdogMs,
  });
  return { logs, errors, rt };
}

/** Runs setup() (and loop() until `ms`), then stops. */
async function run(source: string, ms = 0, watchdogMs = 8000): Promise<Run> {
  const r = makeRuntime(watchdogMs);
  const started = r.rt.start(source);
  if (!started.ok) throw new Error(started.error);
  if (ms > 0) {
    await new Promise((res) => setTimeout(res, ms));
    r.rt.stop();
  }
  await r.rt.waitUntilStopped();
  return r;
}

function problemsOf(source: string): TranspileError {
  const res = transpileArduinoSketch(source);
  if (res.ok) throw new Error('expected the sketch to fail');
  return res;
}

describe('sketch translation keeps lines and strings intact', () => {
  it('maps every sketch line to the same line of the generated body', () => {
    const src = [
      '#include <Wire.h>',
      '',
      '/* block',
      '   comment */',
      'const int LED = 2;   // trailing comment',
      '',
      'void blink(int times,',
      '           int ms) {',
      '  for (int i = 0; i < times; i++) {',
      '    digitalWrite(LED, HIGH);',
      '    delay(ms);',
      '  }',
      '}',
      '',
      'void setup() { pinMode(LED, OUTPUT); }',
      'void loop() { blink(2, 10); }',
    ].join('\n');
    const res = transpileArduinoSketch(src);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const body = res.jsSource.split('\n').slice(res.lineOffset, res.lineOffset + src.split('\n').length);
    expect(body).toHaveLength(src.split('\n').length);
    expect(body[9]).toContain('digitalWrite(LED, HIGH)');
    expect(body[10]).toContain('await __hal.delay(ms)');
    expect(body[15]).toContain('await blink(2, 10)');
  });

  it('never rewrites text inside strings', async () => {
    const r = await run(`void setup() { Serial.println("for (;;) while (x) int y = 5; // not a comment /* nor this */"); }`);
    expect(r.errors).toEqual([]);
    expect(r.logs).toContain('for (;;) while (x) int y = 5; // not a comment /* nor this */');
  });

  it('compiles every example sketch and every preset sketch with no problems or warnings', () => {
    const sources = [...SKETCH_TEMPLATES.map((t) => t.code), ...STUDIO_PRESETS.map((p) => createPresetProject(p.id).code)];
    for (const code of sources) {
      const res = transpileArduinoSketch(code);
      if (!res.ok) throw new Error(`${res.message}\n${code.split('\n')[(res.line ?? 1) - 1] ?? ''}`);
      expect(res.warnings).toEqual([]);
    }
  });
});

describe('compile errors point at the right line and column', () => {
  it("reports a missing ';' on the line that lacks it", () => {
    const res = problemsOf(['void setup() {', '  pinMode(2, OUTPUT);', '  digitalWrite(2, HIGH)', '  delay(10);', '}'].join('\n'));
    expect(res.problems[0]).toMatchObject({ line: 3, message: "expected ';' at the end of this line" });
  });

  it('reports an undeclared function with a suggestion', () => {
    const res = problemsOf('void setup() {\n  digitalWrit(2, HIGH);\n}');
    expect(res.problems[0]).toMatchObject({ line: 2, column: 3 });
    expect(res.problems[0]?.message).toContain("'digitalWrit' was not declared in this scope");
    expect(res.problems[0]?.message).toContain("did you mean 'digitalWrite'");
  });

  it('reports a member the object does not have', () => {
    const res = problemsOf('void setup() {\n  Serial.prinln("x");\n}');
    expect(res.problems[0]?.line).toBe(2);
    expect(res.problems[0]?.message).toContain("'Serial' has no member named 'prinln'");
    expect(res.problems[0]?.message).toContain("'println'");
  });

  it('explains calls the simulator does not model', () => {
    expect(problemsOf('void setup() {\n  int v = analogRead(34);\n}').problems[0]?.message).toContain("'analogRead' is not available in the simulator");
  });

  it('flags unsupported C++ plainly', () => {
    expect(problemsOf('class Motor {};\nvoid setup() {}').problems[0]?.message).toContain('classes are not supported');
    expect(problemsOf('int *p;\nvoid setup() {}').problems[0]?.message).toContain('pointers are not supported');
  });

  it('flags statements outside any function', () => {
    const res = problemsOf('pinMode(2, OUTPUT);\nvoid setup() {}');
    expect(res.problems[0]).toMatchObject({ line: 1, message: 'this statement is outside any function: move it into setup() or loop()' });
  });

  it('points an unclosed brace at the line that opened it', () => {
    const res = problemsOf('void setup() {\n  if (true) {\n    delay(1);\n}\n');
    expect(res.problems[0]?.line).toBe(1);
    expect(res.problems[0]?.message).toContain('never closed');
  });

  it('maps a JavaScript parse error to the sketch line', () => {
    const res = problemsOf('void setup() {\n  int x = 5;\n  x = = 3;\n}');
    expect(res.problems[0]?.line).toBe(3);
  });
});

describe('runtime errors and the watchdog', () => {
  it('reports the sketch line of a runtime fault', async () => {
    const r = await run(['const int ECHO = 35;', '', 'void setup() {', '  pinMode(ECHO, OUTPUT);', '}'].join('\n'));
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.line).toBe(4);
    expect(r.errors[0]?.message).toContain('input-only');
  });

  it.each([
    ['while without braces', 'int x = 0;\nint y = 0;\nvoid setup() {\n  while (x == 0) y++;\n}', 4],
    ['do/while', 'void setup() {\n  do {\n  } while (1);\n}', 3],
    ['empty for(;;)', 'void setup() {\n  for (;;);\n}', 2],
  ])('stops a runaway %s and names its line', async (_name, src, line) => {
    const r = await run(src, 0, 250);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.message).toContain('watchdog');
    expect(r.errors[0]?.message).toContain(`line ${line}`);
  });

  it('lets a millis() busy-wait with a nested call in its condition finish', async () => {
    const r = await run('void setup() {\n  unsigned long t = millis();\n  while (millis() - t < 40) {}\n  Serial.println("done");\n}');
    expect(r.errors).toEqual([]);
    expect(r.logs).toContain('done');
  });
});

describe('C++ behaviour the sketches rely on', () => {
  it('truncates and wraps integer variables like C++', async () => {
    const r = await run(
      'int a = 7 / 2;\nint c;\nbyte b = 300;\nint16_t s = 40000;\nvoid setup() {\n  c++;\n  a /= 2;\n  Serial.println(a);\n  Serial.println(c);\n  Serial.println(b);\n  Serial.println(s);\n}',
    );
    expect(r.errors).toEqual([]);
    expect(r.logs).toEqual(['1', '1', '44', '-25536']);
  });

  it('starts uninitialised variables at zero, false and empty text', async () => {
    const r = await run('float f;\nbool ok;\nString s;\nvoid setup() {\n  f += 1.5;\n  Serial.println(f);\n  Serial.println(ok);\n  Serial.println(s.length());\n}');
    expect(r.logs).toEqual(['1.5', '0', '0']);
  });

  it('supports Arduino String helpers', async () => {
    const r = await run('String s = "  42 ";\nvoid setup() {\n  s.trim();\n  Serial.println(s.length());\n  Serial.println(s.toInt() + 1);\n  Serial.println(s.equals("42"));\n}');
    expect(r.logs).toEqual(['2', '43', '1']);
  });

  it('supports enums, sizeof(array)/sizeof(array[0]) and print formats', async () => {
    const r = await run(
      'enum Mode { IDLE, RUN = 5, STOP };\nMode m = RUN;\nint vals[] = {4, 5, 6};\nvoid setup() {\n  Serial.println(m);\n  Serial.println(STOP);\n  Serial.println(sizeof(vals) / sizeof(vals[0]));\n  Serial.println(255, HEX);\n  Serial.println(3.14159, 2);\n}',
    );
    expect(r.errors).toEqual([]);
    expect(r.logs).toEqual(['5', '6', '3', 'FF', '3.14']);
  });

  it("lets a sketch define its own version of a built-in name", async () => {
    const r = await run('long map(long x, long a, long b, long c, long d) { return 99; }\nvoid setup() {\n  Serial.println(map(1, 0, 1, 0, 1));\n}');
    expect(r.errors).toEqual([]);
    expect(r.logs).toEqual(['99']);
  });

  it('routes ledcWrite(channel) to the pin attached with ledcAttachPin', async () => {
    const r = makeRuntime();
    expect(r.rt.start('void setup() {\n  ledcSetup(0, 5000, 8);\n  ledcAttachPin(25, 0);\n  ledcWrite(0, 128);\n}\nvoid loop() { delay(20); }').ok).toBe(true);
    await new Promise((res) => setTimeout(res, 40));
    expect(r.rt.getPinPwmMap().get(25)).toBe(128);
    r.rt.stop();
    await r.rt.waitUntilStopped();
  });

  it('warns that a static local restarts on every call', () => {
    const res = transpileArduinoSketch('void tick() {\n  static int n = 0;\n  n++;\n}\nvoid setup() { tick(); }');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.warnings[0]).toMatchObject({ line: 2, severity: 'warning' });
  });
});
