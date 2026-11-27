import * as THREE from 'three';
import { ARDUINO_NANO, DS3231_MODULE, HC05_MODULE, MICROSD_MODULE, NRF24_MODULE, RPI_PICO } from '../../catalog/moduleGeometry';
import { buildPcb, MM } from '../kit/pcb';
import { chipPassive, crystalSmd3225, inductorShielded, ledSmd, lqfp, microUsb, qfn, soic, soicWide, sot223, sot23, tactSmd, usbC } from '../kit/packages';
import { PBR, plastic } from '../kit/pbr';
import { moduleBoard } from './moduleKit';
import { box, cyl, sideLabel } from './shapes';
import type { PartBuilder } from './types';

/* ================================================================== Arduino Nano (USB-C clone) */

/**
 * Blue Nano V3 with USB-C: ATmega328P (TQFP-32, turned 45 degrees as on the real board), reset button, 16 MHz
 * crystal, TX / RX / PWR / L LEDs, the unpopulated ICSP pads and the pin labels beside both rows.
 */
export const buildArduinoNano: PartBuilder = ({ group }) => {
  const g = ARDUINO_NANO;
  const board = moduleBoard(group, g, {
    labelMm: 0.55,
    draw: (p) => {
      p.pour(5.0, 6.8, 8.0, 36.5);
      for (const [x, y] of [[7.73, 38.0], [10.27, 38.0], [7.73, 40.54], [10.27, 40.54], [7.73, 43.08], [10.27, 43.08]] as const) p.ring(x, y, 1.6, 0.9, { finish: 'tin', square: x === 7.73 && y === 38.0 });
      p.silkText('ICSP', 9.0, 36.4, 0.6);
      ['TX', 'RX', 'PWR', 'L'].forEach((t, i) => p.silkText(t, 6.3 + i * 1.8, 10.2, 0.45));
      p.silkText('NANO', 9.0, 31.6, 0.9);
      p.silkText('V3.0', 9.0, 33.0, 0.6);
      p.silkText('RESET', 9.0, 15.6, 0.45);
      for (const [x, y] of [[6.0, 20.0], [12.0, 20.0], [6.0, 28.0], [12.0, 28.0], [9.0, 29.6]] as const) p.via(x, y);
    },
  });
  const at = board.at;
  usbC(group, { at: at(9.0, 3.6), overhangMm: 1.2 });
  for (let i = 0; i < 4; i += 1) ledSmd(group, { at: at(6.3 + i * 1.8, 8.8), code: '0603', color: i === 2 ? 0x2ed060 : 0xffb020, glow: i === 2 ? 0.12 : 0.03, rot: Math.PI / 2 });
  tactSmd(group, { at: at(9.0, 13.3), size: 3.5 });
  crystalSmd3225(group, { at: at(9.0, 17.6) });
  lqfp(group, { at: at(9.0, 23.75), size: 7, pins: 32, pitch: 0.8, rot: Math.PI / 4, marking: ['ATMEGA328P', 'AU 2412'] });
  chipPassive(group, { at: at(6.4, 17.6), code: '0603', kind: 'C', rot: Math.PI / 2 });
  chipPassive(group, { at: at(11.6, 17.6), code: '0603', kind: 'C', rot: Math.PI / 2 });
  chipPassive(group, { at: at(6.0, 30.0), code: '0603', kind: 'C' });
  chipPassive(group, { at: at(12.0, 30.0), code: '0603', kind: 'R', marking: '103' });
};

/* ================================================================== Raspberry Pi Pico */

/**
 * Green Pico: RP2040 (QFN-56), 2 MB QSPI flash, 12 MHz crystal, BOOTSEL button, LED, micro-USB, the buck converter
 * and its inductor, the three DEBUG pads, castellated edges, and pin numbers at the row ends (the GPIO names are
 * printed on the underside of the real board; the app shows them on hover).
 */
export const buildRpiPico: PartBuilder = ({ group }) => {
  const g = RPI_PICO;
  const board = moduleBoard(group, g, {
    silk: false,
    draw: (p) => {
      for (let i = 0; i < 20; i += 1) {
        const y = 1.37 + i * 2.54;
        p.pad(0.45, y, 0.9, 1.5, { finish: 'gold' });
        p.pad(g.wMm - 0.45, y, 0.9, 1.5, { finish: 'gold' });
      }
      p.pour(4.0, 5.0, 13.0, 40.0);
      p.silkText('1', 3.1, 1.37, 0.7, { align: 'left' });
      p.silkText('20', 3.1, 49.63, 0.7, { align: 'left' });
      p.silkText('40', g.wMm - 3.1, 1.37, 0.7, { align: 'right' });
      p.silkText('21', g.wMm - 3.1, 49.63, 0.7, { align: 'right' });
      p.silkText('LED', 5.4, 7.7, 0.6);
      p.silkText('BOOTSEL', 7.6, 14.6, 0.6);
      p.silkText('DEBUG', 10.5, 47.6, 0.6);
      p.silkText('Pico', 10.5, 44.6, 1.4);
      for (let i = 0; i < 3; i += 1) p.pad(8.5 + i * 2.0, 49.7, 1.2, 1.6, { finish: 'gold' });
      for (const [x, y] of [[6.0, 20.0], [15.0, 20.0], [6.0, 29.0], [15.0, 29.0], [10.5, 38.5]] as const) p.via(x, y);
    },
  });
  const at = board.at;
  microUsb(group, { at: at(10.5, 2.6), overhangMm: 1.3 });
  ledSmd(group, { at: at(5.4, 6.2), code: '0603', color: 0x2ed060, glow: 0.05 });
  tactSmd(group, { at: at(7.6, 11.8), size: 3.6 });
  crystalSmd3225(group, { at: at(14.4, 15.4) });
  qfn(group, { at: at(10.5, 24.5), size: 7, pins: 56, marking: ['RP2040', 'RP2-B2', '2124'] });
  soic(group, { at: at(10.5, 33.6), pins: 8, marking: ['W25Q16JV', 'IQ 2131'], rot: Math.PI / 2 });
  inductorShielded(group, { at: at(8.2, 41.0), size: 2.6, h: 1.2 });
  qfn(group, { at: at(12.8, 41.0), size: 2.0, sizeD: 3.0, pins: 10, height: 0.75 });
  for (const [x, y, r] of [[6.0, 24.5, true], [15.0, 24.5, true], [10.5, 19.6, false], [10.5, 29.4, false], [14.6, 33.6, true], [6.4, 33.6, true]] as const) {
    chipPassive(group, { at: at(x, y), code: '0402', kind: 'C', rot: r ? Math.PI / 2 : 0 });
  }
};

/* ================================================================== HC-05 Bluetooth */

/**
 * HC-05: the green Bluetooth core module (BC417 radio, flash, crystal, meander antenna at the north end, castellated
 * edges soldered down) on its blue base board with the 3.3 V regulator, the status LED, the button and six pins.
 */
export const buildHc05: PartBuilder = ({ group }) => {
  const g = HC05_MODULE;
  const board = moduleBoard(group, g, {
    labelMm: 0.7,
    draw: (p) => {
      p.silkText('HC-05', 8.0, 36.2, 0.7);
      p.trace([[3.0, 34.0], [3.0, 30.0]], 0.4, 0.2);
      p.trace([[13.0, 34.0], [13.0, 30.5]], 0.4, 0.2);
    },
  });
  const at = board.at;
  // the core module on top
  const subW = 12.7;
  const subD = 27;
  const subY0 = 0.6;
  const sub = buildPcb({
    key: 'hc05-core',
    wMm: subW,
    dMm: subD,
    thicknessMm: 0.8,
    cornerMm: 0.4,
    mask: '#2d6b3c',
    yBottom: board.top + 0.05 * MM,
    draw: (p) => {
      // meander antenna under the mask at the north end
      const pts: Array<[number, number]> = [[1.2, 6.2]];
      for (let i = 0; i < 6; i += 1) {
        const x = 1.2 + i * 1.9;
        pts.push([x, 1.0], [x + 0.95, 1.0], [x + 0.95, 5.2], [x + 1.9, 5.2]);
      }
      p.trace(pts, 0.5);
      for (let i = 0; i < 13; i += 1) {
        const y = 8.5 + i * 1.5;
        p.pad(0.35, y, 0.7, 0.9, { finish: 'gold' });
        p.pad(subW - 0.35, y, 0.7, 0.9, { finish: 'gold' });
      }
      p.silkLine([[0.6, 7.2], [subW - 0.6, 7.2]], 0.12);
    },
  });
  const dz = (subY0 + subD / 2 - g.dMm / 2) * MM;
  sub.mesh.position.z += dz;
  group.add(sub.mesh);
  const sat = (x: number, y: number) => sub.at(x, y).add(new THREE.Vector3(0, 0, dz));
  qfn(group, { at: sat(6.35, 13.5), size: 6, pins: 48, marking: ['BC417', '143B', 'QQK'] });
  soic(group, { at: sat(6.35, 21.8), pins: 8, marking: ['EN25F80'], rot: Math.PI / 2 });
  crystalSmd3225(group, { at: sat(3.2, 9.0) });
  for (const [x, y] of [[10.4, 9.0], [10.4, 18.0], [2.4, 18.0], [10.4, 25.2], [2.4, 25.2]] as const) chipPassive(group, { at: sat(x, y), code: '0402', kind: 'C', rot: Math.PI / 2 });
  // solder fillets where the castellations meet the base board
  for (let i = 0; i < 13; i += 1) {
    for (const sx of [-1, 1]) {
      const pt = at(8.0 + sx * (subW / 2 + 0.15), subY0 + 8.5 + i * 1.5);
      group.add(box(0.5 * MM, 0.6 * MM, 0.8 * MM, PBR.solder(), pt.x, board.top + 0.3 * MM, pt.z));
    }
  }
  // the base board's own parts
  sot23(group, { at: at(8.0, 29.6), marking: ['662K'] });
  ledSmd(group, { at: at(3.0, 29.4), code: '0603', color: 0xff2a1a, glow: 0.12 });
  tactSmd(group, { at: at(12.8, 29.4), size: 3.0 });
};

/* ================================================================== nRF24L01+ */

/** Green nRF24L01+: QFN-20 radio, 16 MHz crystal, the matching network in 0402 parts, meander antenna at the east end. */
export const buildNrf24: PartBuilder = ({ group }) => {
  const g = NRF24_MODULE;
  const board = moduleBoard(group, g, {
    silk: false,
    draw: (p) => {
      p.pour(6.5, 0.8, 11.5, 13.4);
      // the meander antenna (a trace under the mask)
      const pts: Array<[number, number]> = [[18.6, 7.5]];
      for (let i = 0; i < 4; i += 1) {
        const x = 19.6 + i * 2.2;
        pts.push([x, 7.5], [x, 1.4], [x + 1.1, 1.4], [x + 1.1, 13.6], [x + 2.2, 13.6]);
      }
      p.trace(pts, 0.55);
      for (const [x, y] of [[7.4, 2.0], [7.4, 13.0], [17.2, 2.0], [17.2, 13.0]] as const) p.via(x, y);
      p.silkText('NRF24L01+', 12.2, 14.2, 0.6);
    },
  });
  const at = board.at;
  qfn(group, { at: at(11.6, 7.6), size: 4, pins: 20, marking: ['NRF', '24L01+', '1702AF'] });
  crystalSmd3225(group, { at: at(9.2, 2.6) });
  for (const [x, y, r] of [[15.0, 5.0, true], [15.0, 7.6, true], [15.0, 10.2, true], [16.4, 6.3, false], [16.4, 8.9, false], [8.2, 11.8, false], [10.4, 12.6, true], [13.4, 12.6, true]] as const) {
    chipPassive(group, { at: at(x, y), code: '0402', kind: r ? 'C' : 'L', rot: r ? Math.PI / 2 : 0 });
  }
};

/* ================================================================== DS3231 RTC (ZS-042) */

/**
 * Blue ZS-042: DS3231SN (wide SOIC-16), AT24C32 EEPROM, pull-up resistors, the power LED, the charge diode, the
 * 6-pin and 4-pin headers, and the CR2032 holder on the underside (the board stands on it).
 */
export const buildDs3231: PartBuilder = ({ group }) => {
  const g = DS3231_MODULE;
  const board = moduleBoard(group, g, {
    labelMm: 0.7,
    draw: (p) => {
      p.pour(12.0, 1.2, 14.0, 19.6);
      for (let i = 0; i < 4; i += 1) p.trace([[3.4, 9.73 + i * 2.54], [8.0, 9.73 + i * 2.54], [13.6, 6.0 + i * 1.27]], 0.3, 0.2);
      p.silkText('DS3231 RTC', 12.0, 1.2, 0.8);
      p.silkText('ZS-042', 26.0, 21.0, 0.7);
    },
  });
  const at = board.at;
  soicWide(group, { at: at(19.0, 8.0), pins: 16, marking: ['DS3231SN', '#2321', 'A2 92AC'] });
  soic(group, { at: at(19.0, 17.2), pins: 8, marking: ['ATMEL', '24C32'], rot: Math.PI / 2 });
  for (let i = 0; i < 4; i += 1) chipPassive(group, { at: at(12.0, 15.2 + i * 1.6), code: '0603', kind: 'R', marking: '472' });
  ledSmd(group, { at: at(26.6, 17.2), code: '0603', color: 0xff2a1a, glow: 0.12 });
  chipPassive(group, { at: at(26.6, 19.4), code: '0603', kind: 'R', marking: '102' });
  chipPassive(group, { at: at(26.6, 4.0), code: '0805', kind: 'R', marking: '201' });
  chipPassive(group, { at: at(12.0, 4.0), code: '0603', kind: 'C' });
  const dPos = at(26.6, 6.6);
  group.add(box(1.7 * MM, 0.9 * MM, 1.25 * MM, PBR.icEpoxy(), dPos.x, board.top + 0.45 * MM, dPos.z, 0.1 * MM));
  group.add(box(0.3 * MM, 0.02 * MM, 1.2 * MM, plastic(0x9aa0a6, 0.5), dPos.x - 0.55 * MM, board.top + 0.91 * MM, dPos.z));

  // under the board: the coin cell holder (black plate, four feet) and the cell in it
  const c = at(19.0, 11.0);
  const under = board.bottom;
  group.add(box(23 * MM, 1.6 * MM, 21 * MM, PBR.headerPlastic(), c.x, under - 0.8 * MM, c.z, 0.4 * MM));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) group.add(box(2.4 * MM, under - 1.6 * MM, 2.4 * MM, PBR.headerPlastic(), c.x + sx * 10.3 * MM, (under - 1.6 * MM) / 2, c.z + sz * 9.3 * MM, 0.3 * MM));
  group.add(cyl(10 * MM, 3.2 * MM, PBR.steel(), c.x, under - 1.6 * MM - 1.65 * MM, c.z, 48));
  group.add(box(8 * MM, 0.3 * MM, 12 * MM, PBR.nickel(), c.x + 6 * MM, under - 1.75 * MM, c.z));
};

/* ================================================================== microSD module */

/**
 * Blue microSD module: push-push socket at the east end (slot facing east), AMS1117-3.3, 74LVC125A level shifter,
 * pull-ups and capacitors, 6-pin header on the west edge.
 */
export const buildMicrosd: PartBuilder = ({ group }) => {
  const g = MICROSD_MODULE;
  const board = moduleBoard(group, g, {
    draw: (p) => {
      p.pour(7.0, 4.5, 18.0, 15.0);
      for (let i = 0; i < 6; i += 1) p.trace([[3.4, 5.65 + i * 2.54], [6.5, 5.65 + i * 2.54], [7.8, 8.2 + i * 1.27]], 0.3, 0.2);
      for (let i = 0; i < 4; i += 1) p.trace([[14.2, 8.8 + i * 1.27], [17.0, 8.8 + i * 1.27], [27.0, 7.0 + i * 1.6]], 0.3, 0.2);
      p.silkText('MicroSD Card Adapter', 21.0, 22.6, 0.75);
      p.silkText('TF CARD', 33.0, 1.6, 0.7);
    },
  });
  const at = board.at;
  soic(group, { at: at(11.0, 12.0), pins: 14, marking: ['LVC125A'] });
  sot223(group, { at: at(19.6, 12.0), rot: Math.PI / 2, marking: ['AMS1117', '3.3'] });
  for (const [x, y] of [[15.4, 5.2], [15.4, 18.8]] as const) chipPassive(group, { at: at(x, y), code: '0805', kind: 'C' });
  for (let i = 0; i < 4; i += 1) chipPassive(group, { at: at(24.4, 6.4 + i * 1.8), code: '0603', kind: 'R', marking: '103' });
  // the socket: nickel shield with its formed ribs on the plastic base, the card slot on the east face
  const s = at(33.6, 12.0);
  const top = board.top;
  group.add(box(14.6 * MM, 1.3 * MM, 15.4 * MM, plastic(0x18191b, 0.6), s.x, top + 0.65 * MM, s.z, 0.2 * MM));
  group.add(box(14.0 * MM, 0.25 * MM, 15.0 * MM, PBR.nickel(), s.x, top + 1.45 * MM, s.z, 0.1 * MM));
  for (const dz of [-4.5, 0, 4.5]) group.add(box(10.5 * MM, 0.12 * MM, 0.8 * MM, PBR.nickel(), s.x - 1.0 * MM, top + 1.62 * MM, s.z + dz * MM));
  group.add(box(0.3 * MM, 0.9 * MM, 11.4 * MM, plastic(0x050506, 0.9), s.x + 7.2 * MM, top + 0.75 * MM, s.z));
  for (const sz of [-1, 1]) group.add(box(14.0 * MM, 1.3 * MM, 0.2 * MM, PBR.nickel(), s.x, top + 0.8 * MM, s.z + sz * 7.6 * MM));
  sideLabel(group, ['PUSH'], 6, 1.6, s.x - 4 * MM, top + 0.8 * MM, s.z + 7.71 * MM, 1, { color: 'rgba(60,62,66,0.6)' });
};
