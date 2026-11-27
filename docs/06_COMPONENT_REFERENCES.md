# 06 · Component references

What each 3D part is modelled on, the real numbers used, and what is simplified. Dimensions and pin positions live in
one place, `src/catalog/boardGeometry.ts`, which both the parts catalog (pin positions used by wiring and the circuit
check) and the 3D builders (`src/viewport/parts/*.ts`) read, so a wire always lands on the pin that is drawn.

Units: millimetres here (datasheet units); the scene uses centimetres. "Source" says where a number came from.
"Not checked against a photo" marks values taken from a datasheet or footprint without a photo comparison.

## How parts are built

- **Boards**: 1.6 mm FR-4 with rounded corners and drilled holes; the tan glass-epoxy shows on the cut edges. The top
  face is drawn in real millimetres (traces under the mask with their clearance in the pour, exposed ENIG/HASL pads,
  plated holes, vias, silkscreen) as a colour map, a roughness/metal map and a bump map.
- **Headers**: 2.54 mm pitch, 2.5 mm black spacer, 0.64 mm square pin with a pointed tip standing 6 mm above the
  spacer, trimmed pin and solder fillet under the board. Pins are drawn pointing up so DuPont sockets fit from above
  (most modules ship with the header pointing down; see "Known differences").
- **Packages**: SOIC, TSSOP/HTSSOP, LQFP, QFN, SOT-23, SOT-223, TO-263, SMA/SMB, chip passives (0402-2512),
  HC-49/S and 3225 crystals, SMD tact switches, Micro-USB, USB-C, RF shield cans at their datasheet sizes, with gull-wing
  leads modelled from the side profile and laser markings that run along the long side.
- **Wire ends**: a DuPont socket (2.5 x 2.5 x 14 mm) on header pins; a solder joint with heat-shrink on component
  leads, solder tabs and pads. Pins that point sideways (HC-SR04) or along a lead get their socket/joint in that
  direction.

## Parts

| Part | Real size used | Pins / layout | Source | Simplified or inferred |
| --- | --- | --- | --- | --- |
| ESP32 DevKit V1 (DOIT, 30 pin) | 51.5 x 28.3 mm board; ESP-WROOM-32 18 x 25.5 x 3.1 mm | 2 x 15 at 2.54 mm, rows 25.4 mm apart, first pin 5.6 mm from the antenna end. West: EN, VP, VN, D34, D35, D32, D33, D25, D26, D27, D14, D12, D13, GND, VIN. East: D23, D22, TX0, RX0, D21, D19, D18, D5, TX2, RX2, D4, D2, D15, GND, 3V3 | Espressif ESP-WROOM-32 datasheet (module size, 38 castellated pads at 1.27 mm); DOIT DevKit V1 pinout and board drawings | Chip positions follow the DOIT layout from photos, not a CAD file. The pin IDs used by wires are unchanged; 10 pins were added (EN, GPIO36/39/34/23/1/3/5/17/16) |
| HW-627 DRV8833 | 18.5 x 16 mm, red | 2 x 6, rows 15.24 mm apart. West (from north): IN4, IN3, GND, VCC, IN2, IN1. East: EEP, OUT1-OUT4, ULT | KiCad HW-627 footprints (robopoly, DrGlaucous) and Components101 via olerast.com/en/tools/pinout/drv8833-module; size from ebits.dk and pschatzmann.ch; red board from tinkered.ai; TI DRV8833 datasheet (HTSSOP-16 pin order) | EEP and ULT were added as pins. Power LED colour not confirmed |
| GY-521 (MPU-6050) | ~21.2 x 16.4 mm, blue, two 3 mm holes | 8 in a row: VCC, GND, SCL, SDA, XDA, XCL, AD0, INT | InvenSense MPU-6000/6050 datasheet (QFN-24 4 x 4 mm); GY-521 photos | Board size is approximate (clone boards vary by ~1 mm); XDA, XCL, INT added |
| 0.96" SSD1306 OLED (I2C) | 27.3 x 27.8 mm board; glass 26.7 x 19.26 mm, active area 21.74 x 10.86 mm; 2 mm corner holes | 4 at the north edge: GND, VCC, SCL, SDA | Panel drawing for the 0.96" 128 x 64 SSD1306 module | Screen shows the 128 x 64 dots of a two-colour panel (top 16 rows yellow); dark when unpowered |
| HC-SR04 | 45 x 20 mm board; 16 mm transducers 26 mm apart, about 12 mm tall | 4 at the bottom centre: Vcc, Trig, Echo, Gnd (left to right from the front) | HC-SR04 user guide / datasheet; product photos | Drawn with a straight header pointing back so wires attach from behind; most boards ship with right-angle pins pointing down. Back-side chips (MAX232, LM324, EM78P153) placed from photos |
| ESP32-CAM (AI-Thinker) | 27 x 40.5 x 4.5 mm | 2 x 8 (camera up). West: 5V, GND, IO12, IO13, IO15, IO14, IO2, IO4. East: 3V3, IO16, IO0, GND, VCC, U0R, U0T, GND | vdoc.ai-thinker.com/en/esp32-cam (size); openlabbench.gwark.dev and espboards.dev (pin order); AI-Thinker schematic | Row spacing (22.86 mm) and row offset are not in the datasheet; the pins are drawn up through the board like the DevKit. Only 5V and GND matter to the simulation |
| 6 x 6 mm tact switch | 6 x 6 x 5 mm, legs 6.5 x 4.5 mm | A and B are the two legs on one side (switched) | Omron B3F-style datasheet | Stands on its legs; wires are soldered to the leg sides |
| TT gearmotor + wheel | Gearbox ~70 x 22.5 x 18.8 mm with 130 motor; wheel 65 x 26 mm | Two solder tabs on the motor end cap | Common TT motor specs (Adafruit/DFRobot listings) | **Not fetched in this round** (from general knowledge). Axle is 32.5 mm up so the wheel stands on the bench; the chassis carries brackets the gearbox bolts to |
| 2207 motor + 5" prop | 27.9 mm bell, 16 x 16 mm M3 base, 5.0" (127 mm) 4.3-pitch tri-blade | Three phase wires toward the frame centre | FPV motor and prop specs | Blades lofted from cambered sections with pitch angle atan(P / 2 pi r); exact blade shape of a given brand not copied |
| 2S Li-ion pack | 2 x 18650 side by side (~37 x 19 x 65 mm) | Red and black leads with tinned ends | 18650 size (18.6 x 65 mm) | Wrap colour and label are generic |
| 6S 1100 mAh LiPo | ~35 x 33 x 69 mm pack; XT60 15.8 x 8.1 x 16 mm | XT60 contacts 7.2 mm apart | XT60 drawing | **XT60 size from general knowledge**. Label is generic (no brand) |
| LM2596 module | 43.2 x 21 mm, blue, two 3 mm holes | IN+, IN-, OUT+, OUT- corner pads | LM2596 datasheet (TO-263-5 10.1 x 8.9 mm); module photos | Part positions and hole positions approximated from photos |
| 1/4 W resistor 10 k | 6.3 x 2.3 mm body, 0.6 mm leads | Two leads | Carbon-film resistor dimensions; IEC 60062 colour code | Bands brown-black-orange-gold (10 k, 5 %) |
| 5 mm LED | 5.0 mm body, 5.8 mm flange with cathode flat, 8.6 mm tall, 2.54 mm lead spacing | Anode (west), cathode (east, flat side) | Generic 5 mm LED drawing | Legs bent into feet at the bench |
| 1000 uF 16 V cap | 10 x 20 mm, 5 mm lead spacing | Pos (west), Neg (east, under the stripe) | Radial electrolytic series sizes (e.g. 1000 uF 16 V = 10 x 20 mm) | Generic black sleeve |
| F7 FC + 45 A 4-in-1 ESC | 36 x 36 mm boards, 30.5 x 30.5 mm holes, grommets | Battery pads at the ESC rear; three phase pads per motor; 5V pad on the FC | Typical 30.5 mm stack layouts | Chip layout is representative, not a specific product |
| 2WD carbon chassis | 144 x 192 x 3 mm deck | — | Project's own part | Carbon weave is 3K 2x2 twill; motor brackets added; the old description's caster was removed (a caster cannot sit under a deck lying on the bench) |
| 5" X frame | Motor mounts on a 243 mm diagonal, 4 mm bottom plate, 2 mm top plate, 25 mm standoffs | — | Typical 5" true-X frames | Unibody outline is representative |
| FPV antenna + TPU mount | ~6 cm tall | 5V, GND leads | Pagoda antenna photos | Representative |
| CAD shapes | Your size | — | — | Printed parts show 0.2 mm layer lines; plate is twill carbon; standoff is 5 mm hex aluminium |

## Extended library (added 2026-11-27)

35 parts in `src/catalog/partsCatalogExtra.ts`, their sizes and pin positions in `src/catalog/moduleGeometry.ts`, the
3D builders in `src/viewport/parts/*Extra*.ts`. All are **wiring only** (see [07_PARTS_LIBRARY.md](07_PARTS_LIBRARY.md)).
**None of these numbers was re-checked against a datasheet drawing or a photo in this round**: they come from general
knowledge of the common module layouts and datasheet package sizes. Clone boards vary by a millimetre or two.

| Part | Size used (mm) | Pins / layout | Simplified or inferred |
| --- | --- | --- | --- |
| SG90 servo | case 22.4 x 11.8 x 22.7, tabs 32.2 wide | GND (brown), V+ (red), SIG (orange) on a 3-pin header adapter pointing east | Lead shortened; horn drawn along the case |
| MG996R servo | case 40.7 x 19.7 x 37.2, tabs 54 wide | Same as the SG90 | Brass spline; lead shortened |
| 28BYJ-48 + ULN2003 board | board 35 x 32; motor 28 mm, ears 42 mm apart | IN1-IN4 (west), - / + (south) | Motor lies north of the board with a short lead into the JST XH socket |
| N20 gearmotor | 12 x 10 section, 15 mm can, 9.3 mm gearbox, 3 mm shaft | M+, M- solder tabs (east end) | Gear train simplified |
| Active buzzer (KY-012) | board 18.5 x 15, buzzer 12 x 9.5 | S, +, - (south edge) | |
| 1-channel relay | board 50 x 26, SRD-05VDC 19 x 15.5 x 15.3 | DC+, DC-, IN (west); NO, COM, NC screw terminal (east) | Driver parts placed from typical layouts |
| DHT22 / AM2302 | 15.1 x 25 x 7.7 case | VCC, DATA, NC, GND legs bent into feet (south) | Inside of the grille simplified |
| NEO-6M GPS (GY-NEO6MV2) | board 25 x 35, antenna 25 x 25 x 4 | VCC, RX, TX, GND (south edge) | Antenna lies beside the board on its coax |
| TCRT5000 line sensor | board 32 x 14, sensor 10.2 x 5.8 x 7 | VCC, GND, DO, AO (west) | |
| WS2812B stick (8) | board 53 x 10.2, LEDs 5 x 5 at 5.9 mm | GND, DIN, 5V pads (west); GND, DOUT, 5V pads (east) | |
| L298N | board 43 x 43, heatsink 22 x 22 x 14 | ENA, IN1-IN4, ENB header (south); OUT1/OUT2 west, OUT3/OUT4 east, +12V / GND / +5V south (screw terminals) | ENA/ENB jumpers shown removed; terminal positions moved clear of the corner holes |
| TB6612FNG breakout | 20.5 x 20.5 | 2 x 8, rows 15.24 apart | SSOP-24 drawn with the TSSOP model |
| A4988 carrier | 15.24 x 20.32 | 2 x 8, rows 12.7 apart | No heatsink fitted; pin names are under the real board, shown on hover |
| MT3608 boost | 36 x 17 | VIN+, VIN- pads (west); VOUT+, VOUT- (east) | Shown set to 5.0 V |
| TP4056 (USB-C, protected) | 28 x 17 | OUT+, B+, B-, OUT- pads (east) | |
| AMS1117-3.3 module | 22 x 17 | IN, GND, 3V3 (south) | Tantalum capacitors |
| 4 x AA holder | 62.5 x 57.5 x 15.2 | Red and black leads, tinned ends (south) | Generic NiMH cells |
| Rocker switch (KCD1) in a printed block | block 26 x 22 x 16, bezel 21 x 15 | Two 4.8 mm tabs (south) | The holder is a printed part, not a product |
| Arduino Nano (USB-C clone) | 18 x 45 | 2 x 15, rows 15.24 apart | CH340 and regulator are on the underside and not drawn |
| Raspberry Pi Pico | 21 x 51 | 2 x 20, rows 17.78 apart; castellated edges | Pin names on the underside, shown on hover |
| HC-05 | base 16 x 37, core module 12.7 x 27 | STATE, RXD, TXD, GND, VCC, EN (south) | |
| nRF24L01+ | 29 x 15 | 2 x 4 at the west end | Pin names under the real board |
| DS3231 (ZS-042) | 38 x 22, stands 5 mm up on its coin cell holder | 32K, SQW, SCL, SDA, VCC, GND (west); SCL, SDA, VCC, GND pass-through (east) | Holes moved to x 9 / 29 so the labels stay readable |
| microSD module | 42 x 24 | GND, VCC, MISO, MOSI, SCK, CS (west) | Socket drawn empty |
| GY-BME280 (4 pin) | 11.5 x 14 | VIN, GND, SCL, SDA (south) | 3.3 V-only version |
| GY-VL53L0XV2 | 25 x 10.7 | VIN, GND, SCL, SDA, GPIO1, XSHUT (south) | Protective film left on |
| HC-SR501 PIR | 32.3 x 24.3, dome 23 x 13 | VCC, OUT, GND right-angle header pointing south under the board | Stands on two nylon spacers; underside parts placed from typical layouts |
| KY-023 joystick | 34 x 26 | GND, +5V, VRx, VRy, SW (west) | |
| 10 k pot (9 mm) | 9.7 x 9.7 body, 6 mm shaft | A, W, B legs bent into feet (south) | |
| TM1637 display | 42 x 24, display 30 x 14 x 7.2 | CLK, DIO, VCC, GND (west) | Driver chip is on the underside, not drawn |
| MAX7219 matrix | 50 x 32, matrix 32 x 32 x 8 on 8.5 mm sockets | VCC, GND, DIN, CS, CLK (west); outputs (east) | |
| 1N4007 | DO-41, 5.2 x 2.7 body | A (west), K (east, band) | |
| 2N2222A | TO-92 | E, B, C feet (south), flat face south | |
| IRLZ44N | TO-220 | G, D, S feet (south), marked face south | |
| 100 nF ceramic | 4.2 x 4.6 x 2.6 dipped | Two feet (south), 2.54 mm | |

## Known differences from the real parts

- Header pins point up on every module so DuPont sockets can be pushed on from above; real modules usually ship with
  the header pointing down. The HC-SR04 uses a straight header pointing back.
- Parts are procedural models from datasheet numbers and photos, not manufacturer CAD files; hidden details
  (underside parts, internal structure) are simplified.
- Values marked "from general knowledge" above were not re-checked against a source in this round.
