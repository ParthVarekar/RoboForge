# 07 · Parts library: what small robot builds use, and what RoboForge has

A list of the equipment that hobby robot and electronics projects of this kind usually use, grouped by job, with its
state in the RoboForge parts library. Dimensions, pin orders and what is simplified are in
[06_COMPONENT_REFERENCES.md](06_COMPONENT_REFERENCES.md); how parts must be built is in
[PARTS_STYLE_GUIDE.md](PARTS_STYLE_GUIDE.md).

**States**

- **Simulated**: in the library, and the simulator runs its behaviour (motors turn, sensors give readings, screens draw).
- **Wiring only**: in the library with its real pins and voltage ratings. The circuit check powers it and flags
  overvoltage, missing ground, I2C and one-jumper-per-pin problems, but the simulator does not run its behaviour yet.
  The parts list marks these "WIRING ONLY".
- **Planned**: not in the library yet. The note says what it needs first.

The library had 26 parts before this round (counting the four CAD shapes and the solder splice); 35 were added on
2026-11-27, so it now has 61. On 2026-11-28 the servos, the buzzer, the relay and the DHT22 became simulated (see
"Simulated actuators and the DHT22" below).

## Controllers

| Part | State | Notes |
| --- | --- | --- |
| ESP32 DevKit V1 (30 pin) | Simulated | Runs the sketches |
| ESP32-CAM (AI-Thinker) | Simulated (power only) | Camera view not simulated |
| Arduino Nano V3 (USB-C) | Wiring only, added | The simulator runs ESP32 sketches, not AVR code |
| Raspberry Pi Pico (RP2040) | Wiring only, added | GPIO names are shown on hover (printed under the real board) |
| Arduino Uno R3 | Planned | Needs a female-header "socket" contact type, so a jumper can be pushed into it |
| Arduino Mega 2560 | Planned | Same as the Uno |
| ESP8266 NodeMCU / Wemos D1 mini | Planned | |
| ESP32-S3 DevKit, ESP32-C3 SuperMini | Planned | |
| STM32 "Blue Pill" | Planned | |
| Raspberry Pi 4 / 5 | Planned | 40-pin header; a Linux computer is not something the simulator can run |
| micro:bit | Planned | Edge connector needs its own contact type |

## Motor drivers and motor power

| Part | State | Notes |
| --- | --- | --- |
| DRV8833 (HW-627) | Simulated | The rover's driver |
| L298N dual H-bridge | Wiring only, added | Screw terminals take several wires; its +5V terminal is a 5 V source |
| TB6612FNG breakout | Wiring only, added | |
| A4988 stepper carrier | Wiring only, added | |
| 28BYJ-48 stepper + ULN2003 board | Wiring only, added | |
| DRV8825, TMC2208 / TMC2209 | Planned | Same footprint as the A4988 |
| BTS7960 43 A, Cytron MDD10A | Planned | For bigger motors |
| PCA9685 16-channel servo driver | Planned | |
| 30 A / 4-in-1 brushless ESC | Simulated (in the FPV stack) | A separate single ESC is planned |

## Motors and actuators

| Part | State | Notes |
| --- | --- | --- |
| TT gearmotor + 65 mm wheel | Simulated | |
| 2207 brushless + 5" prop | Simulated | |
| SG90 micro servo | Simulated, added | `Servo` (ESP32Servo): the horn turns at the datasheet speed |
| MG996R metal-gear servo | Simulated, added | Same; slower (0.17 s per 60 degrees) |
| N20 micro gearmotor | Wiring only, added | |
| 1-channel 5 V relay module | Simulated, added | IN HIGH turns it on; an LED fed through NO or NC follows it; click sound |
| Active buzzer module (KY-012) | Simulated, added | Sounds while SIG is HIGH or carries `tone()` |
| NEMA 17 stepper | Planned | |
| JGA25-370 / N20 with encoder | Planned | Encoders need pulse simulation |
| FS90R continuous-rotation servo | Planned | |
| Vibration motor, small solenoid | Planned | |
| Speaker + PAM8403 amplifier, DFPlayer Mini | Planned | Sound is not simulated |

## Sensors

| Part | State | Notes |
| --- | --- | --- |
| MPU6050 (GY-521) | Simulated | |
| HC-SR04 ultrasonic | Simulated | |
| DHT22 / AM2302 | Simulated, added | `DHT` library; you set the air with the DHT22 card on the bench |
| BME280 (GY-BME280, 3.3 V) | Wiring only, added | VIN rated to 3.6 V: the check flags 5 V on it |
| VL53L0X time of flight | Wiring only, added | |
| HC-SR501 PIR | Wiring only, added | |
| TCRT5000 line / IR sensor | Wiring only, added | |
| NEO-6M GPS (GY-NEO6MV2) | Wiring only, added | |
| DS3231 real-time clock (ZS-042) | Wiring only, added | |
| BNO055, MPU9250, ICM-20948 IMUs | Planned | |
| QMC5883L / HMC5883L compass | Planned | |
| VL53L1X, TF-Luna lidar, RPLIDAR A1 | Planned | The lidar needs a rotating-scan model |
| Sharp GP2Y0A21 IR distance | Planned | Analog output |
| DS18B20, MLX90614, BMP280 | Planned | |
| INA219 / ACS712 current sensor | Planned | |
| Rotary encoder (KY-040), hall sensor (A3144) | Planned | |
| Load cell + HX711 | Planned | |
| LDR, soil moisture, MQ-2 gas, KY-038 sound | Planned | Analog inputs are not simulated yet |
| VS1838B IR receiver, RC522 RFID | Planned | |

## Displays and lights

| Part | State | Notes |
| --- | --- | --- |
| 0.96" SSD1306 OLED | Simulated | |
| 16x2 and 20x4 I2C LCD | Simulated | |
| 5 mm LED | Simulated | |
| WS2812B stick (8 LEDs) | Wiring only, added | Its 5V and 5V_OUT pads are joined on the board |
| TM1637 4-digit display | Wiring only, added | |
| MAX7219 8 x 8 matrix | Wiring only, added | Pass-through header for chaining |
| 1.3" SH1106 OLED, 1.8" ST7735 / 2.4" ILI9341 TFT | Planned | |
| 2.9" e-paper | Planned | |
| WS2812B ring and strip, RGB LED module | Planned | |

## Input

| Part | State | Notes |
| --- | --- | --- |
| 6 x 6 mm tact switch | Simulated | |
| KY-023 joystick | Wiring only, added | |
| 10 k potentiometer (9 mm) | Wiring only, added | |
| Rocker power switch (KCD1) | Wiring only, added | Shown switched on: its two tabs are joined |
| 4 x 4 membrane keypad, slide switch, limit switch | Planned | |

## Communication and storage

| Part | State | Notes |
| --- | --- | --- |
| HC-05 Bluetooth | Wiring only, added | |
| nRF24L01+ (PCB antenna) | Wiring only, added | VCC rated to 3.6 V |
| microSD module | Wiring only, added | |
| FPV VTX antenna | Simulated (power only) | |
| nRF24L01+ PA/LNA, HC-12 | Planned | |
| LoRa SX1278 (Ra-02), SIM800L | Planned | |
| MCP2515 CAN, MAX485 RS-485 | Planned | |
| ESP-01 | Planned | |

## Power

| Part | State | Notes |
| --- | --- | --- |
| 2S 18650 Li-ion pack | Simulated | 2200 mAh in the run-time estimate |
| 6S 1100 mAh LiPo | Simulated | |
| LM2596 buck | Simulated | |
| 4 x AA holder (NiMH) | Wiring only, added | 4.8 V source, 2000 mAh in the run-time estimate |
| MT3608 boost (set to 5.0 V) | Wiring only, added | |
| TP4056 charger with protection (USB-C) | Wiring only, added | B+ and OUT+ are joined on the board |
| AMS1117-3.3 module | Wiring only, added | 3.3 V source |
| XL4015 buck, XL6009 buck-boost, LM7805 | Planned | |
| 2S / 3S BMS, battery level indicator | Planned | |
| 1S 18650 holder, 3S LiPo | Planned | |
| DC barrel jack, XT30 / XT60 leads, blade fuse holder | Planned | |
| Power distribution board | Planned | |

## Passives, discretes and wiring

| Part | State | Notes |
| --- | --- | --- |
| 10 k resistor (1/4 W) | Simulated | Other values planned (needs a value field) |
| 1000 uF 16 V electrolytic | Simulated | |
| Solder splice | Simulated | Joins several wires |
| 1N4007 diode | Wiring only, added | |
| 2N2222A NPN (TO-92) | Wiring only, added | |
| IRLZ44N logic-level MOSFET (TO-220) | Wiring only, added | |
| 100 nF ceramic | Wiring only, added | |
| 1N5819 Schottky, Zener diodes | Planned | |
| BC547, BSS138 4-channel level shifter, PC817 optocoupler | Planned | |
| Breadboard (830 / 400) | Planned | Needs the socket contact type and row connections |
| Perfboard, screw-terminal blocks, JST connectors | Planned | |

## Frames and mechanics

| Part | State | Notes |
| --- | --- | --- |
| 2WD chassis, 5" X frame | Simulated | |
| CAD box, cylinder, standoff, plate | Mechanical | Sizes you set |
| Ball caster, mecanum wheels, tank tracks | Planned | Need physics changes for the arena |
| Pan-tilt servo bracket, servo horns | Planned | |

## What "added" does and does not mean

- Each added part is modelled at its real size from datasheet numbers and common module layouts, with its real pins,
  so wires land on the drawn pin, and with voltage ratings the circuit check uses. Sizes were not re-checked against a
  photo or drawing in this round: see the "Extended library" table in 06.
- The other added parts are **wiring only**: a sketch cannot drive them yet. The Design tab does not place any of the
  added parts; it says so and the user adds them from the Parts list.

## Simulated actuators and the DHT22

| Part | In the sketch | What the bench does | What the circuit check looks at |
| --- | --- | --- | --- |
| SG90, MG996R servo | `#include <ESP32Servo.h>`, `Servo s; s.attach(pin); s.write(angle);` (also `writeMicroseconds`, `read`, `detach`; `ESP32PWM::allocateTimer` is accepted) | The horn turns to the angle at 600 (SG90) or 350 (MG996R) degrees per second; it stays where it is when the pulses stop | SIG on an output GPIO; VCC 4-7.2 V to move (a warning below 4 V) |
| Active buzzer (KY-012) | `digitalWrite(pin, HIGH)`, or `tone(pin, hz[, ms])` / `noTone(pin)` | Rings over the buzzer and a quiet tone (the Sound button turns it off) | SIG on an output GPIO; VCC 3-5.5 V |
| 1-channel relay | `digitalWrite(pin, HIGH)` turns it on | Its green LED lights; an LED wired from a powered COM through NO (or NC) and a resistor lights while the relay is on (off); a click | IN on an output GPIO; DC+ 4.5 V or more (a warning on 3.3 V) |
| DHT22 | `#include <DHT.h>`, `DHT dht(pin, DHT22); dht.begin(); dht.readTemperature(); dht.readHumidity();` | Reads the temperature and humidity set on the DHT22 card (0.1 steps, a little noise, at most a new value every 2 s); NaN when it is not wired or the type is wrong, with a hint in the Serial tab | DATA on a GPIO; VCC 3-6 V; a note when DATA has no pull-up to VCC |

Not modelled: servo load, stall current and jitter; the active buzzer's own pitch mixing with a `tone()` (the
simulator plays the tone's pitch); relay contact bounce and other loads than an LED (a motor on the contacts does
not turn); the DHT22's slow response to change and its reading errors. Nothing here was tried on real hardware.
The **Actuator Lab** preset and its sketch show all four parts together.
- Nothing here was tried on real hardware.
