# 05 — Development Progress, Verification Matrix & Integration Roadmap

## 1. Chronological Development & Polish Progression

The `studio_trial/` application was built and refined across four structured engineering phases:

### Phase 1 — Clean-Room Foundation (`studio_trial/`)
- Scaffolded an isolated Vite 6 + React 18 + strict TypeScript + Three.js + `cannon-es` + Monaco Editor + Vitest workspace on port `8060`.
- Built the initial Union-Find circuit solver (`circuit.ts`), offline Arduino/ESP32 sketch transpiler (`sketchTranspiler.ts`), 60 Hz virtual HAL runtime (`runtime.ts`), 3D workbench & arena scenes, and `roboforge-studio-bridge/v1` exporter (`roboforgeExport.ts`).

### Phase 2 — BenchTwin / Constructa Precision CAD Upgrade
- Redesigned the UI around a **Light & Dark Precision CAD Studio** aesthetic (`styles.css`) with a `10 mm / 2 mm` graduated cutting mat, 3-tab Left Dock (`Parts`, `Shapes`, `Tasks`), top `CadToolStrip` (`Box`, `Cylinder`, `Standoff`, `CF Plate`, `Select`, `Wire`, `Move`, `Lift`, `Turn`, `+15°`, `Copy`, `Delete`, `Measure`, `CoM`), top-left `Browser` tree, top-right `AxisGizmo`, bottom camera preset pill bar, and bottom CAD status bar.
- Expanded the catalog to **23 parts** (adding `0.96" OLED SSD1306`, `6mm Tactile Push Button`, `5-Inch Carbon X-Frame`, `2207 Brushless Motor + 5" Prop`, `F7 FC + 45A 4-in-1 ESC Stack`, `6S 1100mAh LiPo XT60`, `5.8GHz FPV VTX Antenna`, and 4 CAD primitives) with 2D SVG thumbnails (`partThumbnails.ts`).
- Added the **`Scope`** tab (live 25 Hz 4-channel PWM/GPIO oscilloscope) and **`Build it for real`** BOM + Wire Cut-List modal.

### Phase 3 — Autonomous 360° Zero-Collision Room Mapper & Live 2D SLAM
- Extended `sketchTranspiler.ts` to support typed C++ arrays (`float scans[20];`), array initializers, and C-style scalar casts (`(int)`, `(float)`).
- Added a live **2D Occupancy Grid SLAM Engine** inside `ArenaPhysicsEngine` (`getOccupancyGrid()`, `clearMap()`, `exploredPercent`, `mappedHitCount`), rendered as both a real-time 2D occupancy canvas in the **`Map`** tab (`MapPanel.tsx`) and a 3D orange ultrasonic scan point cloud (`THREE.Points`) in `ArenaScene.ts`.
- Authored and verified **`ROOM_MAPPING_SKETCH`** (in-place 18-sector 360° gyro+ultrasonic sweeps + longest-corridor selection + `±10°` fan-weaving cruise with `62 cm` clearance stop), achieving `0` collisions across default, 4-obstacle, and faulty-rover test suites.

### Phase 4 — Ultra-Detailed 3D Components, Filleted Harness Wiring & Customizable Multi-World Arena
- Rebuilt all 23 component 3D meshes (`partDetailBuilders.ts`, `materials.ts`; since replaced by the datasheet-based builders in `src/viewport/parts/`, see doc 06) with procedural `512 × 512` FR-4 PCB silkscreens, ENIG gold pads, gull-wing IC leads, 12-pole wound copper brushless stators, lathe-turned hourglass resistors, internal LED reflector anvils, Y-scored electrolytic caps, deep charcoal 2×2 twill carbon weave, and Three.js `RoomEnvironment` PMREM metallic reflections.
- Replaced spline wires with **`buildFilletedCurvePath`** (`LineCurve3` + `QuadraticBezierCurve3` tight corner fillets) in `wireGeometry.ts`, adding obstacle-avoiding harness lanes, parallel ribbon offsets, cable-tie collars, square 2.54 mm DuPont female housings with crimp windows, 3-conductor parallel ESC motor looms with zip-ties, and interactive **`Route by hand`** bench tie-point placement. (Since replaced by wires that hang and rest on parts; see doc 03, section 4.)
- Added the **Customizable 3D Arena & Multi-Environment Builder** (`arenaPresets.ts`, `ArenaBuilderStrip.tsx`, `arenaMeshes.ts`, `ArenaControlsPanel.tsx`) with 5 worlds (`Indoor Lab`, `Pine Forest — Drone Space`, `Warehouse Maze`, `FPV Drone Race Airfield`, `Blank Custom Sandbox`), live width/length/wall-height sliders, 2-click `Draw Wall`, 10 click-to-place obstacle/nature primitives (including 3-tier pine trees and open-center fly-through FPV gates), and 6-DOF 5" Quadcopter flight physics.

---

## 2. Issues Caught & Resolved During Verification

| Issue Discovered | Root Cause | Resolution |
| :--- | :--- | :--- |
| **`cannon-es` `Quaternion.toEuler` Error** | `cannon-es` only supports `'YZX'` Euler order and throws on `'YXZ'`. | Replaced `toEuler` in `arenaPhysics.ts` with direct forward-vector rotation (`vmult`) and `Math.atan2(-forward.x, -forward.z)`. |
| **React 18 StrictMode Undo/Redo Desync** | Calling nested `setUndoStack` inside `setProject` updater double-invoked under StrictMode. | Consolidated `past`, `present`, and `future` into a single atomic `ProjectHistoryState` object in `App.tsx`. |
| **Dark Mode Low Text Contrast** | `body` inherited hardcoded `#0f172a` text color even when `.studio-shell[data-theme='dark']` was active. | Added `color: var(--text-primary); background: var(--bg-root);` directly on `.studio-shell` in `styles.css`. |
| **Headless HTTP Clipboard Copy Failure** | `navigator.clipboard.writeText` can reject in headless Chromium contexts. | Added a hidden `<textarea>` + `document.execCommand('copy')` fallback in `ExportModal.tsx`. |
| **Circuit Guard Block Hidden on Inspect Tab** | When `Guard: ON` blocked `Run` on a critical fault, `App.tsx` switched to `Inspect`, which didn't render `compileError`. | Added `runtimeNotice` prop and a top `diag-critical` alert banner in `InspectorPanel.tsx`. |
| **Browser `/favicon.ico` 404 Console Error** | `index.html` lacked a `<link rel="icon">`, causing Chromium to log a 404 for `/favicon.ico`. | Embedded an inline SVG circuit-bot favicon in `studio_trial/index.html`. |
| **Left-Drag Camera Rotation During `Draw Wall`** | Clicking floor corners in `Draw Wall` mode could rotate `OrbitControls`. | Disabled `orbit.enableRotate` in `ArenaScene.setEditTool` whenever `editTool !== 'select'`. |

---

## 3. Verification Matrix (All Run on Final Code)

Every check below was executed in `studio_trial/` and passed with exit code `0`:

### 3.1 Static Analysis & Production Build
- **TypeScript (`bun run typecheck`):** `tsc --noEmit` — **0 errors** (exit `0`).
- **ESLint (`bun run lint`):** `eslint src` — **0 errors, 0 warnings** (strict TypeScript rules, zero `any`, exit `0`).
- **Production Bundle (`bun run build`):** `vite build` — **2,671 modules transformed cleanly** into `studio_trial/dist/` (exit `0`).

### 3.2 Vitest Unit & Simulation Test Suites (`bun run test` — 21/21 Passed)
1. **`src/engine/__tests__/circuit.test.ts` (8 passed):**
   - Default RoboForge 2WD Rover preset resolves 0 diagnostics (`All clear`), powers ESP32/DRV8833/MPU6050/HC-SR04/OLED/CAM, and maps left (`25/26`) & right (`27/14`) motor channels.
   - Detects direct `BAT+ -> GND` short circuit as `critical`.
   - Detects `7.4 V` 2S battery wired directly to `ESP32 VIN` (`5.8 V` max) as `critical` overvoltage.
   - Warns when `HC-SR04 5V ECHO` is wired straight to `GPIO35` without the `10k/10k` voltage divider.
   - Flags `error` when a motor driver input is wired to input-only `GPIO35`.
   - Warns when `5mm LED` lacks a series current-limiting resistor.
   - Resolves forward/reverse H-bridge PWM and reverses polarity when motor leads are swapped.
   - Validates 5-Inch Freestyle Quadcopter preset (`6S LiPo -> F7 FC/ESC -> 4x 2207 motors + 5V BEC -> VTX`) with 0 issues.
2. **`src/engine/__tests__/runtime.test.ts` (5 passed):**
   - Transpiles C++ sketches and drives GPIO PWM outputs (`analogWrite`) over virtual time.
   - Rejects invalid C++ syntax with compiler error diagnostics.
   - Reads live `ultrasonicReadCm(13, 35)` and `imu.readYawDeg()` inside user `loop()`.
   - Updates 3D `oled.println()` display lines and records 25 Hz 4-channel oscilloscope waveforms.
   - Responds to 3D `tactile_button` press state via `digitalRead(pin)`.
3. **`src/engine/__tests__/arenaPhysics.test.ts` (5 passed):**
   - Detects the first demo bag (`~126.5 cm`) with the 3-ray 3D `HC-SR04` raycast from the start pose.
   - Respects motor start PWM deadband (`minStartPwm: 150`).
   - Reproduces right-pull yaw drift when `rightMotorScale = 0.80 < leftMotorScale = 1.0`.
   - Supports dynamic custom arena resizing (`12 × 10 m`), custom wall placement, and rescaled occupancy grid bounds.
   - Flies the 5" Quadcopter Drone in the `18 × 18 m` Pine Forest arena, climbing to hover altitude and flying cleanly through the open center of `Forest Gate 1` with `0` collisions.
4. **`src/engine/__tests__/roomMapper.test.ts` (3 passed):**
   - **Default 2-Bag Arena (28 s simulated):** `ROOM_MAPPING_SKETCH` maps `>= 65%` of the room (`> 2.5 m` path) with **`0` collisions**.
   - **Crowded 4-Obstacle Arena (28 s simulated):** Navigates bags, crate, and cone, mapping `>= 60%` of the room with **`0` collisions**.
   - **Faulty Rover Profile (60 s simulated, `rightMotorScale: 0.85`, `minStartPwm: 150`, `gyroDriftDegPerSec: 0.4`):** Explores `>= 90%` of the room (`> 4.0 m` path) with **`0` collisions**.

### 3.3 Full Browser E2E Suite (Playwright + Headless Google Chrome WebGL)
Executed across all 7 stages with **`console_errors: []`**, **`page_errors: []`**, and **`bad_responses: []`** (exit `0`):
- **Stage 1:** Workbench WebGL render, zoom close-up inspection, and camera preset bar (`Iso`, `Top`, `Front`, `Right`, `Fit`, `Mat`).
- **Stage 2:** Left Dock search (`OLED`), all 8 category filters (`Controllers` through `All 19`), `Simulated only` filter, add/delete component, `Shapes` tab, and `Tasks` tab (`8 / 8 DONE`).
- **Stage 3:** `Undo`/`Redo`, CAD tool strip (`Box`, `Cylinder`, `Standoff`, `CF Plate`, `Measure` 3D point-to-point readout, `Wire`, `Move`, `Lift`, `Turn`, `CoM`, `Select`, `+15°`, `Copy`, `Delete`), `Browser` tree selection, Component Inspector rename & mm coordinates, Wire Inspector (`Direct Taut`, `Arched Jumper`, `Tidy Route`, **`Route by hand`** placing 2 tie points on the bench -> `2 tie pts`, `Clear route`, `Lay out again`), `HC-SR04` target slider, and `AxisGizmo`.
- **Stage 4:** Dark/Light theme toggle, `fault_lab` diagnostics, `quad_5in` workbench motor/propeller spin test, switching `quad_5in` to Arena mode (`18×18 m` Pine Forest), climbing with `Climb (Q)` and flying toward the FPV gates.
- **Stage 5:** `ArenaBuilderStrip` world switching (`Maze` `7×9 m`, `Blank` `10×10 m`), 2-click **`Draw Wall`** on the 3D floor creating `Custom Wall 1`, click-to-place `Tree`, `Gate`, and `Boulder`, editing obstacle label/rotation/duplication, and resizing the Arena via sliders to `14×12 m`.
- **Stage 6:** `Build it for real` modal (`View RoboForge Bridge JSON →`, `Copy JSON`), JSON `Import`, verifying `Guard: ON` blocks a critical `BAT+ -> GND` short (`Blocked by Circuit Check`) while `Guard: OFF` allows execution, Monaco code editing + `Verify` (`OK`) + `Run` (`EDITOR_VERIFIED_OK` in Serial) + `Scope` (`SAMPLING 25 Hz`).
- **Stage 7:** Live 3D Arena execution of `Load & Run Room Mapper` confirming `0 hits` (`0` collisions), live 3D orange scan point cloud, and synchronized 2D occupancy map canvas.

---

## 4. Honesty & What Was Not Checked

- **Simulation / Emulator Only:** All circuit, firmware, rover driving, 360° room mapping, and quadcopter flight results reported in these documents were tested in the browser simulator (`Three.js` + `cannon-es` + `VirtualEsp32Runtime`), Vitest, and headless Google Chrome (`SwiftShader` WebGL) — **not** on physical ESP32 rover or drone hardware.
- **3D Pin-to-Pin Pointer Snapping:** While wire routing styles, manual bench tie-point clicks (`Route by hand`), wire deletion/undo, and short-circuit diagnostics were tested in Playwright, clicking tiny individual 3D pin header tips via projected screen coordinates to start/finish a new wire was not scripted in Playwright.
- **Desktop Hardware GPU Window:** Automated browser checks ran in headless Chrome with SwiftShader WebGL rather than an interactive desktop GPU window.

---

## 5. Integration Roadmap (Connecting `studio_trial/` to Primary RoboForge)

When ready to strap RoboForge's primary backend features onto `studio_trial/`:
1. **Nemotron AI Chat-to-Workbench Synthesis (`simlab/llm/`):**
   - Connect RoboForge's chat planner so natural-language prompts (*"Build a 2WD sewer inspection rover with dual front ultrasonics and an OLED"*) emit a validated `StudioProject` JSON that populates the 3D workbench and wires automatically.
2. **One-Click Physical ESP32 Firmware Flash & Live Hardware Twin (`sewerbot/hardware/wifi_rover.py`):**
   - Export the Monaco C++ sketch and `roboforge-studio-bridge/v1` pin map directly to an `.ino` / PlatformIO project matching `docs/ROVER_API.md`.
   - Stream live UDP/HTTP telemetry from the physical rover (`yaw`, `ultrasonic_cm`, `pwm_l`, `pwm_r`) into `ArenaScene` and `MapPanel` so the 3D Arena acts as a real-time digital twin during hardware runs.
3. **MuJoCo & Webots Co-Simulation Export:**
   - Convert `StudioProject` components, masses, 3D Center-of-Mass, and custom Arena obstacles/walls into MuJoCo MJCF / Webots `.wbt` worlds for heavy contact-physics validation.
