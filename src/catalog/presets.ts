import { DEFAULT_ARENA_CONFIG, type StudioProject } from '../schema/projectSchema';
import { getArenaTemplate } from './arenaPresets';

export interface SketchTemplate {
  id: string;
  label: string;
  code: string;
}

export const BAG_PASS_SKETCH = `// RoboForge 2WD Rover — Autonomous Bag-Pass, Heading-Hold & Live OLED
// Matches real RoboForge hardware pinout:
//   Left motor: GPIO 25/26 | Right motor: GPIO 27/14
//   MPU6050 + OLED I2C: SDA 32, SCL 33 | HC-SR04: TRIG 13, ECHO 35 (10k/10k divider)

const int L_FWD = 25;
const int L_REV = 26;
const int R_FWD = 27;
const int R_REV = 14;
const int TRIG = 13;
const int ECHO = 35;
const int STATUS_LED = 4;

const int CRUISE_PWM = 185;
const int TURN_PWM = 175;
const float SAFE_CM = 40.0;
const float HOLD_KP = 3.2;
const float HOLD_KD = 0.25;

float targetYaw = 0.0;
int bagsAvoided = 0;

void setMotors(int leftPwm, int rightPwm) {
  leftPwm = constrain(leftPwm, -255, 255);
  rightPwm = constrain(rightPwm, -255, 255);
  analogWrite(L_FWD, leftPwm > 0 ? leftPwm : 0);
  analogWrite(L_REV, leftPwm < 0 ? -leftPwm : 0);
  analogWrite(R_FWD, rightPwm > 0 ? rightPwm : 0);
  analogWrite(R_REV, rightPwm < 0 ? -rightPwm : 0);
}

void stopMotors() {
  setMotors(0, 0);
}

void updateDisplay(float dist, float yaw, String state) {
  oled.clear();
  oled.println("ROBOFORGE 2WD");
  oled.print("STATE: "); oled.println(state);
  oled.print("DIST:  "); oled.print(dist); oled.println(" cm");
  oled.print("YAW:   "); oled.print(yaw); oled.println(" deg");
  oled.print("BAGS:  "); oled.println(bagsAvoided);
}

void turnToYaw(float goalDeg) {
  for (int i = 0; i < 160; i++) {
    float err = goalDeg - imu.readYawDeg();
    if (abs(err) < 4.0) break;
    if (err > 0) {
      setMotors(-TURN_PWM, TURN_PWM);
    } else {
      setMotors(TURN_PWM, -TURN_PWM);
    }
    delay(25);
  }
  stopMotors();
  delay(120);
}

void driveStraightMs(int durationMs, float holdDeg) {
  unsigned long startMs = millis();
  while (millis() - startMs < durationMs) {
    float err = imu.readYawDeg() - holdDeg;
    float rate = imu.readYawRate();
    float steer = constrain(HOLD_KP * err + HOLD_KD * rate, -60, 60);
    setMotors(CRUISE_PWM + steer, CRUISE_PWM - steer);
    delay(25);
  }
  stopMotors();
}

void setup() {
  Serial.begin(115200);
  pinMode(L_FWD, OUTPUT);
  pinMode(L_REV, OUTPUT);
  pinMode(R_FWD, OUTPUT);
  pinMode(R_REV, OUTPUT);
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  pinMode(STATUS_LED, OUTPUT);

  imu.begin();
  digitalWrite(STATUS_LED, HIGH);
  updateDisplay(0, 0, "ARMED");
  Serial.println("RoboForge Studio Rover: Bag-Pass + Heading-Hold started.");
}

void loop() {
  float dist = ultrasonicReadCm(TRIG, ECHO);
  float yaw = imu.readYawDeg();

  if (dist > 0 && dist < SAFE_CM) {
    bagsAvoided = bagsAvoided + 1;
    updateDisplay(dist, yaw, "DETOUR");
    Serial.print("Obstacle at ");
    Serial.print(dist);
    Serial.println(" cm — running right-side bag detour...");
    digitalWrite(STATUS_LED, LOW);
    stopMotors();
    delay(150);

    // 1. Turn 90 deg right (-90), sidestep clear (matches ROVER_API bagStepMs ~1600ms)
    turnToYaw(targetYaw - 90.0);
    driveStraightMs(1650, targetYaw - 90.0);

    // 2. Turn back straight (0), drive past the bag (matches ROVER_API bagPassMs ~4200ms)
    turnToYaw(targetYaw);
    driveStraightMs(4200, targetYaw);

    // 3. Turn 90 deg left (+90), return to centerline
    turnToYaw(targetYaw + 90.0);
    driveStraightMs(1650, targetYaw + 90.0);

    // 4. Restore original heading
    turnToYaw(targetYaw);
    digitalWrite(STATUS_LED, HIGH);
    Serial.print("Detour complete. Bags cleared: ");
    Serial.println(bagsAvoided);
  } else {
    updateDisplay(dist, yaw, "CRUISE");
    float err = yaw - targetYaw;
    float rate = imu.readYawRate();
    float steer = constrain(HOLD_KP * err + HOLD_KD * rate, -60, 60);
    setMotors(CRUISE_PWM + steer, CRUISE_PWM - steer);
    delay(35);
  }
}
`;

export const QUAD_SPIN_TEST_SKETCH = `// 5-Inch Freestyle Quadcopter — Bench ESC Arming & Motor Ramp Test
// ESC Channels: M1 (FL)=25, M2 (FR)=26, M3 (RL)=27, M4 (RR)=14

const int M1 = 25, M2 = 26, M3 = 27, M4 = 14;

void setAllMotors(int throttle) {
  analogWrite(M1, throttle);
  analogWrite(M2, throttle);
  analogWrite(M3, throttle);
  analogWrite(M4, throttle);
}

void setup() {
  Serial.begin(115200);
  pinMode(M1, OUTPUT); pinMode(M2, OUTPUT);
  pinMode(M3, OUTPUT); pinMode(M4, OUTPUT);
  imu.begin();
  Serial.println("6S 45A 4-in-1 ESC armed. Spooling up idle (18%)...");
  setAllMotors(55);
  delay(800);
}

void loop() {
  // Smooth bench hover throttle pulse (18% -> 58% -> 18%)
  for (int t = 55; t <= 155; t += 10) {
    setAllMotors(t);
    Serial.print("Throttle PWM: ");
    Serial.println(t);
    delay(180);
  }
  for (int t = 155; t >= 55; t -= 10) {
    setAllMotors(t);
    delay(180);
  }
}
`;

export const CALIBRATION_SWEEP_SKETCH = `// RoboForge Reality-Gap Diagnostic Sweep
// Drives straight without heading-hold so you can measure pull/drift
// in the Arena Twin Panel (e.g. set Right Motor Scale to 0.85 to test drift).

const int L_FWD = 25, L_REV = 26, R_FWD = 27, R_REV = 14;
const int STATUS_LED = 4;

void setMotors(int l, int r) {
  analogWrite(L_FWD, l > 0 ? l : 0);
  analogWrite(L_REV, l < 0 ? -l : 0);
  analogWrite(R_FWD, r > 0 ? r : 0);
  analogWrite(R_REV, r < 0 ? -r : 0);
}

void setup() {
  Serial.begin(115200);
  pinMode(L_FWD, OUTPUT); pinMode(L_REV, OUTPUT);
  pinMode(R_FWD, OUTPUT); pinMode(R_REV, OUTPUT);
  pinMode(STATUS_LED, OUTPUT);
  imu.begin();
  Serial.println("Starting open-loop gap test (180 PWM, 2.0 s)...");

  digitalWrite(STATUS_LED, HIGH);
  setMotors(180, 180);
  delay(2000);
  setMotors(0, 0);
  delay(350);

  float drift = imu.readYawDeg();
  Serial.print("Measured straight-run yaw drift: ");
  Serial.print(drift);
  Serial.println(" deg (+left / -right)");

  if (abs(drift) < 3.0) {
    Serial.println("Motors well balanced (< 3 deg drift).");
  } else if (drift < 0) {
    Serial.println("Diagnosis: RIGHT motor weaker (pulled right). Increase trim or check Arena Twin sliders.");
  } else {
    Serial.println("Diagnosis: LEFT motor weaker (pulled left).");
  }
  digitalWrite(STATUS_LED, LOW);
}

void loop() {
  delay(1000);
}
`;

export const TELEMETRY_SERIAL_SKETCH = `// Interactive Serial Console & Live Sensor Monitor
// Send commands in the Serial tab: "f" (forward), "b" (back), "l" (left), "r" (right), "s" (stop)

const int L_FWD = 25, L_REV = 26, R_FWD = 27, R_REV = 14;
const int TRIG = 13, ECHO = 35, STATUS_LED = 4;

void drive(int l, int r) {
  analogWrite(L_FWD, l > 0 ? l : 0);
  analogWrite(L_REV, l < 0 ? -l : 0);
  analogWrite(R_FWD, r > 0 ? r : 0);
  analogWrite(R_REV, r < 0 ? -r : 0);
}

void setup() {
  Serial.begin(115200);
  pinMode(L_FWD, OUTPUT); pinMode(L_REV, OUTPUT);
  pinMode(R_FWD, OUTPUT); pinMode(R_REV, OUTPUT);
  pinMode(TRIG, OUTPUT); pinMode(ECHO, INPUT);
  pinMode(STATUS_LED, OUTPUT);
  imu.begin();
  Serial.println("Serial drive ready. Type f, b, l, r, or s below.");
}

void loop() {
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\\n');
    if (cmd == "f") { drive(190, 190); digitalWrite(STATUS_LED, HIGH); Serial.println("Forward"); }
    else if (cmd == "b") { drive(-190, -190); Serial.println("Reverse"); }
    else if (cmd == "l") { drive(-175, 175); Serial.println("Turn Left"); }
    else if (cmd == "r") { drive(175, -175); Serial.println("Turn Right"); }
    else { drive(0, 0); digitalWrite(STATUS_LED, LOW); Serial.println("Stopped"); }
  }

  float d = ultrasonicReadCm(TRIG, ECHO);
  float yaw = imu.readYawDeg();
  Serial.print("DIST=");
  Serial.print(d);
  Serial.print("cm  YAW=");
  Serial.print(yaw);
  Serial.println("deg");
  delay(500);
}
`;

export const ROOM_MAPPING_SKETCH = `// RoboForge Autonomous 360-Deg Room Mapper (Zero-Collision SLAM Explorer)
// Uses ONLY MPU6050 gyro + HC-SR04 ultrasonic sensor to explore & map the entire
// 3D Arena room while keeping generous clearance around walls and demo bags.
//   Left motor: GPIO 25/26 | Right motor: GPIO 27/14
//   MPU6050 + OLED I2C: SDA 32, SCL 33 | HC-SR04: TRIG 13, ECHO 35

const int L_FWD = 25;
const int L_REV = 26;
const int R_FWD = 27;
const int R_REV = 14;
const int TRIG = 13;
const int ECHO = 35;
const int STATUS_LED = 4;

const int CRUISE_PWM = 205;
const int TURN_PWM = 185;
const float SAFE_FRONT_CM = 62.0;
const float SAFE_SHOULDER_CM = 54.0;
const float HOLD_KP = 3.2;
const float HOLD_KD = 0.25;

float scans[20];
float lastHeading = 0.0;
int sweepCount = 0;

float wrap180(float a) {
  while (a > 180.0) { a -= 360.0; }
  while (a <= -180.0) { a += 360.0; }
  return a;
}

void setMotors(int leftPwm, int rightPwm) {
  leftPwm = constrain(leftPwm, -255, 255);
  rightPwm = constrain(rightPwm, -255, 255);
  analogWrite(L_FWD, leftPwm > 0 ? leftPwm : 0);
  analogWrite(L_REV, leftPwm < 0 ? -leftPwm : 0);
  analogWrite(R_FWD, rightPwm > 0 ? rightPwm : 0);
  analogWrite(R_REV, rightPwm < 0 ? -rightPwm : 0);
}

void stopMotors() {
  setMotors(0, 0);
}

void turnToYaw(float goalDeg) {
  goalDeg = wrap180(goalDeg);
  for (int i = 0; i < 160; i++) {
    float err = wrap180(goalDeg - imu.readYawDeg());
    if (abs(err) < 5.0) break;
    int p = abs(err) > 22.0 ? TURN_PWM : 162;
    if (err > 0) {
      setMotors(-p, p);
    } else {
      setMotors(p, -p);
    }
    delay(24);
  }
  stopMotors();
  delay(60);
}

float readSafeCm() {
  float d = ultrasonicReadCm(TRIG, ECHO);
  if (d < 0) return 380.0;
  return d;
}

void sweep360() {
  stopMotors();
  digitalWrite(STATUS_LED, LOW);
  for (int i = 0; i < 20; i++) {
    scans[i] = 380.0;
  }
  float prevYaw = imu.readYawDeg();
  float swept = 0.0;
  unsigned long startMs = millis();

  // Smooth continuous 360-deg radar spin (~1.5 s)
  setMotors(-TURN_PWM, TURN_PWM);
  while (swept < 355.0 && millis() - startMs < 2600) {
    float nowYaw = imu.readYawDeg();
    float step = abs(wrap180(nowYaw - prevYaw));
    swept += step;
    prevYaw = nowYaw;

    float rel = wrap180(nowYaw);
    if (rel < 0) rel += 360.0;
    int bin = constrain((int)(rel / 18.0), 0, 19);
    float d = readSafeCm();
    if (d < scans[bin]) scans[bin] = d;
    delay(24);
  }
  stopMotors();
  delay(60);
  digitalWrite(STATUS_LED, HIGH);
}

float pickExplorationHeading() {
  float reverseDir = wrap180(lastHeading + 180.0);
  // Keep turning clockwise (~ -72 deg) around room perimeter when open lanes exist
  float perimeterHint = wrap180(lastHeading - 68.0);
  float bestScore = -9999.0;
  float bestAngle = wrap180(lastHeading - 90.0);
  float fallbackMax = -1.0;
  float fallbackAngle = bestAngle;

  for (int i = 0; i < 20; i++) {
    float cand = wrap180(i * 18.0 + 9.0);
    if (scans[i] > fallbackMax) {
      fallbackMax = scans[i];
      fallbackAngle = cand;
    }

    int prev = (i + 19) % 20;
    int next = (i + 1) % 20;
    int prev2 = (i + 18) % 20;
    int next2 = (i + 2) % 20;
    float shoulder = min(scans[prev], scans[next]);
    float wideShoulder = min(scans[prev2], scans[next2]);
    float corridor = min(scans[i], min(shoulder, wideShoulder * 1.15));
    if (shoulder < SAFE_SHOULDER_CM || scans[i] < 95.0) continue;

    float revDiff = abs(wrap180(cand - reverseDir));
    float hintDiff = abs(wrap180(cand - perimeterHint));
    float sameDiff = abs(wrap180(cand - lastHeading));

    // Strongly favor long unexplored open corridors while avoiding going straight back
    float score = min(corridor, 260.0) * 1.35 - hintDiff * 0.25;
    if (sameDiff < 25.0) score -= 40.0;
    if (revDiff < 60.0) score -= 180.0;

    if (score > bestScore) {
      bestScore = score;
      bestAngle = cand;
    }
  }
  return bestScore > -9000.0 ? bestAngle : fallbackAngle;
}

void updateOled(String phase, float distCm) {
  oled.clear();
  oled.println("SLAM MAPPER");
  oled.print("PHASE: "); oled.println(phase);
  oled.print("SCAN#: "); oled.println(sweepCount);
  oled.print("DIST:  "); oled.print(distCm); oled.println("cm");
}

void setup() {
  Serial.begin(115200);
  pinMode(L_FWD, OUTPUT); pinMode(L_REV, OUTPUT);
  pinMode(R_FWD, OUTPUT); pinMode(R_REV, OUTPUT);
  pinMode(TRIG, OUTPUT); pinMode(ECHO, INPUT);
  pinMode(STATUS_LED, OUTPUT);

  imu.begin();
  digitalWrite(STATUS_LED, HIGH);
  Serial.println("Autonomous Room Mapper ready: sweeping 360 deg...");
}

void loop() {
  sweepCount = sweepCount + 1;
  updateOled("360 SCAN", readSafeCm());
  sweep360();

  float nextHeading = pickExplorationHeading();
  turnToYaw(nextHeading);
  lastHeading = nextHeading;

  float frontCm = readSafeCm();
  Serial.print("Sweep #"); Serial.print(sweepCount);
  Serial.print(" -> heading "); Serial.print(nextHeading);
  Serial.print(" deg (clear "); Serial.print(frontCm); Serial.println(" cm)");

  if (frontCm < SAFE_FRONT_CM) {
    return;
  }

  // Cruise smoothly down the open corridor up to ~3.4 s with +/-10 deg fan sweep, halting safely at 62 cm
  updateOled("EXPLORE", frontCm);
  unsigned long startMs = millis();
  while (millis() - startMs < 3400) {
    float d = readSafeCm();
    if (d < SAFE_FRONT_CM) {
      Serial.print("Clearance stop at "); Serial.print(d); Serial.println(" cm.");
      break;
    }
    float elapsed = millis() - startMs;
    float fanOffset = 10.0 * sin(elapsed * 0.006);
    float desired = wrap180(nextHeading + fanOffset);
    float err = wrap180(imu.readYawDeg() - desired);
    float rate = imu.readYawRate();
    float steer = constrain(HOLD_KP * err + HOLD_KD * rate, -55, 55);
    setMotors(CRUISE_PWM + steer, CRUISE_PWM - steer);
    delay(28);
  }
  stopMotors();
  delay(60);
}
`;

export const SKETCH_TEMPLATES: SketchTemplate[] = [
  { id: 'bag_pass', label: 'Bag-Pass + Heading-Hold + OLED', code: BAG_PASS_SKETCH },
  { id: 'room_mapper', label: 'Autonomous 360° Room Mapper', code: ROOM_MAPPING_SKETCH },
  { id: 'quad_spin', label: '5" Quad ESC Motor Ramp Test', code: QUAD_SPIN_TEST_SKETCH },
  { id: 'gap_sweep', label: 'Reality-Gap Drift Sweep', code: CALIBRATION_SWEEP_SKETCH },
  { id: 'serial_cmd', label: 'Serial Console & Sensors', code: TELEMETRY_SERIAL_SKETCH },
];

export const DEFAULT_ARENA_OBSTACLES: StudioProject['obstacles'] = [
  {
    id: 'bag_1',
    kind: 'bag',
    label: 'Demo Bag 1',
    position: [0.0, 0, 0.7],
    size: [0.3, 0.24, 0.24],
    color: '#d97706',
  },
  {
    id: 'bag_2',
    kind: 'bag',
    label: 'Demo Bag 2',
    position: [0.0, 0, -1.05],
    size: [0.3, 0.24, 0.24],
    color: '#b45309',
  },
];

export const DEFAULT_FAULTS: StudioProject['faults'] = {
  leftMotorScale: 1.0,
  rightMotorScale: 0.94,
  minStartPwm: 145,
  gyroDriftDegPerSec: 0.15,
  floorFriction: 0.65,
  usNoiseCm: 0.4,
};

function makeRoboForgeRoverPreset(): StudioProject {
  return {
    version: 1,
    name: 'RoboForge 2WD Rover (Wired)',
    description:
      'Complete ESP32 rover matching hardware pinout (L:25/26, R:27/14, MPU:32/33, HC-SR04:13/35 with 10k/10k divider, 2S->LM2596->5.2V, 1000uF cap, OLED, ESP32-CAM).',
    circuitProtection: true,
    code: BAG_PASS_SKETCH,
    arena: { ...DEFAULT_ARENA_CONFIG },
    obstacles: DEFAULT_ARENA_OBSTACLES,
    faults: DEFAULT_FAULTS,
    components: [
      { id: 'chassis_1', kind: 'chassis_2wd', label: '2WD Carbon Chassis', position: [0, 0, 0], rotationY: 0 },
      { id: 'esp32_1', kind: 'esp32_devkit', label: 'ESP32 Main', position: [-3.5, 0.45, 0.5], rotationY: 0 },
      { id: 'drv_1', kind: 'drv8833', label: 'DRV8833 Driver', position: [3.2, 0.45, 0.2], rotationY: 0 },
      { id: 'mpu_1', kind: 'mpu6050', label: 'MPU6050 IMU', position: [-3.5, 0.45, -5.2], rotationY: 0 },
      { id: 'oled_1', kind: 'oled_ssd1306', label: '0.96" OLED', position: [-0.2, 0.45, -5.5], rotationY: 0 },
      { id: 'us_1', kind: 'hcsr04', label: 'HC-SR04 Front', position: [0.5, 0.45, -8.8], rotationY: 0 },
      { id: 'res_top', kind: 'resistor_10k', label: 'R1 10k (ECHO)', position: [-3.2, 0.45, -8.2], rotationY: 0 },
      { id: 'res_bot', kind: 'resistor_10k', label: 'R2 10k (GND)', position: [-5.8, 0.45, -7.2], rotationY: Math.PI / 2 },
      { id: 'bat_1', kind: 'battery_2s', label: '2S Li-Ion 7.4V', position: [0.0, 0.45, 6.2], rotationY: Math.PI / 2 },
      { id: 'buck_1', kind: 'lm2596_buck', label: 'LM2596 5.2V', position: [3.6, 0.45, -4.6], rotationY: 0 },
      { id: 'cap_1', kind: 'cap_1000uf', label: '1000uF Bulk Cap', position: [5.6, 0.45, -1.8], rotationY: 0 },
      // gearboxes bolted against the chassis' side brackets (deck half-width 7.2 cm + half gearbox 0.94 cm)
      { id: 'motor_l', kind: 'dc_motor', label: 'Left Motor', position: [-8.14, 0.0, 1.2], rotationY: 0, side: 'left' },
      { id: 'motor_r', kind: 'dc_motor', label: 'Right Motor', position: [8.14, 0.0, 1.2], rotationY: 0, side: 'right' },
      { id: 'cam_1', kind: 'esp32_cam', label: 'ESP32-CAM', position: [4.2, 0.45, -8.0], rotationY: 0 },
      { id: 'res_led', kind: 'resistor_10k', label: 'R3 LED Res', position: [0.2, 0.45, -1.2], rotationY: 0 },
      { id: 'led_1', kind: 'led_5mm', label: 'Status LED', position: [0.2, 0.45, -2.8], rotationY: 0, color: '#22c55e' },
    ],
    wires: [
      { id: 'w1', from: { componentId: 'bat_1', pinId: 'BAT_POS' }, to: { componentId: 'buck_1', pinId: 'IN_POS' }, color: '#ef4444', style: 'routed' },
      { id: 'w2', from: { componentId: 'bat_1', pinId: 'GND' }, to: { componentId: 'buck_1', pinId: 'IN_NEG' }, color: '#1e293b', style: 'routed' },
      { id: 'w3', from: { componentId: 'buck_1', pinId: 'OUT_POS' }, to: { componentId: 'esp32_1', pinId: 'VIN' }, color: '#ef4444', style: 'routed' },
      { id: 'w4', from: { componentId: 'buck_1', pinId: 'OUT_POS' }, to: { componentId: 'drv_1', pinId: 'VM' }, color: '#ef4444', style: 'routed' },
      { id: 'w5', from: { componentId: 'buck_1', pinId: 'OUT_POS' }, to: { componentId: 'us_1', pinId: 'VCC' }, color: '#ef4444', style: 'routed' },
      { id: 'w6', from: { componentId: 'buck_1', pinId: 'OUT_POS' }, to: { componentId: 'cam_1', pinId: '5V' }, color: '#ef4444', style: 'routed' },

      { id: 'w7', from: { componentId: 'buck_1', pinId: 'OUT_NEG' }, to: { componentId: 'esp32_1', pinId: 'GND_R' }, color: '#1e293b', style: 'routed' },
      { id: 'w8', from: { componentId: 'buck_1', pinId: 'OUT_NEG' }, to: { componentId: 'drv_1', pinId: 'GND' }, color: '#1e293b', style: 'routed' },
      { id: 'w9', from: { componentId: 'esp32_1', pinId: 'GND_L' }, to: { componentId: 'mpu_1', pinId: 'GND' }, color: '#1e293b', style: 'routed' },
      { id: 'w10', from: { componentId: 'mpu_1', pinId: 'GND' }, to: { componentId: 'mpu_1', pinId: 'AD0' }, color: '#1e293b', style: 'routed' },
      { id: 'w11', from: { componentId: 'buck_1', pinId: 'OUT_NEG' }, to: { componentId: 'us_1', pinId: 'GND' }, color: '#1e293b', style: 'routed' },
      { id: 'w12', from: { componentId: 'buck_1', pinId: 'OUT_NEG' }, to: { componentId: 'cam_1', pinId: 'GND' }, color: '#1e293b', style: 'routed' },

      { id: 'w13', from: { componentId: 'drv_1', pinId: 'VM' }, to: { componentId: 'cap_1', pinId: 'POS' }, color: '#dc2626', style: 'routed' },
      { id: 'w14', from: { componentId: 'drv_1', pinId: 'GND' }, to: { componentId: 'cap_1', pinId: 'NEG' }, color: '#0f172a', style: 'routed' },

      { id: 'w15', from: { componentId: 'esp32_1', pinId: 'GPIO25' }, to: { componentId: 'drv_1', pinId: 'IN1' }, color: '#f97316', style: 'routed' },
      { id: 'w16', from: { componentId: 'esp32_1', pinId: 'GPIO26' }, to: { componentId: 'drv_1', pinId: 'IN2' }, color: '#eab308', style: 'routed' },
      { id: 'w17', from: { componentId: 'esp32_1', pinId: 'GPIO27' }, to: { componentId: 'drv_1', pinId: 'IN3' }, color: '#22c55e', style: 'routed' },
      { id: 'w18', from: { componentId: 'esp32_1', pinId: 'GPIO14' }, to: { componentId: 'drv_1', pinId: 'IN4' }, color: '#06b6d4', style: 'routed' },

      { id: 'w19', from: { componentId: 'drv_1', pinId: 'OUT1' }, to: { componentId: 'motor_l', pinId: 'M_POS' }, color: '#fb923c', style: 'routed' },
      { id: 'w20', from: { componentId: 'drv_1', pinId: 'OUT2' }, to: { componentId: 'motor_l', pinId: 'M_NEG' }, color: '#facc15', style: 'routed' },
      { id: 'w21', from: { componentId: 'drv_1', pinId: 'OUT3' }, to: { componentId: 'motor_r', pinId: 'M_POS' }, color: '#4ade80', style: 'routed' },
      { id: 'w22', from: { componentId: 'drv_1', pinId: 'OUT4' }, to: { componentId: 'motor_r', pinId: 'M_NEG' }, color: '#22d3ee', style: 'routed' },

      { id: 'w23', from: { componentId: 'esp32_1', pinId: '3V3' }, to: { componentId: 'mpu_1', pinId: 'VCC' }, color: '#f43f5e', style: 'routed' },
      { id: 'w24', from: { componentId: 'esp32_1', pinId: 'GPIO32' }, to: { componentId: 'mpu_1', pinId: 'SDA' }, color: '#3b82f6', style: 'routed' },
      { id: 'w25', from: { componentId: 'esp32_1', pinId: 'GPIO33' }, to: { componentId: 'mpu_1', pinId: 'SCL' }, color: '#a855f7', style: 'routed' },

      // OLED shares I2C bus (3V3, GND, SDA, SCL)
      { id: 'w34', from: { componentId: 'mpu_1', pinId: 'VCC' }, to: { componentId: 'oled_1', pinId: 'VCC' }, color: '#f43f5e', style: 'routed' },
      { id: 'w35', from: { componentId: 'mpu_1', pinId: 'GND' }, to: { componentId: 'oled_1', pinId: 'GND' }, color: '#1e293b', style: 'routed' },
      { id: 'w36', from: { componentId: 'mpu_1', pinId: 'SDA' }, to: { componentId: 'oled_1', pinId: 'SDA' }, color: '#3b82f6', style: 'routed' },
      { id: 'w37', from: { componentId: 'mpu_1', pinId: 'SCL' }, to: { componentId: 'oled_1', pinId: 'SCL' }, color: '#a855f7', style: 'routed' },

      { id: 'w26', from: { componentId: 'esp32_1', pinId: 'GPIO13' }, to: { componentId: 'us_1', pinId: 'TRIG' }, color: '#14b8a6', style: 'routed' },
      { id: 'w27', from: { componentId: 'us_1', pinId: 'ECHO' }, to: { componentId: 'res_top', pinId: 'B' }, color: '#ec4899', style: 'routed' },
      { id: 'w28', from: { componentId: 'res_top', pinId: 'A' }, to: { componentId: 'esp32_1', pinId: 'GPIO35' }, color: '#f472b6', style: 'routed' },
      { id: 'w29', from: { componentId: 'esp32_1', pinId: 'GPIO35' }, to: { componentId: 'res_bot', pinId: 'A' }, color: '#94a3b8', style: 'routed' },
      { id: 'w30', from: { componentId: 'res_bot', pinId: 'B' }, to: { componentId: 'esp32_1', pinId: 'GND_L' }, color: '#1e293b', style: 'routed' },

      { id: 'w31', from: { componentId: 'esp32_1', pinId: 'GPIO4' }, to: { componentId: 'res_led', pinId: 'A' }, color: '#84cc16', style: 'routed' },
      { id: 'w32', from: { componentId: 'res_led', pinId: 'B' }, to: { componentId: 'led_1', pinId: 'ANODE' }, color: '#84cc16', style: 'routed' },
      { id: 'w33', from: { componentId: 'led_1', pinId: 'CATHODE' }, to: { componentId: 'esp32_1', pinId: 'GND_R' }, color: '#1e293b', style: 'routed' },
    ],
  };
}

function makeQuad5InPreset(): StudioProject {
  const forest = getArenaTemplate('forest_park');
  return {
    version: 1,
    name: '5-Inch Freestyle Quadcopter',
    description:
      'True-X carbon-fiber 5-inch quad with red anodized standoffs, 4x 2207 brushless motors & 3-blade props, F7+45A ESC stack, 6S LiPo XT60, TPU FPV antenna, and Pine Forest flight arena.',
    circuitProtection: true,
    code: QUAD_SPIN_TEST_SKETCH,
    arena: forest.config,
    obstacles: forest.obstacles,
    faults: DEFAULT_FAULTS,
    components: [
      { id: 'frame_1', kind: 'frame_quad_5in', label: '5" Carbon X-Frame', position: [0, 0, 0], rotationY: 0 },
      { id: 'fc_1', kind: 'fc_esc_stack', label: 'F7 FC + 45A ESC', position: [0, 0.35, 0], rotationY: 0 },
      { id: 'lipo_1', kind: 'battery_6s_lipo', label: '6S 1100mAh LiPo', position: [0, 3.15, -0.3], rotationY: 0 },
      { id: 'vtx_1', kind: 'vtx_antenna', label: '5.8GHz FPV VTX', position: [0, 3.15, 4.1], rotationY: 0 },
      { id: 'm1_fl', kind: 'brushless_2207', label: 'Motor 1 (FL CW)', position: [-8.6, 0.42, -8.6], rotationY: Math.PI / 4, side: 'left' },
      { id: 'm2_fr', kind: 'brushless_2207', label: 'Motor 2 (FR CCW)', position: [8.6, 0.42, -8.6], rotationY: -Math.PI / 4, side: 'right' },
      { id: 'm3_rl', kind: 'brushless_2207', label: 'Motor 3 (RL CCW)', position: [-8.6, 0.42, 8.6], rotationY: (3 * Math.PI) / 4, side: 'right' },
      { id: 'm4_rr', kind: 'brushless_2207', label: 'Motor 4 (RR CW)', position: [8.6, 0.42, 8.6], rotationY: -(3 * Math.PI) / 4, side: 'left' },
    ],
    wires: [
      { id: 'qw1', from: { componentId: 'lipo_1', pinId: 'BAT_POS' }, to: { componentId: 'fc_1', pinId: 'BAT_POS' }, color: '#ef4444', style: 'routed', clearanceCm: 0.35 },
      { id: 'qw2', from: { componentId: 'lipo_1', pinId: 'GND' }, to: { componentId: 'fc_1', pinId: 'GND' }, color: '#18181b', style: 'routed', clearanceCm: 0.35 },
      { id: 'qw3', from: { componentId: 'fc_1', pinId: '5V_BEC' }, to: { componentId: 'vtx_1', pinId: '5V' }, color: '#f97316', style: 'routed', clearanceCm: 0.4 },
      { id: 'qw4', from: { componentId: 'fc_1', pinId: 'GND' }, to: { componentId: 'vtx_1', pinId: 'GND' }, color: '#18181b', style: 'routed', clearanceCm: 0.3 },
      { id: 'qw5', from: { componentId: 'fc_1', pinId: 'M1' }, to: { componentId: 'm1_fl', pinId: 'PHASE' }, color: '#38bdf8', style: 'routed', clearanceCm: 0.2 },
      { id: 'qw6', from: { componentId: 'fc_1', pinId: 'M2' }, to: { componentId: 'm2_fr', pinId: 'PHASE' }, color: '#eab308', style: 'routed', clearanceCm: 0.2 },
      { id: 'qw7', from: { componentId: 'fc_1', pinId: 'M3' }, to: { componentId: 'm3_rl', pinId: 'PHASE' }, color: '#d946ef', style: 'routed', clearanceCm: 0.2 },
      { id: 'qw8', from: { componentId: 'fc_1', pinId: 'M4' }, to: { componentId: 'm4_rr', pinId: 'PHASE' }, color: '#22c55e', style: 'routed', clearanceCm: 0.2 },
    ],
  };
}

function makeFaultLabPreset(): StudioProject {
  const base = makeRoboForgeRoverPreset();
  const removeIds = new Set(['res_top', 'res_bot', 'cap_1', 'res_led', 'oled_1']);
  const components = base.components.filter((c) => !removeIds.has(c.id));
  const wires = base.wires
    .filter(
      (w) =>
        !removeIds.has(w.from.componentId) &&
        !removeIds.has(w.to.componentId) &&
        w.id !== 'w21' &&
        w.id !== 'w22',
    )
    .concat([
      { id: 'wf1', from: { componentId: 'us_1', pinId: 'ECHO' }, to: { componentId: 'esp32_1', pinId: 'GPIO35' }, color: '#ec4899', style: 'routed' },
      { id: 'wf2', from: { componentId: 'esp32_1', pinId: 'GPIO4' }, to: { componentId: 'led_1', pinId: 'ANODE' }, color: '#84cc16', style: 'routed' },
      { id: 'wf3', from: { componentId: 'drv_1', pinId: 'OUT3' }, to: { componentId: 'motor_r', pinId: 'M_NEG' }, color: '#4ade80', style: 'routed' },
      { id: 'wf4', from: { componentId: 'drv_1', pinId: 'OUT4' }, to: { componentId: 'motor_r', pinId: 'M_POS' }, color: '#22d3ee', style: 'routed' },
    ]);

  return {
    ...base,
    name: 'Wiring Fault Diagnostics Lab',
    description:
      'Intentional beginner wiring mistakes: un-divided 5V ECHO into GPIO35, LED missing resistor, missing bulk cap, and swapped right motor wires.',
    components,
    wires,
  };
}

function makeBlankBenchPreset(): StudioProject {
  return {
    version: 1,
    name: 'Blank Workbench',
    description: 'Start fresh with an ESP32 DevKit and 2S Battery. Add parts or CAD shapes from the sidebar.',
    circuitProtection: true,
    code: TELEMETRY_SERIAL_SKETCH,
    obstacles: DEFAULT_ARENA_OBSTACLES,
    faults: DEFAULT_FAULTS,
    components: [
      { id: 'esp32_1', kind: 'esp32_devkit', label: 'ESP32 Main', position: [-3.5, 0.1, 0], rotationY: 0 },
      { id: 'bat_1', kind: 'battery_2s', label: '2S Li-Ion 7.4V', position: [5.0, 0.1, 0], rotationY: 0 },
    ],
    wires: [],
  };
}

function makeRoomMapperPreset(): StudioProject {
  const base = makeRoboForgeRoverPreset();
  return {
    ...base,
    name: 'Autonomous 360° Room Mapper',
    description:
      '2WD Rover running the automated 360° ultrasonic SLAM exploration script to map the 3D Arena with zero collisions.',
    code: ROOM_MAPPING_SKETCH,
  };
}

export interface PresetEntry {
  id: string;
  label: string;
  create: () => StudioProject;
}

export const STUDIO_PRESETS: PresetEntry[] = [
  { id: 'roboforge_rover', label: 'RoboForge 2WD Rover (Wired)', create: makeRoboForgeRoverPreset },
  { id: 'room_mapper', label: 'Autonomous 360° Room Mapper', create: makeRoomMapperPreset },
  { id: 'quad_5in', label: '5-Inch Freestyle Quadcopter', create: makeQuad5InPreset },
  { id: 'fault_lab', label: 'Circuit Fault Diagnostics Lab', create: makeFaultLabPreset },
  { id: 'blank_bench', label: 'Blank Workbench', create: makeBlankBenchPreset },
];

/**
 * Creates a fresh deep copy of the named preset project (defaults to the RoboForge 2WD Rover).
 */
export function createPresetProject(presetId: string): StudioProject {
  const found = STUDIO_PRESETS.find((p) => p.id === presetId) ?? STUDIO_PRESETS[0]!;
  return structuredClone(found.create());
}
