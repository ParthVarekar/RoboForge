import { useMemo, useState } from 'react';
import type React from 'react';
import { ArrowRight } from 'lucide-react';
import { createPresetProject } from '../catalog/presets';
import { analyzeCircuit } from '../engine/circuit';
import type { StudioProject } from '../schema/projectSchema';

type FaultScenarioId = 'clean' | 'echo_5v' | 'direct_short' | 'input_only';

interface FaultScenario {
  id: FaultScenarioId;
  label: string;
  buildProject: () => StudioProject;
}

const FAULT_SCENARIOS: FaultScenario[] = [
  {
    id: 'clean',
    label: 'Clean harness',
    buildProject: () => createPresetProject('roboforge_rover'),
  },
  {
    id: 'echo_5v',
    label: '5V echo risk',
    buildProject: () => createPresetProject('fault_lab'),
  },
  {
    id: 'direct_short',
    label: 'Direct short',
    buildProject: () => {
      const p = createPresetProject('roboforge_rover');
      p.wires.push({
        id: 'w_demo_short',
        from: { componentId: 'bat_1', pinId: 'BAT_POS' },
        to: { componentId: 'bat_1', pinId: 'GND' },
        color: '#ef4444',
        style: 'routed',
      });
      return p;
    },
  },
  {
    id: 'input_only',
    label: 'Input-only pin',
    buildProject: () => {
      const p = createPresetProject('roboforge_rover');
      const idx = p.wires.findIndex((w) => w.to.componentId === 'drv_1' && w.to.pinId === 'IN1');
      if (idx >= 0) {
        p.wires[idx] = {
          ...p.wires[idx]!,
          from: { componentId: 'esp32_1', pinId: 'GPIO35' },
        };
      }
      return p;
    },
  },
];

export interface CircuitGuardDemoProps {
  onOpenFaultLab: () => void;
}

/**
 * Interactive circuit diagnostics showcase running the real Union-Find netlist engine (`analyzeCircuit`)
 * live against four authentic ESP32 wiring scenarios.
 */
export function CircuitGuardDemo({ onOpenFaultLab }: CircuitGuardDemoProps): React.ReactElement {
  const [scenarioId, setScenarioId] = useState<FaultScenarioId>('echo_5v');

  const analysis = useMemo(() => {
    const sc = FAULT_SCENARIOS.find((s) => s.id === scenarioId) ?? FAULT_SCENARIOS[0]!;
    return analyzeCircuit(sc.buildProject());
  }, [scenarioId]);

  const isShort = scenarioId === 'direct_short';
  const isEcho = scenarioId === 'echo_5v';
  const isInputOnly = scenarioId === 'input_only';

  return (
    <section id="wiring" className="lp-section lp-section-carbon">
      <div className="lp-container">
        <h2 className="lp-h2">Catch wiring faults before power hits the board</h2>
        <p className="lp-body">
          Every wire connects into a real netlist solver. Test an electrical trap below to inspect the exact
          diagnostic and hardware fix reported by the engine.
        </p>

        <div style={{ marginTop: 24 }}>
          <div className="lp-segmented lp-segmented-dark" role="tablist" aria-label="Select wiring scenario">
            {FAULT_SCENARIOS.map((sc) => (
              <button
                key={sc.id}
                type="button"
                role="tab"
                aria-selected={scenarioId === sc.id}
                className="lp-seg-tab"
                onClick={() => setScenarioId(sc.id)}
              >
                {sc.label}
              </button>
            ))}
          </div>
        </div>

        <div className="lp-fault-grid">
          {/* Bespoke interactive vector wiring diagram reflecting the selected real scenario */}
          <div className="lp-schematic-stage">
            <svg
              className="lp-schematic-svg"
              viewBox="0 0 640 360"
              role="img"
              aria-label="Interactive ESP32 rover wiring schematic"
            >
              {/* Subtle drafting grid */}
              <defs>
                <pattern id="lpGrid" width="32" height="32" patternUnits="userSpaceOnUse">
                  <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(244,247,250,0.06)" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="640" height="360" fill="url(#lpGrid)" rx="6" />

              {/* 2S Battery Pack */}
              <rect x="28" y="42" width="136" height="86" rx="6" fill="#102536" stroke="#38bdf8" strokeWidth="1.5" />
              <text x="96" y="76" textAnchor="middle" fill="#f4f7fa" fontFamily="Space Grotesk, sans-serif" fontSize="14" fontWeight="700">
                2S Li-Ion
              </text>
              <text x="96" y="98" textAnchor="middle" fill="#a6b5c6" fontFamily="IBM Plex Sans, sans-serif" fontSize="13">
                7.4 V nominal
              </text>

              {/* LM2596 Buck Converter */}
              <rect x="236" y="42" width="152" height="86" rx="6" fill="#13223b" stroke="#60a5fa" strokeWidth="1.5" />
              <text x="312" y="76" textAnchor="middle" fill="#f4f7fa" fontFamily="Space Grotesk, sans-serif" fontSize="14" fontWeight="700">
                LM2596 Buck
              </text>
              <text x="312" y="98" textAnchor="middle" fill="#a6b5c6" fontFamily="IBM Plex Sans, sans-serif" fontSize="13">
                Regulated 5.2 V
              </text>

              {/* ESP32 DevKit V1 */}
              <rect x="236" y="196" width="160" height="122" rx="6" fill="#1a2230" stroke="#94a3b8" strokeWidth="1.5" />
              <text x="316" y="232" textAnchor="middle" fill="#f4f7fa" fontFamily="Space Grotesk, sans-serif" fontSize="14" fontWeight="700">
                ESP32 DevKit V1
              </text>
              <text x="316" y="255" textAnchor="middle" fill="#a6b5c6" fontFamily="IBM Plex Sans, sans-serif" fontSize="13">
                3.3 V logic ceiling
              </text>
              <text x="316" y="280" textAnchor="middle" fill="#2dd4bf" fontFamily="IBM Plex Sans, sans-serif" fontSize="13">
                GPIO 25/26/27/14 · 35
              </text>

              {/* HC-SR04 Ultrasonic */}
              <rect x="466" y="42" width="146" height="86" rx="6" fill="#112737" stroke="#2dd4bf" strokeWidth="1.5" />
              <text x="539" y="76" textAnchor="middle" fill="#f4f7fa" fontFamily="Space Grotesk, sans-serif" fontSize="14" fontWeight="700">
                HC-SR04
              </text>
              <text x="539" y="98" textAnchor="middle" fill="#a6b5c6" fontFamily="IBM Plex Sans, sans-serif" fontSize="13">
                5 V ECHO output
              </text>

              {/* DRV8833 Motor Driver */}
              <rect x="466" y="210" width="146" height="96" rx="6" fill="#28163a" stroke="#c084fc" strokeWidth="1.5" />
              <text x="539" y="246" textAnchor="middle" fill="#f4f7fa" fontFamily="Space Grotesk, sans-serif" fontSize="14" fontWeight="700">
                DRV8833
              </text>
              <text x="539" y="268" textAnchor="middle" fill="#a6b5c6" fontFamily="IBM Plex Sans, sans-serif" fontSize="13">
                Dual H-Bridge
              </text>

              {/* Power bus lines (orthogonal filleted) */}
              <path
                d="M 164 68 L 236 68"
                fill="none"
                stroke={isShort ? '#f87171' : '#ef4444'}
                strokeWidth={isShort ? 4 : 2.5}
              />
              <path
                d="M 164 102 L 236 102"
                fill="none"
                stroke={isShort ? '#f87171' : '#64748b'}
                strokeWidth={isShort ? 4 : 2.5}
              />
              {/* Direct short loop highlight */}
              {isShort && (
                <g>
                  <path
                    d="M 196 68 L 196 102"
                    fill="none"
                    stroke="#f87171"
                    strokeWidth="4"
                    strokeDasharray="6 4"
                  />
                  <circle cx="196" cy="85" r="10" fill="rgba(248,113,113,0.22)" stroke="#f87171" strokeWidth="2" />
                  <text x="196" y="148" textAnchor="middle" fill="#f87171" fontFamily="IBM Plex Sans, sans-serif" fontSize="13" fontWeight="600">
                    Shorted 7.4 V to GND
                  </text>
                </g>
              )}

              {/* Buck 5.2 V -> ESP32 VIN */}
              <path d="M 312 128 L 312 196" fill="none" stroke="#ef4444" strokeWidth="2.5" />

              {/* HC-SR04 ECHO -> ESP32 GPIO35 (with or without 10k/10k divider) */}
              {isEcho ? (
                <g>
                  <path
                    d="M 520 128 L 520 162 L 352 162 L 352 196"
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth="3.5"
                    strokeDasharray="7 4"
                  />
                  <text x="454" y="154" textAnchor="middle" fill="#fbbf24" fontFamily="IBM Plex Sans, sans-serif" fontSize="13" fontWeight="600">
                    Direct 5.2 V ECHO
                  </text>
                </g>
              ) : (
                <g>
                  <path d="M 520 128 L 520 162 L 352 162 L 352 196" fill="none" stroke="#2dd4bf" strokeWidth="2.5" />
                  <rect x="412" y="150" width="66" height="24" rx="4" fill="#16202b" stroke="#2dd4bf" strokeWidth="1.5" />
                  <text x="445" y="166" textAnchor="middle" fill="#f4f7fa" fontFamily="IBM Plex Sans, sans-serif" fontSize="12">
                    10k / 10k
                  </text>
                </g>
              )}

              {/* ESP32 -> DRV8833 Motor PWM */}
              <path
                d="M 396 258 L 466 258"
                fill="none"
                stroke={isInputOnly ? '#f87171' : '#38bdf8'}
                strokeWidth={isInputOnly ? 3.5 : 2.5}
                strokeDasharray={isInputOnly ? '6 4' : undefined}
              />
              {isInputOnly && (
                <text x="431" y="290" textAnchor="middle" fill="#f87171" fontFamily="IBM Plex Sans, sans-serif" fontSize="13" fontWeight="600">
                  GPIO35 input-only
                </text>
              )}
            </svg>
          </div>

          {/* Live Engine Output */}
          <div className="lp-fault-readout">
            <table className="lp-net-table">
              <thead>
                <tr>
                  <th>Circuit check readout</th>
                  <th style={{ textAlign: 'right' }}>Live result</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Resolved nets</td>
                  <td>{analysis.nets.length} nets</td>
                </tr>
                <tr>
                  <td>Active diagnostics</td>
                  <td style={{ color: analysis.diagnostics.length === 0 ? '#2dd4bf' : '#fbbf24' }}>
                    {analysis.diagnostics.length === 0
                      ? 'All clear'
                      : `${analysis.diagnostics.length} found`}
                  </td>
                </tr>
                <tr>
                  <td>Guard interlock</td>
                  <td style={{ color: analysis.hasCriticalFault ? '#f87171' : '#2dd4bf' }}>
                    {analysis.hasCriticalFault ? 'Blocks execution' : 'Ready to run'}
                  </td>
                </tr>
              </tbody>
            </table>

            {analysis.diagnostics.length === 0 ? (
              <div className="lp-diag-list">
                <div className="lp-diag-item">
                  <div className="lp-diag-title">No electrical rule issues detected</div>
                  <p className="lp-diag-detail">
                    Regulated 5.2 V feeds the ESP32 and DRV8833, the 10k / 10k divider protects GPIO35, and all
                    motor outputs map cleanly to PWM-capable pins.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="lp-diag-list">
                {analysis.diagnostics.slice(0, 3).map((d) => (
                  <li key={d.id} className={`lp-diag-item sev-${d.severity}`}>
                    <div className="lp-diag-title">{d.title}</div>
                    <p className="lp-diag-detail">{d.detail}</p>
                    <p className="lp-diag-fix">Fix: {d.fix}</p>
                  </li>
                ))}
              </ul>
            )}

            <div>
              <button type="button" className="lp-cta lp-cta-dark" onClick={onOpenFaultLab}>
                Inspect in Fault Lab
                <ArrowRight size={17} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
