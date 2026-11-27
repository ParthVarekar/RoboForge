import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { labelTexture } from './boardArt';
import { decal, markingTop, mesh, pin1Dot, placed, rbox, type IcOptions, type Place } from './packages';
import { PBR, ledEmitter, markShared, plastic } from './pbr';
import { MM } from './pcb';

/**
 * Through-hole packages, connectors and modules' big parts at their datasheet sizes, in the style of packages.ts:
 * `at` is the point on the board top under the part's centre (cm), `rot` turns it about the vertical axis, and the
 * numbers below are millimetres. Sources are listed in docs/06_COMPONENT_REFERENCES.md.
 */

/* ------------------------------------------------------------------ DIP */

/**
 * DIP-n (300 mil): 6.35 mm moulded body seated 0.5 mm above the board, leads on a 7.62 mm row spacing at 2.54 mm,
 * shoulders bent down through the board, a half-moon notch and a dot at pin 1. `socket` adds the black turned-pin
 * socket under it (as on the Arduino Uno).
 */
export function dip(g: THREE.Group, p: IcOptions & { pins: number; socket?: boolean }): void {
  const sub = placed(g, p);
  const per = p.pins / 2;
  const len = per * 2.54 + 0.9;
  const lift = p.socket ? 3.2 : 0.5;
  if (p.socket) {
    sub.add(mesh(rbox(10.1, 3.0, len + 1.2, 0.3), PBR.headerPlastic(), 0, 1.5 * MM, 0));
    sub.add(mesh(new THREE.BoxGeometry(4.0 * MM, 0.2 * MM, (len - 2) * MM), plastic(0x0b0b0c, 0.7), 0, 3.05 * MM, 0, false));
  }
  const h = 3.3;
  const yBody = lift + h / 2;
  sub.add(mesh(rbox(6.35, h, len, 0.35), PBR.icEpoxy(), 0, yBody * MM, 0));
  const shoulder = new THREE.BoxGeometry(0.75 * MM, 0.25 * MM, 1.5 * MM);
  const leg = new THREE.BoxGeometry(0.25 * MM, (lift + 1.6) * MM, 0.5 * MM);
  const geos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < per; i += 1) {
    const z = (i - (per - 1) / 2) * 2.54;
    for (const sx of [-1, 1]) {
      const s = shoulder.clone();
      s.translate(sx * 3.5 * MM, (lift + 1.0) * MM, z * MM);
      geos.push(s);
      const l = leg.clone();
      l.translate(sx * 3.81 * MM, ((lift + 1.0) / 2 - 0.3) * MM, z * MM);
      geos.push(l);
    }
  }
  sub.add(mesh(mergeGeometries(geos), PBR.tin(), 0, 0, 0, false));
  geos.forEach((x) => x.dispose());
  shoulder.dispose();
  leg.dispose();
  const top = (lift + h) * MM;
  const notch = new THREE.Mesh(new THREE.CircleGeometry(0.9 * MM, 20, 0, Math.PI), plastic(0x0d0d0e, 0.4));
  notch.rotation.x = -Math.PI / 2;
  notch.position.set(0, top + 0.001, (-len / 2) * MM);
  sub.add(notch);
  sub.add(pin1Dot(-2.0, -len / 2 + 1.6, top, 0.4));
  if (p.marking) sub.add(markingTop(p.marking, 6.35, len, top));
}

/* ------------------------------------------------------------------ TO-92, TO-220 */

/**
 * TO-92 (4.8 mm, flat face toward -z before rotation) standing on its three legs (1.27 mm pitch). `legMm` is the
 * lead length showing below the body.
 */
export function to92(g: THREE.Group, p: Place & { marking?: string; legMm?: number }): void {
  const sub = placed(g, p);
  const leg = p.legMm ?? 3;
  const h = 4.6;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, 2.4, -0.25 * Math.PI, 1.25 * Math.PI, false);
  shape.closePath();
  const body = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.15, curveSegments: 24 });
  body.scale(MM, MM, MM);
  body.rotateX(-Math.PI / 2);
  body.rotateY(Math.PI);
  sub.add(mesh(body, PBR.icEpoxy(), 0, leg * MM, -0.2 * MM));
  for (let i = -1; i <= 1; i += 1) sub.add(mesh(new THREE.BoxGeometry(0.45 * MM, (leg + 0.4) * MM, 0.45 * MM), PBR.tin(), i * 1.27 * MM, ((leg - 0.4) / 2) * MM, 0.1 * MM, false));
  if (p.marking) {
    const tex = labelTexture([p.marking], { wPx: 256, hPx: 128, color: 'rgba(200,203,208,0.85)' });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(3.4 * MM, 2.0 * MM), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false }));
    face.rotation.y = Math.PI;
    // on the flat face: chord at 1.7 mm, plus the 0.15 mm bevel, plus the body's 0.2 mm offset
    face.position.set(0, (leg + h * 0.55) * MM, -2.07 * MM);
    sub.add(face);
  }
}

/**
 * TO-220 standing upright: 10.16 x 9.0 x 4.5 mm moulded body, the 1.27 mm tinned tab above it with its 3.6 mm hole,
 * three legs at 2.54 mm. The marked face looks toward -z before rotation.
 */
export function to220(g: THREE.Group, p: Place & { marking?: readonly string[]; legMm?: number }): void {
  const sub = placed(g, p);
  const leg = p.legMm ?? 3.5;
  sub.add(mesh(rbox(10.16, 9.0, 4.5, 0.3), PBR.icEpoxy(), 0, (leg + 4.5) * MM, 0));
  const tab = new THREE.Shape();
  tab.moveTo(-5.08, 0);
  tab.lineTo(5.08, 0);
  tab.lineTo(5.08, 6.3);
  tab.lineTo(-5.08, 6.3);
  tab.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 3.5, 1.8, 0, Math.PI * 2, true);
  tab.holes.push(hole);
  const tabGeo = new THREE.ExtrudeGeometry(tab, { depth: 1.27, bevelEnabled: false, curveSegments: 20 });
  tabGeo.scale(MM, MM, MM);
  sub.add(mesh(tabGeo, PBR.tin(), 0, (leg + 9.0) * MM, (1.0) * MM));
  for (let i = -1; i <= 1; i += 1) sub.add(mesh(new THREE.BoxGeometry(0.8 * MM, (leg + 0.5) * MM, 0.5 * MM), PBR.tin(), i * 2.54 * MM, ((leg - 0.5) / 2) * MM, 0, false));
  if (p.marking) {
    const tex = labelTexture(p.marking, { wPx: 256, hPx: 220, color: 'rgba(200,203,208,0.85)' });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(8.5 * MM, 7.0 * MM), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false }));
    face.rotation.y = Math.PI;
    face.position.set(0, (leg + 4.5) * MM, (-2.26) * MM);
    sub.add(face);
  }
}

/* ------------------------------------------------------------------ connectors */

/**
 * Screw terminal block (KF301-style, 5.08 mm pitch): `ways` cells 7.5 mm deep and 10 mm tall, a slotted screw on
 * top of each, the square wire entry facing -z before rotation.
 */
export function screwTerminal(g: THREE.Group, p: Place & { ways: number; color?: number }): void {
  const sub = placed(g, p);
  const pitch = 5.08;
  const w = p.ways * pitch;
  const mat = plastic(p.color ?? 0x2b7fd0, 0.55, 0.1);
  sub.add(mesh(rbox(w, 10, 7.5, 0.4), mat, 0, 5 * MM, 0));
  for (let i = 0; i < p.ways; i += 1) {
    const x = (i - (p.ways - 1) / 2) * pitch;
    sub.add(mesh(new THREE.CylinderGeometry(1.6 * MM, 1.6 * MM, 1.2 * MM, 20), PBR.nickel(), x * MM, 9.6 * MM, 1.2 * MM));
    const slot = mesh(new THREE.BoxGeometry(2.8 * MM, 0.3 * MM, 0.5 * MM), plastic(0x2a2c30, 0.6), x * MM, 10.25 * MM, 1.2 * MM, false);
    slot.rotation.y = Math.PI / 5;
    sub.add(slot);
    // the wire entry: a dark square opening with the clamp plate inside
    sub.add(mesh(new THREE.BoxGeometry(3.4 * MM, 3.4 * MM, 0.3 * MM), plastic(0x15171a, 0.8), x * MM, 3.4 * MM, -3.62 * MM, false));
    sub.add(mesh(new THREE.BoxGeometry(2.6 * MM, 0.5 * MM, 0.35 * MM), PBR.nickel(), x * MM, 2.2 * MM, -3.55 * MM, false));
  }
}

/** JST XH (2.5 mm) shrouded socket with `pins` contacts, white; `plug` shows a mating plug inserted (wires leaving -z). */
export function jstXh(g: THREE.Group, p: Place & { pins: number; plug?: boolean }): void {
  const sub = placed(g, p);
  const w = p.pins * 2.5 + 2.4;
  sub.add(mesh(rbox(w, 7.0, 5.75, 0.25), plastic(0xf2efe6, 0.55), 0, 3.5 * MM, 0));
  sub.add(mesh(new THREE.BoxGeometry((w - 1.6) * MM, 5.6 * MM, 0.3 * MM), plastic(0xd8d4ca, 0.6), 0, 3.6 * MM, -2.75 * MM, false));
  if (p.plug) sub.add(mesh(rbox(w - 1.8, 5.2, 4.0, 0.2), plastic(0xfaf8f2, 0.5), 0, 3.8 * MM, -4.2 * MM));
}

/* ------------------------------------------------------------------ electromechanical */

/** SRD-05VDC-SL-C sugar-cube relay: 19 x 15.5 x 15.3 mm blue case with its printed ratings on top. */
export function relaySrd(g: THREE.Group, p: Place): void {
  const sub = placed(g, p);
  sub.add(mesh(rbox(19, 15.3, 15.5, 0.6), plastic(0x2160c4, 0.42, 0.25), 0, 7.65 * MM, 0));
  const tex = labelTexture(['SRD-05VDC-SL-C', '10A 250VAC  10A 125VAC', '10A 30VDC   10A 28VDC'], { wPx: 512, hPx: 400, color: 'rgba(240,244,250,0.92)', sizes: [64, 40, 40] });
  sub.add(decal(tex, 17, 13, 15.3 * MM + 0.002));
}

/** 12 x 9.5 mm magnetic buzzer: black can with the sound hole on top and the "+" mark. */
export function buzzer12(g: THREE.Group, p: Place & { sealed?: boolean }): THREE.Group {
  const sub = placed(g, p);
  const can = new THREE.CylinderGeometry(6 * MM, 6 * MM, 9.5 * MM, 40);
  sub.add(mesh(can, plastic(0x141416, 0.45, 0.2), 0, 4.75 * MM, 0));
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.0 * MM, 1.5 * MM, 24), plastic(0x2a2a2c, 0.5));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 9.5 * MM + 0.001;
  sub.add(ring);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(1.0 * MM, 24), plastic(0x050505, 0.9));
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = 9.5 * MM + 0.0012;
  sub.add(hole);
  const tex = labelTexture(['+'], { wPx: 128, hPx: 128, color: 'rgba(230,230,230,0.9)', weight: 800 });
  const plus = decal(tex, 2.6, 2.6, 9.5 * MM + 0.0015);
  plus.position.x = -3.6 * MM;
  sub.add(plus);
  if (p.sealed) {
    const label = labelTexture(['REMOVE SEAL', 'AFTER WASHING'], { wPx: 256, hPx: 160, color: 'rgba(30,30,30,0.85)', bg: 'rgba(245,245,240,0.96)' });
    const s = decal(label, 7.2, 4.4, 9.5 * MM + 0.0018);
    s.position.x = 1.2 * MM;
    sub.add(s);
  }
  return sub;
}

/** Small square single-turn trimmer (3362-style, 6.6 x 6.6 x 4.6 mm): blue body, white cross rotor. */
export function trimpot3362(g: THREE.Group, p: Place & { color?: number }): void {
  const sub = placed(g, p);
  sub.add(mesh(rbox(6.6, 4.6, 6.6, 0.3), plastic(p.color ?? 0x2f62c4, 0.42, 0.2), 0, 2.3 * MM, 0));
  sub.add(mesh(new THREE.CylinderGeometry(2.0 * MM, 2.0 * MM, 0.8 * MM, 24), plastic(0xf2f2ee, 0.5), 0, 5.0 * MM, 0));
  for (const r of [0, Math.PI / 2]) {
    const slot = mesh(new THREE.BoxGeometry(3.0 * MM, 0.3 * MM, 0.55 * MM), plastic(0x9a9a96, 0.6), 0, 5.42 * MM, 0, false);
    slot.rotation.y = r;
    sub.add(slot);
  }
}

/**
 * 9 mm rotary potentiometer (RV09-style) standing on its legs: black base, steel cover, threaded bushing and a 6 mm
 * knurled shaft with its flat.
 */
export function potRv09(g: THREE.Group, p: Place & { legMm?: number }): void {
  const sub = placed(g, p);
  const leg = p.legMm ?? 3;
  sub.add(mesh(rbox(9.7, 5.0, 9.7, 0.3), plastic(0x1a1b1e, 0.6), 0, (leg + 2.5) * MM, 0));
  sub.add(mesh(rbox(9.9, 1.4, 9.9, 0.2), PBR.steel(), 0, (leg + 5.7) * MM, 0));
  sub.add(mesh(new THREE.CylinderGeometry(3.5 * MM, 3.5 * MM, 5.0 * MM, 32), PBR.brass(), 0, (leg + 8.9) * MM, 0));
  const shaft = new THREE.CylinderGeometry(3.0 * MM, 3.0 * MM, 9.0 * MM, 36);
  sub.add(mesh(shaft, PBR.aluminium(), 0, (leg + 15.9) * MM, 0));
  // knurl: fine ridges on the top half of the shaft
  const ridge = new THREE.BoxGeometry(0.35 * MM, 5.0 * MM, 0.35 * MM);
  const geos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2;
    const r = ridge.clone();
    r.translate(Math.cos(a) * 3.0 * MM, (leg + 17.9) * MM, Math.sin(a) * 3.0 * MM);
    geos.push(r);
  }
  sub.add(mesh(mergeGeometries(geos), PBR.aluminium(), 0, 0, 0, false));
  geos.forEach((x) => x.dispose());
  ridge.dispose();
  for (let i = -1; i <= 1; i += 1) sub.add(mesh(new THREE.BoxGeometry(0.8 * MM, (leg + 0.4) * MM, 0.3 * MM), PBR.tin(), i * 2.5 * MM, ((leg - 0.4) / 2) * MM, 5.2 * MM, false));
}

/* ------------------------------------------------------------------ light */

/**
 * WS2812B (5050): 5 x 5 x 1.6 mm white body, the clear window showing the controller die and three LED chips.
 * Returns the window material so the scene can light it.
 */
export function ws2812(g: THREE.Group, p: Place): THREE.MeshStandardMaterial {
  const sub = placed(g, p);
  sub.add(mesh(rbox(5.0, 1.6, 5.0, 0.15), plastic(0xf4f2ec, 0.45), 0, 0.8 * MM, 0));
  // the clear epoxy window over the reflector cup: a faintly amber disc with a darker rim
  const emit = ledEmitter(0xe8dfc8, 0.03);
  emit.roughness = 0.12;
  const win = new THREE.Mesh(new THREE.CircleGeometry(2.1 * MM, 32), emit);
  win.rotation.x = -Math.PI / 2;
  win.position.y = 1.6 * MM + 0.001;
  sub.add(win);
  const rim = new THREE.Mesh(new THREE.RingGeometry(2.1 * MM, 2.3 * MM, 40), plastic(0xbdb6a6, 0.4));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 1.6 * MM + 0.0012;
  sub.add(rim);
  sub.add(mesh(new THREE.BoxGeometry(1.1 * MM, 0.1 * MM, 1.1 * MM), plastic(0x2a2c30, 0.4), 0.6 * MM, 1.55 * MM, 0.5 * MM, false));
  for (const [x, z, c] of [[-0.7, -0.6, 0xd23a3a], [-0.7, 0.2, 0x37b24d], [-0.2, -0.9, 0x3567d8]] as const) {
    sub.add(mesh(new THREE.BoxGeometry(0.45 * MM, 0.12 * MM, 0.45 * MM), plastic(c, 0.4), x * MM, 1.56 * MM, z * MM, false));
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 0.35, 1]) sub.add(mesh(new THREE.BoxGeometry(0.6 * MM, 0.5 * MM, 0.9 * MM), PBR.tin(), sx * 2.6 * MM, 0.25 * MM, sz * 1.6 * MM, false));
  return emit;
}

let segCache: THREE.CanvasTexture | null = null;

/** 0.36" four-digit seven-segment display (30 x 14 x 7.2 mm): black face, grey unlit segments, the colon. */
export function sevenSeg4(g: THREE.Group, p: Place): void {
  const sub = placed(g, p);
  sub.add(mesh(rbox(30, 7.2, 14, 0.2), plastic(0x121214, 0.5), 0, 3.6 * MM, 0));
  if (!segCache) {
    const c = document.createElement('canvas');
    c.width = 600;
    c.height = 280;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#18181a';
      ctx.fillRect(0, 0, 600, 280);
      ctx.fillStyle = '#5a5552';
      const digit = (x0: number) => {
        const w = 70;
        const h = 190;
        const t = 14;
        const y0 = 45;
        ctx.save();
        ctx.translate(x0, 0);
        ctx.transform(1, 0, -0.1, 1, 0, 0);
        ctx.fillRect(t, y0, w - 2 * t, t);
        ctx.fillRect(t, y0 + h / 2 - t / 2, w - 2 * t, t);
        ctx.fillRect(t, y0 + h - t, w - 2 * t, t);
        ctx.fillRect(0, y0 + t, t, h / 2 - 1.5 * t);
        ctx.fillRect(w - t, y0 + t, t, h / 2 - 1.5 * t);
        ctx.fillRect(0, y0 + h / 2 + t / 2, t, h / 2 - 1.5 * t);
        ctx.fillRect(w - t, y0 + h / 2 + t / 2, t, h / 2 - 1.5 * t);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(x0 + w + 6, y0 + h - 6, 7, 0, Math.PI * 2);
        ctx.fill();
      };
      [40, 165, 330, 455].forEach(digit);
      ctx.beginPath();
      ctx.arc(298, 115, 8, 0, Math.PI * 2);
      ctx.arc(292, 175, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    segCache = new THREE.CanvasTexture(c);
    segCache.colorSpace = THREE.SRGBColorSpace;
    markShared(segCache);
  }
  sub.add(decal(segCache, 29, 13.4, 7.2 * MM + 0.001));
}

let matrixCache: THREE.CanvasTexture | null = null;

/** 8 x 8 dot matrix (1088AS-style, 32 x 32 x 8 mm): black face with 64 pale 3 mm dots. */
export function ledMatrix8(g: THREE.Group, p: Place): void {
  const sub = placed(g, p);
  sub.add(mesh(rbox(32, 8, 32, 0.25), plastic(0x0f0f11, 0.5), 0, 4 * MM, 0));
  if (!matrixCache) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#141416';
      ctx.fillRect(0, 0, 512, 512);
      for (let r = 0; r < 8; r += 1) {
        for (let k = 0; k < 8; k += 1) {
          const grad = ctx.createRadialGradient(32 + k * 64, 32 + r * 64, 2, 32 + k * 64, 32 + r * 64, 24);
          grad.addColorStop(0, '#d9cfc6');
          grad.addColorStop(1, '#8e857e');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(32 + k * 64, 32 + r * 64, 23, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    matrixCache = new THREE.CanvasTexture(c);
    matrixCache.colorSpace = THREE.SRGBColorSpace;
    markShared(matrixCache);
  }
  sub.add(decal(matrixCache, 31.6, 31.6, 8 * MM + 0.001));
}

/* ------------------------------------------------------------------ cells, antennas, sinks */

/** CR2032 coin cell (20 x 3.2 mm) in its holder, + face up with its engraving. */
export function coinCell(g: THREE.Group, p: Place): void {
  const sub = placed(g, p);
  sub.add(mesh(rbox(22.5, 2.0, 22.5, 1.5), PBR.headerPlastic(), 0, 1.0 * MM, 0));
  sub.add(mesh(new THREE.CylinderGeometry(10 * MM, 10 * MM, 3.2 * MM, 48), PBR.steel(), 0, 3.2 * MM, 0));
  const tex = labelTexture(['+', 'CR2032', '3V'], { wPx: 256, hPx: 256, color: 'rgba(80,84,90,0.85)', sizes: [70, 44, 38] });
  sub.add(decal(tex, 14, 14, 4.8 * MM + 0.001, 0.9));
  sub.add(mesh(new THREE.BoxGeometry(6 * MM, 0.3 * MM, 4 * MM), PBR.nickel(), 0, 4.9 * MM, 8.5 * MM, false));
}

/** Square ceramic GPS patch antenna (25 x 25 x 4 mm): tan ceramic, the silver patch and its feed point. */
export function patchAntenna(g: THREE.Group, p: Place & { sizeMm?: number }): void {
  const sub = placed(g, p);
  const s = p.sizeMm ?? 25;
  sub.add(mesh(rbox(s, 4, s, 0.4), plastic(0xc9b48a, 0.75), 0, 2 * MM, 0));
  sub.add(mesh(new THREE.BoxGeometry((s - 4) * MM, 0.06 * MM, (s - 4) * MM), PBR.aluminium(), 0, 4.03 * MM, 0, false));
  sub.add(mesh(new THREE.CylinderGeometry(0.6 * MM, 0.6 * MM, 0.3 * MM, 16), PBR.solder(), 2.0 * MM, 4.15 * MM, 2.0 * MM, false));
}

/** Extruded finned heatsink, black anodised: `fins` fins across `wMm`, `hMm` tall, `dMm` deep. */
export function finnedHeatsink(g: THREE.Group, p: Place & { wMm: number; hMm: number; dMm: number; fins: number }): void {
  const sub = placed(g, p);
  const mat = new THREE.MeshStandardMaterial({ color: 0x1a1b1e, metalness: 0.6, roughness: 0.5 });
  sub.add(mesh(new THREE.BoxGeometry(p.wMm * MM, p.hMm * MM, 2.0 * MM), mat, 0, (p.hMm / 2) * MM, (-p.dMm / 2 + 1) * MM));
  const fin = 0.9;
  for (let i = 0; i < p.fins; i += 1) {
    const x = (i - (p.fins - 1) / 2) * ((p.wMm - fin) / Math.max(1, p.fins - 1));
    sub.add(mesh(new THREE.BoxGeometry(fin * MM, p.hMm * MM, (p.dMm - 2) * MM), mat, x * MM, (p.hMm / 2) * MM, 1 * MM));
  }
}
