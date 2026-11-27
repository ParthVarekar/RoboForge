import { BUZZER_MODULE, RELAY_1CH, WS2812_STICK } from '../../catalog/moduleGeometry';
import { chipPassive, diodeSma, ledSmd, sot23 } from '../kit/packages';
import { buzzer12, relaySrd, screwTerminal, ws2812 } from '../kit/thruhole';
import { moduleBoard, tinnedPads } from './moduleKit';
import type { PartBuilder } from './types';

/* ================================================================== active buzzer (KY-012) */

/** Black KY-012 board with the 12 mm active buzzer (wash seal still on) and its three pins at the south edge. */
export const buildBuzzerActive: PartBuilder = ({ group }) => {
  const g = BUZZER_MODULE;
  const board = moduleBoard(group, g, {
    draw: (p) => {
      p.trace([[6.71, 12.3], [6.71, 9.5], [7.6, 8.3]], 0.4, 0.2);
      p.trace([[11.79, 12.3], [11.79, 9.5], [10.9, 8.3]], 0.4, 0.2);
      p.silkText('KY-012', 15.6, 1.4, 0.9);
      p.silkCircle(9.25, 5.9, 6.3, 0.15);
    },
  });
  buzzer12(group, { at: board.at(9.25, 5.9), sealed: true });
};

/* ================================================================== 1-channel relay */

/**
 * Blue 1-channel relay board: SRD-05VDC relay, S8050 driver transistor, flyback diode, power and status LEDs, the
 * input header on the west edge and the NO / COM / NC screw terminal on the east edge (wire entries facing east).
 */
export const buildRelay1ch: PartBuilder = ({ group }) => {
  const g = RELAY_1CH;
  const board = moduleBoard(group, g, {
    draw: (p) => {
      p.pour(6, 1, 9.5, 24);
      // the switched side: wide traces from the relay to the terminal
      p.trace([[35.0, 8.0], [41.0, 7.9]], 1.6);
      p.trace([[35.0, 13.0], [41.0, 13.0]], 1.6);
      p.trace([[35.0, 18.0], [41.0, 18.1]], 1.6);
      p.trace([[3.5, 10.46], [7.0, 10.46], [8.0, 6.0], [16.0, 6.0]], 0.5, 0.25);
      p.trace([[3.5, 15.54], [9.0, 15.54], [10.5, 14.0]], 0.3, 0.2);
      p.silkLine([[38.4, 2.0], [38.4, 24.0]], 0.2);
      p.silkText('NO', 39.6, 7.92, 0.9, { rot: -Math.PI / 2 });
      p.silkText('COM', 39.6, 13.0, 0.9, { rot: -Math.PI / 2 });
      p.silkText('NC', 39.6, 18.08, 0.9, { rot: -Math.PI / 2 });
      p.silkText('1 Relay Module', 26.0, 24.2, 1.0);
      p.silkText('High level trigger', 26.0, 1.6, 0.8);
      for (const [x, y] of [[13.8, 3.2], [13.8, 22.8], [7.2, 21.0]] as const) p.via(x, y);
    },
  });
  const at = board.at;
  relaySrd(group, { at: at(26.0, 13.0) });
  screwTerminal(group, { at: at(g.wMm - 3.75, 13.0), ways: 3, rot: -Math.PI / 2 });
  sot23(group, { at: at(10.6, 12.2), marking: ['J3Y'] });
  diodeSma(group, { at: at(14.0, 9.0), marking: 'M7', rot: Math.PI / 2 });
  ledSmd(group, { at: at(9.0, 3.4), code: '0805', color: 0xff2a1a, glow: 0.12 });
  ledSmd(group, { at: at(9.0, 22.6), code: '0805', color: 0x2ed060, glow: 0.05 });
  chipPassive(group, { at: at(11.6, 3.4), code: '0805', kind: 'R', marking: '102' });
  chipPassive(group, { at: at(11.6, 22.6), code: '0805', kind: 'R', marking: '102' });
  chipPassive(group, { at: at(8.2, 17.2), code: '0805', kind: 'R', marking: '102', rot: Math.PI / 2 });
};

/* ================================================================== WS2812B stick (8 LEDs) */

/** Black 8 x WS2812B stick: the LEDs at 5.9 mm pitch with a decoupling cap each, tinned input and output pads. */
export const buildWs2812Stick8: PartBuilder = ({ group }) => {
  const g = WS2812_STICK;
  const pitch = 5.9;
  const x0 = (g.wMm - 7 * pitch) / 2;
  const board = moduleBoard(group, g, {
    draw: (p) => {
      p.trace([[1.6, 2.2], [g.wMm - 1.6, 2.2]], 0.8, 0.2);
      p.trace([[1.6, 8.0], [g.wMm - 1.6, 8.0]], 0.8, 0.2);
      for (let i = 0; i < 8; i += 1) {
        const x = x0 + i * pitch;
        if (i < 7) p.trace([[x + 2.6, 5.6], [x + pitch - 2.6, 4.6]], 0.25, 0.2);
        p.silkRect(x - 2.75, 2.35, 5.5, 5.5, 0.12);
      }
      p.trace([[1.6, 5.1], [x0 - 2.6, 4.6]], 0.25, 0.2);
      p.trace([[x0 + 7 * pitch + 2.6, 5.6], [g.wMm - 1.6, 5.1]], 0.25, 0.2);
      p.silkText('WS2812B x8', g.wMm / 2, 9.4, 0.8);
      p.silkLine([[4.0, 0.9], [7.0, 0.9]], 0.15);
      p.silkLine([[6.4, 0.55], [7.0, 0.9], [6.4, 1.25]], 0.15);
    },
  });
  tinnedPads(group, g, board);
  const at = board.at;
  for (let i = 0; i < 8; i += 1) {
    const x = x0 + i * pitch;
    ws2812(group, { at: at(x, 5.1) });
    chipPassive(group, { at: at(x + pitch / 2, 9.0), code: '0402', kind: 'C' });
  }
};
