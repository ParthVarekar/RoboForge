# HANDOFF: RoboForge Studio (the 3D bench, editor and arena)

Written 2026-11-24 for the next coding agent (Antigravity) and for the owner, Parth Varekar. This file is the single
source of truth for this project: what exists, how it is built, where every piece lives, what the physical rover is
like, what was verified and how, what is open, and what to do next. Read sections 0 to 3 first, then the section for
whatever you touch. If anything here disagrees with the code, the code wins: fix this file in the same change.

Plain-words rule that runs through everything: **the wireless rover has never run on the real hardware.** Say
"tested in the simulator" or "verified on hardware for these tests", never "works", "safe", "guaranteed" or "proven".
The app text and the docs must not contain those words.

---

## 0. Read this first (ten facts)

1. This is **RoboForge Studio**: a browser app (React 18, Vite, TypeScript, Three.js, Monaco). A 3D electronics bench
   where you place real-size parts, wire them pin to pin, check the circuit, write Arduino/ESP32 C++ that runs on a
   **virtual ESP32**, and drive a rover or a quadcopter around a **3D physics arena**.
2. The studio is **separate** from the older Python RoboForge project in the same parent folder. That project has its
   own handoff at `C:\Users\Parth\Desktop\phaltan4_similator\docs\handoff\HANDOFF.md` (FastAPI dashboard, chat planner,
   wireless rover firmware, 1027 Python tests). Do not mix the two up.
3. The studio working copy is `C:\Users\Parth\Desktop\phaltan4_similator\studio_trial\`. **It is not a git repo**; it has
   `node_modules` and `dist`. The git clone is `C:\Users\Parth\Desktop\phaltan4_similator\roboforge-target\`, origin
   `https://github.com/ParthVarekar/RoboForge.git`, branch `main`, HEAD **`f82a8ce`** (pushed).
4. The studio is what is on GitHub: the repo root is the studio (README, docs, src, package.json).
5. Units: **bench = centimetres** (`MM = 0.1` cm), **arena = metres** (physics and meshes), **north is −Z**,
   **PWM = 0..255**, GPIO numbers are ESP32 GPIO numbers.
6. Tests: **65 Vitest tests in 7 files, all passing** on 2026-11-24 (section 14). Type check and lint pass. The
   production build passed on 2026-11-24 before the last DEV-only hook; run it again.
7. Browser checks (section 15): on the latest code, **zero touching wires** on the rover, quad, room mapper and fault lab
   presets. A mixed-style check (tight, arched and one hand clip on the rover) still had **one pair touching by 0.3 mm**.
8. The **physical rover** is an ESP32 DevKit with a DRV8833 driver, two TT gearmotors, an MPU6050 gyro, an HC-SR04
   sonar, an ESP32-CAM (GC2145) and a 2S Li-ion pack through an LM2596 buck. Its wireless firmware is written and
   compiled but **not run on the real rover**. Section 8 has every fact and every open question about it.
9. **Open hardware risks you must not miss** (section 8.6): the HC-SR04 echo is 5 V and needs a divider before it
   touches GPIO35 (the notes say no divider is fitted yet); the older USB sketch and the wireless firmware use
   **different pins for the right motor**; no capacitors are fitted; the first DRV8833 was destroyed on 2026-11-01.
10. The owner's standing rules are in section 2. Two that get broken easily: **no AI or Claude co-author line in
    commits**, and **never print or commit an API key or a Wi-Fi password**.

---

## 1. Where everything is

| Thing | Location | Notes |
|---|---|---|
| Studio working copy (edit here) | `C:\Users\Parth\Desktop\phaltan4_similator\studio_trial\` | no git; `node_modules/` and `dist/` present |
| Git clone (push from here) | `C:\Users\Parth\Desktop\phaltan4_similator\roboforge-target\` | `.git` present; origin GitHub; branch `main` |
| Sync working copy into the clone | section 2.6 (a `tar` pipe) | excludes `node_modules`, `dist`, `.vite` |
| Dev server (our private copy) | `http://127.0.0.1:8070/` | port 8070 is ours; 8060 belongs to someone else on this machine |
| Python RoboForge (other project) | `C:\Users\Parth\Desktop\phaltan4_similator\` (`sewerbot/`, `simlab/`, `firmware/`, `docs/`) | its handoff: `docs\handoff\HANDOFF.md` |
| Clone of the Python project | `hack-odyssey-target/` (origin `college-hack24-nov26/hack-odyssey`) | pushes for that project only |
| Scratchpad (throwaway) | `C:\Users\Parth\AppData\Local\Temp\claude\...\scratchpad\` | captures and experiments; not part of the project |

Git history of the studio (clone, newest first):

| Commit | Date | Subject |
|---|---|---|
| `f82a8ce` | 2026-11-24 | Arena drives the bench build itself: real parts and wires instead of box models |
| `d8df637` | 2026-11-23 | Docs images as WebP (4.2 MB of PNG down to 0.4 MB) |
| `3cc6784` | 2026-11-23 | Dress the wiring flat on the deck in tidy lanes, with no wires touching |
| `1f0e856` | 2026-11-22 | Wires that hang and rest on the parts like real jumper wires |
| `c114b82` | 2026-11-22 | Remove the old part builders (replaced by `src/viewport/parts/`) |
| `10668cd` | 2026-11-22 | RoboForge Studio: real-size parts and a dependable sketch editor |
| `ed40c09` | 2026-11-22 | Initial commit |

Not yet committed (working copy only, section 16): `HANDOFF.md`, `scripts/checks/`, `docs/screenshots/2026-11-24/`,
and the DEV-only wire hook in `src/viewport/WorkbenchScene.ts`.

---

## 2. Owner's rules and standing instructions

2.1 **Commits and pull requests carry no AI or Claude co-author line**, and no "Generated with" line, even when a tool
reminder asks for one. The owner's rule wins. The author is the owner: name `ParthVarekar`, and the email address is
the one in `AGENTS.md` of the Python project (do not copy it into other files).

2.2 **Push timely, but not too often.** The owner's standing request for the studio: keep pushing to the repo in a
timely manner when code changes; do not overdo it. (The Python project's rule is different: push only when asked.)

2.3 **Never touch the owner's running dashboards** on ports 8000 and 8001 (Python project). Test on 8050 or higher.
Port 8060 is someone else's on this machine: do not use it. Our dev copy is 8070.

2.4 **Secrets:** never write, print or commit an API key (`OPENROUTER_API_KEY`, `config/llm.json`) or the rover's
Wi-Fi name or password (`config.local.h`, `config/wifi.json`). Keep them git-ignored.

2.5 **Ask first** before: flashing firmware, saving a trim or setting to the rover, driving the real rover, deleting
data, sending messages, force-pushing, or pushing (unless the owner has asked for that push, as in 2.2).

2.6 **Sync and push recipe (studio).** Replace `<owner-email>` with the address from the Python project's `AGENTS.md`:
```powershell
cd C:\Users\Parth\Desktop\phaltan4_similator\studio_trial
tar --exclude=./node_modules --exclude=./dist --exclude=./.vite -cf - . | (cd ../roboforge-target && tar -xf -)
cd ..\roboforge-target
git status --short
git add -A
git -c user.name="ParthVarekar" -c user.email="<owner-email>" commit -m "Short, plain subject" -m "Body in plain words."
git push origin main
```
The sync copies but does not delete: a file removed in the working copy must also be removed in the clone (use
`git rm`; the old PNGs were removed that way).

2.7 **Honesty in app text and docs:** never write "safe", "guaranteed" or "proven". Every result must say what was not
checked. Plain words, short summaries.

2.8 **Pronouns:** when a person's pronouns are not known, use they/them.

---

## 3. What the studio does (product)

### 3.1 The bench (3D electronics workbench)
- Place real-size parts from the **Parts** dock (19 parts) or **Shapes** (4 CAD primitives). A search box and category
  chips (All, Controllers, Drivers, Sensors, Actuators, Power, Passives, Drone / Frame).
- Tools in the ribbon (`CadToolStrip.tsx`): Box, Cylinder, Standoff, CF Plate (add shapes); **Select**, **Wire**,
  **Move**, **Lift**, **Turn** (15° steps), **Copy**, **Delete**, **Measure** (3D tape measure), **CoM** (centre-of-mass
  marker). Snap is in mm (`snapMm`, the footer shows "Snap 1").
- **Wires:** click a pin, then another pin. Colours are in `WIRE_COLORS` (`InspectorPanel.tsx`). Styles: **Natural**
  (`routed`, the default, laid on the deck), **Tight** (`direct`), **Arched**. **Route by hand** adds cable clips
  (`waypoints`); **Clear route**; **Lay out again** (re-solves the slack).
- **Inspector** (right dock, Inspect tab): the selected part or wire; wire cable length (`routedMm`, `cutMm`), colour,
  style buttons, and the circuit checks list ("All clear" or the diagnostics).
- **Circuit checks** (`circuit.ts`, section 10). With **Guard: ON** (`circuitProtection`), a run is blocked while a
  critical fault exists (`startSketch` in `App.tsx`).
- **Presets** (Starter Preset select): `roboforge_rover` (the default, "RoboForge 2WD Rover (Wired)"), `room_mapper`
  ("Autonomous 360° Room Mapper"), `quad_5in` ("5-Inch Freestyle Quadcopter"), `fault_lab` ("Circuit Fault Diagnostics
  Lab", with deliberate faults), `blank_bench`. Loading a preset over a modified build asks first (`ConfirmDialog`).
- **Camera:** Iso, Top, Front, Right, Fit, Mat (the studio mat on or off), zoom in and out; mouse orbit and wheel zoom.
- **Theme:** light and dark (the toolbar's moon button). The bench, the editor and the arena follow it.
- **Export:** Import and Export (`ExportModal.tsx`). The RoboForge bridge spec comes from `buildRoboForgeBridgeSpec`
  (schema tag `roboforge-studio-bridge/v1`). The other export formats were not re-checked in this session.
- **Build it for real** (toolbar): present in the UI; its behaviour was not checked. Do not describe it as working.
- **Undo / redo:** Ctrl+Z and Ctrl+Y (not while typing). History is in `App.tsx` (`history`, `ProjectHistoryState`).

### 3.2 The sketch editor and the virtual ESP32
- Right dock **Code** tab: a Monaco editor for an Arduino/ESP32 C++ subset (section 11). Verify, Run, Load example
  sketch (five examples), Widen the editor.
- **Problems:** red squiggles on the exact line and column, a count in the status bar, and a list that jumps to the line.
- **Runtime errors** point at the sketch line. A loop that runs 8 seconds without `delay()` is stopped with a message.
- **Right-dock tabs:** Serial (the serial monitor), Scope (the 4-channel logic scope; the README says 25 Hz, not checked
  here), Map (the 2D occupancy SLAM map), Twin (reality-gap sliders, section 12).
- **Keyboard:** Ctrl+S (verify and save, `App.tsx` line 352), Ctrl+Enter (run, line 358), Ctrl+Z / Ctrl+Y (undo and redo
  outside the editor). **The README's "F8 / Shift+F8" and "Esc stops the sketch" are not in the code** (section 17).

### 3.3 The arena (3D physics)
- **Arena** toolbar button switches the viewport to the physics arena (`ArenaScene.ts`, `arenaPhysics.ts`).
- **Environment** (Arena Environment Preset select): `indoor_lab` (the default config is 4.0 × 6.4 m with 0.24 m walls),
  `forest_park` (a pine forest, 18 × 18 m, the drone space), `warehouse_maze`, `drone_course` (FPV gates),
  `sandbox_open`. Templates: `ARENA_TEMPLATES` in `catalog/arenaPresets.ts`.
- **Obstacles** (`ARENA_ELEMENT_PALETTE`): Wall, Tree, Drone Gate, Crate / Box, Cylinder, Boulder (sphere), Pillar, Cone,
  Demo Bag, Ramp. Tools: Select, Draw Wall (2 clicks), place, move, rotate (+15°), copy, delete. Width, length and wall
  height sliders (`ArenaConfig`).
- **Vehicles:** a **2WD Rover** or **5" Drone** toggle. The vehicle on screen is **the bench build copied in** (section 9.5).
- **Cameras:** Chase (the default), Orbit, Top, and **ESP32-CAM** / FPV picture-in-picture at the bottom left.
- **Run** starts the sketch; **Stop** and **E-STOP** stop it; **Reset Rover**, **Reset 2 Bags**, **Clear**.
- **Real Rover Profile (15% Weak R)** and **Ideal Sim** set the reality-gap faults (section 12).
- HUD (top right): world size, yaw, distance to the nearest obstacle, speed, bags passed and hits, path length, map %.

---

## 4. How to run, check and debug

```powershell
cd C:\Users\Parth\Desktop\phaltan4_similator\studio_trial
bun install                              # once (node_modules is already present)
npx vite --port 8070 --host 127.0.0.1    # our private copy: the one all the checks use
bun run typecheck                        # tsc --noEmit
bun run lint                             # eslint src (strict, no any)
npx vitest run                           # 65 tests
bun run build                            # tsc + vite build; prints a chunk-size warning (known, section 17)
```

The `dev` script in `package.json` hard-codes port 8060, and `vite.config.ts` also sets 8060. On this machine use the
`npx vite --port 8070` line above.

**Browser checks** (`scripts/checks/`, see section 15): they need Chrome and a running dev server on 8070. They use
Playwright from the global npm folder (`%APPDATA%\npm\node_modules\@playwright\mcp\node_modules\playwright`) and Chrome at
`C:\Program Files\Google\Chrome\Application\chrome.exe`. `wire_overlap.cjs` accepts `CHROME_PATH` to override Chrome.

**Debug hook (DEV builds only, `import.meta.env.DEV`):** `window.__roboforgeWires` holds the finished wire paths
(`{ id, radius, from, to, points }[]`), set at the end of `WorkbenchScene.rebuildWires`. A production build does not expose it.

**Stopping and restarting the dev server:** the server stops when the machine sleeps or the session pauses. Start it
again with the `npx vite` line above (or the preview named `studio`, if the preview tool is available), then check that
`curl -s -o NUL -w "%{http_code}" http://127.0.0.1:8070/` returns 200.

---

## 5. Architecture at a glance

```
            App.tsx (state: project + undo history, selection, tabs, runtime, serial, session autosave)
              |                       |                                 |
   Toolbar / CadToolStrip /     Viewport3D.tsx (render loop,        Right dock tabs: InspectorPanel,
   ArenaBuilderStrip /          chooses bench or arena scene)       CodePanel (Monaco), SerialPanel,
   ArenaControlsPanel / Parts   |                    |               LogicPlotterPanel (Scope), MapPanel, Twin
                                |                    |
                 WorkbenchScene.ts (bench)     ArenaScene.ts (arena)
                  |   componentMeshes.ts          |   arenaMeshes.ts (obstacles)
                  |   parts/* builders (PART_BUILDERS)   arenaVehicle.ts (bench copy)
                  |   kit/* (PCB, headers, packages, leads, PBR)   arenaPhysics.ts (cannon-es, rover + drone)
                  |   wireRope.ts, wireDeckRouter.ts, wireRouting.ts, wireGeometry.ts
                  |
   engine/: circuit.ts (analysis, motor drive), sketchTranspiler.ts (C++ subset -> JS),
            runtime.ts (VirtualEsp32Runtime, the loop, watchdog), halApi.ts (the API list),
            wireLength.ts (slack rules), roboforgeExport.ts (bridge spec)
   schema/projectSchema.ts (Zod: the one data model, parse and serialize)
   catalog/: partsCatalog.ts (pins, sizes, categories), boardGeometry.ts (real board dimensions),
             presets.ts (5 bench presets, 5 sketch templates, default faults), arenaPresets.ts, partThumbnails.ts
```

Per-frame loop (`Viewport3D.tsx`, around lines 320 to 370). The viewport calls `onSyncLiveFrame`, which is
`App.handleSyncLiveFrame`: `rt.recordSignalSample()`, `livePinPwmRef = rt.getPinPwmMap()`, and
`liveMotorsRef = resolveMotorDrives(analysisRef.current, pwmMap)`. Then:
- bench: `benchSceneRef.updateLiveState(livePinPwmRef, liveMotorsRef)` (wheel and prop spin, LED glow, OLED), then `render(dt)`;
- arena: physics `step(dt, left, right)` for the rover or `stepDrone(dt, input)` for the quad, then `getRoverPose()`, then
  `arenaSceneRef.render(dt, pose, telemetry, ledPwm, mappedPoints)`.

The sketch runs in `VirtualEsp32Runtime`. Between loop turns it sleeps 16 ms (about 60 turns a second) and writes the
pin PWM map that `resolveMotorDrives` turns into motor commands.

Persistence: the `localStorage` key **`roboforge.studio.session.v1`** holds `{ presetId, project, savedAt }`, saved on
change; `loadSession()` parses it with `parseStudioProject` (Zod). Nothing is sent to a server.

---

## 6. Data model (`src/schema/projectSchema.ts`, Zod, version 1)

`StudioProject` = `{ version: 1, name, description, components[], wires[], code: string, obstacles[], arena?, faults,
circuitProtection: boolean }`.

| Type | Fields | Enums and limits |
|---|---|---|
| `ComponentInstance` | `id`, `kind`, `label`, `position: [x,y,z]` (cm), `rotationY` (rad), `side?`, `color?`, `sizeOverride?` | `kind` is one of the 23 `ComponentKind`s (section 9.1); `side`: left, right, center |
| `WirePinRef` | `componentId`, `pinId` | pin ids as in `partsCatalog.ts` (e.g. `GPIO25`, `VIN`, `BAT_POS`) |
| `WireConnection` | `id`, `from`, `to`, `color`, `style?`, `clearanceCm?`, `waypoints?: Vec3[]` | `style`: `routed` (Natural), `direct` (Tight), `arched`; `clearanceCm` 0.1 to 6, default 0.45 |
| `ArenaObstacle` | `id`, `kind`, `label`, `position`, `size`, `color`, `rotationY?` | kinds: bag, box, cone, ramp, wall, tree, gate, pillar, sphere, cylinder |
| `ArenaConfig` | `environment`, `widthM` (2 to 40), `lengthM` (2 to 40), `wallHeightM` (0 to 5), `enclosed` | environments: indoor_lab, forest_park, warehouse_maze, drone_course, sandbox_open |
| `TwinFaultConfig` | `leftMotorScale` (0 to 1.5), `rightMotorScale` (0 to 1.5), `minStartPwm` (0 to 240), `gyroDriftDegPerSec` (−15 to 15), `floorFriction` (0.05 to 1.5), `usNoiseCm` (0 to 10) | defaults in `DEFAULT_FAULTS` (presets.ts): 1.0, 0.94, 145, 0.15, 0.65, 0.4 |

Other exports: `Vec3Schema`, `DEFAULT_ARENA_CONFIG`, `resolveArenaConfig`, `parseStudioProject`, `serializeStudioProject`.
Wire colours are strings (for example `#ef4444` for power and `#1e293b` for ground).

---

## 7. Module map (every source file, what it exports, what it is for)

Line counts from the working copy on 2026-11-24. About 20,300 lines in 55 non-test modules, plus 7 test files.

### 7.1 App shell and UI (`src/`, `src/components/`)
| File (lines) | Exports | Purpose |
|---|---|---|
| `App.tsx` (1083) | `App` | owns the state: `history` (undo), `project`, `analysis = analyzeCircuit(project)` (memo), `mode` (`StudioViewMode`: 'workbench' or 'arena'), `tool`, `rightTab`, selections, `serialLog`, `displayBench` (the `DisplayBench`, synced from `analysis.sensors.i2cDevices`), `runtimeProblem`, `runtimeRef` (`VirtualEsp32Runtime`), `livePinPwmRef`, `liveMotorsRef`, `physicsRef` (`ArenaPhysicsEngine`), `manualDriveRef`, `droneInputRef`, `keysDownRef`; keyboard shortcuts; `handleSyncLiveFrame`; `startSketch`; autosave `saveSession` |
| `main.tsx` (15) | none | React root |
| `components/Toolbar.tsx` (178) | `Toolbar`, `StudioViewMode` | presets select, Bench / Arena, Run, Stop, E-STOP, Guard, Build it for real, Import, theme |
| `components/CadToolStrip.tsx` (147) | `CadToolStrip` | the bench tool ribbon |
| `components/ArenaBuilderStrip.tsx` (145) | `ArenaBuilderStrip` | the arena palette ribbon (Select, Draw Wall, obstacle kinds, Demo Bag) |
| `components/ArenaControlsPanel.tsx` (652) | `ArenaControlsPanel` | arena controls: World, the vehicle toggle, sizes, run and reset buttons, Real Rover Profile / Ideal Sim, fault sliders |
| `components/PartsPanel.tsx` (251) | `PartsPanel` | the parts list with thumbnails (`requestPartThumbnail`), search, categories |
| `components/InspectorPanel.tsx` (398) | `InspectorPanel` | the selected part or wire: cable length, colour, style buttons, route by hand, circuit checks; `WIRE_COLORS` |
| `components/CodePanel.tsx` (349) | `CodePanel` | the Monaco editor, markers, Verify, Run, example select, status bar; `LINT_DELAY_MS = 450` |
| `components/sketchLanguage.ts` | `registerSketchLanguage` | the Monaco language: `KEYWORDS`, completions from `HAL_API` and `HAL_CLASSES` (members of a declared `display` / `lcd` object too), hover, signatures; snippets `oled-setup` and `lcd-setup` |
| `components/SerialPanel.tsx` (94) | `SerialPanel` | the serial monitor (`SerialEntry` lines) |
| `components/LogicPlotterPanel.tsx` (125) | `LogicPlotterPanel` | the Scope: 4 channels from `SignalSample` |
| `components/MapPanel.tsx` (248) | `MapPanel` | the 2D occupancy SLAM map, KPIs (room mapped %, collisions, obstacle hits, path driven), Load & Run Room Mapper, Clear Map, Reset Rover |
| `components/Viewport3D.tsx` (705) | `Viewport3D` | owns `benchSceneRef`, `arenaSceneRef`, `vehicleSnapshotRef`; creates the scene for the mode; the per-frame loop (section 5), which also calls `paintDisplays` for the bench screens or the arena copy's screens; camera buttons (Chase, Orbit, Top, ESP32-CAM, Reset) |
| `components/ExportModal.tsx` (263) | `ExportModal` | export (section 3.1) |
| `components/ConfirmDialog.tsx` (65) | `ConfirmDialog`, `ConfirmRequest` | "replace the build?" and similar confirmations (Escape closes) |
| `components/AxisGizmo.tsx` (67) | `AxisGizmo` | the X/Y/Z corner gizmo |

### 7.2 Catalog (`src/catalog/`)
| File (lines) | Exports | Purpose |
|---|---|---|
| `partsCatalog.ts` (635) | `PinRole`, `PinSpec`, `PartCategory`, `PartSpec`, `PARTS_CATALOG`, `PART_CATEGORIES`, `getPartSpec`, `getPinSpec` | every part: name, category, `sizeCm`, pins (id, role, position, `contact?: 'header' \| 'lead'`, and `dir?: Vec3`, the direction the wire leaves), and a simulated flag. The one source of pin ids |
| `boardGeometry.ts` (281) | `MM`, `HEADER_PITCH_MM` (2.54), `HEADER_TIP_ABOVE_BOARD_MM` (8.5), `PCB_T_MM` (1.6), `ESP32_DEVKIT`, `DRV8833_HW627`, `GY521`, `OLED_096`, `ESP32_CAM`, `HCSR04`, `TT_MOTOR`, `LM2596_MODULE`, `FC_STACK`, `CHASSIS_2WD`, and the pin-tip functions (`esp32PinTip`, `drv8833PinTip`, `gy521PinTip`, `hcsr04PinTip`, `lm2596PadTip`, `fcStackPad`, `ttTerminalTip`, `esp32CamPinTip`, `oledPinTip`, `modulePinTip`) | the real board dimensions (mm) and where each pin tip is; shared by the builders and the catalog |
| `displaySketches.ts` | `DISPLAY_LAB_SKETCH`, `OLED_DASHBOARD_SKETCH`, `I2C_SCANNER_SKETCH` | the display examples (real Adafruit_SSD1306 / LiquidCrystal_I2C / Wire code) |
| `presets.ts` (697) | `SketchTemplate`, `BAG_PASS_SKETCH`, `QUAD_SPIN_TEST_SKETCH`, `CALIBRATION_SWEEP_SKETCH`, `TELEMETRY_SERIAL_SKETCH`, `ROOM_MAPPING_SKETCH`, `SKETCH_TEMPLATES`, `DEFAULT_ARENA_OBSTACLES`, `DEFAULT_FAULTS`, `PresetEntry`, `STUDIO_PRESETS`, `createPresetProject(presetId)` | the six bench presets (`display_lab` added) and the eight example sketches |
| `arenaPresets.ts` (295) | `ArenaTemplate`, `ArenaElementPaletteItem`, `ARENA_ELEMENT_PALETTE`, `getArenaElementSpec`, `createArenaObstacle`, `ARENA_TEMPLATES`, `getArenaTemplate(env)` | the arena environments and the obstacle palette (default size and colour per kind) |
| `partThumbnails.ts` (162) | `getPartThumbnailSvg(kind)` | SVG fallback thumbnails |

Sketch template ids in `SKETCH_TEMPLATES` (used by the Load example sketch select): `bag_pass`, `room_mapper`,
`quad_spin`, `gap_sweep`, `serial_cmd`, `oled_dashboard`, `display_lab`, `i2c_scanner`.

### 7.3 Circuit, sketch and simulation engine (`src/engine/`)
| File (lines) | Exports | Purpose |
|---|---|---|
| `circuit.ts` (819) | `DiagnosticSeverity`, `CircuitDiagnostic`, `NetInfo`, `PowerBudget`, `SensorWiringStatus`, `MotorChannelMapping`, `WireMetric`, `ChecklistTask`, `CircuitAnalysis`, `MotorDriveOutput`, `pinKey`, `getPinWorldPositionCm`, `computeWireMetric`, `analyzeCircuit(project)`, `resolveMotorDrives(analysis, pinPwm)` | nets (union-find over wires and the internal connections of parts), the rule checks, the motor drive model, the cut-list metric |
| `sketchTranspiler.ts` (1119) | `SKETCH_SOURCE_URL` ('sketch.ino.js'), `SketchProblem`, `TranspileResult`, `TranspileError`, `transpileArduinoSketch(source)` | the C++ subset to JavaScript translator and its static checks (section 11) |
| `runtime.ts` | `PinModeValue`, `SerialEntry`, `SignalSample`, `HardwareEnvironmentHooks`, `StartResult`, `VirtualEsp32Runtime` | runs the translated sketch: pins, PWM, the I2C IMU, the display libraries (hook `displays`), the `oled` shortcut, Serial, the watchdog and the error mapping (section 11.3) |
| `halApi.ts` | `HalParam`, `HalEntry`, `HAL_API`, `HAL_CLASSES`, `HAL_NAMES`, `HAL_AWAITED`, `HAL_UNAVAILABLE`, `KNOWN_INCLUDES`, `INCLUDE_ADVICE`, `halEntry`, `halMember`, `halClass` | the one list of the virtual ESP32 API that drives completions, hover, "not declared", member checks, and what the runtime provides (section 11.4); `HAL_CLASSES` holds `Adafruit_SSD1306` and `LiquidCrystal_I2C` with their members |
| `printFormat.ts` | `formatPrintValue`, `textBytes`, `decodeSketchText`, `encodeSketchText` | Arduino `Print` formatting shared by Serial and the displays; sketch strings are bytes (section 11.6) |
| `displays/font5x7.ts` | `gfxGlyph`, `lcdGlyphRows` | the 5x7 dot-matrix characters: Adafruit_GFX code page 437 and the HD44780 A00 ROM |
| `displays/gfx.ts` | `MonoGfx`, `SSD1306_BLACK/WHITE/INVERSE` | Adafruit_GFX drawing on a 1-bit buffer (the library's algorithms) |
| `displays/panels.ts` | `I2cDeviceWiring`, `DEFAULT_I2C_ADDRESS`, `Ssd1306Panel`, `Hd44780Panel`, `DisplayBench`, `LCD_BLINK_MS` | the display modules themselves (what each lights), kept for as long as the part is on the bench |
| `displays/libraries.ts` | `SketchWire`, `SketchSsd1306`, `SketchLcdI2c`, `createDisplayLibraries` | `Wire`, `Adafruit_SSD1306`, `LiquidCrystal_I2C` as the sketch sees them, with the hints printed to Serial |
| `arenaPhysics.ts` (788) | `ArenaVehicleMode`, `DroneFlightInput`, `ArenaTelemetry`, `OccupancyGridSnapshot`, `ArenaPhysicsEngine` | the cannon-es rigid body for the rover, the flight model for the quad, the 3D ultrasonic raycast, the 2D occupancy grid (section 13) |
| `wireLength.ts` (42) | `SOCKET_RISE_CM` (0.88), `wireSlackCm`, `wireLengthCm`, `legSlackThroughCm`, `wireLengthThroughCm` | the slack rules for each wire style (section 9.4) |
| `roboforgeExport.ts` (81) | `RoboForgeBridgeSpec`, `buildRoboForgeBridgeSpec` | the bridge export (schema tag `roboforge-studio-bridge/v1`) |

### 7.4 Schema (`src/schema/`)
`projectSchema.ts` (161): section 6.

### 7.5 Bench and arena scenes (`src/viewport/`)
| File (lines) | Exports | Purpose |
|---|---|---|
| `WorkbenchScene.ts` (1365) | `WorkbenchTool`, `BenchCameraView`, `PinHoverInfo`, `MeasureResult`, `WorkbenchCallbacks`, `VehicleSnapshot`, `WorkbenchScene` | the bench scene: components, wires, tools, gizmos, camera, the wire pipeline `rebuildWires` (section 9.3), `snapshotModel` (section 9.5), `updateLiveState` (spin and LEDs) |
| `componentMeshes.ts` (163) | `ComponentVisualHandle`, `setPinHaloVisible`, `buildComponentGroup(instance)` | builds one part through `PART_BUILDERS`, adds the pin pick targets (`pickType: 'pin'`), the contact shadow and the fault ring; returns `pinMeshes`, `wheelMesh`, `propMesh`, `ledMaterial`, `display` (a `DisplaySurface`), `buttonCap` |
| `parts/index.ts` (39) | `PART_BUILDERS` (`Record<ComponentKind, PartBuilder>`) | the map from kind to builder (section 9.1) |
| `parts/controllers.ts` (225) | `buildEsp32Devkit` | ESP32 DevKit V1 (the WROOM-32 module, the USB and the regulator) |
| `parts/modules.ts` (458) | `buildDrv8833`, `buildMpu6050`, `buildOled`, `buildEsp32Cam`, `buildHcsr04` | the sensor and driver modules |
| `parts/displays.ts` | `buildLcd1602`, `buildLcd2004` | the character LCDs: board on four nylon standoffs, zinc bezel, matte screen, the PCF8574 backpack underneath with its trimmer, jumper and right-angle 4-pin header pointing west |
| `parts/power.ts` (552) | `buildTtMotor`, `buildBrushless2207`, `buildBattery2s`, `buildLipo6s`, `buildLm2596` | motors, batteries, buck converter |
| `parts/discretes.ts` (241) | `buildTactileButton`, `buildResistor`, `buildLed5mm`, `buildCap1000uf` | passives and the switch |
| `parts/frames.ts` (527) | `buildFcStack`, `buildChassis2wd`, `buildQuadFrame`, `buildVtxAntenna`, `buildCadBox`, `buildCadCylinder`, `buildCadStandoff`, `buildCadPlate` | frames, the FC / ESC stack, the antenna and the CAD shapes |
| `parts/types.ts` (24) | `PartBuildResult`, `PartBuildContext`, `PartBuilder` | the builder signature `({ instance, group, spec, size })` |
| `kit/pbr.ts` (127) | `markShared`, `PBR`, `plastic`, `anodised`, `siliconeJacket`, `solderMask`, `ledEmitter`, `disposeObject` | shared physically based materials; `disposeObject` frees GPU memory |
| `kit/pcb.ts` (119) | `PcbHole`, `PcbOptions`, `PcbResult`, `buildPcb`, `roundedRectShape` | a rounded PCB with plated holes |
| `kit/boardArt.ts` (385) | `PadFinish`, `BoardPainter`, `BoardArt`, `createBoardArt`, `hexLuminance`, `boardTopMaterial`, `labelTexture` | silkscreen, solder mask and pad artwork as canvas textures |
| `kit/headers.ts` (109) | `PITCH` (2.54 mm), `HeaderPinsOptions`, `addHeaderPins`, `headerRow`, `HEADER_TIP_ABOVE_BOARD` | 2.54 mm male headers (black housing, square pins) |
| `kit/packages.ts` (584) | `chipPassive`, `soic`, `tssop`, `lqfp`, `qfn`, `sot23`, `sot223`, `to263`, `diodeSma`, `ledSmd`, `crystalHc49s`, `crystalSmd3225`, `tactSmd`, `microUsb`, `usbC`, `shieldCan`, `electrolyticRadial`, `electrolyticSmd`, `inductorShielded`, `trimpot3296w` | IC and passive packages at their true pitch |
| `kit/leads.ts` (39) | `bentPath`, `leadTube`, `v3` | bent component leads |
| `wireRope.ts` (496) | `V3`, `RopeObstacle`, `prepareObstacle`, `ObstacleGrid`, `NeighborField`, `RopeInput`, `solveRope`, `shareLinks` | the hanging-wire solver and its collision grid (section 9.4) |
| `wireDeckRouter.ts` (921) | `DeckGrid`, `SIDE_CLEARANCE_CM`, `makeDeckGrid`, `DeckRequest`, `DeckRoute`, `DeckOptions`, `RISE_CM`, `routeDeck`, `filletRun`, `smoothBumps`, `shapeDrop`, `shapeBridge`, `roundCorners`, `densify`, `separateWires` | lays the Natural wires on the deck (section 9.4) |
| `wireRouting.ts` (61) | `WirePlan`, `planWire`, `arcLengths3`, `pointAlong` | the rest length per leg for hanging wires; path sampling |
| `wireGeometry.ts` (199) | `WireEnd`, `DEFAULT_END`, `WireRenderOptions`, `wireRadius`, `DUPONT_ABOVE_TIP`, `wireExit`, `buildWireGroup` | turns a path into tubes, DuPont sockets, solder joints, ESC looms and cable clips |
| `ArenaScene.ts` (797) | `ArenaCameraMode`, `ArenaEditTool`, `ArenaSceneCallbacks`, `ArenaScene` | the arena scene: environment, obstacles, the vehicle visuals, cameras, the PiP, the ultrasonic beam, the trail, the SLAM points, `setVehicleModel` |
| `arenaMeshes.ts` (249) | `buildArenaObstacleGroup` | the meshes for each obstacle kind (trees, gates, walls, bags, boulders, cones, ramps) |
| `arenaVehicle.ts` (80) | `ArenaVehicleVisual`, `buildArenaVehicle` | the arena's vehicle: the bench copy (or the preset build), scaled to metres |
| `materials.ts` (576) | `getCarbonTexture`, `getAcousticMeshTexture`, `PcbSilkscreenConfig`, `getPcbSilkscreenTexture`, `getGrassGroundTexture`, `getConcreteFloorTexture`, `getTreeBarkTexture`, `getArenaWallTexture`, `getCuttingMatTexture(theme)`, `makeSilkscreenPlane` | procedural textures |
| `displayPainter.ts` | `LcdCanvasLayout`, `DisplaySurface`, `PlacedDisplaySurface`, `paintOled`, `paintLcd`, `paintDisplays` | paints each screen from its panel, only when the panel's version (or the blink / scroll step) changed |
| `partPreview.ts` (150) | `requestPartThumbnail`, `cancelPartThumbnail` | offscreen renders of parts for the parts list |

---

## 8. The physical rover (the hackathon hardware)

### 8.1 What it is
A 2WD carbon-deck rover for the hackathon. The brain is an **ESP32 DevKit**. The motors go through a **DRV8833** H-bridge.
**Two TT DC gearmotors** with wheels and a ball caster. An **MPU6050 (GY-521)** gyro for heading. An **HC-SR04** sonar
at the front. An **ESP32-CAM (AI-Thinker, GC2145 sensor)** for video, on the rover's Wi-Fi. Power is a **2S Li-ion pack**
through an **LM2596 buck set to about 5.2 V**. The studio's model of it is the preset `roboforge_rover` (the same parts
and the same pins).

### 8.2 Pin map (current; these win over older notes)
From `firmware/roboforge_rover/roboforge_rover.ino` (lines 52 to 64), `firmware/esp32_rover_v2/esp32_rover_v2.ino`
and `docs/HARDWARE.md`:

| Function | GPIO | Notes |
|---|---|---|
| Left motor, DRV8833 IN1 / IN2 | 25 / 26 | `LEFT_IN1`, `LEFT_IN2` |
| Right motor, DRV8833 IN3 / IN4 | 27 / 14 | `RIGHT_IN1`, `RIGHT_IN2` (wireless firmware) |
| MPU6050 SDA / SCL | 32 / 33 | `IMU_SDA`, `IMU_SCL`; power from 3V3, AD0 to GND |
| HC-SR04 TRIG | 13 | `TRIG_PIN`; must be an output-capable pin |
| HC-SR04 ECHO | 35 | `ECHO_PIN`; **input-only pin, and the echo is 5 V: needs a divider** (the owner's guide says two 10 kΩ) |
| Camera | none | the ESP32-CAM talks over Wi-Fi; only 5 V and GND on the rover side |

Pin rules the studio enforces (`circuit.ts`, the runtime): GPIO 34, 35, 36 and 39 are input-only; GPIO 6 to 11 are the
flash chip and not for general use; one pin cannot do two jobs.

### 8.3 Power
- A 2S Li-ion pack (the studio part "2S Li-Ion Pack (7.4V 2200mAh)") into an **LM2596** buck, set to about **5.2 V**.
- The buck feeds the ESP32 (VIN), the ESP32-CAM 5 V and the DRV8833 VM. A 470 to 1000 µF capacitor across VM and GND is
  **advised but not fitted**.
- **No capacitors are fitted, and no battery or rail dividers are fitted** (the handoff notes). Brownouts when the motors
  start were noted earlier: the owner's guide says to charge the pack, check the buck output stays above 5 V, add the
  capacitor and shorten the power wires.
- The older 4 × AA NiMH plan (with a 5 V boost, a GPIO34 battery-sense divider, and an AMS1117 that needs about 4.6 V in)
  is **legacy**. Do not build from it.

### 8.4 Firmware (what exists, where)
| Folder | What | State |
|---|---|---|
| `firmware/roboforge_rover/` | the **wireless** rover sketch (`roboforge_rover.ino`), `nav_engine.h` (plain C++ navigation: path, return home, bag demo), `webpage.h`, `config.example.h` (copy to `config.local.h`, which is git-ignored) | compiles (78% of flash); the navigation engine's 52 host tests pass on the PC; **never run on the real rover** |
| `firmware/roboforge_cam/` | the camera sketch (joins `Rover-AP`) | compiles (32% of flash); not run on the real rover |
| `firmware/esp32_rover_v2/` | the USB build used by `tools/rover_bringup.py`, `tools/rover_gap.py`, `tools/flash.py` (Python project) | pins match section 8.2 |
| `firmware/esp32_rover_serial/` | the owner's **USB serial** sketch (`rover_wasd` plus telemetry; default build) | **older pins**: left 26/27, right 32/33, TRIG 18, ECHO 19 (divider), IR 21 (sensors off by default). `speedLevel = 180`, `MIN_DUTY = 90`, a 1 s watchdog |
| `firmware/esp32_rover/`, `firmware/esp32cam_stream/`, `firmware/arduino_sensor_hub/` | older builds (recovery and legacy) | do not use for the current rover |

Wireless constants in `roboforge_rover.ino`: `FW_VERSION "roboforge-1.0"`, `PWM_FREQ 20000`, `PWM_BITS 8`, LEDC channels
`CH_L1` to `CH_R2` = 0 to 3. The access point name and password come from `config.local.h`. Never copy them anywhere.

### 8.5 What was measured on the real rover, and what was not
Measured in earlier **USB** sessions with the owner (handoff notes, section 4):
- one speed level, **180**, is used; nothing moved below strength about **150** on the floor;
- the **right motor is the weaker one**, and was intermittent;
- **heading-hold** kept straight runs within about **2.5°**;
- **no encoders**, so every distance is time-based;
- the camera is a GC2145 with software JPEG; the sketch had to allocate a smaller buffer.

Not measured (the owner's checks, in order; `docs/ROBOFORGE_GUIDE.md`, section 9):

| Check | Meaning |
|---|---|
| G-W1 | after flashing, `http://192.168.4.1/api/state` opens on the laptop |
| G-W2 | driving from the console with no USB cable |
| G-W3 | the calibration wizard runs; start strength and weak motor give sensible numbers |
| G-W4 | the bag demo passes two bags without touching them (first with a spotter) |
| G-W5 | with the rover a few metres away, the laptop's Wi-Fi is turned off: the rover stops, then comes home |

Also not done: the HC-SR04 reading on the real board (its wiring was being set up); bag and box **photos** from the owner
for target recognition (the simulator uses stand-in colours); heading-hold, soft start, missions and signal thresholds on
the wireless firmware (the zip's own notes say these are starting values to tune); no run log exists yet in
`runs/rover/<time>/`. **Do not claim any real-rover result without a log.**

### 8.6 Risks and decisions for the owner
1. **ECHO divider.** `HARDWARE.md` and the guide say the ECHO line goes through a divider (two 10 kΩ) into GPIO35. The
   handoff notes say no dividers are fitted. A 5 V echo on GPIO35 without the divider can damage the pin. **Fit the divider
   before the sensor is powered from 5 V.** Ask the owner to confirm the wiring.
2. **Two pin maps.** The owner's USB sketch (`esp32_rover_serial`) puts the right motor on 32/33 and the sensors on 18/19.
   The wireless firmware puts the right motor on 27/14 and the sensors on 13/35. The MPU is on 32/33 in both. **Confirm
   which map is on the physical rover** before G-W2. If the old map is wired, the wireless firmware drives the wrong pins.
3. **Brownouts** when the motors start (no capacitor). Fit a 470 to 1000 µF capacitor across VM and GND.
4. **The first DRV8833 was destroyed on 2026-11-01** (its motors hummed without spinning). The handoff implies a replacement
   has been used for the USB tests. The studio's Builder warns that a 0.5 A PW-package DRV8833 cannot take a 1.2 A stall:
   use a bigger driver, or current-limit it.
5. **The OLED.** The studio preset includes a 0.96" OLED. The notes do not say whether the physical rover has one.
6. **Wi-Fi secret.** The hotspot password is only in `config.local.h`. Anyone on that network can drive the rover.

### 8.7 Timeline (dates from the notes)

| Date | Event |
|---|---|
| 2026-10-29 | the parts list confirmed (ESP32, ESP32-CAM, Arduino Uno/Nano, DRV8833, 4 × AA NiMH, TT motors assumed) |
| 2026-11-01 | the first DRV8833 is destroyed; live work on the rover stops for a while |
| 2026-11-04 | Python project: full suite 1027 passed, 1 skipped; the wireless firmware compiles |
| 2026-11-07 | Python project handoff written |
| (undated) | USB sessions: heading-hold, the speed level and the weak right motor measured (section 8.5) |
| 2026-11-22 | studio work begins: real-size parts, the editor, the wiring; pushed to GitHub |
| 2026-11-24 | the arena drives the bench build; this handoff |

---

## 9. The bench in depth

### 9.1 Parts (23 kinds: 19 simulated parts and 4 CAD shapes)
From `PARTS_CATALOG`, dumped on 2026-11-24. Pin roles: `gpio`, `gpio_input_only`, `gnd`, `power_in`, `power_out`,
`passive`, `i2c_sda`, `i2c_scl`, `motor_in`, `motor_out`, `esc_phase`, `sensor_trig`, `sensor_echo`, `led_anode`,
`led_cathode`, `cap_pos`, `cap_neg`.

| Kind | Name | Category | Size (cm, x × y × z) | Pins (role) |
|---|---|---|---|---|
| `esp32_devkit` | ESP32 DevKit V1 | Controllers | 2.83 × 1.30 × 5.15 | 30 pins: EN (passive); GPIO36, 39, 34, 35 (input only); GPIO32, 33, 25, 26, 27, 14, 12, 13, 23, 22, 1, 3, 21, 19, 18, 5, 17, 16, 4, 2, 15 (gpio); GND_L, GND_R (gnd); VIN (power_in); 3V3 (power_out) |
| `fc_esc_stack` | F7 FC + 45A 4-in-1 ESC | Controllers | 3.6 × 1.5 × 3.6 | BAT_POS (power_in), GND (gnd), 5V_BEC (power_out), M1 to M4 (esc_phase) |
| `drv8833` | DRV8833 Dual Motor Driver | Drivers | 1.85 × 1.2 × 1.6 | IN1 to IN4 (motor_in), OUT1 to OUT4 (motor_out), VM (power_in), GND (gnd), EEP and ULT (passive) |
| `mpu6050` | MPU6050 6-Axis IMU | Sensors | 2.12 × 1.2 × 1.64 | VCC (power_in), GND (gnd), SCL (i2c_scl), SDA (i2c_sda), XDA, XCL, AD0, INT (passive) |
| `hcsr04` | HC-SR04 Ultrasonic | Sensors | 4.5 × 2.0 × 1.6 | VCC (power_in), TRIG (sensor_trig), ECHO (sensor_echo), GND (gnd) |
| `oled_ssd1306` | 0.96" OLED I2C | Sensors | 2.73 × 1.2 × 2.78 | GND (gnd), VCC (power_in), SCL (i2c_scl), SDA (i2c_sda) |
| `esp32_cam` | ESP32-CAM (GC2145) | Sensors | 2.7 × 1.3 × 4.05 | 5V (power_in), GND, GND_2, GND_3 (gnd), IO12, IO13, IO15, IO14, IO2, IO4, 3V3, IO16, IO0, VCC, U0R, U0T (passive) |
| `tactile_button` | Tactile Push Button 6 mm | Sensors | 1.0 × 0.9 × 1.0 | A, B (passive) |
| `dc_motor` | TT DC Gearmotor + Wheel | Actuators | 5.6 × 6.5 × 7.0 | M_POS, M_NEG (passive) |
| `brushless_2207` | 2207 1950KV + 5" Prop | Actuators | 2.8 × 3.2 × 2.8 | PHASE (esc_phase) |
| `battery_2s` | 2S Li-Ion Pack 7.4 V 2200 mAh | Power | 3.8 × 1.9 × 6.8 | BAT_POS (power_out), GND (gnd) |
| `battery_6s_lipo` | 6S LiPo 1100 mAh 22.2 V | Power | 3.6 × 3.4 × 7.2 | BAT_POS (power_out), GND (gnd) |
| `lm2596_buck` | LM2596 Buck 5.2 V | Power | 4.32 × 1.4 × 2.1 | IN_POS (power_in), IN_NEG (gnd), OUT_POS (power_out), OUT_NEG (gnd) |
| `resistor_10k` | Resistor 10 kΩ 1/4 W | Passives | 2.2 × 0.5 × 0.6 | A, B (passive) |
| `led_5mm` | 5 mm Status LED | Passives | 1.0 × 1.4 × 1.0 | ANODE (led_anode), CATHODE (led_cathode) |
| `cap_1000uf` | 1000 µF 16 V Electrolytic | Passives | 1.0 × 2.25 × 1.0 | POS (cap_pos), NEG (cap_neg) |
| `chassis_2wd` | 2WD Carbon Rover Chassis Deck | Drone / Frame | 14.4 × 0.45 × 19.2 | none |
| `frame_quad_5in` | 5-Inch Carbon X-Frame | Drone / Frame | 22 × 3.2 × 22 | none |
| `vtx_antenna` | 5.8 GHz FPV Antenna + TPU Mount | Drone / Frame | 1.8 × 6.2 × 1.8 | 5V (power_in), GND (gnd) |
| `cad_box` | Custom Mount Block | CAD Shapes | 3 × 1.6 × 3 | none (not simulated) |
| `cad_cylinder` | Structural Cylinder / Spacer | CAD Shapes | 2.2 × 2 × 2.2 | none |
| `cad_standoff` | M3 Red Aluminium Standoff 28 mm | CAD Shapes | 0.58 × 2.8 × 0.58 | none |
| `cad_plate` | Carbon Mounting Plate 60 × 40 mm | CAD Shapes | 6 × 0.25 × 4 | none |

Builders (`PART_BUILDERS` in `parts/index.ts`): `esp32_devkit`→`buildEsp32Devkit`, `fc_esc_stack`→`buildFcStack`,
`drv8833`→`buildDrv8833`, `mpu6050`→`buildMpu6050`, `hcsr04`→`buildHcsr04`, `oled_ssd1306`→`buildOled`,
`esp32_cam`→`buildEsp32Cam`, `tactile_button`→`buildTactileButton`, `dc_motor`→`buildTtMotor`,
`brushless_2207`→`buildBrushless2207`, `battery_2s`→`buildBattery2s`, `battery_6s_lipo`→`buildLipo6s`,
`lm2596_buck`→`buildLm2596`, `resistor_10k`→`buildResistor`, `led_5mm`→`buildLed5mm`, `cap_1000uf`→`buildCap1000uf`,
`chassis_2wd`→`buildChassis2wd`, `frame_quad_5in`→`buildQuadFrame`, `vtx_antenna`→`buildVtxAntenna`,
`cad_box`, `cad_cylinder`, `cad_standoff`, `cad_plate`→`buildCadBox`, `buildCadCylinder`, `buildCadStandoff`, `buildCadPlate`.

### 9.2 How a component is placed and built
1. `WorkbenchScene.rebuildComponents()`: for each `ComponentInstance`, call `buildComponentGroup(instance)` (`componentMeshes.ts`).
2. `buildComponentGroup` gets the `PartSpec` (`getPartSpec`), sets the group's position and `rotationY`, and calls
   `PART_BUILDERS[kind]({ instance, group, spec, size })`.
3. The builder adds meshes using `kit/*`, and returns the parts that animate (`wheelMesh`, `propMesh`, `ledMaterial`,
   `oledCanvas`, `buttonCap`) plus `pinMeshes` (pin id to mesh).
4. `buildComponentGroup` adds the pin pick targets (`pickType: 'pin'`), the contact shadow and the fault ring.
5. Pin tips come from `boardGeometry.ts`. A wire's endpoints are the world positions of its pin meshes (`getWorldPinPos`).

### 9.3 The wire pipeline (`WorkbenchScene.rebuildWires`)
This function lays every wire. In order:

| Step | What it does | Variables and constants |
|---|---|---|
| 1 | clear `wireRoot` and dispose its meshes | `wireRoot` |
| 2 | collect the obstacles (the oriented boxes of part meshes) | `grid = new ObstacleGrid(this.collectWireObstacles(), 0)`. `collectWireObstacles` skips meshes with `noPick`, `noFrame`, pin targets, tube geometry, and anything smaller than 0.25 cm in every direction |
| 3 | build the wire records | `infos: WireInfo[]`: `a` and `b` (pin world positions); `endA` and `endB` (`getWireEnd`, giving `{ contact: 'header' \| 'lead', dir }`, with `dir` from the catalog pin rotated by the part); `exitA` and `exitB` (`wireExit`: the tip plus `dir × SOCKET_RISE_CM`, 0.88 cm for a header socket, or `0.06 + SLEEVE_LEN`, 0.52 cm, for a soldered lead); `radius` (`wireRadius`: 0.072 power, 0.056 signal, 0.14 ESC loom); `isPower` (the pin role is power_out, power_in or gnd); `isEscPhase`; `pins` (hand-placed waypoints) |
| 4 | wires that share a pin sit side by side | `atPin` map; `spread(sorted, centre, side)` offsets by `step = 2 × maxRadius + 0.012` cm. The side vector is the pin's `dir` crossed with the direction to the far ends. A second pass, after the landings are known, stacks them one behind the other with `baseLift` (rank × 0.2 cm) |
| 5 | choose the deck wires | `natural(w)`: style `routed`, no waypoints, not ESC. `deckWires` = natural, with a span of at least 1.5 cm, and the two ends on different parts |
| 6 | build the deck grid (only if there are deck wires) | `pitch = 0.254` cm (one lane per 2.54 mm). The box of all deck ends with a margin of 2.5 cm; `nx` and `nz` capped at 400. `grid.heightField(...)` rasterises the top height of each part, per cell |
| 7 | find the deck and the blocked cells | `makeDeckGrid(x0, z0, nx, nz, pitch, heightAt, focus)` gives `deck.deckY`, `blocked`, `low` (section 9.4) |
| 8 | route on the deck | `routable` = deck wires whose highest end is within 3 cm of `deckY`. `routeDeck(deck, requests, { attempts: 4 for full or 1 for fast, keepOut: the exits and pins of the non-deck wires })` (section 9.4) |
| 9 | the run on the deck | `arcLengths3(route.run)`. `NEXT = 0.3` cm at each end is left for the drops. `laid` holds `w`, `run`, `s`, `total`, `middle` |
| 10 | the formed pieces | for each end, `shapeDrop(exit, dir, land, next, radius, surface, lift)`; for two pins of the same part, `shapeBridge(...)`. `LIFTS = [0, 0.16, 0.32, 0.48, 0.66, 0.86, 1.1, 1.4]` cm of extra height to try. Up to six placement rounds: a piece that could not be cleared goes first in the next round. The best round is kept. `NeighborField` (`field`) holds every laid piece |
| 11 | the hanging wires: tight, arched, hand-routed, ESC looms, and any natural wire that could not lie on the deck | `planWire(chain, style, clearance, grid)` (`wireRouting.ts`) gives `{ length, legSlack }`. `cachedSolve(id, key, { start, startDir, end, endDir, length, legSlack, radius, gravity, stiffness, pins, neighbors })` calls `solveRope` with `steps` of 180 (full) or 60 (fast). Gravity 1 (0.15 when arched). Stiffness 0.88 (0.97 when arched) |
| 12 | the last check: no two wires touch | `dense = densify(path, 0.06)`; `separateWires(dense, radii)`: cell = 2 × largest radius + 0.012, `keepEnds` 0.12 cm, 16 rounds, `maxLift` 0.6 cm |
| 13 | caches | `finalCache` (the whole result, keyed on the wire records and a hash of the parts), `deckCache` (the deck routes), `wireCache` (the per-wire rope results, pruned to the live set) |
| 14 | the DEV hook | `window.__roboforgeWires`, only when `import.meta.env.DEV` |
| 15 | draw | `buildWireGroup(points, a, b, { wireId, fromEnd, toEnd, color, selected, isPower, isEscPhase, waypoints })` for each wire |

Selecting a wire does not re-lay anything (`finalCache`). Dragging a part re-runs with `quality: 'fast'` (`steps` 60, one
routing attempt). Timings measured with a temporary probe: a full rebuild of the 37-wire rover took about 45 to 190 ms
(one run was 186 ms, the slowest); a rebuild for a selection-only change took about 31 to 64 ms. These were probes, not
a benchmark; re-measure before quoting.

### 9.4 The wire algorithms, variable by variable

**`makeDeckGrid` (`wireDeckRouter.ts`).** Constants: `LOW_PART_CM = 0.35`, `SIDE_CLEARANCE_CM = 0.1`.
- `deckY` is the mode of the surface heights in 0.02 cm bins, counting the cells near the wire ends, each weighted by
  `1 − d/reach` (reach 3 cm). This finds the chassis plate, or the bench, without being told.
- A cell is **blocked** if the highest of its surface heights (its centre and eight points one clearance away) is more than
  0.35 cm above `deckY`, or the lowest is more than 0.05 cm below it. A cell is **low** if the highest is more than 0.04 cm
  above `deckY`. A wire may lie over a low cell, at extra cost.

**`routeDeck` (`wireDeckRouter.ts`, about 350 lines).** State arrays over the `nx × nz` grid:
- `occ` (Uint8: bit 1 = a lane along X is used, bit 2 = along Z); `owner` (Int32: the wire that owns a cell); `portOf` (Int32:
  the wire whose port is this cell); `zone` (Int32: cells kept clear around other wires' joints, a radius of 0.2 cm around
  each `keepOut` point, and around each deck wire end that is within 1.2 cm of the deck); `top` (the height of the highest
  wire already over a cell).
- **Landings.** `findLanding(exit, dir, far, who)` looks for the nearest free cell to where the wire bends over
  (`exit + dir × RISE_CM`, with `RISE_CM = 0.45`), within `escapeCm` (3.5 cm). It also needs a **port**, the next cell out.
  The score is the distance, plus 0.05 × the distance to the far end. A wire leaves its landing through its port.
- **Shared ends swap.** Two ends that leave from the same spot (within 2 cm) swap landings when their paths cross
  (`cross()` tests the segments, `segDist()` tests near misses), provided the swap adds no more than 0.3 cm. Up to six passes.
- **Order.** `order: 'short'` (the default) routes short wires first. Ties go to the group, then to `lateralKey` (the wires
  of one bundle, in the order they sit across it).
- **A\*** over (cell, heading), with `gScore`, `came` and a binary min-heap (`MinHeap`). Costs: each cell 1; a lane already
  used adds `crossCost` (default 4); a `low` cell adds 3; a turn adds `bendCost` (default 4), and 4 more next to a landing.
  A cell where a wire already lies cannot be turned in, unless `over` is set. A cell next to a wire going the same way gets
  `−bundleBonus` (default 0: bundles form from the order, not from the cost). The heuristic is `(1 − bundleBonus) ×` the
  Manhattan distance. A wire arrives through its own port only.
- **Attempts.** Up to `attempts` rounds (4 for a full rebuild, 1 for a drag). A wire that finds no lane goes first in the
  next round. The round with the fewest failures wins.
- **Stack on top (last resort).** A wire with no lane is re-routed with `over = true` (it may lie over a taken lane, at +8
  cost). Those cells are counted as `stacked`. **The count of `stacked` cells on the presets was not checked** in this
  session; check it.
- **Heights.** `need[k]` for each run point is `base` (`deck.deckY + radius`), raised over `low` cells and over cells where a
  wire already lies (`top + radius + 0.015`). `smoothBumps(s, need, base)` raises each bump with a cosine ease (flat for
  0.2 cm, then easing over 0.55 cm) and fills dips narrower than 1.2 cm.
- **Output.** `DeckRoute` = `{ run: V3[] (x, y, z), crossings, stacked }`. `crossings` counts the cells the wire hops over.

**`shapeDrop` (`wireDeckRouter.ts`).** From the exit, straight out for `RISE_CM` (0.45 cm). A sideways tab runs out only as far
as its landing (at least 0.15 cm). Then across, to above the landing, at the height that clears whatever lies between
(`surface(x, z) + radius + 0.08` along the way, plus `lift`). Then down onto the landing, then on to `next` on the run.
`roundCorners(pts, 0.3)` rounds the corners.

**`shapeBridge` (`wireDeckRouter.ts`).** The same idea for a jumper between two pins of one part: straight out, one square
corner over the part (on the side with less in the way), then down. `roundCorners(…, 0.3, 0.08, 0.15)`.

**`separateWires` (the last check, `wireDeckRouter.ts`).** `densify` every path to 0.06 cm steps. Put every sample in a grid
(cell = 2 × the largest radius + 0.012). For each touching pair (`need = r_a + r_b + 0.01`), decide which wire goes over: the
one that is more level (flatter tangent). If both are level, the one that sits higher overall goes over (`meanY`, a fixed
order, so two wires never take turns). If a lift would exceed `maxLift` (0.6 cm), the pair is eased sideways instead
(`nudges`). A lift is a smooth bump over the wire: 1 within 0.15 cm, then a cosine-squared fall to 0 at 0.7 cm. It fades to
zero in the last `keepEnds` (0.12 cm) at each socket. Up to 16 rounds. It returns how many pairs it could not clear.

**`planWire` (`wireRouting.ts`).** The rest length for hanging wires, leg by leg. The two end legs get
`max(0.1, min(wireSlackCm(leg, 'routed'), 0.15 + 0.6 × h) + extra)`, where `h` is how far the end sits above the surface
below it, and `extra = (clearance − 0.45) × 2`. A single leg gets `min(wireSlackCm, 0.2 + 0.6 × (hA + hB)) + extra`. Interior
legs (between tie points) get `0.5 × max(0, |Δy| − 0.1)`: only enough to step off a board.

**`solveRope` (`wireRope.ts`, about 250 lines).** The chain of points:
- Count: `n = clamp(round(length / 0.3) + 1 + 2 × STUB_POINTS, 12, 90)`, with `STUB_POINTS = 2` (the straight stubs at each
  socket). `seg = length / (n − 1 − 2 × STUB_POINTS)`, about 0.3 cm per link.
- `pinned[]` marks the stubs and the anchors. `anchorIdx` spreads the tie points along the wire with `shareLinks(legs, links,
  seg, legSlack)`: each leg gets its straight length plus its share of the spare length. A leg with no share gets no more
  links than its straight length.
- Start: each leg begins as an arch. `clear` is the height that clears the parts under the leg by `2r + 0.3` cm (sampled in
  16 steps); `sagRoom` is the sag a slack leg needs; `lift = max(sagRoom, clear)`.
- Each step: `g = 0.0075 × gravity`, `damping = 0.9` (Verlet), `minBend = stiffness × 2 × seg` (a bend limit that only pushes
  apart), `passes = 8` per step with the sweep direction alternating. `tether()` keeps each point within its straight reach of
  its two fixed anchors, which stops long wires stretching. `collide(i, withNeighbors)` pushes a point out of the oriented
  boxes (a face weight: resting on top 0.5, underside 1.6, and a grounded part's underside is never used). With
  `neighbors`, it also pushes the point out of the wires already laid (`NeighborField.separate(pos, b, r + seg × 0.5)`).
- Settle: 600 sweeps with gravity off (`SETTLE = 600`), alternating direction; collisions every third sweep; a final six
  neighbour passes. The settle brings the chain to its exact length (a test checks this).

**`ObstacleGrid` (`wireRope.ts`).** Hashes the obstacles into cells of `cell = 1.0` cm (with `margin = 0.2`). `near(x, y, z)`
returns the candidates; `inRegion(min, max)`; `surfaceY(x, z, floorY)` is the top of the highest box under a point;
`heightField(x0, z0, nx, nz, pitch, floorY)` is the same for a whole grid of cell centres (the deck uses it).

**`NeighborField` (`wireRope.ts`).** A hash of points with radii, cell 0.4 cm: `add(points, radius)`, `separate(pos, i,
radius)`, `overlaps(points, radius, slack = 0.004)`, `merge(other)`.

**`wireLength.ts`.** `SOCKET_RISE_CM = 0.88`. `wireSlackCm(span, style, clearance)`: direct gives `min(0.6, max(0.15, span × 0.03))`;
arched gives `min(6, max(1.5, span × 0.3)) + max(0, extra)`; routed gives `max(0.4, min(2.0, max(0.6, span × 0.08)) + extra)`.
`legSlackThroughCm` gives the end legs `wireSlackCm`, and the interior legs `max(0.05, leg × 0.03)`. The inspector and the
cut-list use `wireLengthCm`, an estimate from the straight span.

**`wireGeometry.ts` (the drawing).** `wireRadius`: 0.056 signal, 0.072 power, 0.14 ESC loom. The tube is a `TubeGeometry`
along a `CatmullRomCurve3` through the path, with 8 to 10 radial segments and `segments = clamp(path × 4, 24, 420)`. The DuPont
housing: `DUPONT_BELOW_TIP = 0.6` cm and `DUPONT_ABOVE_TIP = SOCKET_RISE_CM − 0.08 = 0.80` cm; a black 2.5 mm sleeve (a rounded box
1.4 cm long), a steel latch window and a crimp barrel at the top. A solder joint is a sphere of 0.06 cm with a black heat-shrink
sleeve of `SLEEVE_LEN = 0.46` cm. An ESC loom is three strands twisted one turn per 3 cm, at an offset of 0.085 cm, with a
strand radius of 0.048 (0.06 when selected). A cable clip at a waypoint is a rounded box, 0.34 × 0.16 × 0.24 cm.

### 9.5 The bench build copied into the arena
`WorkbenchScene.snapshotModel()` deselects the wire (so the copy has no selection highlight), tags the wheels
(`arenaRole` `wheelL` or `wheelR`, from `comp.side`), the props (`prop`) and the status LEDs (each LED material is cloned and
tagged `led`), removes the pin targets and fault rings, deep-clones `componentRoot` and `wireRoot`, and returns
`{ group, vehicle }`. `vehicle` is `'drone'` if the bench has a quad frame, `'rover'` if it has a chassis or a DC motor, and
`null` otherwise. `Viewport3D` stores the result in `vehicleSnapshotRef` when the bench closes, and gives it to the arena
when the arena opens (`arena.setVehicleModel(...)`).

`arenaVehicle.ts`: `buildArenaVehicle(mode, snapshot)` uses the snapshot when its `vehicle` matches the mode. Otherwise it uses
`presetModel(mode)`: the bench preset `roboforge_rover` or `quad_5in`, built with the same part builders. It scales by
`CM = 0.01` (bench centimetres to arena metres), centres the box over its footprint, puts the bottom at `−GROUND_BELOW_ORIGIN[mode]`
(rover 0.036 m, drone −0.006 m), and collects the wheels, props and LEDs for animation.

---

## 10. Circuit analysis (`engine/circuit.ts`)

`analyzeCircuit(project)` returns `CircuitAnalysis`:
- `nets: NetInfo[]` and `pinToNet: Map<pinKey, NetInfo>`. Nets are union-find sets of pins, joined by wires and by the
  internal connections of parts (for example the two GND pins of the DevKit);
- `diagnostics: CircuitDiagnostic[]` (severity `critical`, `error`, `warning` or `info`, with a title, detail and component ids);
- `hasCriticalFault`, `hasError`, `faultyComponentIds: Set`;
- `budget: PowerBudget` (current draw against the source);
- `sensors: SensorWiringStatus` (`controllerPowered`, `camPowered`, and per sensor whether it is wired);
- `motors: MotorChannelMapping[]` (each motor's driver channel, its GPIO pins, `inPosGpio`, `driverPowered`, side and kind);
- `wireMetrics: Map<wireId, WireMetric>` (`routedMm`, `cutMm`, clearance);
- `checklist: ChecklistTask[]`.

Tested rules (`circuit.test.ts`): the 2WD preset has zero critical, error or warning faults; GPIO PWM maps through the DRV8833
to the motors; the fault lab's swapped right motor is caught; 7.4 V into ESP32 VIN is a critical overvoltage; a direct
power-to-ground short is critical; input-only GPIO35 used as TRIG is an error; the bridge export matches the wired pinout;
the quad preset has four brushless motors, wire lengths and a centre of mass.

`resolveMotorDrives(analysis, pinPwm)` returns one `MotorDriveOutput` per motor: `command` from −1 to +1 (the sign from the
direction pins, the magnitude from PWM / 255), and `pwmMagnitude`. A DC motor needs its driver powered and its `inPosGpio`
wired. A brushless motor uses the PWM on its PHASE pin.

---

## 11. The sketch editor and the virtual ESP32

### 11.1 The editor (`CodePanel.tsx`, `sketchLanguage.ts`)
Monaco 0.52. Lint runs `LINT_DELAY_MS = 450` ms after typing. The markers come from `transpileArduinoSketch`. Completions and
hover come from `HAL_API`. The themes `roboforge-light` and `roboforge-dark` follow the app theme (`monaco.editor.setTheme`).
Autosave is in `App.tsx` (section 5). "Load example sketch" lists `SKETCH_TEMPLATES`, and loading over a modified sketch asks
first. Ctrl+S (`App.tsx`, line 352) and Ctrl+Enter (line 358) are the verify-and-save and run shortcuts.

### 11.2 The translator (`sketchTranspiler.ts`, 1119 lines)
`transpileArduinoSketch(source)` returns a `TranspileResult` (the JavaScript body and any `SketchProblem`s), or a
`TranspileError`. Key pieces (names from the file): `HEADER_LINE_COUNT = 2` (the generated header lines that must not shift the
sketch's lines); `TYPE_WORDS` (int, float, double, bool, boolean, char, long, short, byte, word, String, size_t, unsigned,
signed); `TYPE_ALTS` (the patterns for typed declarations); `KEYWORDS`; `JS_ALLOWED_CALLS` (String, Number, parseInt and so on).

Tested guarantees: every sketch line maps to the same line of the generated body; text inside strings is never rewritten; all
built-in examples and presets compile with no problems or warnings; errors name the right line and column (a missing `;`, an
undeclared name with a suggestion, a member the object does not have, unsupported C++, statements outside a function, an
unclosed brace reported at the line that opened it, and a JavaScript parse error mapped back to the sketch line).

Loop guards: every loop form (while, do/while, for, with or without braces, and an empty `for(;;)`) is instrumented, so the
runtime can check the time. A `millis()` busy-wait works.

C++ behaviour: `int` variables truncate and wrap; uninitialised variables start at 0, false or an empty string; the Arduino
`String` helpers; enums; `sizeof(array)/sizeof(array[0])`; `Serial.print(x, HEX)` and the other formats; `ledcWrite(channel)`
goes to the pin attached with `ledcAttachPin`; a static local warns that it restarts on each call; a sketch may define its own
version of a built-in name.

Unsupported C++ (classes, templates, pointers and the like) is reported plainly, not run.

### 11.3 The runtime (`runtime.ts`, 516 lines)
`VirtualEsp32Runtime` runs `setup()` once, then `loop()` repeatedly, with a 16 ms sleep between turns (about 60 turns a second).
`watchdogMs` defaults to **8000** ms. A loop that runs that long in real time without `delay()` or `yield()` throws
`WatchdogError(line, seconds)`, which reports "the loop on line N ran for 8 s without delay() or yield(), so the simulator
stopped the sketch". Errors map to sketch lines through `SKETCH_SOURCE_URL` ('sketch.ino.js' in the stack frames) and the
pattern `SKETCH_FRAME`. `INPUT_ONLY_PINS = {34, 35, 36, 39}`: `pinMode(35, OUTPUT)` is a runtime fault. `getPinPwmMap()` gives
the pin-to-duty map that `resolveMotorDrives` reads. `recordSignalSample()` feeds the Scope. `HardwareEnvironmentHooks` is the
interface through which the runtime reads the 3D world (ultrasonic, IMU) and writes to the OLED and Serial; read its definition
(about lines 20 to 43) before changing it.

### 11.4 The API (`halApi.ts`, 54 entries)
Functions: `pinMode(int pin, int mode)`, `digitalWrite(int pin, int value)`, `digitalRead(int pin)`, `analogWrite(int pin,
int value)` (PWM 0 to 255), `ledcWrite(pinOrChannel, duty)`, `ledcSetup(channel, freq, bits)` (accepted; the simulator always
uses 8-bit duty), `ledcAttachPin(pin, channel)`, `ledcAttach(pin, freq, bits)`, `delay(ms)`, `delayMicroseconds(us)` (rounded up
to whole milliseconds), `yield()`, `millis()`, `micros()`, `ultrasonicReadCm(trigPin, echoPin)` (−1 if not wired to those pins),
`pulseIn(pin, state)` (about 58 µs per cm), `constrain`, `map`, `abs`, `min`, `max`, `sq`, `sqrt`, `pow`, `sin`, `cos`, `tan`,
`atan2`, `hypot`, `fmod`, `floor`, `ceil`, `round`, `isnan`, `random(max)` and `random(min, max)`, `randomSeed(seed)` (accepted),
`radians`, `degrees`, `bitRead`, `bitSet`, `bitClear`, `bitWrite`, `highByte`, `lowByte`.
Constants: `HIGH` = 1, `LOW` = 0, `OUTPUT`, `INPUT`, `INPUT_PULLUP`, `LED_BUILTIN` = 2, `PI`, `BIN` = 2, `OCT` = 8, `DEC` = 10,
`HEX` = 16, and the SSD1306 colours and commands (`SSD1306_WHITE`, `WHITE`, `SSD1306_SWITCHCAPVCC` and the rest).
Objects: `Serial` (print, println, and reading back lines typed in the Serial tab), `imu` (`readYawDeg`, `readYawRate`),
`Wire` (begin, setClock, beginTransmission, write, endTransmission) and `oled` (the shortcut: eight lines of 21
characters on the first wired OLED). Classes (`HAL_CLASSES`): `Adafruit_SSD1306` and `LiquidCrystal_I2C` (section 11.6).

`HAL_NAMES` drives "was not declared". `HAL_AWAITED` marks the calls that pause (delay, delayMicroseconds, yield).
`HAL_UNAVAILABLE` lists the calls the simulator does not model, each with its reason.

### 11.5 The example sketches (`presets.ts`)
- `BAG_PASS_SKETCH`: the 2WD bag-pass demo with heading hold and the live OLED.
- `QUAD_SPIN_TEST_SKETCH`: bench ESC arming and a motor ramp for the quad.
- `CALIBRATION_SWEEP_SKETCH`: a reality-gap diagnostic sweep.
- `TELEMETRY_SERIAL_SKETCH`: an interactive serial console and a live sensor monitor.
- `ROOM_MAPPING_SKETCH`: an autonomous 360° room mapper (a zero-collision SLAM explorer).
- `OLED_DASHBOARD_SKETCH`, `DISPLAY_LAB_SKETCH`, `I2C_SCANNER_SKETCH` (`displaySketches.ts`): section 11.6.

### 11.6 Displays (OLED and LCD), added 2026-11-24
What the user asked for: "make the displays configurable by code ... whatever you have coded ... appears in the displays
... LCD or OLED". The design keeps the real libraries' behaviour so a sketch runs unchanged on the board.
- **Parts.** `oled_ssd1306` (category Displays, I2C 0x3C, 128 x 64, yellow top 16 rows) and the new `lcd1602_i2c` and
  `lcd2004_i2c` (HD44780 blue STN with a PCF8574T backpack at 0x27; pins GND, VCC, SDA, SCL on a right-angle header pointing
  west; geometry in `boardGeometry.ts` `LCD1602_I2C` / `LCD2004_I2C`, board 15 mm up on nylon standoffs).
- **Circuit.** `SensorWiringStatus.i2cDevices` lists every OLED, LCD and MPU6050 with address, power, supply voltage and the
  ESP32 GPIOs its SDA/SCL reach. LCD checks: `lcd-low-supply-*` (warning, under 4.5 V: faint text), `lcd-5v-pullups-*`
  (info: the backpack pulls SDA/SCL to 5 V), `i2c-address-clash-*` (two devices at one address on one bus).
- **Panels** (`displays/panels.ts`). `DisplayBench` holds one panel per display part, created by `sync(i2cDevices)` (App
  effect on `analysis`). A panel lives as long as the part: it keeps its picture when the sketch stops or restarts, as a real
  display keeps its picture through an ESP32 reset. Power-up states: the OLED is off (black) until `begin()`; the LCD has its
  backlight on and blocks on the first line until `init()`, which then turns the backlight off until `backlight()` (the
  PCF8574 starts with its outputs high, the library writes "no backlight").
- **Libraries** (`displays/libraries.ts`), built per run by `createDisplayLibraries(host)` and spread into the HAL.
  `Wire.begin(sda, scl)` sets the bus pins (default 21/22; a second begin() keeps them). A display's `begin()` / `init()`
  finds its panel with `DisplayBench.deviceAt(address, sda, scl)`; if nothing answers, the screen stays dark and
  `explainMissing` prints the reason once (no such part, no power, SDA/SCL not wired, swapped, wrong pins, wrong address).
  `Adafruit_SSD1306.begin()` returns true like the library (it only fails on memory). Hints: drawing before begin(); text with
  no `setTextColor` (the default 0xFFFF draws nothing on an SSD1306, as on the board); drawing that is never `display()`ed
  (checked between loop() runs); a 128 x 32 set-up on this 128 x 64 module; `lcd.println` (it writes CR and LF, which show as
  custom characters 5 and 2); an LCD on 3.3 V. `createChar` leaves the address in CGRAM, as the library does.
- **Fidelity details.** GFX shapes use the library's algorithms; the built-in 6 x 8 font has the `cp437(false)` quirk
  (codes 176+ shifted, so `(char)247` is the degree sign); `setFont(&Font)` is drawn with the built-in font scaled by the
  font's point size, baseline at the cursor. The LCD models DDRAM addressing (row offsets 0x00, 0x40, 0x14, 0x54, so a 20x4
  continues row 0 on row 2), display shift, autoscroll, entry direction, cursor, blink (410 ms) and the A00 ROM (0x5C is the
  yen sign, 0x7E/0x7F arrows, 0xDF degree). Sketch strings are bytes: the translator stores non-ASCII characters in string
  literals as their UTF-8 bytes (`transformStringBytes`), Serial decodes them back (`decodeSketchText`), and a display draws
  the bytes, as on the board; the editor warns when such text goes to a display.
- **Translator.** `findLibraryObjects` (declared objects and their class), `transformLibraryObjects` (declaration to
  `const name = Class(args)`, `&Wire` to `Wire`, `&FreeSans9pt7b` to the font name), member checks for declared objects
  and `Wire`, an address-of check (`&x` other than Wire / fonts is an error; `getTextBounds` gets its own message), `PROGMEM`
  dropped, Arduino `B0101` constants, `#define` names kept out of the HAL header (so `#define WHITE ...` works), include
  warnings (`KNOWN_INCLUDES`, `INCLUDE_ADVICE`).
- **Screens** (`viewport/displayPainter.ts`). Each display part's builder returns a `DisplaySurface` (canvas, texture,
  material, LCD layout). `paintDisplays` runs every frame from `Viewport3D` and repaints a screen only when its panel's
  `version` (or the blink / scroll step) changed. The arena copy shares the textures (`VehicleSnapshot.displays`), so it
  updates too. Screen and glass materials use a low `specularIntensity`: with a scene-wide environment map, three.js uses
  the scene's `environmentIntensity` instead of a material's `envMapIntensity`, and glossy glass seen from straight above
  mirrored the studio's ceiling light and turned the OLED white (this was why "the displays show nothing").
- **Checks.** `engine/__tests__/displays.test.ts` (17 tests); `scripts/checks/displays.cjs` captures the Display Lab before
  and after Run, both screens close up, and the rover OLED.
- **Not modelled.** U8g2 and other libraries, SPI displays, the parallel `LiquidCrystal`, GFX font files, address jumpers,
  `Wire.read/requestFrom`, `getTextBounds` (pointers).

---

### 11.6b Drag and drop from the parts list (added 2026-11-25)
Part and shape cards are `draggable` (`PartsPanel.startPartDrag`, type `PART_DRAG_TYPE`, the thumbnail as drag image).
`Viewport3D`'s canvas host shows a teal ring while a part is dragged over the bench (`WorkbenchScene.showDropMarker`) and
on drop calls `onDropPart(kind, at)`; `WorkbenchScene.dropPointAt(x, y)` puts the part on the chassis, quad frame, CAD plate
or box under the cursor (an upward face), otherwise on the mat at height 0, snapped to the grid and kept on the bench.
`App.handleAddPart(kind, at?)` places it there (clicking a card still adds it at the default spot). Bench mode only.

### 11.9 Design tab: AI plans a build, the assembler builds it (added 2026-11-27)
The user chats briefly in the **Design** tab (right panel); the result is a blueprint and parts list, and **Build on the
bench** assembles it step by step on the bench. The AI decides *what* (platform and add-on parts); deterministic code
decides *where* and *how*.
- `engine/design/plan.ts`: the contract. `BuildPlanSchema` (title, summary, `platform` rover | drone | bench, `parts`
  [{kind, qty, role, placement front|back|any, locked}]), `ADDON_KINDS` per platform, `PLATFORM_INFO`,
  `catalogForPrompt()`, `parsePlan()` (Zod; refuses unknown kinds, drops kinds that are not add-ons for the platform).
- `engine/design/offline.ts`: `offlineTurn(text, plan, history)`, the keyword planner used with no key, when the AI
  fails, and in tests. It makes a plan, asks what kind of build when unclear, applies edits ("add a button", "use an
  LCD instead", "remove the camera"), and says plainly what the library lacks (temperature, GPS, servo...).
- `engine/design/assemble.ts`: `assemble(plan)` -> `{ project, steps, bom, pins, notes, dropped }`.
  - Rover: the core in the real rover's layout (chassis, motors at x = +-8.14, ESP32, driver, 2S pack, buck, bulk
    capacitor fed through its leads).
  - Bench: ESP32, pack and buck as in the Display Lab.
  - Drone: the quad preset (the plan only chooses the VTX).
  - Add-ons: a footprint packer (body + pins + room for sockets on sideways pins; soldered leads less), preferred
    spots per kind, `maxShift` 4.5 cm on the rover. Front sensors and the camera may overhang the deck's front edge.
    Standoffs, motor brackets and the battery-lead lane are kept clear.
  - Satellites: the ECHO divider and LED resistors are placed *with* their module or the module tries its next spot.
  - GPIOs from preference lists: TRIG 13,16,17,18,19; ECHO 35,34,36,39 (input-only); LEDs 4,23,19...; buttons
    18,19,23... (to 3V3). I2C is 32/33 on the rover and 21/22 on the bench.
  - Shared nets fan out through `wire_splice` parts. The source keeps one jumper (header) or up to 4 (pads), and far
    groups of consumers get local splices chained from the first one.
  - Anything that does not fit is listed in `dropped` with the reason (for example a 16x2 LCD on the rover deck).
- `engine/design/sketch.ts`: `starterSketch(spec)`, a real-board starter sketch with the assigned pins (rover: cruise and
  turn away below 30 cm, heading turn with the IMU; bench: show readings; drone: the quad test sketch).
- `engine/design/designChat.ts`: `designTurn()` (AI via `/api/design/chat`, else offline), `systemPrompt(plan)`,
  `readAiAnswer()` (first JSON object, then `parsePlan`), `aiStatus()`.
- `server/designAi.ts`: the Vite dev-server plugin.
  - `GET /api/design/status`; `POST /api/design/chat` with `{system, messages}`.
  - It reads `config/llm.json` (`api_key`, `model`) from the studio folder or its parent, or `OPENROUTER_API_KEY`,
    and only calls the configured model (default `nvidia/nemotron-3.5-super-vl:free`).
  - The key stays server-side, and errors are scrubbed of it.
  - A production build has no endpoint, so the offline planner answers.
- `components/DesignPanel.tsx`: the chat, blueprint (`footprint()` top view), parts list (remove an asked-for part),
  totals and runtime, pins, notes, Markdown/CSV export, and the build progress with Pause / Skip.
- `App.tsx`: `buildPlayback`. The steps are applied with `updateProjectInPlace` (380 ms per part, 150 ms per wire),
  and the finished build is pushed as one undo step. `Viewport3D` `buildFx` turns on
  `WorkbenchScene.setArrivalEffects` (parts drop in) and frames the build at the end.
- Checks:
  - `engine/__tests__/design.test.ts` (15 tests: no critical faults or errors, one jumper per pin, real pins only,
    LEDs with resistors, dividers, powered I2C devices, a sketch that compiles cleanly, parts-list counts);
  - `scripts/checks/design_flow.cjs` (the whole flow in Chrome, including Run);
  - `scripts/checks/project_wires.cjs` (touching or straight wires for saved projects).
- Seen working on 2026-11-27: offline and real-AI (Nemotron) designs built and ran (rover avoiding walls; desk
  gadget with LCD, sensor, buttons and LED). Not checked: how the free model copes with long or unusual chats.

### 11.8 Parts style guide
`docs/PARTS_STYLE_GUIDE.md` holds the binding rules for building parts: sourcing first, one geometry constant per part,
the kit APIs, materials, the screen-reflection trap, registration steps, verification with
`scripts/checks/part_shots.cjs <kind>`, and a definition-of-done checklist. Attach it to any request for a new part.

### 11.7 One jumper per header pin, solder splices (added 2026-11-24)
A 2.54 mm header pin takes one DuPont socket, so `engine/pinCapacity.ts` gives header pins a capacity of 1 and soldered
points (`contact: 'lead'`: resistor / LED / capacitor leads, buck and FC pads, motor tabs, battery leads, splices) no
limit. The bench refuses to start or finish a wire on a full pin (`pinRefusal`, red tooltip line "Has its jumper", a
notice saying to use a splice); `App.handleConnectPins` checks again; `analyzeCircuit` reports `pin-overloaded-*` errors
for imported or older builds (`overloadedPins`). The new part `wire_splice` (Passives, one soldered pin `J`) joins several
wires. The presets were rewired to match: the rover feeds 3V3, GND, SDA and SCL to the MPU6050 and OLED through four
splices (`sp_3v3`, `sp_gnd`, `sp_sda`, `sp_scl`), the driver's VM/GND come through the bulk capacitor's leads, the ECHO
divider resistors are soldered together at the GPIO35 end, and the MPU's AD0 strap is gone (the GY-521 pulls AD0 low
itself). The Display Lab splits GPIO21/22 at two splices; the fault lab feeds the driver straight from the buck. Tests:
`engine/__tests__/pinCapacity.test.ts`. `scripts/checks/wire_overlap.cjs` ignores contact within 3.5 mm of a shared
soldered end.

## 12. The reality-gap model and the Twin tab

`TwinFaultConfig` (section 6) is edited in the Twin tab, and by the arena's Real Rover Profile and Ideal Sim buttons.
- **Real Rover Profile (15% Weak R):** `leftMotorScale` 1.0, `rightMotorScale` 0.85, `minStartPwm` 150, `gyroDriftDegPerSec` 0.4.
- **Ideal Sim:** scales 1.0 and 1.0, `minStartPwm` 0, `gyroDriftDegPerSec` 0, `floorFriction` 0.8, `usNoiseCm` 0.
- **Defaults** (`DEFAULT_FAULTS`): 1.0, 0.94, 145, 0.15, 0.65, 0.4.

How each knob acts in `arenaPhysics.ts`:
- `applyMotorImperfections(rawCmd, gainScale)`: a command below `minStartPwm` does nothing (the deadband). The rest is scaled
  to 0..1 over the range up to 255, then multiplied by the side's scale. Test: nothing moves below `minStartPwm`.
- `vTarget = (effLeft + effRight) / 2 × MAX_WHEEL_SPEED_MPS` (0.55 m/s); `omegaTarget = (effRight − effLeft) × 0.55 / TRACK_WIDTH_M`
  (0.14 m). A weaker right motor pulls the rover to the right (test: "reproduces right-pull drift").
- `traction = clamp(floorFriction / 0.65, 0.15, 1.2)` scales how fast the body follows its target.
- `accumulatedDriftDeg += gyroDriftDegPerSec × dt`; the reported yaw rate is the body's rate plus the drift.
- `usNoiseCm`: the ultrasonic reading gets an error of `sin(simTime × 29.3) × usNoiseCm × 0.5` cm.
- `ROVER_HALF_EXTENTS` = (0.085, 0.035, 0.105) m, the rigid body. `MAX_ULTRASONIC_M` = 4.0 m, the sonar raycast range.

Drone: `stepDrone(dt, DroneFlightInput)` takes `forward`, `strafe`, `climb`, `yaw` and `throttle`, and moves a flight model.
`ArenaTelemetry.propThrottle` drives the prop spin and the LED brightness in `ArenaScene.render`.

---

## 13. The arena in depth

- `ArenaPhysicsEngine` (`arenaPhysics.ts`, 788 lines, cannon-es 0.20): `setVehicleMode`, `setArenaConfig`, `setFaults`,
  `setObstacles`, `clearMap`, `resetRover`, `zeroGyro`, `step(dt, leftCmd, rightCmd)` (the rover), `stepDrone`, `getTelemetry`,
  `getOccupancyGrid`, `getRoverPose`, `getRawYawDeg`. Private: `computeStartZ`, `updateGridDimensions`, `clampWithinArenaBounds`,
  `updatePathAndBags` (the path length and the bag count), `markGridCell(wx, wz, 1 | 2)` (1 = free, 2 = wall or bag),
  `castUltrasonic(updateMap)` (the 3D raycast from the sonar, nearest hit within `MAX_ULTRASONIC_M`), `computeTelemetry`,
  `rebuildPerimeterWalls`.
- The occupancy grid is the SLAM map that `MapPanel` shows (Free, Wall / Bag, Trail, Rover). "Room mapped" is the share of the
  room's cells that have been seen.
- `ArenaScene.ts` (797 lines): `setCameraMode` (orbit, chase, top), `setVehicleMode`, `setArenaConfig`, `setEditTool`,
  `syncObstacles`, `render(dt, pose, telemetry, ledPwm, mappedPoints)` (sets the vehicle pose, spins the wheels and props, lights
  the LEDs, draws the ultrasonic beam, the trail and the SLAM points, updates the camera, renders the scene, and the FPV PiP).
  `updateCamera`: the chase camera sits 0.55 m behind (rover) or 0.8 m behind (drone), and 0.32 m (rover) or 0.45 m (drone) up. It
  lerps at 0.09 and looks at a point 0.35 m ahead along the heading.
- Obstacles: `arenaMeshes.ts` `buildArenaObstacleGroup` makes each kind. The collider is built from the same size in `arenaPhysics.ts`.
- Environments: `ARENA_TEMPLATES` in `catalog/arenaPresets.ts`, each with its obstacles and wall settings.

---

## 14. Tests (82 Vitest tests, 8 files, all passing on 2026-11-24)

| File | Tests | What it covers |
|---|---|---|
| `engine/__tests__/sketchTranspiler.test.ts` | 23 | line mapping, strings untouched, every example and preset compiles, error lines and columns, the watchdog on runaway loops, C++ behaviour |
| `engine/__tests__/circuit.test.ts` | 8 | the rover and quad presets, the fault lab, GPIO to motor mapping, critical faults, the bridge export |
| `engine/__tests__/wireDeckRouter.test.ts` | 13 | the deck grid, lanes side by side, hops over crossings, square corners, lanes off joints, pin order, drops, bridges, fillets, bump smoothing, the last-check separation |
| `engine/__tests__/wireRope.test.ts` | 8 | rope length, straight sockets, sag on the bench, drape, turned boxes, the bend limit, tie points, neighbours, slack per style |
| `engine/__tests__/arenaPhysics.test.ts` | 5 | the ultrasonic detects the first bag, the deadband, right-pull drift, arena resize and grid, the quad through a gate |
| `engine/__tests__/roomMapper.test.ts` | 3 | the room mapper maps the 2-bag arena and a crowded one with zero collisions, and maps at least 90% in 60 s with a 15% weaker right motor and gyro drift |
| `engine/__tests__/runtime.test.ts` | 5 | all five templates compile; setup and loop, PWM, IMU, Serial; a fault on an input-only pin; OLED and Scope; typed arrays and method calls |
| `engine/__tests__/displays.test.ts` | 17 | GFX shapes and text, SSD1306 needs setTextColor and display(), wrong address / pins / swapped SDA-SCL hints, the oled shortcut, LCD power-up blocks, setCursor and print, custom characters, 20x4 row order, println hint, 3.3 V dimming, I2C scan, UTF-8 strings, declaration forms and errors, library members match the runtime, Display Lab wiring, LCD on 3.3 V warning |

Commands: `bun run typecheck`, `bun run lint`, `npx vitest run`, `bun run build`. The test count comes from Vitest's own
report. A grep for `it(` in the source gives a larger number, because it also matches `split(` and similar.

---

## 15. Browser verification (what was run, what it showed)

| Check | Script | Result (date) |
|---|---|---|
| No two wires touch (the main preset check) | `scripts/checks/wire_overlap.cjs` | rover 37 wires, 0 pairs; quad 8, 0; room mapper 37, 0; fault lab 27, 0 (2026-11-24, with the DEV hook) |
| Mixed wire styles on the rover (tight, arched, one hand clip) | a temporary script (not kept) | **1 pair touching, 0.3 mm** after the last change. Not covered by `wire_overlap.cjs`, which uses the preset as saved |
| Presets load with no console errors | `presets.cjs` | all presets, `errors: []` |
| Editor workflow (typing, undo across example loads, theme, width, the preset-change confirm and cancel) | `editor.cjs` | 25 of 25 passed (an earlier run, before the arena change; re-run it) |
| Arena: rover and quad, chase and orbit, environments, run | `arena.cjs`, and `docshots.cjs` | the rover chase, the quad chase and the forest orbit were captured. The rover drove about 0.9 m (path reading) in 4 s and turned, and the sonar mapped. No errors |
| Room mapper: the arena plus the Map panel | `docshots.cjs` | a 12 s run: 62% of the room mapped, 209 points, 0 collisions |
| Timing | temporary probes (not kept) | presets load in about 250 to 1000 ms; a full rover rebuild 45 to 190 ms; a selection-only rebuild 31 to 64 ms |

Screenshots taken on 2026-11-24 are in `docs/screenshots/2026-11-24/` (WebP, 1200 px wide). Section 18 lists them.

---

## 16. Working copy versus the clone (today)

Changed since `f82a8ce` (not committed): `HANDOFF.md` (new); `scripts/checks/` (new: `wire_overlap.cjs`, `presets.cjs`,
`editor.cjs`, `arena.cjs`, `wire_close_up.cjs`, `docshots.cjs`); `docs/screenshots/2026-11-24/` (new, 18 WebP files); and
`src/viewport/WorkbenchScene.ts` (the DEV-only `__roboforgeWires` hook, an `if (import.meta.env.DEV)` block just before the tube
draw loop). Type check, lint and the 65 tests pass with these changes. **Push only when the owner asks, or under the standing
"timely" rule (section 2.2) once the owner has seen these changes.**

---

## 17. Known issues, gaps and honest limits

### 17.1 README and docs (wrong now)
- The README says **44 Vitest tests** (there are 65) and **31 TypeScript modules and 4 suites** (there are 55 modules and 7 suites).
- The README says **"F8 / Shift+F8 next / previous problem"** and **"Esc (in the editor) stops the sketch"**. **Neither is in the code**:
  there is no F8 binding in `src`, and Escape only cancels viewport tools and closes dialogs. Fix the README, or add the keys.
- The README quickstart uses port 8060 (correct for the `dev` script). This machine's private copy uses 8070.
- `docs/01` to `docs/06` contain development history ("Since replaced", phase logs). They are being reorganised (section 18).
- The arena images `docs/assets/03_room_mapper_live_arena.webp` and `docs/assets/04_drone_forest_arena.webp` still show the **old
  box vehicle models**. Replace them with `docs/screenshots/2026-11-24/room_mapper_arena_map.webp` and
  `arena_forest_orbit.webp`, or retake them.

### 17.2 Studio behaviour
- **The Real Rover Profile** is a simulation, not a measurement. Its numbers follow the handoff's measured notes, but they are
  not a model of the real rover.
- **Wire clutter.** The shared 3.3 V and GND runs from the buck to every board make the deck busy. The wires are clean (no
  touching) but not minimal.
- **Fallback stacking.** When no lane is free, a wire may lie over a bundle (`stacked` > 0). Check the count after large
  preset edits (it was not checked on the presets this session).
- **Two wires can still touch** in a mixed-style build: the 0.3 mm pair on the rover (section 15). Find the cause; the last
  check handles the normal case.
- **Quad battery lead.** Earlier, a lead from the 6S pack rose to the top of the frame and dropped in a long arc. The rope
  settle and tether changes came after that, and the quad was checked for overlaps, not for shape. Look at it again.
- **Drag cost.** A drag uses one routing attempt and 60 rope steps. Check it does not stutter on a slow machine.
- **Build size.** `bun run build` warns that chunks are over 500 kB (three.js and Monaco). Known; consider code splitting.
- **Scope and Twin.** They have had no screenshots or checks in this round.
- **Build it for real** is in the toolbar; its behaviour was not checked.
- **The parts** are procedural models built from datasheet dimensions, not manufacturer CAD. Small hidden details are
  simplified (see `docs/06_COMPONENT_REFERENCES.md`).
- **The sketch runtime** is a C++ subset translated to JavaScript, not a compiler. Unsupported C++ is reported, not run.

### 17.3 Hardware (summary; details in section 8)
- Nothing wireless has run on the real rover. G-W1 to G-W5 are the owner's.
- Open: the ECHO divider; the pin-map conflict; no capacitors; brownouts; the destroyed driver; the camera buffer; no encoders
  (distance is time-based).

---

## 18. Documentation plan and screenshot inventory

### 18.1 Target structure (not started; this is the next docs task)
A reading order that is not a development log. Each doc says what is simulated, what is verified, and what is not.

| # | File | Content |
|---|---|---|
| — | `README.md` (root) | the front page: what it is, status, screenshots, quick start, docs index |
| 00 | `docs/README.md` | the index, the reading order, a status legend |
| 01 | `docs/01_OVERVIEW.md` | what RoboForge is; the hackathon; a guided tour with screenshots; a glossary |
| 02 | `docs/02_BENCH_AND_PARTS.md` | building on the bench: parts, tools, inspector, circuit checks, presets, export |
| 03 | `docs/03_WIRING.md` | the wires: Natural (deck lanes), Tight, Arched, hand clips, DuPont, solder joints, rules and limits |
| 04 | `docs/04_COMPONENTS.md` | the 23 kinds, how they are modelled, the kit, materials, lighting |
| 05 | `docs/05_COMPONENT_REFERENCE.md` | dimensions, pins and sources (move `06_COMPONENT_REFERENCES.md` here) |
| 06 | `docs/06_SKETCH_EDITOR.md` | the editor, the C++ subset, errors, the HAL API table, shortcuts (fix the F8 and Esc claims) |
| 07 | `docs/07_ARENA_AND_VEHICLES.md` | the arena, environments, obstacles, the bench-built vehicles, cameras, physics, SLAM |
| 08 | `docs/08_THE_REAL_ROVER.md` | the hardware: pins, power, firmware, measured, not measured, risks, timeline (from section 8) |
| 09 | `docs/09_ARCHITECTURE.md` | the module map (section 7), the data flow (section 5), the schema (section 6), the algorithms (sections 9.3 and 9.4) |
| 10 | `docs/10_TESTING.md` | the tests (section 14), the browser checks (section 15), how to run them |
| 11 | `docs/11_STATUS_AND_ROADMAP.md` | known issues (section 17), next steps (section 19), history (section 1) |
| 12 | `docs/12_RESEARCH_AND_COMPARISON.md` | the old competitor research (BenchTwin, Constructa) from `01_RESEARCH_AND_GAP_ANALYSIS.md` |

Then: remove the old `docs/01` to `06` files once their content has moved; fix the README numbers (section 17.1); point the
README images at `docs/screenshots/2026-11-24/` or `docs/assets/`; check every link.

### 18.2 Screenshot inventory (WebP, 1200 px wide, `docs/screenshots/2026-11-24/`)
| File | What it shows |
|---|---|
| `bench_rover_iso.webp` | the rover preset, Iso, light theme |
| `bench_rover_top.webp` | the rover, Top view (the deck and the lanes) |
| `bench_rover_front.webp` | the rover, Front view |
| `bench_rover_close.webp` | a close-up of the wiring around the ESP32 and the drivers |
| `bench_rover_dark_iso.webp` | the rover, Iso, dark theme |
| `app_light_full.webp` | the full app, light theme, Inspect tab |
| `app_light_wire_selected.webp` | a wire selected: cable length and style buttons |
| `app_dark_full.webp` | the full app, dark theme |
| `bench_quad_iso.webp` | the 5-inch quad preset |
| `bench_fault_lab_iso.webp` | the fault lab preset |
| `editor_verified.webp` | the Code tab with the bag-pass example, after Verify |
| `editor_problem.webp` | the Code tab with a deliberate error: red status, line 129 flagged |
| `arena_rover_chase.webp` | the arena, the rover, Chase camera (the bench build in the arena) |
| `arena_rover_driving.webp` | the arena, the rover driving after Run |
| `arena_drone_chase.webp` | the arena, the quad, Chase camera |
| `arena_forest_orbit.webp` | the forest park arena, the quad flying, the FPV inset |
| `arena_warehouse_builder_full.webp` | the arena builder ribbon and the warehouse world |
| `room_mapper_arena_map.webp` | the room mapper running in the arena, with the Map panel |

**Not available yet:** photographs of the physical rover. None are in the project (only simulator dataset images). The owner
should supply them. Put them in `docs/photos/` with a caption each. Do not invent or stage them.

Older images still linked in places: `docs/assets/06_sketch_editor.webp` (older editor) and
`docs/assets/01b_rover_closeup_wiring.webp` (earlier wiring), plus the old arena images (section 17.1). Replace them with the set above.

---

## 19. Next steps (in order)

1. **Confirm the hardware with the owner:** the ECHO divider (section 8.6.1) and the pin map on the physical rover (8.6.2).
   Do not drive the real rover until both are answered.
2. **Fix the README** (the numbers, the F8 and Esc claims, the port) and the arena screenshots (section 17.1).
3. **Docs restructure** (section 18.1), with every claim checked against the code. The tables in sections 6, 7, 9.1, 11.4 and
   14 can be generated from the code.
4. **Commit and push** the pending changes (section 16), with the owner's author name and **no co-author line**.
5. **Studio gaps:** Scope and Twin screenshots and checks; the mixed-style 0.3 mm pair; the quad battery-lead shape; the
   `stacked` count on the presets; code splitting for the 500 kB warning.
6. **The owner's hardware gates** G-W1 to G-W5 (Python project, `docs/ROBOFORGE_GUIDE.md`). Read the logs before saying
   anything about results. Create `runs/rover/<time>/` for every real run.
7. **Later (Python project):** missions on the real rover (`MissionRunner` over the Wi-Fi client), the Draft-versus-AI
   wording, regenerate the judges' brief (`python -m tools.build_brief`), and the demo rehearsals (plan phase D).

---

## 20. Glossary and conventions

- **Bench units:** centimetres. `MM = 0.1` (one millimetre). Part sizes are in `sizeCm`. Wire radius: 0.056 cm (signal),
  0.072 (power), 0.14 (ESC loom).
- **Arena units:** metres. Bench to arena: `CM = 0.01`.
- **Axes:** X to the right, Y up, Z towards the viewer; **north is −Z**. A part's `rotationY` is in radians about Y.
- **Pins:** `pinId` is the catalog id (`GPIO25`, `VIN`, `BAT_POS`). The world position comes from the pin mesh.
- **Natural (routed):** the default wire style, laid on the deck. **Tight (direct):** pulled almost straight. **Arched:** a stiff
  jumper that holds an arch. **Route by hand:** adds clips (`waypoints`).
- **Deck:** the surface the wires lie on (the chassis plate, or the bench). **Lane:** one cell of the deck grid (2.54 mm).
- **Port:** the cell a wire leaves its landing through. **Landing:** the cell under the socket where a wire comes down.
- **Socket:** a DuPont female housing on a header pin. **Joint:** a solder joint with heat-shrink, on a lead or a pad.
- **Virtual ESP32 / HAL:** the simulated board and its API (`halApi.ts`). **Watchdog:** the 8 s loop guard.
- **Reality gap:** the difference between the simulator and the real rover (motor scale, deadband, gyro drift, friction, sonar noise).
- **Writing style for the app and docs:** plain words; no "safe", "guaranteed" or "proven"; say what was not tested.

---

## 21. Quick reference

| Need | Where |
|---|---|
| Add a part | `catalog/partsCatalog.ts` (pins, size); `viewport/parts/*.ts` (builder); `parts/index.ts` (the map); `catalog/boardGeometry.ts` (dimensions) |
| Add a preset | `catalog/presets.ts` (`STUDIO_PRESETS`, `createPresetProject`) |
| Add an example sketch | `catalog/presets.ts` (`SKETCH_TEMPLATES`) |
| Add a HAL function | `engine/halApi.ts` (`HAL_API`); then `engine/runtime.ts` (the implementation); and `sketchTranspiler.ts` if the name needs special handling |
| Change the wire router | `viewport/wireDeckRouter.ts` (the deck, drops, bridges, separation); `viewport/wireRope.ts` (hanging wires); `viewport/wireRouting.ts` (slack per leg); `engine/wireLength.ts` (slack rules); `viewport/WorkbenchScene.ts` `rebuildWires` (the pipeline) |
| Change the arena physics | `engine/arenaPhysics.ts` (constants near the top; `applyMotorImperfections`, `castUltrasonic`) |
| Change the arena look | `viewport/ArenaScene.ts`, `viewport/arenaMeshes.ts`, `viewport/arenaVehicle.ts` |
| Change the look of parts | `viewport/kit/*`, `viewport/materials.ts`, `viewport/parts/*` |
| Change the data model | `schema/projectSchema.ts` (then fix every reader; `version` is 1, so bump it only when the stored format breaks) |
| Change the editor | `components/CodePanel.tsx`, `components/sketchLanguage.ts`, `engine/sketchTranspiler.ts` |
| Add a test | `src/engine/__tests__/*.test.ts` |
| Check that wires do not touch | `scripts/checks/wire_overlap.cjs` (needs the DEV hook) |
| Replace an image | `docs/screenshots/...` (WebP, 1200 px wide); update the link in the README or the docs |

Key constants, in one place:
- Wires: `SOCKET_RISE_CM` 0.88 (`wireLength.ts`); `RISE_CM` 0.45, `SIDE_CLEARANCE_CM` 0.1, `LOW_PART_CM` 0.35 (`wireDeckRouter.ts`);
  the deck `pitch` 0.254, `NEXT` 0.3 and `LIFTS` (`WorkbenchScene.ts`); `STUB_POINTS` 2, `SETTLE` 600, `passes` 8, `damping` 0.9,
  `g` 0.0075 (`wireRope.ts`); `DUPONT_BELOW_TIP` 0.6, `DUPONT_ABOVE_TIP` 0.8, `SLEEVE_LEN` 0.46 (`wireGeometry.ts`).
- Runtime: `watchdogMs` 8000, the loop sleep 16 ms, `INPUT_ONLY_PINS` 34, 35, 36, 39 (`runtime.ts`).
- Arena physics: `ROVER_HALF_EXTENTS` (0.085, 0.035, 0.105) m, `MAX_ULTRASONIC_M` 4.0, `MAX_WHEEL_SPEED_MPS` 0.55,
  `TRACK_WIDTH_M` 0.14 (`arenaPhysics.ts`); `CM` 0.01 (`arenaVehicle.ts`).
- Editor: `LINT_DELAY_MS` 450 (`CodePanel.tsx`); the session key `roboforge.studio.session.v1` (`App.tsx`).
- Hardware: left motor 25/26, right motor 27/14, MPU 32/33, TRIG 13, ECHO 35 (the wireless firmware); speed level 180 and a
  minimum strength of about 150 (measured, the USB build); a 2S Li-ion pack into an LM2596 at about 5.2 V.

---

*End of handoff. Last updated 2026-11-24 by the studio session.*
