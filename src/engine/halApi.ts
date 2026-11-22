/**
 * The virtual ESP32's API as the sketch editor and translator see it: one list drives the "was not declared" check,
 * autocomplete, hover help and parameter hints, so they cannot drift apart from what runtime.ts provides.
 */

export interface HalParam {
  name: string;
  doc: string;
}

export interface HalEntry {
  name: string;
  kind: 'function' | 'constant' | 'object';
  signature: string;
  doc: string;
  params?: HalParam[];
  /** Snippet inserted by autocomplete (Monaco snippet syntax). */
  snippet?: string;
  /** Members for objects (Serial, imu, oled). */
  members?: HalEntry[];
}

const fn = (name: string, signature: string, doc: string, params: HalParam[] = [], snippet?: string): HalEntry => ({
  name,
  kind: 'function',
  signature,
  doc,
  params,
  snippet: snippet ?? `${name}(${params.map((p, i) => `\${${i + 1}:${p.name}}`).join(', ')})`,
});
const k = (name: string, signature: string, doc: string): HalEntry => ({ name, kind: 'constant', signature, doc });
const p = (name: string, doc: string): HalParam => ({ name, doc });

export const HAL_API: HalEntry[] = [
  fn('pinMode', 'void pinMode(int pin, int mode)', 'Sets a GPIO as OUTPUT, INPUT or INPUT_PULLUP. GPIO34-39 are input-only.', [p('pin', 'GPIO number'), p('mode', 'OUTPUT, INPUT or INPUT_PULLUP')]),
  fn('digitalWrite', 'void digitalWrite(int pin, int value)', 'Drives an output pin HIGH (3.3 V) or LOW (0 V).', [p('pin', 'GPIO number'), p('value', 'HIGH or LOW')]),
  fn('digitalRead', 'int digitalRead(int pin)', 'Reads a pin: HIGH (1) or LOW (0). Buttons wired to the pin read HIGH while pressed in 3D.', [p('pin', 'GPIO number')]),
  fn('analogWrite', 'void analogWrite(int pin, int value)', 'PWM output, 0-255. Drives motor driver inputs and LEDs.', [p('pin', 'GPIO number'), p('value', 'duty, 0-255')]),
  fn('ledcWrite', 'void ledcWrite(int pinOrChannel, int duty)', 'ESP32 LEDC PWM, 0-255. Takes a pin, or a channel attached with ledcAttachPin().', [p('pinOrChannel', 'GPIO, or LEDC channel'), p('duty', 'duty, 0-255')]),
  fn('ledcSetup', 'double ledcSetup(int channel, double freq, int resolutionBits)', 'Configures an LEDC channel (accepted; the simulator always uses 8-bit duty).', [p('channel', 'LEDC channel 0-15'), p('freq', 'frequency in Hz'), p('resolutionBits', 'duty resolution in bits')]),
  fn('ledcAttachPin', 'void ledcAttachPin(int pin, int channel)', 'Routes an LEDC channel to a pin, so ledcWrite(channel, duty) drives that pin.', [p('pin', 'GPIO number'), p('channel', 'LEDC channel 0-15')]),
  fn('ledcAttach', 'bool ledcAttach(int pin, double freq, int resolutionBits)', 'Arduino-ESP32 3.x: attaches LEDC PWM to a pin; then ledcWrite(pin, duty).', [p('pin', 'GPIO number'), p('freq', 'frequency in Hz'), p('resolutionBits', 'duty resolution in bits')]),
  fn('delay', 'void delay(unsigned long ms)', 'Pauses the sketch for ms milliseconds. Long loops should call delay() so the board can do other work.', [p('ms', 'milliseconds')]),
  fn('delayMicroseconds', 'void delayMicroseconds(unsigned int us)', 'Pauses for us microseconds (the simulator rounds up to whole milliseconds).', [p('us', 'microseconds')]),
  fn('yield', 'void yield()', 'Lets other tasks run without waiting.'),
  fn('millis', 'unsigned long millis()', 'Milliseconds since the sketch started.'),
  fn('micros', 'unsigned long micros()', 'Microseconds since the sketch started.'),
  fn('ultrasonicReadCm', 'float ultrasonicReadCm(int trigPin, int echoPin)', 'Distance from the wired HC-SR04 in cm, or -1 if it is not wired to these pins.', [p('trigPin', 'GPIO wired to TRIG'), p('echoPin', 'GPIO wired to ECHO (through the divider)')]),
  fn('pulseIn', 'unsigned long pulseIn(int pin, int state)', 'Echo pulse length in microseconds from the HC-SR04 (about 58 us per cm).', [p('pin', 'GPIO wired to ECHO'), p('state', 'HIGH')]),
  fn('constrain', 'T constrain(T x, T low, T high)', 'Limits x to the range low..high.', [p('x', 'value'), p('low', 'lower limit'), p('high', 'upper limit')]),
  fn('map', 'long map(long x, long inMin, long inMax, long outMin, long outMax)', 'Re-maps x from one range to another.', [p('x', 'value'), p('inMin', 'input low'), p('inMax', 'input high'), p('outMin', 'output low'), p('outMax', 'output high')]),
  fn('abs', 'T abs(T x)', 'Absolute value.', [p('x', 'value')]),
  fn('min', 'T min(T a, T b)', 'Smaller of a and b.', [p('a', 'value'), p('b', 'value')]),
  fn('max', 'T max(T a, T b)', 'Larger of a and b.', [p('a', 'value'), p('b', 'value')]),
  fn('sq', 'T sq(T x)', 'x squared.', [p('x', 'value')]),
  fn('sqrt', 'double sqrt(double x)', 'Square root.', [p('x', 'value')]),
  fn('pow', 'double pow(double base, double exponent)', 'base raised to exponent.', [p('base', 'base'), p('exponent', 'exponent')]),
  fn('sin', 'double sin(double rad)', 'Sine of an angle in radians.', [p('rad', 'angle in radians')]),
  fn('cos', 'double cos(double rad)', 'Cosine of an angle in radians.', [p('rad', 'angle in radians')]),
  fn('tan', 'double tan(double rad)', 'Tangent of an angle in radians.', [p('rad', 'angle in radians')]),
  fn('atan2', 'double atan2(double y, double x)', 'Angle of the point (x, y) in radians.', [p('y', 'y'), p('x', 'x')]),
  fn('hypot', 'double hypot(double x, double y)', 'Length of the vector (x, y).', [p('x', 'x'), p('y', 'y')]),
  fn('fmod', 'double fmod(double x, double y)', 'Floating-point remainder of x / y.', [p('x', 'dividend'), p('y', 'divisor')]),
  fn('floor', 'double floor(double x)', 'Rounds down.', [p('x', 'value')]),
  fn('ceil', 'double ceil(double x)', 'Rounds up.', [p('x', 'value')]),
  fn('round', 'long round(double x)', 'Rounds to the nearest whole number.', [p('x', 'value')]),
  fn('isnan', 'bool isnan(double x)', 'True if x is not a number.', [p('x', 'value')]),
  fn('random', 'long random(long max) / random(long min, long max)', 'Random whole number in [0, max) or [min, max).', [p('minOrMax', 'max, or min when two arguments'), p('max', 'upper bound (exclusive)')], 'random(${1:max})'),
  fn('randomSeed', 'void randomSeed(unsigned long seed)', 'Accepted for compatibility (the simulator uses the browser generator).', [p('seed', 'seed value')]),
  fn('radians', 'double radians(double deg)', 'Degrees to radians.', [p('deg', 'angle in degrees')]),
  fn('degrees', 'double degrees(double rad)', 'Radians to degrees.', [p('rad', 'angle in radians')]),
  fn('bitRead', 'int bitRead(x, n)', 'Reads bit n of x.', [p('x', 'value'), p('n', 'bit, 0 = least significant')]),
  fn('bitSet', 'x bitSet(x, n)', 'x with bit n set (assign the result: x = bitSet(x, n)).', [p('x', 'value'), p('n', 'bit')]),
  fn('bitClear', 'x bitClear(x, n)', 'x with bit n cleared (assign the result).', [p('x', 'value'), p('n', 'bit')]),
  fn('bitWrite', 'x bitWrite(x, n, b)', 'x with bit n set to b (assign the result).', [p('x', 'value'), p('n', 'bit'), p('b', '0 or 1')]),
  fn('highByte', 'byte highByte(x)', 'Bits 8-15 of x.', [p('x', 'value')]),
  fn('lowByte', 'byte lowByte(x)', 'Bits 0-7 of x.', [p('x', 'value')]),
  k('HIGH', 'HIGH = 1', 'Logic high (3.3 V).'),
  k('LOW', 'LOW = 0', 'Logic low (0 V).'),
  k('OUTPUT', 'OUTPUT', 'pinMode: drive the pin.'),
  k('INPUT', 'INPUT', 'pinMode: read the pin.'),
  k('INPUT_PULLUP', 'INPUT_PULLUP', 'pinMode: read the pin with the internal pull-up enabled.'),
  k('LED_BUILTIN', 'LED_BUILTIN = 2', 'The blue LED on the DevKit (GPIO2).'),
  k('PI', 'PI = 3.14159...', 'The constant pi.'),
  k('BIN', 'BIN = 2', 'Serial.print format: binary.'),
  k('OCT', 'OCT = 8', 'Serial.print format: octal.'),
  k('DEC', 'DEC = 10', 'Serial.print format: decimal.'),
  k('HEX', 'HEX = 16', 'Serial.print format: hexadecimal.'),
  {
    name: 'Serial',
    kind: 'object',
    signature: 'Serial',
    doc: 'USB serial port; output appears in the Serial tab, and lines typed there can be read back.',
    members: [
      fn('begin', 'void Serial.begin(unsigned long baud)', 'Opens the port (any baud rate is accepted).', [p('baud', 'e.g. 115200')]),
      fn('print', 'void Serial.print(value, format?)', 'Prints without a newline. format: HEX/BIN/OCT/DEC for whole numbers, or decimal places for others.', [p('value', 'text or number'), p('format', 'optional: HEX, BIN, OCT, DEC or decimal places')], 'print(${1:value})'),
      fn('println', 'void Serial.println(value, format?)', 'Prints and ends the line.', [p('value', 'text or number'), p('format', 'optional: HEX, BIN, OCT, DEC or decimal places')], 'println(${1:value})'),
      fn('available', 'int Serial.available()', 'Number of lines waiting from the Serial tab.'),
      fn('readStringUntil', "String Serial.readStringUntil(char end)", 'Next line typed in the Serial tab.', [p('end', "'\\n'")], "readStringUntil('\\\\n')"),
    ],
  },
  {
    name: 'imu',
    kind: 'object',
    signature: 'imu  (MPU6050 on I2C)',
    doc: 'The wired MPU6050: heading from the gyro. Needs VCC, GND, SDA and SCL wired to the ESP32.',
    members: [
      fn('begin', 'bool imu.begin()', 'Starts the MPU6050 and zeroes the heading; false if it is not wired.'),
      fn('readYawDeg', 'float imu.readYawDeg()', 'Heading in degrees since begin()/zero() (counter-clockwise positive).'),
      fn('readYawRate', 'float imu.readYawRate()', 'Turn rate in degrees per second.'),
      fn('zero', 'void imu.zero()', 'Sets the current heading to 0.'),
      fn('ready', 'bool imu.ready()', 'True while the MPU6050 is wired and powered.'),
    ],
  },
  {
    name: 'oled',
    kind: 'object',
    signature: 'oled  (0.96" SSD1306, 128 x 64)',
    doc: 'The wired OLED: text appears on the 3D screen (five lines, about 21 characters each).',
    members: [
      fn('clear', 'void oled.clear()', 'Clears the screen.'),
      fn('print', 'void oled.print(value)', 'Adds text to the current line.', [p('value', 'text or number')]),
      fn('println', 'void oled.println(value)', 'Adds text and starts a new line.', [p('value', 'text or number')]),
    ],
  },
];

/** Names bound from the runtime into every sketch. */
export const HAL_NAMES: readonly string[] = HAL_API.filter((e) => e.name !== 'delay' && e.name !== 'delayMicroseconds' && e.name !== 'yield').map(
  (e) => e.name,
);

/** Calls the translator turns into awaited HAL calls (they pause the sketch). */
export const HAL_AWAITED: Readonly<Record<string, string>> = {
  delay: '__hal.delay',
  delayMicroseconds: '__hal.delayMicroseconds',
  yield: '__hal.yieldTask',
};

/** Common Arduino calls the simulator does not model, with the reason shown in the editor. */
export const HAL_UNAVAILABLE: Readonly<Record<string, string>> = {
  analogRead: 'no analog sensors are modelled',
  analogReadResolution: 'no analog sensors are modelled',
  tone: 'no buzzer is modelled',
  noTone: 'no buzzer is modelled',
  attachInterrupt: 'interrupts are not modelled; poll the pin in loop()',
  detachInterrupt: 'interrupts are not modelled',
  shiftOut: 'shift registers are not modelled',
  shiftIn: 'shift registers are not modelled',
  touchRead: 'touch pads are not modelled',
  hallRead: 'the hall sensor is not modelled',
};

export function halEntry(name: string): HalEntry | undefined {
  return HAL_API.find((e) => e.name === name);
}

export function halMember(object: string, member: string): HalEntry | undefined {
  return halEntry(object)?.members?.find((m) => m.name === member);
}
