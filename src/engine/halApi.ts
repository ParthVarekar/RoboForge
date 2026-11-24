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
  kind: 'function' | 'constant' | 'object' | 'class';
  signature: string;
  doc: string;
  params?: HalParam[];
  /** Snippet inserted by autocomplete (Monaco snippet syntax). */
  snippet?: string;
  /** Members for objects (Serial, imu, oled, Wire) and for the library classes' objects. */
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
    doc: 'Simulator shortcut for the wired OLED: lines of text on the 3D screen (eight lines of 21 characters; older lines scroll off). For code that also runs on the real board, use the Adafruit_SSD1306 library.',
    members: [
      fn('clear', 'void oled.clear()', 'Clears the screen.'),
      fn('print', 'void oled.print(value)', 'Adds text to the current line.', [p('value', 'text or number')]),
      fn('println', 'void oled.println(value)', 'Adds text and starts a new line.', [p('value', 'text or number')]),
    ],
  },
  {
    name: 'Wire',
    kind: 'object',
    signature: 'Wire  (ESP32 I2C bus)',
    doc: 'The I2C bus the OLED, LCD and MPU6050 share. Default pins SDA 21 / SCL 22; Wire.begin(sda, scl) picks others (the rover uses 32 / 33).',
    members: [
      fn('begin', 'bool Wire.begin(int sda = 21, int scl = 22, uint32_t frequency = 100000)', 'Starts the bus on these pins. Call it before display.begin() or lcd.init() when the display is not on 21/22.', [p('sda', 'GPIO wired to SDA'), p('scl', 'GPIO wired to SCL'), p('frequency', 'optional bus speed in Hz')]),
      fn('setClock', 'void Wire.setClock(uint32_t hz)', 'Bus speed (accepted; the simulator does not model timing).', [p('hz', '100000 or 400000')]),
      fn('getClock', 'uint32_t Wire.getClock()', 'Bus speed set with begin() or setClock().'),
      fn('beginTransmission', 'void Wire.beginTransmission(uint8_t address)', 'Starts talking to the device at this 7-bit address.', [p('address', 'e.g. 0x3C')]),
      fn('write', 'size_t Wire.write(uint8_t value)', 'Queues a byte (accepted; raw register writes are not modelled).', [p('value', 'byte')]),
      fn('endTransmission', 'uint8_t Wire.endTransmission()', '0 if a device answered at the address, 2 if nothing did: an I2C scanner finds the wired modules (OLED 0x3C, LCD 0x27, MPU6050 0x68).'),
    ],
  },
  k('SSD1306_WHITE', 'SSD1306_WHITE = 1', 'OLED colour: pixel on.'),
  k('SSD1306_BLACK', 'SSD1306_BLACK = 0', 'OLED colour: pixel off.'),
  k('SSD1306_INVERSE', 'SSD1306_INVERSE = 2', 'OLED colour: flips the pixel.'),
  k('WHITE', 'WHITE = 1', 'Older name for SSD1306_WHITE.'),
  k('BLACK', 'BLACK = 0', 'Older name for SSD1306_BLACK.'),
  k('INVERSE', 'INVERSE = 2', 'Older name for SSD1306_INVERSE.'),
  k('SSD1306_SWITCHCAPVCC', 'SSD1306_SWITCHCAPVCC = 0x02', 'display.begin(): the module makes its own panel voltage (the usual setting).'),
  k('SSD1306_EXTERNALVCC', 'SSD1306_EXTERNALVCC = 0x01', 'display.begin(): panel voltage from outside.'),
  k('SSD1306_DISPLAYOFF', 'SSD1306_DISPLAYOFF = 0xAE', 'display.ssd1306_command(): panel off.'),
  k('SSD1306_DISPLAYON', 'SSD1306_DISPLAYON = 0xAF', 'display.ssd1306_command(): panel on.'),
  k('SSD1306_NORMALDISPLAY', 'SSD1306_NORMALDISPLAY = 0xA6', 'display.ssd1306_command(): lit pixels are white.'),
  k('SSD1306_INVERTDISPLAY', 'SSD1306_INVERTDISPLAY = 0xA7', 'display.ssd1306_command(): inverted.'),
];

/** Adafruit_GFX drawing calls, shared by display objects. */
const GFX_MEMBERS: HalEntry[] = [
  fn('drawPixel', 'void drawPixel(int16_t x, int16_t y, uint16_t color)', 'Sets one pixel.', [p('x', '0-127'), p('y', '0-63'), p('color', 'SSD1306_WHITE, SSD1306_BLACK or SSD1306_INVERSE')]),
  fn('getPixel', 'bool getPixel(int16_t x, int16_t y)', 'True if the pixel is on in the buffer.', [p('x', 'x'), p('y', 'y')]),
  fn('drawLine', 'void drawLine(int16_t x0, int16_t y0, int16_t x1, int16_t y1, uint16_t color)', 'Straight line.', [p('x0', 'start x'), p('y0', 'start y'), p('x1', 'end x'), p('y1', 'end y'), p('color', 'colour')]),
  fn('drawFastHLine', 'void drawFastHLine(int16_t x, int16_t y, int16_t w, uint16_t color)', 'Horizontal line w pixels long.', [p('x', 'x'), p('y', 'y'), p('w', 'width'), p('color', 'colour')]),
  fn('drawFastVLine', 'void drawFastVLine(int16_t x, int16_t y, int16_t h, uint16_t color)', 'Vertical line h pixels long.', [p('x', 'x'), p('y', 'y'), p('h', 'height'), p('color', 'colour')]),
  fn('drawRect', 'void drawRect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t color)', 'Rectangle outline.', [p('x', 'left'), p('y', 'top'), p('w', 'width'), p('h', 'height'), p('color', 'colour')]),
  fn('fillRect', 'void fillRect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t color)', 'Filled rectangle.', [p('x', 'left'), p('y', 'top'), p('w', 'width'), p('h', 'height'), p('color', 'colour')]),
  fn('fillScreen', 'void fillScreen(uint16_t color)', 'Fills the whole buffer.', [p('color', 'colour')]),
  fn('drawCircle', 'void drawCircle(int16_t x0, int16_t y0, int16_t r, uint16_t color)', 'Circle outline.', [p('x0', 'centre x'), p('y0', 'centre y'), p('r', 'radius'), p('color', 'colour')]),
  fn('fillCircle', 'void fillCircle(int16_t x0, int16_t y0, int16_t r, uint16_t color)', 'Filled circle.', [p('x0', 'centre x'), p('y0', 'centre y'), p('r', 'radius'), p('color', 'colour')]),
  fn('drawRoundRect', 'void drawRoundRect(int16_t x, int16_t y, int16_t w, int16_t h, int16_t r, uint16_t color)', 'Rectangle outline with rounded corners.', [p('x', 'left'), p('y', 'top'), p('w', 'width'), p('h', 'height'), p('r', 'corner radius'), p('color', 'colour')]),
  fn('fillRoundRect', 'void fillRoundRect(int16_t x, int16_t y, int16_t w, int16_t h, int16_t r, uint16_t color)', 'Filled rectangle with rounded corners.', [p('x', 'left'), p('y', 'top'), p('w', 'width'), p('h', 'height'), p('r', 'corner radius'), p('color', 'colour')]),
  fn('drawTriangle', 'void drawTriangle(int16_t x0, int16_t y0, int16_t x1, int16_t y1, int16_t x2, int16_t y2, uint16_t color)', 'Triangle outline.', [p('x0', 'x0'), p('y0', 'y0'), p('x1', 'x1'), p('y1', 'y1'), p('x2', 'x2'), p('y2', 'y2'), p('color', 'colour')]),
  fn('fillTriangle', 'void fillTriangle(int16_t x0, int16_t y0, int16_t x1, int16_t y1, int16_t x2, int16_t y2, uint16_t color)', 'Filled triangle.', [p('x0', 'x0'), p('y0', 'y0'), p('x1', 'x1'), p('y1', 'y1'), p('x2', 'x2'), p('y2', 'y2'), p('color', 'colour')]),
  fn('drawBitmap', 'void drawBitmap(int16_t x, int16_t y, const uint8_t bitmap[], int16_t w, int16_t h, uint16_t color)', '1-bit picture (rows of bytes, high bit first, as image2cpp exports). Optional last argument: background colour.', [p('x', 'left'), p('y', 'top'), p('bitmap', 'byte array'), p('w', 'width'), p('h', 'height'), p('color', 'colour')]),
  fn('drawXBitmap', 'void drawXBitmap(int16_t x, int16_t y, const uint8_t bitmap[], int16_t w, int16_t h, uint16_t color)', 'XBM picture (low bit first, as GIMP exports).', [p('x', 'left'), p('y', 'top'), p('bitmap', 'byte array'), p('w', 'width'), p('h', 'height'), p('color', 'colour')]),
  fn('drawChar', 'void drawChar(int16_t x, int16_t y, unsigned char c, uint16_t color, uint16_t bg, uint8_t size)', 'One character of the built-in font.', [p('x', 'left'), p('y', 'top'), p('c', 'character'), p('color', 'colour'), p('bg', 'background'), p('size', 'scale')]),
  fn('setCursor', 'void setCursor(int16_t x, int16_t y)', 'Where the next text starts (top-left of the character, in pixels).', [p('x', 'pixels from the left'), p('y', 'pixels from the top')]),
  fn('getCursorX', 'int16_t getCursorX()', 'Text cursor x.'),
  fn('getCursorY', 'int16_t getCursorY()', 'Text cursor y.'),
  fn('setTextSize', 'void setTextSize(uint8_t size)', 'Scales the 6 x 8 font: 1 = 21 characters per line, 2 = 10, 3 = 7.', [p('size', '1, 2, 3...')]),
  fn('setTextColor', 'void setTextColor(uint16_t color, uint16_t bg)', 'Text colour; give a background colour too to draw over old text. Without setTextColor the SSD1306 draws no text.', [p('color', 'SSD1306_WHITE'), p('bg', 'optional background, e.g. SSD1306_BLACK')], 'setTextColor(${1:SSD1306_WHITE})'),
  fn('setTextWrap', 'void setTextWrap(bool wrap)', 'Wrap long text onto the next line (on by default).', [p('wrap', 'true or false')]),
  fn('cp437', 'void cp437(bool on = true)', 'Use the correct code page 437 numbering for symbols 176 and up.', [p('on', 'true')]),
  fn('setFont', 'void setFont(const GFXfont *font)', 'Custom fonts are drawn with the built-in font scaled to about their size (the simulator does not hold the font files); setFont() goes back to the built-in font.', [p('font', '&FreeSans9pt7b, or nothing')]),
  fn('setRotation', 'void setRotation(uint8_t r)', 'Turns the picture: 0-3 in quarter turns.', [p('r', '0, 1, 2 or 3')]),
  fn('getRotation', 'uint8_t getRotation()', 'Current rotation.'),
  fn('width', 'int16_t width()', 'Width in pixels (after rotation).'),
  fn('height', 'int16_t height()', 'Height in pixels (after rotation).'),
  fn('print', 'size_t print(value, format?)', 'Draws text at the cursor and moves it on. Numbers print as on Serial.', [p('value', 'text or number'), p('format', 'optional: HEX, BIN, DEC or decimal places')], 'print(${1:value})'),
  fn('println', 'size_t println(value, format?)', 'Draws text and moves to the next line.', [p('value', 'text or number'), p('format', 'optional')], 'println(${1:value})'),
  fn('write', 'size_t write(uint8_t c)', 'Draws one character by its code (with the default numbering, (char)247 is the degree sign).', [p('c', 'character code')]),
];

/**
 * Display libraries a sketch can include. A declaration like `Adafruit_SSD1306 display(128, 64, &Wire, -1);` creates
 * an object of the class; its members are listed here for the checker, completion and hover help.
 */
export const HAL_CLASSES: HalEntry[] = [
  {
    name: 'Adafruit_SSD1306',
    kind: 'class',
    signature: 'Adafruit_SSD1306 display(128, 64, &Wire, -1);',
    doc: 'The 0.96" SSD1306 OLED (128 x 64) with Adafruit_GFX drawing. Draw into the buffer, then call display() to show it.',
    members: [
      fn('begin', 'bool begin(uint8_t vcs = SSD1306_SWITCHCAPVCC, uint8_t addr = 0x3D)', 'Starts the display. This module answers at 0x3C. Start Wire on the right pins first when the OLED is not on 21/22.', [p('vcs', 'SSD1306_SWITCHCAPVCC'), p('addr', '0x3C')], 'begin(SSD1306_SWITCHCAPVCC, ${1:0x3C})'),
      fn('display', 'void display()', 'Sends the buffer to the screen: nothing appears until you call it.'),
      fn('clearDisplay', 'void clearDisplay()', 'Clears the buffer (call display() to show the empty screen).'),
      fn('invertDisplay', 'void invertDisplay(bool i)', 'Swaps lit and dark pixels on the screen (immediately).', [p('i', 'true or false')]),
      fn('dim', 'void dim(bool dim)', 'Lowers the brightness.', [p('dim', 'true or false')]),
      fn('ssd1306_command', 'void ssd1306_command(uint8_t c)', 'Sends a command: SSD1306_DISPLAYOFF, SSD1306_DISPLAYON, SSD1306_NORMALDISPLAY, SSD1306_INVERTDISPLAY.', [p('c', 'command')]),
      fn('startscrollright', 'void startscrollright(uint8_t start, uint8_t stop)', 'Hardware scroll to the right for pages start..stop (0-7, 8 rows each).', [p('start', 'first page'), p('stop', 'last page')], 'startscrollright(0x00, 0x0F)'),
      fn('startscrollleft', 'void startscrollleft(uint8_t start, uint8_t stop)', 'Hardware scroll to the left.', [p('start', 'first page'), p('stop', 'last page')], 'startscrollleft(0x00, 0x0F)'),
      fn('startscrolldiagright', 'void startscrolldiagright(uint8_t start, uint8_t stop)', 'Diagonal scroll (shown as its sideways movement).', [p('start', 'first page'), p('stop', 'last page')]),
      fn('startscrolldiagleft', 'void startscrolldiagleft(uint8_t start, uint8_t stop)', 'Diagonal scroll (shown as its sideways movement).', [p('start', 'first page'), p('stop', 'last page')]),
      fn('stopscroll', 'void stopscroll()', 'Stops a hardware scroll.'),
      ...GFX_MEMBERS,
    ],
  },
  {
    name: 'LiquidCrystal_I2C',
    kind: 'class',
    signature: 'LiquidCrystal_I2C lcd(0x27, 16, 2);',
    doc: 'A 16x2 or 20x4 character LCD with the PCF8574 I2C backpack (address 0x27). Rows and columns count from 0.',
    members: [
      fn('init', 'void init()', 'Starts the LCD (the backlight stays off until backlight()).'),
      fn('begin', 'void begin()', 'Same as init() in newer versions of the library.'),
      fn('backlight', 'void backlight()', 'Backlight on.'),
      fn('noBacklight', 'void noBacklight()', 'Backlight off.'),
      fn('setBacklight', 'void setBacklight(uint8_t on)', 'Backlight on (non-zero) or off.', [p('on', '1 or 0')]),
      fn('getBacklight', 'bool getBacklight()', 'Whether the backlight is on.'),
      fn('clear', 'void clear()', 'Clears the screen and moves the cursor to 0, 0.'),
      fn('home', 'void home()', 'Moves the cursor to 0, 0 and undoes scrolling.'),
      fn('setCursor', 'void setCursor(uint8_t col, uint8_t row)', 'Where the next character goes: column first, then row (both from 0).', [p('col', '0-15 (0-19 on a 20x4)'), p('row', '0-1 (0-3 on a 20x4)')]),
      fn('print', 'size_t print(value, format?)', 'Writes text from the cursor. Text past the end of a row does not wrap onto the next row.', [p('value', 'text or number'), p('format', 'optional')], 'print(${1:value})'),
      fn('println', 'size_t println(value)', 'Avoid on an LCD: the line ending shows as two odd characters.', [p('value', 'text or number')]),
      fn('write', 'size_t write(uint8_t c)', 'One character by code: 0-7 are your createChar() characters, 223 is the degree sign.', [p('c', 'character code')]),
      fn('printstr', 'void printstr(const char *s)', 'Writes text (older name).', [p('s', 'text')]),
      fn('createChar', 'void createChar(uint8_t slot, uint8_t rows[8])', 'Defines custom character 0-7 from eight rows of 5 bits. Call setCursor() or clear() afterwards.', [p('slot', '0-7'), p('rows', 'byte array of 8 rows')]),
      fn('load_custom_character', 'void load_custom_character(uint8_t slot, uint8_t rows[8])', 'Same as createChar().', [p('slot', '0-7'), p('rows', 'byte array')]),
      fn('display', 'void display()', 'Shows the text again after noDisplay().'),
      fn('noDisplay', 'void noDisplay()', 'Hides the text (kept in memory).'),
      fn('cursor', 'void cursor()', 'Shows an underline cursor.'),
      fn('noCursor', 'void noCursor()', 'Hides the underline cursor.'),
      fn('blink', 'void blink()', 'Blinking block cursor.'),
      fn('noBlink', 'void noBlink()', 'Stops the blinking cursor.'),
      fn('cursor_on', 'void cursor_on()', 'Same as cursor().'),
      fn('cursor_off', 'void cursor_off()', 'Same as noCursor().'),
      fn('blink_on', 'void blink_on()', 'Same as blink().'),
      fn('blink_off', 'void blink_off()', 'Same as noBlink().'),
      fn('scrollDisplayLeft', 'void scrollDisplayLeft()', 'Moves all text one place left.'),
      fn('scrollDisplayRight', 'void scrollDisplayRight()', 'Moves all text one place right.'),
      fn('leftToRight', 'void leftToRight()', 'Text runs left to right (default).'),
      fn('rightToLeft', 'void rightToLeft()', 'Text runs right to left.'),
      fn('autoscroll', 'void autoscroll()', 'Each new character pushes the text along.'),
      fn('noAutoscroll', 'void noAutoscroll()', 'Turns autoscroll off.'),
    ],
  },
];

/** Headers the simulator knows; any other #include gets a warning. */
export const KNOWN_INCLUDES: ReadonlySet<string> = new Set([
  'Arduino.h',
  'Wire.h',
  'SPI.h',
  'Adafruit_GFX.h',
  'Adafruit_SSD1306.h',
  'Adafruit_I2CDevice.h',
  'LiquidCrystal_I2C.h',
  'math.h',
  'stdint.h',
  'stdlib.h',
  'string.h',
  'stdio.h',
]);

/** What to say about a few libraries people often reach for. */
export const INCLUDE_ADVICE: Readonly<Record<string, string>> = {
  'LiquidCrystal.h': 'the parallel LiquidCrystal library is not modelled; the LCD parts here have the I2C backpack: #include <LiquidCrystal_I2C.h>',
  'U8g2lib.h': 'U8g2 is not modelled; drive the OLED with Adafruit_SSD1306 (#include <Adafruit_SSD1306.h>)',
  'U8x8lib.h': 'U8x8 is not modelled; drive the OLED with Adafruit_SSD1306 (#include <Adafruit_SSD1306.h>)',
  'Adafruit_SH110X.h': 'the OLED part here has an SSD1306 controller: use Adafruit_SSD1306',
  'SSD1306Wire.h': 'this OLED library is not modelled; use Adafruit_SSD1306',
  'MPU6050.h': "MPU6050 libraries are not modelled; use the simulator's imu object (imu.begin(), imu.readYawDeg())",
  'Adafruit_MPU6050.h': "MPU6050 libraries are not modelled; use the simulator's imu object (imu.begin(), imu.readYawDeg())",
  'WiFi.h': 'Wi-Fi is not modelled in the simulator',
};

export function halClass(name: string): HalEntry | undefined {
  return HAL_CLASSES.find((e) => e.name === name);
}

/** Names bound from the runtime into every sketch. */
export const HAL_NAMES: readonly string[] = [
  ...HAL_API.filter((e) => e.name !== 'delay' && e.name !== 'delayMicroseconds' && e.name !== 'yield').map((e) => e.name),
  ...HAL_CLASSES.map((e) => e.name),
];

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
  getTextBounds: 'it returns its results through pointers; with the built-in font each character is 6 x 8 pixels times the text size',
};

export function halEntry(name: string): HalEntry | undefined {
  return HAL_API.find((e) => e.name === name);
}

export function halMember(object: string, member: string): HalEntry | undefined {
  return halEntry(object)?.members?.find((m) => m.name === member);
}
