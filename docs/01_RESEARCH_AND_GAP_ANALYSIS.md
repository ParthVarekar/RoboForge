# 01 — Competitive Research & Gap Analysis

## 1. Executive Summary & Isolation Strategy

During our evaluation of the main **RoboForge** platform (`simlab/` + `sewerbot/`), we conducted a competitive benchmark against two modern web-native robotics and hardware prototyping platforms:
1. **Constructa (`constructa-page.atumx.in`)** — an interactive 3D robotics & electronics assembly, pin-wiring, and browser-based code execution studio.
2. **BenchTwin (`benchtwin.com`)** — a precision browser-based 3D CAD & electronics workbench featuring a daylight/dark drafting mat, catalog of electronic modules & drone frames, pin-to-pin cable routing with physical cut-length calculation, real-time electrical rule checks, and a "Build it for real" BOM workflow.

To adopt the best UX, 3D CAD, wiring, and interactive electronics features from both products without risking regressions in the working RoboForge codebase, we created **`studio_trial/`** as a self-contained, clean-room trial application serving on port `8060`.

---

## 2. Detailed Breakdown of Reference Products

### 2.1 What BenchTwin Does Well
From inspecting BenchTwin's application layout and reference screenshots (`5-inch freestyle quadcopter` and `ESP32` starter benches):
- **Precision CAD Drafting Aesthetic:**
  - Clean daylight and dark studio themes with a millimeter-graduated engineering cutting mat (`10 mm` major grid, `2 mm` fine subgrid, `50 mm` bold lines).
  - Compact 3-tab Left Dock: **`Parts`** (searchable, category-filtered component cards with `SIMULATED` badges, unit price `$`, and mass `g`), **`Shapes`** (primitive blocks, cylinders, M3 standoffs, carbon plates), and **`Tasks`** (`X / Y` live bringup progress counter).
  - Top **CAD Tool Strip**: 1-click shape insertion (`Box`, `Cylinder`, `Standoff`, `CF Plate`), transform modes (`Select`, `Wire`, `Move`, `Lift`, `Turn`), quick actions (`+15°`, `Copy`, `Delete`), 3D `Measure` tape, and Center-of-Mass (`CoM`) indicator.
  - Viewport overlays: top-left collapsible **`Browser`** item tree, top-right **3D Axis Gizmo** (`X/Y/Z` orientation widget), bottom-center camera preset pill bar (`Iso`, `Top`, `Front`, `Right`, `Fit`, `Mat`, `-`, `+`), and a bottom precision status bar (`Units mm`, `Snap 1`, `Turn 15°`, live cursor `X/Y mm`, part count, total mass, estimated cost, and issue count).
- **Contextual Wire & Component Inspector:**
  - Clicking a wire opens a dedicated **Wire Card** showing endpoint pins (`LiPo 1 BAT+ -> ESC 1 BAT+`), 8 color swatches with color-coding guidance, **physical routed length and recommended cut length in millimeters** (`89 mm long, cut 130 mm`), routing style toggles, manual tie-point routing (`Route by hand`, `Clear route`, `Lay out again`), and `Delete wire`.
  - Collapsible **`Circuit checks`** accordion at the bottom of the right dock showing `All clear` or actionable electrical diagnostics.
- **High-Contrast 3D Mechanical & Electronic Assemblies:**
  - Recognizable multi-material 3D models (woven carbon-fiber frames, red anodized M3 standoffs, brushless motors with visible copper windings and blue locknuts, XT60 battery packs with Velcro straps, orange TPU antenna mounts).

### 2.2 What Constructa (AtumX) Does Well
- **Integrated Hardware-to-Arena Loop:**
  - Bridges the 3D electronics bench directly to an embedded code editor and a 3D test arena where the wired robot drives and senses obstacles.
- **Pin-Level Microcontroller Simulation:**
  - Wiring a motor driver or ultrasonic sensor to specific GPIO pins determines which `digitalWrite` / `analogWrite` calls in the user's code actually actuate the 3D robot.

### 2.3 Where Existing RoboForge (`simlab/` + `sewerbot/`) Already Excels
While Constructa and BenchTwin excel at visual 3D electronics assembly and browser-first CAD ergonomics, RoboForge already has deep engineering capabilities that neither competitor offers:
- **Reality-Gap Digital Twin Physics:** Modeling real-world hardware imperfections such as right/left DC motor gain asymmetry (`rightMotorScale: 0.85`), floor static friction deadband (`minStartPwm: 145–150`), and MPU6050 gyroscope integration drift (`gyroDriftDegPerSec`).
- **Real Hardware Pinout & Electrical Nuances:** Exact alignment with the physical ESP32 2WD rover (`L: 25/26`, `R: 27/14`, `MPU6050: 32/33`, `HC-SR04: TRIG 13 / ECHO 35` requiring a `10k/10k` voltage divider from 5 V to 3.3 V, `2S Li-Ion -> LM2596 5.2 V`, `1000 uF` bulk capacitor).
- **Multi-Simulator & Hardware Bridge:** FastAPI backends, MuJoCo/Webots/OpenSCAD pipelines, and the wireless UDP/HTTP rover contract (`docs/ROVER_API.md`).

---

## 3. Side-by-Side Capability Matrix

| Capability | Original RoboForge (`simlab`/`sewerbot`) | BenchTwin | Constructa | **RoboForge Studio Trial (`studio_trial/`)** |
| :--- | :---: | :---: | :---: | :---: |
| **Interactive 3D Electronics Workbench** | No (2D/chat-based) | Yes | Yes | **Yes (Light & Dark Studio + PMREM PBR)** |
| **High-Detail Procedural 3D Components** | Basic OpenSCAD/URDF | High | Medium | **23 Multi-Part 3D Models with PCB Silkscreens** |
| **Pin-to-Pin 3D Wire Harness Routing** | No | Yes | Yes | **Yes (Filleted Orthogonal Lanes + DuPont Plugs)** |
| **Manual Wire Tie-Points (`Route by hand`)** | No | Yes | No | **Yes (Click bench to add tie clips + cut-list mm)** |
| **Real-Time Electrical Rule & Short Checker** | Static pin notes | Yes | Partial | **Yes (Union-Find Nets, Shorts, 5V->3.3V Divider, Guard)** |
| **Power, Mass, Cost & 3D CoM Budget** | Partial | Yes | Partial | **Yes (Live mA, Runtime min, Grams, USD, 3D CoM)** |
| **Offline In-Browser C++ IDE & Transpiler** | External Arduino IDE | Partial | Yes | **Yes (Monaco Editor + Instant `Verify` + 5 Templates)** |
| **Live 4-Channel 25 Hz PWM/GPIO Oscilloscope** | No | No | No | **Yes (`Scope` Tab)** |
| **Live 3D I2C OLED (`0.96" SSD1306`) Rendering** | No | No | No | **Yes (`oled.println()` renders on 3D PCB)** |
| **Customizable Multi-World 3D Physics Arena** | Fixed Webots/MuJoCo worlds | No | Fixed arena | **Yes (5 Worlds, Resize, Draw Walls, Place Trees/Gates)** |
| **Dual Vehicle Simulation (2WD Rover + 5" Drone)** | Separate templates | Static bench | Rover only | **Yes (Ground Rover + 6-DOF Quadcopter Flight)** |
| **Live 2D Occupancy Grid SLAM Map + 3D Point Cloud** | Post-run plots | No | No | **Yes (Live `Map` Tab + Zero-Collision 360° Mapper)** |
| **Reality-Gap Fault Injector (Deadband, Drift, Trim)** | Yes (CLI/SimLab) | No | No | **Yes (Live Interactive Sliders in `Twin` Tab)** |
| **Hardware Export (`BOM + Cut-List + Bridge JSON`)** | Config files | BOM preview | No | **Yes (`Build it for real` Modal + Bridge v1 JSON)** |

---

## 4. Key Research Takeaways Implemented in `studio_trial/`

1. **Zero-Spaghetti Wiring Is Essential for 3D Electronics Readability:**
   - Early 3D wiring prototypes that use unconstrained `CatmullRomCurve3` splines bow outward like loose hair and slice across ICs. Replacing spline interpolation with **straight line segments joined by tight quadratic corner fillets (`buildFilletedCurvePath`)**, stratified power/signal heights, obstacle-aware perimeter channels, and parallel ribbon offsets makes complex 30-wire boards (like the full RoboForge 2WD Rover) look like an engineered wiring harness.
2. **Circuit Rules Must Mirror Real ESP32 Failure Modes:**
   - Generic simulators let users wire any pin to anything. Our circuit engine (`src/engine/circuit.ts`) specifically checks ESP32 hardware traps: wiring motor PWM or `HC-SR04 TRIG` to input-only `GPIO34–39`, pulling boot-strapping pins (`GPIO0/2/12/15`), wiring `5 V ECHO` straight into a `3.3 V` ESP32 pin without a `10k/10k` divider, omitting the `1000 uF` bulk capacitor on `DRV8833 VM`, or creating a direct `BAT+ -> GND` short.
3. **The 3D Arena Must Be User-Sculptable Across Domains:**
   - A fixed 4×6.4 m box is great for the RoboForge bag-pass test, but users designing a 5-inch quadcopter or testing multi-room SLAM need to reshape the world, switch to a **Pine Forest with trees and fly-through gates** or a **Warehouse Maze**, and draw custom walls directly on the floor.
