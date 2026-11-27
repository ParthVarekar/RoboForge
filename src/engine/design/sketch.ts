import { QUAD_SPIN_TEST_SKETCH } from '../../catalog/presets';
import type { Platform } from './plan';

/**
 * A starter sketch for an assembled build, written with the pins the assembler chose and the same libraries as the
 * real board (Wire, Adafruit_SSD1306, LiquidCrystal_I2C). It is a working base to edit, not a finished program: the
 * rover drives forward and turns away from obstacles; a bench build reads its sensors and shows them.
 */

export interface SketchSpec {
  title: string;
  platform: Platform;
  i2c: { sda: number; scl: number } | null;
  mpu: boolean;
  screen: 'oled' | 'lcd1602' | 'lcd2004' | null;
  us: Array<{ trig: number; echo: number; placement: 'front' | 'back' }>;
  leds: number[];
  buttons: number[];
  cam: boolean;
}

const clean = (s: string) => s.replace(/[^\x20-\x7e]/g, '').replace(/"/g, "'");

export function starterSketch(s: SketchSpec): string {
  if (s.platform === 'drone') return QUAD_SPIN_TEST_SKETCH;
  const rover = s.platform === 'rover';
  const L: string[] = [];
  const push = (...lines: string[]) => L.push(...lines);
  const lcdCols = s.screen === 'lcd2004' ? 20 : 16;
  const front = s.us.find((u) => u.placement === 'front') ?? null;
  const back = s.us.find((u) => u.placement === 'back') ?? null;
  const usName = (u: { placement: string }, i: number) => (u === front ? 'FRONT' : u === back ? 'BACK' : `US${i + 1}`);

  push(`// ${clean(s.title)}`, '// Starter sketch from RoboForge Design, using the pins the assembler chose.');
  if (rover) push('// Motors: left GPIO25/26, right GPIO27/14 (DRV8833).');
  if (s.i2c) push(`// I2C bus: SDA GPIO${s.i2c.sda}, SCL GPIO${s.i2c.scl}.`);
  if (s.cam) push('// The ESP32-CAM runs its own firmware; this sketch only powers it.');
  push('');
  if (s.i2c) push('#include <Wire.h>');
  if (s.screen === 'oled') push('#include <Adafruit_GFX.h>', '#include <Adafruit_SSD1306.h>');
  if (s.screen === 'lcd1602' || s.screen === 'lcd2004') push('#include <LiquidCrystal_I2C.h>');
  if (s.i2c || s.screen) push('');

  if (rover) push('const int L_FWD = 25;', 'const int L_REV = 26;', 'const int R_FWD = 27;', 'const int R_REV = 14;');
  s.us.forEach((u, i) => push(`const int TRIG_${usName(u, i)} = ${u.trig};`, `const int ECHO_${usName(u, i)} = ${u.echo};`));
  s.leds.forEach((g, i) => push(`const int LED_${i + 1} = ${g};`));
  s.buttons.forEach((g, i) => push(`const int BUTTON_${i + 1} = ${g};`));
  if (rover) push('', 'const int CRUISE_PWM = 170;', 'const int TURN_PWM = 165;', 'const float STOP_CM = 30.0;');
  push('');

  if (s.screen === 'oled') push('Adafruit_SSD1306 display(128, 64, &Wire, -1);', '');
  if (s.screen === 'lcd1602' || s.screen === 'lcd2004') push(`LiquidCrystal_I2C lcd(0x27, ${lcdCols}, ${s.screen === 'lcd2004' ? 4 : 2});`, '');

  push(`bool running = ${s.buttons.length ? 'false' : 'true'};`, 'unsigned long lastShow = 0;', '');

  if (rover) {
    push(
      'void setMotors(int left, int right) {',
      '  left = constrain(left, -255, 255);',
      '  right = constrain(right, -255, 255);',
      '  analogWrite(L_FWD, left > 0 ? left : 0);',
      '  analogWrite(L_REV, left < 0 ? -left : 0);',
      '  analogWrite(R_FWD, right > 0 ? right : 0);',
      '  analogWrite(R_REV, right < 0 ? -right : 0);',
      '}',
      '',
    );
    push('// back off, then turn left about 90 degrees');
    push('void avoid() {', '  setMotors(0, 0);', '  delay(100);', '  setMotors(-CRUISE_PWM, -CRUISE_PWM);', '  delay(300);');
    if (s.mpu) {
      push(
        '  float goal = imu.readYawDeg() + 90.0;',
        '  for (int i = 0; i < 150; i++) {',
        '    if (imu.readYawDeg() >= goal - 4.0) break;',
        '    setMotors(-TURN_PWM, TURN_PWM);',
        '    delay(15);',
        '  }',
      );
    } else push('  setMotors(-TURN_PWM, TURN_PWM);', '  delay(450);');
    push('  setMotors(0, 0);', '}', '');
  }

  // status output
  const shortTitle = clean(s.title).toUpperCase().slice(0, 21);
  push('void show(String state, float frontCm) {');
  push('  Serial.print(state);');
  push('  Serial.print("  front=");', '  Serial.print(frontCm, 0);');
  if (s.mpu) push('  Serial.print("  yaw=");', '  Serial.print(imu.readYawDeg(), 1);');
  push('  Serial.println();');
  if (s.screen === 'oled') {
    push(
      '  display.clearDisplay();',
      '  display.setTextColor(SSD1306_WHITE);',
      '  display.setTextSize(1);',
      '  display.setCursor(0, 0);',
      `  display.println("${shortTitle}");`,
      '  display.setCursor(0, 20);',
      '  display.print("STATE ");',
      '  display.println(state);',
    );
    if (front) push('  display.print("DIST  ");', '  if (frontCm < 0) display.println("--");', '  else { display.print(frontCm, 0); display.println(" cm"); }');
    if (s.mpu) push('  display.print("YAW   ");', '  display.println(imu.readYawDeg(), 1);');
    push('  display.print("UP    ");', '  display.print(millis() / 1000);', '  display.println(" s");', '  display.display();');
  }
  if (s.screen === 'lcd1602' || s.screen === 'lcd2004') {
    // trailing spaces wipe what a longer state left behind
    push('  lcd.setCursor(0, 0);', '  lcd.print(state);', '  lcd.print("        ");');
    push('  lcd.setCursor(0, 1);');
    if (front) push('  if (frontCm < 0) lcd.print("-- cm   ");', '  else { lcd.print(frontCm, 0); lcd.print(" cm   "); }');
    else push('  lcd.print(millis() / 1000);', '  lcd.print(" s   ");');
    if (s.screen === 'lcd2004' && s.mpu) push('  lcd.setCursor(0, 2);', '  lcd.print("yaw ");', '  lcd.print(imu.readYawDeg(), 1);', '  lcd.print("   ");');
  }
  push('}', '');

  push('void setup() {', '  Serial.begin(115200);');
  if (rover) push('  pinMode(L_FWD, OUTPUT);', '  pinMode(L_REV, OUTPUT);', '  pinMode(R_FWD, OUTPUT);', '  pinMode(R_REV, OUTPUT);');
  s.us.forEach((u, i) => push(`  pinMode(TRIG_${usName(u, i)}, OUTPUT);`, `  pinMode(ECHO_${usName(u, i)}, INPUT);`));
  s.leds.forEach((_, i) => push(`  pinMode(LED_${i + 1}, OUTPUT);`));
  s.buttons.forEach((_, i) => push(`  pinMode(BUTTON_${i + 1}, INPUT);   // INPUT_PULLDOWN on the real board`));
  if (s.i2c) push(`  Wire.begin(${s.i2c.sda}, ${s.i2c.scl});`);
  if (s.mpu) push('  imu.begin();');
  if (s.screen === 'oled') push('  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);');
  if (s.screen === 'lcd1602' || s.screen === 'lcd2004') push('  lcd.init();', '  lcd.backlight();');
  push(`  Serial.println("${clean(s.title)}: ready${s.buttons.length ? ', press button 1 to start' : ''}");`, '}', '');

  push('void loop() {');
  if (s.buttons.length) push('  if (digitalRead(BUTTON_1) == HIGH) {', '    running = !running;', '    delay(250);', '  }');
  push(front ? `  float frontCm = ultrasonicReadCm(TRIG_FRONT, ECHO_FRONT);` : '  float frontCm = -1.0;');
  push('  String state = running ? "RUN" : "PAUSED";');
  if (rover) {
    push('  if (!running) {', '    setMotors(0, 0);', '  } else if (frontCm > 0 && frontCm < STOP_CM) {', '    state = "AVOID";', '    avoid();', '  } else {', '    setMotors(CRUISE_PWM, CRUISE_PWM);', '    state = "CRUISE";', '  }');
  }
  if (back) push(`  float backCm = ultrasonicReadCm(TRIG_BACK, ECHO_BACK);`, '  if (backCm > 0 && backCm < 15.0) state = "CLOSE BEHIND";');
  s.leds.forEach((_, i) => push(i === 0 ? '  digitalWrite(LED_1, running ? HIGH : LOW);' : `  digitalWrite(LED_${i + 1}, (millis() / 500) % 2 == 0 ? HIGH : LOW);`));
  push('  if (millis() - lastShow >= 250) {', '    lastShow = millis();', '    show(state, frontCm);', '  }', '  delay(20);', '}', '');
  return L.join('\n');
}
