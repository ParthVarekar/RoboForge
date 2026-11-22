import * as THREE from 'three';
import type { ComponentInstance } from '../schema/projectSchema';
import {
  getAcousticMeshTexture,
  getCarbonTexture,
  getPcbSilkscreenTexture,
  makeSilkscreenPlane,
  paintOledCanvas,
} from './materials';

export interface PartMaterialPalette {
  nickel: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  darkMetal: THREE.MeshStandardMaterial;
  matteBlack: THREE.MeshStandardMaterial;
  copper: THREE.MeshStandardMaterial;
  redAnodized: THREE.MeshStandardMaterial;
  blueAnodized: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  carbon: THREE.MeshStandardMaterial;
  ceramicSmd: THREE.MeshStandardMaterial;
  tpuOrange: THREE.MeshStandardMaterial;
  siliconeBlue: THREE.MeshStandardMaterial;
  kapton: THREE.MeshStandardMaterial;
}

/**
 * Builds the shared physically-based material palette used across all detailed 3D workbench components.
 */
export function createPartPalette(): PartMaterialPalette {
  return {
    nickel: new THREE.MeshStandardMaterial({ color: 0xd8dfe8, metalness: 0.9, roughness: 0.2 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.96, roughness: 0.12 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x222730, metalness: 0.72, roughness: 0.3 }),
    matteBlack: new THREE.MeshStandardMaterial({ color: 0x161920, roughness: 0.68, metalness: 0.14 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.86, roughness: 0.24 }),
    redAnodized: new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.78, roughness: 0.24 }),
    blueAnodized: new THREE.MeshStandardMaterial({ color: 0x2563eb, metalness: 0.8, roughness: 0.22 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xf0bd2e, metalness: 0.9, roughness: 0.18 }),
    carbon: new THREE.MeshStandardMaterial({
      color: 0x5a6270,
      map: getCarbonTexture(),
      roughness: 0.56,
      metalness: 0.16,
      envMapIntensity: 0.45,
    }),
    ceramicSmd: new THREE.MeshStandardMaterial({ color: 0xb48a5a, roughness: 0.45, metalness: 0.12 }),
    tpuOrange: new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.58, metalness: 0.05 }),
    siliconeBlue: new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.55, metalness: 0.05 }),
    kapton: new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3, metalness: 0.35 }),
  };
}

function addSmdComponent(
  group: THREE.Group,
  x: number,
  y: number,
  z: number,
  pal: PartMaterialPalette,
  isCapacitor = false,
  rotate = false,
): void {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  if (rotate) g.rotation.y = Math.PI / 2;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.06, 0.09),
    isCapacitor ? pal.ceramicSmd : pal.matteBlack,
  );
  g.add(body);
  for (const sx of [-0.08, 0.08]) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.065, 0.095), pal.nickel);
    cap.position.x = sx;
    g.add(cap);
  }
  group.add(g);
}

function addGullWingIc(
  group: THREE.Group,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  pinsPerSide: number,
  pal: PartMaterialPalette,
  fourSided = false,
): void {
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), pal.matteBlack);
  body.position.set(x, y, z);
  body.castShadow = true;
  group.add(body);

  // Pin-1 orientation dimple
  const dot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.02, 8),
    new THREE.MeshBasicMaterial({ color: 0x94a3b8 }),
  );
  dot.position.set(x - w * 0.32, y + h * 0.51, z - d * 0.32);
  group.add(dot);

  const pinGeo = new THREE.BoxGeometry(0.12, 0.035, 0.04);
  for (let i = 0; i < pinsPerSide; i += 1) {
    const t = pinsPerSide === 1 ? 0 : i / (pinsPerSide - 1) - 0.5;
    const pz = z + t * (d * 0.84);
    for (const dir of [-1, 1]) {
      const lead = new THREE.Mesh(pinGeo, pal.nickel);
      lead.position.set(x + dir * (w * 0.5 + 0.05), y - h * 0.3, pz);
      group.add(lead);
    }
  }
  if (fourSided) {
    const pinGeoZ = new THREE.BoxGeometry(0.04, 0.035, 0.12);
    for (let i = 0; i < pinsPerSide; i += 1) {
      const t = pinsPerSide === 1 ? 0 : i / (pinsPerSide - 1) - 0.5;
      const px = x + t * (w * 0.84);
      for (const dir of [-1, 1]) {
        const lead = new THREE.Mesh(pinGeoZ, pal.nickel);
        lead.position.set(px, y - h * 0.3, z + dir * (d * 0.5 + 0.05));
        group.add(lead);
      }
    }
  }
}

function addM3Screw(group: THREE.Group, x: number, y: number, z: number, pal: PartMaterialPalette): void {
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 14), pal.chrome);
  head.position.set(x, y, z);
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 6), pal.darkMetal);
  socket.position.set(x, y + 0.06, z);
  group.add(head, socket);
}

function addKnurledStandoff(
  group: THREE.Group,
  x: number,
  yCenter: number,
  z: number,
  height: number,
  radius: number,
  mat: THREE.Material,
  pal: PartMaterialPalette,
): void {
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 6), mat);
  shaft.position.set(x, yCenter, z);
  shaft.castShadow = true;
  group.add(shaft);
  for (const frac of [-0.36, 0.36]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.08, radius * 1.08, height * 0.14, 12), mat);
    ring.position.set(x, yCenter + height * frac, z);
    group.add(ring);
  }
  addM3Screw(group, x, yCenter + height / 2 + 0.08, z, pal);
}

function createPropellerBlade(length: number, mat: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.15);
  shape.bezierCurveTo(length * 0.24, -0.58, length * 0.65, -0.52, length * 0.92, -0.24);
  shape.quadraticCurveTo(length * 1.02, -0.02, length * 0.94, 0.18);
  shape.bezierCurveTo(length * 0.62, 0.36, length * 0.25, 0.26, 0, 0.14);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  geo.rotateX(Math.PI / 2);
  const blade = new THREE.Mesh(geo, mat);
  blade.rotation.x = 0.36;
  blade.castShadow = true;
  return blade;
}

/**
 * Builds an ultra-detailed ESP32 DevKit V1 module with FR-4 silkscreen, WROOM-32 shield,
 * inverted-F gold antenna, CP2102 UART, AMS1117 regulator, micro-USB, SMD passives & LEDs.
 */
export function buildDetailedEsp32(
  group: THREE.Group,
  sx: number,
  sz: number,
  pal: PartMaterialPalette,
): THREE.MeshStandardMaterial {
  const pcbTex = getPcbSilkscreenTexture({
    key: 'esp32_devkit_v2',
    solderMask: '#131926',
    traceColor: 'rgba(56,189,248,0.16)',
    title: 'ESP32',
    subtitle: 'DEVKIT V1',
    leftPins: ['3V3', 'GND', 'D35', 'D32', 'D33', 'D25', 'D26', 'D27', 'D14', 'D13'],
    rightPins: ['VIN', 'GND', 'D15', 'D2', 'D4', 'D12', 'D18', 'D19', 'D21', 'D22'],
  });

  const pcbSideMat = new THREE.MeshStandardMaterial({ color: 0x161c28, roughness: 0.45, metalness: 0.1 });
  const pcbTopMat = new THREE.MeshStandardMaterial({ map: pcbTex, roughness: 0.38, metalness: 0.12 });
  const pcb = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.18, sz), [
    pcbSideMat,
    pcbSideMat,
    pcbTopMat,
    pcbSideMat,
    pcbSideMat,
    pcbSideMat,
  ]);
  pcb.position.y = 0.18;
  pcb.castShadow = true;
  pcb.receiveShadow = true;
  group.add(pcb);

  // Dual continuous black 10-pin 2.54mm header rails
  for (const hx of [-1.22, 1.22]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 4.9), pal.matteBlack);
    rail.position.set(hx, 0.34, 0.0);
    group.add(rail);
  }

  // Inverted-F PCB Wi-Fi Antenna region at front nose
  const antSubstrate = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.19, 0.72), pal.matteBlack);
  antSubstrate.position.set(0, 0.19, -2.32);
  group.add(antSubstrate);
  const antBar = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.025, 0.12), pal.gold);
  antBar.position.set(0, 0.3, -2.56);
  group.add(antBar);
  for (let i = -3; i <= 3; i += 1) {
    const stub = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.44), pal.gold);
    stub.position.set(i * 0.23, 0.3, -2.33);
    group.add(stub);
  }

  // Stamped brushed-nickel ESP-WROOM-32 RF Shield with perimeter lip
  const shieldBase = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.06, 2.02), pal.darkMetal);
  shieldBase.position.set(0, 0.3, -0.95);
  group.add(shieldBase);
  const shield = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.32, 1.94), pal.nickel);
  shield.position.set(0, 0.48, -0.95);
  shield.castShadow = true;
  group.add(shield);
  const rfLbl = makeSilkscreenPlane('ESP-WROOM', '32 · WiFi+BT', 1.48, 1.05, '#cbd5e1', '#0f172a');
  rfLbl.position.set(0, 0.65, -0.95);
  group.add(rfLbl);

  // CP2102 QFN-28 USB-UART bridge + AMS1117 SOT-223 3.3V regulator with metal tab
  addGullWingIc(group, 0.02, 0.33, 1.15, 0.56, 0.11, 0.56, 6, pal, true);
  const regBody = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.15, 0.38), pal.matteBlack);
  regBody.position.set(-0.56, 0.34, 1.85);
  const regTab = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.16), pal.chrome);
  regTab.position.set(-0.56, 0.31, 1.62);
  group.add(regBody, regTab);
  for (const dx of [-0.22, 0, 0.22]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.14), pal.chrome);
    leg.position.set(-0.56 + dx, 0.3, 2.08);
    group.add(leg);
  }

  // 40 MHz silver quartz crystal + SMD resistor/capacitor array
  const xtal = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.22), pal.chrome);
  xtal.position.set(0.62, 0.32, 0.68);
  group.add(xtal);
  const smdPositions: Array<[number, number, boolean]> = [
    [-0.58, 0.65, true],
    [-0.58, 0.92, false],
    [-0.58, 1.18, true],
    [0.62, 1.05, false],
    [0.62, 1.38, true],
    [0.12, 1.78, false],
    [0.48, 1.78, true],
  ];
  for (const [sxPos, szPos, isCap] of smdPositions) {
    addSmdComponent(group, sxPos, 0.3, szPos, pal, isCap);
  }

  // Realistic Micro-USB shell with recessed dark port & internal contact tongue
  const usbShell = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.28, 0.62), pal.chrome);
  usbShell.position.set(0, 0.4, 2.54);
  usbShell.castShadow = true;
  const usbCavity = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.08), pal.matteBlack);
  usbCavity.position.set(0, 0.4, 2.83);
  const usbTongue = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.05, 0.2), pal.darkMetal);
  usbTongue.position.set(0, 0.41, 2.81);
  group.add(usbShell, usbCavity, usbTongue);

  // Tactile EN & BOOT buttons with stainless bezels
  for (const bx of [-0.66, 0.66]) {
    const swHousing = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.3), pal.matteBlack);
    swHousing.position.set(bx, 0.33, 2.34);
    const swBezel = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.28), pal.chrome);
    swBezel.position.set(bx, 0.4, 2.34);
    const swPlunger = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.1, 12), pal.matteBlack);
    swPlunger.position.set(bx, 0.45, 2.34);
    group.add(swHousing, swBezel, swPlunger);
  }

  // Red power LED + live GPIO2 blue status LED
  const pwrLed = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.09, 0.11),
    new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.75 }),
  );
  pwrLed.position.set(-0.56, 0.32, 1.45);
  group.add(pwrLed);

  const ledMaterial = new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    emissive: 0x2563eb,
    emissiveIntensity: 0.25,
  });
  const led2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.09, 0.11), ledMaterial);
  led2.position.set(0.56, 0.32, 1.56);
  group.add(led2);

  return ledMaterial;
}

/**
 * Builds an authentic 30.5x30.5mm dual-deck 45A 4-in-1 ESC + F7 Flight Controller Stack.
 */
export function buildDetailedFcStack(group: THREE.Group, sx: number, sz: number, pal: PartMaterialPalette): void {
  const escTex = getPcbSilkscreenTexture({
    key: 'esc_45a_v2',
    solderMask: '#111622',
    traceColor: 'rgba(250,204,21,0.14)',
    title: '45A 4-IN-1',
    subtitle: 'BLHELI_32',
    leftPins: ['M1', '', 'M3'],
    rightPins: ['M2', '', 'M4'],
  });
  const fcTex = getPcbSilkscreenTexture({
    key: 'fc_f7_v2',
    solderMask: '#121826',
    traceColor: 'rgba(56,189,248,0.16)',
    title: 'F722 FC1',
    subtitle: '5V BEC · OSD',
  });

  // Lower 45A ESC PCB
  const escSide = pal.matteBlack;
  const escBoard = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.18, sz), [
    escSide,
    escSide,
    new THREE.MeshStandardMaterial({ map: escTex, roughness: 0.38, metalness: 0.2 }),
    escSide,
    escSide,
    escSide,
  ]);
  escBoard.position.y = 0.22;
  escBoard.castShadow = true;
  group.add(escBoard);

  // 24 Power MOSFET chips (4 banks of 6) + gold motor solder pads
  for (const bx of [-1.22, 1.22]) {
    for (let r = 0; r < 6; r += 1) {
      const fet = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.28), pal.darkMetal);
      fet.position.set(bx, 0.35, -1.15 + r * 0.46);
      group.add(fet);
    }
    for (const pz of [-1.2, 1.2]) {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.04, 0.36), pal.gold);
      pad.position.set(bx * 1.22, 0.33, pz);
      group.add(pad);
    }
  }
  // Low-ESR filtering capacitor tucked on ESC rear pads
  const escCap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.72, 16), pal.matteBlack);
  escCap.rotation.x = Math.PI / 2;
  escCap.position.set(0, 0.36, 2.02);
  const escCapTop = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 14), pal.chrome);
  escCapTop.rotation.x = Math.PI / 2;
  escCapTop.position.set(0, 0.36, 2.39);
  group.add(escCap, escCapTop);

  // 4 Corner M3 stack screws + blue silicone vibration grommets + red locknuts
  for (const cx of [-1.45, 1.45]) {
    for (const cz of [-1.45, 1.45]) {
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.38, 10), pal.chrome);
      bolt.position.set(cx, 0.72, cz);
      const grommet1 = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.08, 8, 16), pal.siliconeBlue);
      grommet1.rotation.x = Math.PI / 2;
      grommet1.position.set(cx, 0.42, cz);
      const grommet2 = grommet1.clone();
      grommet2.position.set(cx, 0.88, cz);
      const locknut = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.16, 6), pal.redAnodized);
      locknut.position.set(cx, 1.32, cz);
      group.add(bolt, grommet1, grommet2, locknut);
    }
  }

  // 8-pin JST-SH inter-board ribbon harness connecting ESC -> FC
  const jstRibbon = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.58, 0.14), pal.matteBlack);
  jstRibbon.position.set(0, 0.65, -1.52);
  group.add(jstRibbon);

  // Upper F7 Flight Controller PCB
  const fcBoard = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.96, 0.16, sz * 0.96), [
    escSide,
    escSide,
    new THREE.MeshStandardMaterial({ map: fcTex, roughness: 0.36, metalness: 0.15 }),
    escSide,
    escSide,
    escSide,
  ]);
  fcBoard.position.y = 1.06;
  fcBoard.castShadow = true;
  group.add(fcBoard);

  // STM32F722 LQFP-64 MCU + ICM gyro + BMP280 metal barometer + USB-C shell
  addGullWingIc(group, 0, 1.2, -0.15, 0.92, 0.14, 0.92, 8, pal, true);
  const gyro = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.32), pal.darkMetal);
  gyro.position.set(-0.92, 1.18, -0.82);
  const baro = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.09, 0.24), pal.chrome);
  baro.position.set(0.92, 1.18, -0.82);
  const usbc = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.24, 0.78), pal.chrome);
  usbc.position.set(1.55, 1.24, 0.0);
  group.add(gyro, baro, usbc);

  const badge = makeSilkscreenPlane('5V', 'FC1 · F7', 1.28, 0.72, '#0f172a', '#f8fafc');
  badge.position.set(0, 1.15, 0.96);
  group.add(badge);
}

/**
 * Builds a high-detail True-X 5-inch carbon-fiber freestyle quadcopter frame with CNC lightening slots,
 * knurled red aluminum standoffs, aluminum FPV camera cage, anti-slip battery pad, and micro FPV camera.
 */
export function buildDetailedQuadFrame(group: THREE.Group, pal: PartMaterialPalette): void {
  const armLen = 25.0;
  for (const angle of [Math.PI / 4, -Math.PI / 4]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(armLen, 0.42, 1.72), pal.carbon);
    arm.position.y = 0.25;
    arm.rotation.y = angle;
    arm.castShadow = true;
    arm.receiveShadow = true;
    group.add(arm);

    // CNC recessed lightening slot trim along each arm
    for (const dir of [-1, 1]) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.44, 0.38), pal.matteBlack);
      const r = 6.4 * dir;
      slot.position.set(Math.cos(-angle) * r, 0.25, Math.sin(-angle) * r);
      slot.rotation.y = angle;
      group.add(slot);
    }
  }

  // Motor mounting pads with slotted protective rim & M3 screws
  const motorPads: Array<[number, number]> = [
    [-8.6, -8.6],
    [8.6, -8.6],
    [-8.6, 8.6],
    [8.6, 8.6],
  ];
  for (const [mx, mz] of motorPads) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.82, 0.44, 24), pal.carbon);
    pad.position.set(mx, 0.25, mz);
    pad.castShadow = true;
    group.add(pad);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.08, 8, 24), pal.darkMetal);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(mx, 0.48, mz);
    group.add(collar);
  }

  // Sculpted lower & upper carbon fuselage decks with rounded nose & tail
  const makeDeck = (w: number, l: number, thickness: number): THREE.Mesh => {
    const shape = new THREE.Shape();
    const hw = w / 2;
    const hl = l / 2;
    const ch = 0.65;
    shape.moveTo(-hw + ch, -hl);
    shape.lineTo(hw - ch, -hl);
    shape.lineTo(hw, -hl + ch);
    shape.lineTo(hw, hl - ch);
    shape.lineTo(hw - ch, hl);
    shape.lineTo(-hw + ch, hl);
    shape.lineTo(-hw, hl - ch);
    shape.lineTo(-hw, -hl + ch);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 2,
    });
    geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, pal.carbon);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  const bottomPlate = makeDeck(4.8, 12.8, 0.3);
  bottomPlate.position.set(0, 0.56, 0);
  group.add(bottomPlate);

  const topPlate = makeDeck(4.6, 12.2, 0.24);
  topPlate.position.set(0, 3.16, 0);
  group.add(topPlate);

  // Rubberized anti-slip battery grip pad on top plate
  const foamPad = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.08, 7.0),
    new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.96 }),
  );
  foamPad.position.set(0, 3.22, -0.3);
  group.add(foamPad);

  // 6 Knurled red anodized aluminum M3 hex standoffs
  const standoffPts: Array<[number, number]> = [
    [-1.85, -4.6],
    [1.85, -4.6],
    [-1.85, 4.6],
    [1.85, 4.6],
    [-1.85, -1.6],
    [1.85, -1.6],
  ];
  for (const [px, pz] of standoffPts) {
    addKnurledStandoff(group, px, 1.76, pz, 2.55, 0.24, pal.redAnodized, pal);
  }

  // Forward yellow nose direction chevron
  const noseArrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.58, 1.05, 3),
    new THREE.MeshBasicMaterial({ color: 0xfacc15 }),
  );
  noseArrow.rotation.x = -Math.PI / 2;
  noseArrow.position.set(0, 3.22, -4.95);
  group.add(noseArrow);

  // CNC aluminum FPV camera side plates + micro FPV camera with optical lens
  for (const cx of [-1.28, 1.28]) {
    const sidePlate = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.35, 2.1), pal.darkMetal);
    sidePlate.position.set(cx, 1.76, -5.2);
    sidePlate.castShadow = true;
    group.add(sidePlate);
    addM3Screw(group, cx * 1.05, 1.76, -5.2, pal);
  }
  const camBody = new THREE.Mesh(new THREE.BoxGeometry(1.92, 1.78, 1.55), pal.matteBlack);
  camBody.position.set(0, 1.72, -5.2);
  group.add(camBody);
  const lensBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.64, 0.9, 22), pal.darkMetal);
  lensBarrel.rotation.x = Math.PI / 2;
  lensBarrel.position.set(0, 1.72, -6.12);
  const focusRing = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.06, 8, 20), pal.redAnodized);
  focusRing.position.set(0, 1.72, -6.28);
  const glass = new THREE.Mesh(
    new THREE.SphereGeometry(0.44, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.42),
    new THREE.MeshStandardMaterial({ color: 0x1e40af, metalness: 0.92, roughness: 0.06 }),
  );
  glass.rotation.x = -Math.PI / 2;
  glass.position.set(0, 1.72, -6.34);
  group.add(lensBarrel, focusRing, glass);
}

/**
 * Builds an ultra-detailed 2207 1950KV FPV Brushless Motor with 12 individual copper stator windings,
 * vented machined rotor bell, 5-inch swept 3-blade propeller, and anodized blue M5 flanged locknut.
 */
export function buildDetailedBrushlessMotor(group: THREE.Group, pal: PartMaterialPalette): THREE.Group {
  // Lower spoked mounting flange + 4 M3 bolts
  const flange = new THREE.Mesh(new THREE.CylinderGeometry(1.34, 1.42, 0.34, 24), pal.darkMetal);
  flange.position.y = 0.18;
  flange.castShadow = true;
  group.add(flange);
  for (let i = 0; i < 4; i += 1) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    addM3Screw(group, Math.cos(a) * 0.95, 0.38, Math.sin(a) * 0.95, pal);
  }

  // 12 individual wound copper stator poles inside the bell!
  const statorCore = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.82, 16), pal.darkMetal);
  statorCore.position.y = 0.78;
  group.add(statorCore);
  for (let i = 0; i < 12; i += 1) {
    const a = (i * Math.PI * 2) / 12;
    const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.72, 10), pal.copper);
    coil.position.set(Math.cos(a) * 0.96, 0.78, Math.sin(a) * 0.96);
    group.add(coil);
  }

  // Open-windowed gunmetal rotor bell with machined bevel trims
  const bellLowerRim = new THREE.Mesh(new THREE.TorusGeometry(1.34, 0.1, 10, 28), pal.darkMetal);
  bellLowerRim.rotation.x = Math.PI / 2;
  bellLowerRim.position.y = 0.44;
  const bellUpperRim = new THREE.Mesh(new THREE.CylinderGeometry(1.36, 1.38, 0.44, 28), pal.darkMetal);
  bellUpperRim.position.y = 1.24;
  bellUpperRim.castShadow = true;
  const silverChamfer = new THREE.Mesh(new THREE.TorusGeometry(1.36, 0.06, 10, 28), pal.chrome);
  silverChamfer.rotation.x = Math.PI / 2;
  silverChamfer.position.y = 1.04;
  group.add(bellLowerRim, bellUpperRim, silverChamfer);

  // 6 Vertical bell ribs bridging top & bottom rings so copper coils gleam through gaps!
  for (let i = 0; i < 6; i += 1) {
    const a = (i * Math.PI * 2) / 6;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.68, 0.22), pal.darkMetal);
    rib.position.set(Math.cos(a) * 1.28, 0.78, Math.sin(a) * 1.28);
    rib.rotation.y = -a;
    group.add(rib);
  }

  // Spinning Rotor + Swept 3-Blade Prop + Knurled Blue M5 Locknut
  const rotor = new THREE.Group();
  rotor.position.y = 1.58;
  const propMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    transparent: true,
    opacity: 0.85,
    roughness: 0.24,
    metalness: 0.18,
    side: THREE.DoubleSide,
  });
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.72, 0.42, 20), propMat);
  rotor.add(hub);
  for (let i = 0; i < 3; i += 1) {
    const holder = new THREE.Group();
    holder.rotation.y = (i * Math.PI * 2) / 3;
    const blade = createPropellerBlade(5.65, propMat);
    blade.position.x = 0.44;
    holder.add(blade);
    rotor.add(holder);
  }
  const flangeWasher = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.08, 18), pal.blueAnodized);
  flangeWasher.position.y = 0.22;
  const hexNut = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.44, 0.34, 6), pal.blueAnodized);
  hexNut.position.y = 0.38;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.56, 12), pal.chrome);
  shaft.position.y = 0.42;
  rotor.add(flangeWasher, hexNut, shaft);

  group.add(rotor);
  return rotor;
}

/**
 * Builds a realistic 6S 1100mAh LiPo pack with cell seams, woven Velcro strap & buckle,
 * 7-pin JST-XH balance plug, and sculpted yellow XT60H connector housing.
 */
export function buildDetailedLipo6s(
  group: THREE.Group,
  sx: number,
  sy: number,
  sz: number,
  pal: PartMaterialPalette,
): void {
  const packMat = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.48, metalness: 0.12 });
  const pack = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), packMat);
  pack.position.y = sy / 2;
  pack.castShadow = true;
  pack.receiveShadow = true;
  group.add(pack);

  // Subtle 6-cell horizontal stack ribs + Kapton amber end-cap protection
  for (let i = 1; i <= 5; i += 1) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.03, 0.04, sz - 0.2), pal.matteBlack);
    seam.position.y = (i / 6) * sy;
    group.add(seam);
  }
  const endWrap = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.04, sy - 0.1, 0.35), pal.kapton);
  endWrap.position.set(0, sy / 2, sz / 2 - 0.16);
  group.add(endWrap);

  // Woven Velcro battery strap + brushed steel cinch buckle
  const strap = new THREE.Mesh(
    new THREE.BoxGeometry(sx + 0.24, sy + 0.18, 1.35),
    new THREE.MeshStandardMaterial({ color: 0x0f1218, roughness: 0.94 }),
  );
  strap.position.set(0, sy / 2, 0.15);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.8, 1.48), pal.chrome);
  buckle.position.set(sx / 2 + 0.15, sy * 0.56, 0.15);
  group.add(strap, buckle);

  const lbl = makeSilkscreenPlane('6S 1100mAh', '100C · 22.2V', 2.85, 3.6, '#181e29', '#f8fafc');
  lbl.position.set(0, sy + 0.02, -1.25);
  lbl.rotation.z = Math.PI / 2;
  group.add(lbl);

  // White 7-pin JST-XH balance plug tucked neatly on left flank
  const balPlug = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.38, 1.15),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 }),
  );
  balPlug.position.set(-sx / 2 - 0.22, 0.9, 2.0);
  group.add(balPlug);

  // Sculpted Yellow XT60H connector housing with brass bullet sockets
  const xtMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.32, metalness: 0.06 });
  const xtBody = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.82, 1.05), xtMat);
  xtBody.position.set(0, 1.1, sz / 2 + 0.45);
  xtBody.castShadow = true;
  const xtChamfer = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.05, 14), xtMat);
  xtChamfer.rotation.x = Math.PI / 2;
  xtChamfer.position.set(0.68, 1.1, sz / 2 + 0.45);
  group.add(xtBody, xtChamfer);
  for (const bx of [-0.36, 0.36]) {
    const bullet = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.3, 12), pal.gold);
    bullet.rotation.x = Math.PI / 2;
    bullet.position.set(bx, 1.1, sz / 2 + 0.95);
    group.add(bullet);
  }
}

/**
 * Builds a realistic 3D-printed TPU tail mount + circularly-polarized 5.8GHz FPV VTX antenna.
 */
export function buildDetailedVtxAntenna(group: THREE.Group, pal: PartMaterialPalette): void {
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.92, 1.85), pal.tpuOrange);
  base.position.y = 0.46;
  base.castShadow = true;
  group.add(base);
  for (const sx of [-0.7, 0.7]) {
    const tab = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.96, 12), pal.tpuOrange);
    tab.position.set(sx, 0.48, -0.72);
    group.add(tab);
  }
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.66, 1.35, 16), pal.tpuOrange);
  collar.position.y = 1.44;
  const smaHex = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.56, 6), pal.gold);
  smaHex.position.y = 2.3;
  const smaThread = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.36, 14), pal.gold);
  smaThread.position.y = 2.72;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 2.35, 14), pal.matteBlack);
  stem.position.y = 3.92;
  const radome = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.4, 1.38, 20), pal.matteBlack);
  radome.position.y = 5.48;
  radome.castShadow = true;
  const topCap = new THREE.Mesh(new THREE.SphereGeometry(0.68, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), pal.darkMetal);
  topCap.position.y = 6.12;
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.05, 8, 20), pal.tpuOrange);
  stripe.rotation.x = Math.PI / 2;
  stripe.position.y = 5.6;
  group.add(collar, smaHex, smaThread, stem, radome, topCap, stripe);
}

/**
 * Builds a sculpted CNC-milled 2WD Carbon Rover Chassis plate with wheel-well cutouts,
 * lightening slots, knurled red standoffs, aluminum motor L-brackets, and rear steel ball caster.
 */
export function buildDetailedChassis2wd(
  group: THREE.Group,
  sx: number,
  sy: number,
  sz: number,
  pal: PartMaterialPalette,
): void {
  const hw = sx / 2;
  const hl = sz / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-hw + 1.4, -hl);
  shape.lineTo(hw - 1.4, -hl);
  shape.lineTo(hw, -hl + 1.8);
  // Right wheel-well recess
  shape.lineTo(hw, -1.6);
  shape.lineTo(hw - 0.65, -1.1);
  shape.lineTo(hw - 0.65, 4.1);
  shape.lineTo(hw, 4.6);
  shape.lineTo(hw, hl - 1.4);
  shape.lineTo(hw - 1.4, hl);
  shape.lineTo(-hw + 1.4, hl);
  shape.lineTo(-hw, hl - 1.4);
  // Left wheel-well recess
  shape.lineTo(-hw, 4.6);
  shape.lineTo(-hw + 0.65, 4.1);
  shape.lineTo(-hw + 0.65, -1.1);
  shape.lineTo(-hw, -1.6);
  shape.lineTo(-hw, -hl + 1.8);
  shape.closePath();

  const deckGeo = new THREE.ExtrudeGeometry(shape, {
    depth: sy,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
  deckGeo.rotateX(Math.PI / 2);
  const deck = new THREE.Mesh(deckGeo, pal.carbon);
  deck.position.y = sy;
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);

  // CNC wiring pass-through slots along centerline
  for (const cz of [-6.8, -2.5, 2.8]) {
    const slot = new THREE.Mesh(new THREE.BoxGeometry(2.6, sy + 0.06, 0.45), pal.matteBlack);
    slot.position.set(0, sy * 0.52, cz);
    group.add(slot);
  }

  // 4 Knurled red anodized corner hex standoffs + M3 screws
  const cornerPosts: Array<[number, number]> = [
    [-5.8, -8.1],
    [5.8, -8.1],
    [-5.8, 8.1],
    [5.8, 8.1],
  ];
  for (const [cx, cz] of cornerPosts) {
    addKnurledStandoff(group, cx, 0.72, cz, 0.9, 0.28, pal.redAnodized, pal);
  }

  // Side aluminum motor mounting L-brackets
  for (const side of [-1, 1]) {
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 2.2), pal.nickel);
    bracket.position.set(side * (hw - 0.8), 0.62, 1.35);
    group.add(bracket);
    addM3Screw(group, side * (hw - 1.15), 0.48, 0.8, pal);
    addM3Screw(group, side * (hw - 1.15), 0.48, 1.9, pal);
  }

  // Rear stainless swivel ball caster assembly tucked at rear edge
  const casterHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.56, 0.4, 18), pal.nickel);
  casterHousing.position.set(0, 0.28, hl - 1.25);
  const casterBall = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 16), pal.chrome);
  casterBall.position.set(0, 0.14, hl - 1.25);
  group.add(casterHousing, casterBall);

  // Subtle yellow forward nose indicator
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.65, 1.25, 3),
    new THREE.MeshBasicMaterial({ color: 0xfacc15 }),
  );
  arrow.rotation.x = -Math.PI / 2;
  arrow.position.set(0, sy + 0.05, -hl + 1.0);
  group.add(arrow);
}

/**
 * Builds a high-detail Yellow TT DC Gearmotor with ribbed casing, brushed 130 motor barrel,
 * brass terminals + ceramic capacitor, sculpted 5-spoke yellow rim, and 18-block knobby rubber tire.
 */
export function buildDetailedTtMotor(instance: ComponentInstance, group: THREE.Group, pal: PartMaterialPalette): THREE.Group {
  const gearMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.36, metalness: 0.06 });
  const gear = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.85, 4.55), gearMat);
  gear.position.set(0, 1.12, 0.35);
  gear.castShadow = true;
  group.add(gear);

  // Molded side gearbox ribs, screw bosses, and rear axle shaft boss
  for (const rz of [-1.2, 0.1, 1.45]) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(2.04, 1.92, 0.16), gearMat);
    rib.position.set(0, 1.12, rz);
    group.add(rib);
  }
  const axleBoss = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 2.42, 16), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 }));
  axleBoss.rotation.z = Math.PI / 2;
  axleBoss.position.set(0, 1.56, 1.2);
  group.add(axleBoss);

  // Brushed stainless 130 DC motor can + vents + matte endbell
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.84, 0.84, 1.95, 22), pal.nickel);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 1.12, -2.55);
  barrel.castShadow = true;
  group.add(barrel);

  const endbell = new THREE.Mesh(new THREE.CylinderGeometry(0.83, 0.83, 0.4, 22), pal.matteBlack);
  endbell.rotation.x = Math.PI / 2;
  endbell.position.set(0, 1.12, -3.58);
  group.add(endbell);

  // Brass motor terminals + orange disc suppression capacitor
  for (const tx of [-0.52, 0.52]) {
    const tab = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.45, 0.08), pal.gold);
    tab.position.set(tx, 1.05, 2.32);
    group.add(tab);
  }
  const discCap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 12), pal.tpuOrange);
  discCap.rotation.x = Math.PI / 2;
  discCap.position.set(0, 1.12, -3.84);
  group.add(discCap);

  // Detailed multi-spoke wheel + 18 deep knobby rubber tread blocks
  const wheelGroup = new THREE.Group();
  const sideOffset = instance.side === 'left' ? -1.48 : 1.48;
  wheelGroup.position.set(sideOffset, 1.56, 1.2);
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x16181e, roughness: 0.88, metalness: 0.04 });

  const tire = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.94, 28), rubberMat);
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  wheelGroup.add(tire);

  // Chamfered tire sidewalls
  for (const sx of [-0.46, 0.46]) {
    const sidewall = new THREE.Mesh(new THREE.TorusGeometry(1.26, 0.12, 8, 26), rubberMat);
    sidewall.rotation.y = Math.PI / 2;
    sidewall.position.x = sx;
    wheelGroup.add(sidewall);
  }

  for (let i = 0; i < 18; i += 1) {
    const ang = (i * Math.PI * 2) / 18;
    const lug = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.24), rubberMat);
    const staggerX = i % 2 === 0 ? -0.21 : 0.21;
    lug.position.set(staggerX, Math.sin(ang) * 1.54, Math.cos(ang) * 1.54);
    lug.rotation.x = -ang;
    wheelGroup.add(lug);
  }

  const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.06, 1.06, 0.88, 22), gearMat);
  rim.rotation.z = Math.PI / 2;
  wheelGroup.add(rim);
  const innerDish = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.92, 20), pal.darkMetal);
  innerDish.rotation.z = Math.PI / 2;
  wheelGroup.add(innerDish);
  for (let s = 0; s < 5; s += 1) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.97, 1.0, 0.22), gearMat);
    const a = (s * Math.PI * 2) / 5;
    spoke.position.set(0, Math.sin(a) * 0.46, Math.cos(a) * 0.46);
    spoke.rotation.x = -a + Math.PI / 2;
    wheelGroup.add(spoke);
  }
  const hubCap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.0, 14), pal.chrome);
  hubCap.rotation.z = Math.PI / 2;
  wheelGroup.add(hubCap);

  group.add(wheelGroup);
  return wheelGroup;
}

/**
 * Builds detailed modules & passive components (DRV8833, MPU6050, OLED, HC-SR04, LM2596,
 * 2S 18650 Pack, ESP32-CAM, Tactile Button, Resistor, LED, Electrolytic Cap, CAD Shapes).
 */
export function buildDetailedSecondaryPart(
  instance: ComponentInstance,
  group: THREE.Group,
  sx: number,
  sy: number,
  sz: number,
  pal: PartMaterialPalette,
): {
  ledMaterial: THREE.MeshStandardMaterial | null;
  oledCanvas: HTMLCanvasElement | null;
  oledTexture: THREE.CanvasTexture | null;
  buttonCap: THREE.Mesh | null;
} {
  let ledMaterial: THREE.MeshStandardMaterial | null = null;
  let oledCanvas: HTMLCanvasElement | null = null;
  let oledTexture: THREE.CanvasTexture | null = null;
  let buttonCap: THREE.Mesh | null = null;

  switch (instance.kind) {
    case 'drv8833': {
      const tex = getPcbSilkscreenTexture({
        key: 'drv8833_v2',
        solderMask: '#581c87',
        traceColor: 'rgba(216,180,254,0.2)',
        title: 'DRV8833',
        subtitle: '1.5A H-BR',
        leftPins: ['VM', 'GND', 'IN1', 'IN2', 'IN3', 'IN4'],
        rightPins: ['OUT1', 'OUT2', 'OUT3', 'OUT4'],
      });
      const sideMat = new THREE.MeshStandardMaterial({ color: 0x581c87, roughness: 0.4 });
      const pcb = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.2, sz), [
        sideMat,
        sideMat,
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.38, metalness: 0.12 }),
        sideMat,
        sideMat,
        sideMat,
      ]);
      pcb.position.y = 0.19;
      pcb.castShadow = true;
      group.add(pcb);
      addGullWingIc(group, 0, 0.35, 0.12, 0.76, 0.14, 0.98, 8, pal, false);
      addSmdComponent(group, 0, 0.32, -0.78, pal, true);
      addSmdComponent(group, -0.42, 0.32, -0.78, pal, false);
      addSmdComponent(group, 0.42, 0.32, -0.78, pal, false);
      addSmdComponent(group, 0, 0.32, 0.92, pal, true);
      break;
    }

    case 'mpu6050': {
      const tex = getPcbSilkscreenTexture({
        key: 'mpu6050_v2',
        solderMask: '#1d4ed8',
        traceColor: 'rgba(147,197,253,0.22)',
        title: 'GY-521',
        subtitle: 'MPU6050',
        bottomPins: ['VCC', 'GND', 'SCL', 'SDA', 'AD0'],
        showAxes: true,
      });
      const sideMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.38 });
      const pcb = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.18, sz), [
        sideMat,
        sideMat,
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.36, metalness: 0.14 }),
        sideMat,
        sideMat,
        sideMat,
      ]);
      pcb.position.y = 0.18;
      pcb.castShadow = true;
      group.add(pcb);
      addGullWingIc(group, 0, 0.31, -0.08, 0.46, 0.1, 0.46, 6, pal, true);
      addSmdComponent(group, -0.58, 0.3, -0.1, pal, false);
      addSmdComponent(group, 0.58, 0.3, -0.1, pal, true);
      addSmdComponent(group, 0.58, 0.3, 0.22, pal, true);
      const pwrLed = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.08, 0.1),
        new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 0.7 }),
      );
      pwrLed.position.set(-0.62, 0.31, 0.24);
      group.add(pwrLed);
      break;
    }

    case 'oled_ssd1306': {
      const tex = getPcbSilkscreenTexture({
        key: 'oled_ssd1306_v2',
        solderMask: '#1e3a8a',
        traceColor: 'rgba(147,197,253,0.18)',
        title: 'SSD1306',
        topPins: ['GND', 'VCC', 'SCL', 'SDA'],
      });
      const sideMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.4 });
      const pcb = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.2, sz), [
        sideMat,
        sideMat,
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.38, metalness: 0.12 }),
        sideMat,
        sideMat,
        sideMat,
      ]);
      pcb.position.y = 0.19;
      pcb.castShadow = true;
      group.add(pcb);

      const bezel = new THREE.Mesh(new THREE.BoxGeometry(2.52, 0.18, 1.76), pal.matteBlack);
      bezel.position.set(0, 0.38, 0.24);
      group.add(bezel);
      // Copper flex ribbon folding from OLED glass under PCB
      const flexRibbon = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.05, 0.38), pal.kapton);
      flexRibbon.position.set(0, 0.33, 1.18);
      group.add(flexRibbon);

      oledCanvas = document.createElement('canvas');
      oledCanvas.width = 256;
      oledCanvas.height = 128;
      paintOledCanvas(oledCanvas, [], true);
      oledTexture = new THREE.CanvasTexture(oledCanvas);
      oledTexture.anisotropy = 4;

      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(2.3, 1.34),
        new THREE.MeshBasicMaterial({ map: oledTexture }),
      );
      screen.rotation.x = -Math.PI / 2;
      screen.position.set(0, 0.48, 0.24);
      group.add(screen);
      break;
    }

    case 'hcsr04': {
      const pcbMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.36, metalness: 0.12 });
      const pcb = new THREE.Mesh(new THREE.BoxGeometry(sx, 1.82, 0.2), pcbMat);
      pcb.position.set(0, 1.02, 0);
      pcb.castShadow = true;
      group.add(pcb);

      // 4.000 MHz silver oval HC-49S crystal oscillator on top front
      const xtal = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.32, 0.26), pal.chrome);
      xtal.position.set(0, 1.66, -0.2);
      group.add(xtal);

      // Rear electronics (3 SOIC-16 ICs + SMD array visible from behind!)
      for (const ix of [-1.25, 0, 1.25]) {
        const ic = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.44, 0.14), pal.matteBlack);
        ic.position.set(ix, 1.04, 0.15);
        group.add(ic);
      }

      // Dual machined brushed-aluminum transducer barrels with realistic perforated acoustic mesh!
      const meshTex = getAcousticMeshTexture();
      const meshFaceMat = new THREE.MeshStandardMaterial({ map: meshTex, metalness: 0.55, roughness: 0.35 });
      for (const x of [-1.26, 1.26]) {
        const can = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.04, 26), pal.nickel);
        can.rotation.x = Math.PI / 2;
        can.position.set(x, 1.02, -0.58);
        can.castShadow = true;
        group.add(can);

        const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.06, 8, 24), pal.chrome);
        bezel.position.set(x, 1.02, -1.09);
        group.add(bezel);

        const face = new THREE.Mesh(new THREE.CircleGeometry(0.66, 22), meshFaceMat);
        face.rotation.y = Math.PI;
        face.position.set(x, 1.02, -1.11);
        group.add(face);
      }
      break;
    }

    case 'battery_2s': {
      // Molded matte-black dual-cell sled with center divider + nickel coil springs!
      const baseFloor = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.24, sz), pal.matteBlack);
      baseFloor.position.y = 0.12;
      baseFloor.castShadow = true;
      group.add(baseFloor);

      for (const wx of [-sx / 2 + 0.12, 0, sx / 2 - 0.12]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.28, sz), pal.matteBlack);
        wall.position.set(wx, 0.68, 0);
        wall.castShadow = true;
        group.add(wall);
      }
      for (const wz of [-sz / 2 + 0.14, sz / 2 - 0.14]) {
        const endWall = new THREE.Mesh(new THREE.BoxGeometry(sx, 1.48, 0.24), pal.matteBlack);
        endWall.position.set(0, 0.76, wz);
        group.add(endWall);
      }

      const cellMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.24, metalness: 0.22 });
      const whiteRingMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 });
      for (const x of [-0.92, 0.92]) {
        const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.84, 0.84, 6.0, 24), cellMat);
        cell.rotation.x = Math.PI / 2;
        cell.position.set(x, 1.08, 0);
        cell.castShadow = true;
        group.add(cell);

        // Positive insulating white PVC ring + grooved nickel button cap
        const pvcRing = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.76, 0.12, 20), whiteRingMat);
        pvcRing.rotation.x = Math.PI / 2;
        pvcRing.position.set(x, 1.08, -3.02);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.18, 16), pal.chrome);
        cap.rotation.x = Math.PI / 2;
        cap.position.set(x, 1.08, -3.12);
        group.add(pvcRing, cap);

        // Negative terminal helical spring coils
        for (let c = 0; c < 3; c += 1) {
          const coil = new THREE.Mesh(new THREE.TorusGeometry(0.32 - c * 0.07, 0.045, 6, 14), pal.chrome);
          coil.position.set(x, 1.08, 3.04 + c * 0.09);
          group.add(coil);
        }
      }
      const lbl = makeSilkscreenPlane('2S 18650', '7.4V · 2200mAh', 2.9, 1.6, '#0c4a6e', '#f8fafc');
      lbl.position.set(0, 1.94, 0);
      group.add(lbl);
      break;
    }

    case 'lm2596_buck': {
      const tex = getPcbSilkscreenTexture({
        key: 'lm2596_v2',
        solderMask: '#1d4ed8',
        traceColor: 'rgba(147,197,253,0.2)',
        title: 'LM2596S',
        subtitle: 'IN → OUT 5.2V',
        leftPins: ['IN+', 'IN-'],
        rightPins: ['OUT+', 'OUT-'],
      });
      const sideMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.38 });
      const pcb = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.2, sz), [
        sideMat,
        sideMat,
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.38, metalness: 0.14 }),
        sideMat,
        sideMat,
        sideMat,
      ]);
      pcb.position.y = 0.19;
      pcb.castShadow = true;
      group.add(pcb);

      // TO-263-5 LM2596S regulator with silver heatsink tab & 5 leads
      const icBody = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.34, 0.72), pal.matteBlack);
      icBody.position.set(-0.35, 0.44, -0.45);
      const icTab = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.12, 0.24), pal.chrome);
      icTab.position.set(-0.35, 0.36, -0.88);
      group.add(icBody, icTab);

      // Large shielded wire-wound "330" power inductor
      const indBase = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.78, 1.18), pal.darkMetal);
      indBase.position.set(0.45, 0.68, 0.28);
      indBase.castShadow = true;
      const indCore = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.82, 18), pal.matteBlack);
      indCore.position.set(0.45, 0.69, 0.28);
      const indLbl = makeSilkscreenPlane('330', '', 0.72, 0.55, '#1e293b', '#e2e8f0');
      indLbl.position.set(0.45, 1.11, 0.28);
      group.add(indBase, indCore, indLbl);

      // Dual scored aluminum SMD electrolytic cans
      for (const cx of [-1.34, 1.38]) {
        const capBase = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.12, 0.76), pal.matteBlack);
        capBase.position.set(cx, 0.34, 0.35);
        const capCan = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.74, 20), pal.chrome);
        capCan.position.set(cx, 0.72, 0.35);
        capCan.castShadow = true;
        const capMark = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.55), pal.matteBlack);
        capMark.position.set(cx - 0.18, 1.1, 0.35);
        group.add(capBase, capCan, capMark);
      }

      // Blue Bourns 3296W multi-turn trimpot + slotted brass screw
      const pot = new THREE.Mesh(
        new THREE.BoxGeometry(0.68, 0.82, 0.46),
        new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.3 }),
      );
      pot.position.set(-1.12, 0.7, -0.58);
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.16, 12), pal.gold);
      screw.position.set(-1.12, 1.16, -0.58);
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.04), pal.darkMetal);
      slot.position.set(-1.12, 1.24, -0.58);
      group.add(pot, screw, slot);

      // SS34 Schottky diode with cathode stripe
      const diode = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.22, 0.36), pal.matteBlack);
      diode.position.set(0.48, 0.38, -0.68);
      const dStripe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.23, 0.37), pal.chrome);
      dStripe.position.set(0.68, 0.38, -0.68);
      group.add(diode, dStripe);
      break;
    }

    case 'esp32_cam': {
      const pcb = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.2, sz), pal.matteBlack);
      pcb.position.y = 0.19;
      pcb.castShadow = true;
      group.add(pcb);

      // Stamped micro-SD metallic cage with card slot notch
      const sdCage = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.24, 1.48), pal.chrome);
      sdCage.position.set(0, 0.4, 1.05);
      const sdSlot = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.12, 0.14), pal.matteBlack);
      sdSlot.position.set(0, 0.4, 1.76);
      group.add(sdCage, sdSlot);

      // ZIF latch + orange Kapton FPC camera ribbon
      const zif = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.16, 0.28), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 }));
      zif.position.set(0, 0.36, 0.18);
      const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.05, 0.85), pal.kapton);
      ribbon.position.set(0, 0.34, -0.22);
      group.add(zif, ribbon);

      // Machined stepped anodized camera barrel + knurled focus ring + sapphire glass
      const camBase = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.22, 1.18), pal.darkMetal);
      camBase.position.set(0, 0.38, -0.92);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.62, 0.65, 22), pal.darkMetal);
      barrel.position.set(0, 0.72, -0.92);
      barrel.castShadow = true;
      const focusRing = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 8, 22), pal.chrome);
      focusRing.rotation.x = Math.PI / 2;
      focusRing.position.set(0, 0.96, -0.92);
      const glass = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.32, 0.08, 20),
        new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.94, roughness: 0.06 }),
      );
      glass.position.set(0, 1.04, -0.92);
      group.add(camBase, barrel, focusRing, glass);

      // 5050 High-power phosphor flash LED inside silver reflector cup
      const flashFrame = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.46), pal.chrome);
      flashFrame.position.set(0.85, 0.35, -1.35);
      const flashDome = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.18, 0.12, 16),
        new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfde047, emissiveIntensity: 0.4 }),
      );
      flashDome.position.set(0.85, 0.43, -1.35);
      group.add(flashFrame, flashDome);
      break;
    }

    case 'tactile_button': {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.38, 0.95), pal.matteBlack);
      base.position.y = 0.23;
      base.castShadow = true;
      group.add(base);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.08, 0.98), pal.chrome);
      plate.position.y = 0.44;
      group.add(plate);
      // 4 black heat-staked corner rivets + 4 gull-wing silver leads
      for (const rx of [-0.36, 0.36]) {
        for (const rz of [-0.36, 0.36]) {
          const rivet = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 10), pal.matteBlack);
          rivet.position.set(rx, 0.47, rz);
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.22), pal.chrome);
          leg.position.set(rx * 1.32, 0.08, rz * 1.12);
          group.add(rivet, leg);
        }
      }
      buttonCap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.34, 0.38, 18),
        new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.38 }),
      );
      buttonCap.position.y = 0.68;
      buttonCap.userData = { pickType: 'button', componentId: instance.id };
      group.add(buttonCap);
      break;
    }

    case 'resistor_10k': {
      // Lathe-turned realistic peanut/hourglass ceramic resistor body
      const pts = [
        new THREE.Vector2(0.06, -0.62),
        new THREE.Vector2(0.24, -0.58),
        new THREE.Vector2(0.27, -0.44),
        new THREE.Vector2(0.22, -0.22),
        new THREE.Vector2(0.22, 0.22),
        new THREE.Vector2(0.27, 0.44),
        new THREE.Vector2(0.24, 0.58),
        new THREE.Vector2(0.06, 0.62),
      ];
      const bodyGeo = new THREE.LatheGeometry(pts, 20);
      bodyGeo.rotateZ(-Math.PI / 2);
      const body = new THREE.Mesh(
        bodyGeo,
        new THREE.MeshStandardMaterial({ color: 0xd9ad7c, roughness: 0.38, metalness: 0.06 }),
      );
      body.position.y = 0.42;
      body.castShadow = true;
      group.add(body);

      // 4 crisp resistor color code bands (Brown-Black-Orange-Gold = 10k 5%)
      [0x78350f, 0x09090b, 0xea580c, 0xd97706].forEach((c, i) => {
        const radius = i === 0 || i === 3 ? 0.258 : 0.228;
        const band = new THREE.Mesh(
          new THREE.CylinderGeometry(radius, radius, 0.095, 18),
          new THREE.MeshStandardMaterial({ color: c, roughness: 0.35 }),
        );
        band.rotation.z = Math.PI / 2;
        band.position.set(-0.36 + i * 0.24, 0.42, 0);
        group.add(band);
      });

      // Formed axial tinned-copper wire leads bending neatly down to the bench
      const hLead = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 2.1, 10), pal.chrome);
      hLead.rotation.z = Math.PI / 2;
      hLead.position.y = 0.42;
      group.add(hLead);
      for (const lx of [-1.05, 1.05]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.42, 10), pal.chrome);
        leg.position.set(lx, 0.21, 0);
        group.add(leg);
      }
      break;
    }

    case 'led_5mm': {
      const baseColor = new THREE.Color(instance.color ?? '#22c55e');
      ledMaterial = new THREE.MeshStandardMaterial({
        color: baseColor,
        emissive: baseColor,
        emissiveIntensity: 0.2,
        transparent: true,
        opacity: 0.72,
        roughness: 0.08,
        metalness: 0.1,
      });
      const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 22), ledMaterial);
      flange.position.y = 0.52;
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.43, 0.62, 22), ledMaterial);
      cyl.position.y = 0.88;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.42, 22, 16), ledMaterial);
      dome.position.y = 1.19;
      group.add(flange, cyl, dome);

      // Visible internal silver reflector cup (cathode anvil) & anode post inside transparent lens!
      const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 0.08), pal.chrome);
      anvil.position.set(0.14, 0.86, 0);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.08), pal.chrome);
      post.position.set(-0.16, 0.84, 0);
      group.add(anvil, post);
      for (const lx of [-0.3, 0.3]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.52, 8), pal.chrome);
        leg.position.set(lx, 0.26, 0);
        group.add(leg);
      }
      break;
    }

    case 'cap_1000uf': {
      // Radial aluminum electrolytic capacitor with crimped bottom neck & scored pressure-vent top
      const can = new THREE.Mesh(
        new THREE.CylinderGeometry(0.56, 0.56, 1.66, 24),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.26, metalness: 0.22 }),
      );
      can.position.y = 1.12;
      can.castShadow = true;
      const crimp = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.045, 8, 22), pal.darkMetal);
      crimp.rotation.x = Math.PI / 2;
      crimp.position.y = 0.36;
      const topDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.53, 0.53, 0.06, 22), pal.chrome);
      topDisc.position.y = 1.97;
      // Stamped Y/K score lines on aluminum vent top
      for (const ang of [0, Math.PI / 3, -Math.PI / 3]) {
        const score = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 0.04), pal.darkMetal);
        score.position.y = 2.005;
        score.rotation.y = ang;
        group.add(score);
      }
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 1.56, 0.14),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4 }),
      );
      stripe.position.set(0.51, 1.12, 0);
      group.add(can, crimp, topDisc, stripe);
      for (const lx of [-0.35, 0.35]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.36, 8), pal.chrome);
        leg.position.set(lx, 0.18, 0);
        group.add(leg);
      }
      break;
    }

    case 'cad_box': {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(sx, sy, sz),
        new THREE.MeshStandardMaterial({ color: instance.color ?? '#64748b', roughness: 0.45, metalness: 0.18 }),
      );
      box.position.y = sy / 2;
      box.castShadow = true;
      box.receiveShadow = true;
      group.add(box);
      break;
    }

    case 'cad_cylinder': {
      const cyl = new THREE.Mesh(
        new THREE.CylinderGeometry(sx / 2, sx / 2, sy, 28),
        new THREE.MeshStandardMaterial({ color: instance.color ?? '#94a3b8', roughness: 0.35, metalness: 0.42 }),
      );
      cyl.position.y = sy / 2;
      cyl.castShadow = true;
      cyl.receiveShadow = true;
      group.add(cyl);
      break;
    }

    case 'cad_standoff': {
      addKnurledStandoff(group, 0, sy / 2, 0, sy, sx / 2, pal.redAnodized, pal);
      break;
    }

    case 'cad_plate': {
      const pl = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), pal.carbon);
      pl.position.y = sy / 2;
      pl.castShadow = true;
      pl.receiveShadow = true;
      group.add(pl);
      for (const cx of [-sx * 0.4, sx * 0.4]) {
        for (const cz of [-sz * 0.4, sz * 0.4]) {
          addM3Screw(group, cx, sy + 0.05, cz, pal);
        }
      }
      break;
    }
    default:
      break;
  }

  return { ledMaterial, oledCanvas, oledTexture, buttonCap };
}
