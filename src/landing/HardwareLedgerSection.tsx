import type React from 'react';
import { ArrowRight } from 'lucide-react';

export interface HardwareLedgerSectionProps {
  onOpenStudio: () => void;
}

const ROVER_LEDGER: Array<{ item: string; detail: string }> = [
  { item: 'Controller', detail: 'ESP32 DevKit V1 (3.3 V logic, 5.2 V VIN)' },
  { item: 'Motor driver', detail: 'DRV8833 on GPIO 25/26 (L) and 27/14 (R)' },
  { item: 'IMU and OLED', detail: 'MPU6050 + SSD1306 on SDA 32, SCL 33' },
  { item: 'Rangefinder', detail: 'HC-SR04 TRIG 13, ECHO 35 (divider checked)' },
  { item: 'Power stage', detail: '2S Li-ion (7.4 V) to LM2596 (5.2 V buck)' },
  { item: 'Exports', detail: 'BOM mass/cost, mm cut-list, Bridge JSON' },
];

/**
 * Editorial hardware build ledger paired with macro studio photography of the physical-spec rover.
 */
export function HardwareLedgerSection({ onOpenStudio }: HardwareLedgerSectionProps): React.ReactElement {
  return (
    <section id="hardware" className="lp-section lp-section-paper">
      <div className="lp-container">
        <h2 className="lp-h2">Go from browser wiring to a real shopping list</h2>
        <p className="lp-body">
          Every component carries datasheet mass, unit cost, pin ratings, and physical routed cable lengths so your
          simulation exports straight into a parts order and wire cut sheet.
        </p>

        <div className="lp-ledger-grid">
          <div className="lp-macro-frame">
            <img
              src="/landing/rover-macro.jpg"
              alt="Macro studio view of an ESP32 2WD carbon-fiber rover assembled with flat color-coded wiring harnesses on a silver millimeter cutting mat"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <ul className="lp-spec-list">
              {ROVER_LEDGER.map((row) => (
                <li key={row.item} className="lp-spec-row">
                  <span>{row.item}</span>
                  <strong>{row.detail}</strong>
                </li>
              ))}
            </ul>

            <div>
              <button type="button" className="lp-cta" onClick={onOpenStudio}>
                Open Bill of Materials in Studio
                <ArrowRight size={17} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
