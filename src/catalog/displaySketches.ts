/**
 * Example sketches for the display parts. They use the same libraries as the real board (Adafruit_SSD1306 with
 * Adafruit_GFX, LiquidCrystal_I2C, Wire), so the code can be uploaded to an ESP32 unchanged.
 */

export const DISPLAY_LAB_SKETCH = `// Display Lab: SSD1306 OLED + 16x2 LCD sharing one I2C bus (ESP32 SDA 21, SCL 22)
// Same libraries as on the real board: Adafruit_SSD1306 (with Adafruit_GFX) and LiquidCrystal_I2C.
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <LiquidCrystal_I2C.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_ADDRESS 0x3C

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
LiquidCrystal_I2C lcd(0x27, 16, 2);

// custom LCD characters: five pixels wide, eight rows each
byte heart[8] = { B00000, B01010, B11111, B11111, B11111, B01110, B00100, B00000 };
byte thermo[8] = { B00100, B01010, B01010, B01110, B01110, B11111, B11111, B01110 };

int ballX = 20;
int ballY = 34;
int dx = 3;
int dy = 2;
unsigned long lastLcd = 0;

void scanBus() {
  Serial.println("I2C scan:");
  for (int addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.print("  device at 0x");
      Serial.println(addr, HEX);
    }
  }
}

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  scanBus();

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    Serial.println("SSD1306 allocation failed");
  }
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(2);
  display.setCursor(10, 0);
  display.println("RoboForge");
  display.setTextSize(1);
  display.setCursor(12, 30);
  display.println("OLED 128x64 + LCD");
  display.drawRoundRect(0, 20, 128, 44, 6, SSD1306_WHITE);
  display.display();

  lcd.init();
  lcd.backlight();
  lcd.createChar(0, heart);
  lcd.createChar(1, thermo);
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Hello ");
  lcd.write(0);
  lcd.print(" ESP32");
  delay(1500);
}

void drawOled(unsigned long seconds) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("Uptime ");
  display.print(seconds);
  display.print(" s");
  display.drawFastHLine(0, 10, 128, SSD1306_WHITE);
  display.drawRect(0, 16, 128, 48, SSD1306_WHITE);
  display.fillCircle(ballX, ballY, 4, SSD1306_WHITE);
  // a bar that fills over each minute
  int bar = map(seconds % 60, 0, 59, 0, 120);
  display.fillRect(4, 58, bar, 3, SSD1306_WHITE);
  display.display();
}

void loop() {
  ballX += dx;
  ballY += dy;
  if (ballX < 6 || ballX > 121) dx = -dx;
  if (ballY < 22 || ballY > 51) dy = -dy;
  unsigned long seconds = millis() / 1000;
  drawOled(seconds);

  if (millis() - lastLcd >= 500) {
    lastLcd = millis();
    float tempC = 22.0 + 3.0 * sin(millis() / 4000.0);
    lcd.setCursor(0, 1);
    lcd.write(1);
    lcd.print(" ");
    lcd.print(tempC, 1);
    lcd.write(223);   // the degree sign in the LCD's character ROM
    lcd.print("C   ");
    lcd.setCursor(12, 1);
    lcd.print(seconds % 1000);
    lcd.print("s");
  }
  delay(40);
}
`;

export const OLED_DASHBOARD_SKETCH = `// Rover OLED dashboard with the Adafruit_SSD1306 library
// The OLED and the MPU6050 share the rover's I2C bus: SDA 32, SCL 33 (the ESP32 default is 21/22).
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

Adafruit_SSD1306 display(128, 64, &Wire, -1);

const int TRIG = 13;
const int ECHO = 35;

void setup() {
  Serial.begin(115200);
  Wire.begin(32, 33);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("SSD1306 allocation failed");
  }
  imu.begin();
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
}

void loop() {
  float yaw = imu.readYawDeg();
  float dist = ultrasonicReadCm(TRIG, ECHO);

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("ROVER");
  display.setCursor(0, 20);
  display.print("YAW  ");
  display.print(yaw, 1);
  display.setCursor(0, 32);
  display.print("DIST ");
  if (dist < 0) display.print("--");
  else display.print(dist, 0);
  display.print(" cm");

  // compass: the needle points along the heading
  int cx = 104;
  int cy = 38;
  display.drawCircle(cx, cy, 20, SSD1306_WHITE);
  float a = radians(yaw);
  display.drawLine(cx, cy, cx - 17 * sin(a), cy - 17 * cos(a), SSD1306_WHITE);
  display.fillCircle(cx, cy, 2, SSD1306_WHITE);

  // distance bar: full at 200 cm
  int bar = constrain(dist, 0, 200) * 70 / 200;
  display.drawRect(0, 54, 72, 9, SSD1306_WHITE);
  display.fillRect(1, 55, bar, 7, SSD1306_WHITE);
  display.display();
  delay(50);
}
`;

export const I2C_SCANNER_SKETCH = `// I2C scanner: lists every device that answers on the bus
// The rover's bus is SDA 32 / SCL 33 (OLED 0x3C, MPU6050 0x68); the Display Lab uses 21 / 22 (LCD 0x27 too).
#include <Wire.h>

const int SDA_PIN = 32;
const int SCL_PIN = 33;

void setup() {
  Serial.begin(115200);
  Wire.begin(SDA_PIN, SCL_PIN);
}

void loop() {
  int found = 0;
  Serial.println("Scanning...");
  for (int addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    byte error = Wire.endTransmission();
    if (error == 0) {
      Serial.print("I2C device found at 0x");
      if (addr < 16) Serial.print("0");
      Serial.println(addr, HEX);
      found++;
    }
  }
  if (found == 0) {
    Serial.println("No I2C devices found");
  } else {
    Serial.print(found);
    Serial.println(" device(s)");
  }
  delay(5000);
}
`;
