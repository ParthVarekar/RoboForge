import { useState } from 'react';
import type React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Info,
  RefreshCw,
  RotateCw,
  Trash2,
} from 'lucide-react';
import { getPartSpec } from '../catalog/partsCatalog';
import { pinKey, type CircuitAnalysis, type DiagnosticSeverity } from '../engine/circuit';
import type { ComponentInstance, Vec3, WireConnection, WireStyle } from '../schema/projectSchema';

const WIRE_COLORS = [
  '#ef4444',
  '#18181b',
  '#eab308',
  '#16a34a',
  '#0284c7',
  '#94a3b8',
  '#f97316',
  '#a855f7',
];

export interface InspectorPanelProps {
  components: ComponentInstance[];
  wires: WireConnection[];
  analysis: CircuitAnalysis;
  selectedComponentId: string | null;
  selectedWireId: string | null;
  routingWireId: string | null;
  runtimeNotice?: string | null;
  onSelectComponent: (id: string) => void;
  onUpdateComponent: (id: string, patch: Partial<ComponentInstance>) => void;
  onDuplicateComponent: (id: string) => void;
  onDeleteSelected: () => void;
  onUpdateWire: (id: string, patch: Partial<WireConnection>) => void;
  onToggleRouteByHand: (wireId: string | null) => void;
}

function severityIcon(sev: DiagnosticSeverity): React.ReactElement {
  if (sev === 'critical') return <AlertCircle size={14} color="#dc2626" />;
  if (sev === 'error') return <AlertCircle size={14} color="#ea580c" />;
  if (sev === 'warning') return <AlertTriangle size={14} color="#d97706" />;
  return <Info size={14} color="#0d9488" />;
}

/**
 * Right-dock contextual Inspector displaying Wire cable cut-length & routing controls,
 * Part mm-precision placement & pinout probe table, and collapsible Circuit Checks.
 */
export function InspectorPanel({
  components,
  wires,
  analysis,
  selectedComponentId,
  selectedWireId,
  routingWireId,
  runtimeNotice,
  onSelectComponent,
  onUpdateComponent,
  onDuplicateComponent,
  onDeleteSelected,
  onUpdateWire,
  onToggleRouteByHand,
}: InspectorPanelProps): React.ReactElement {
  const [checksOpen, setChecksOpen] = useState(true);

  const selectedWire = wires.find((w) => w.id === selectedWireId) ?? null;
  const selectedComp = components.find((c) => c.id === selectedComponentId) ?? null;
  const wireMetric = selectedWire ? analysis.wireMetrics.get(selectedWire.id) : null;

  const updatePosMm = (comp: ComponentInstance, axis: 0 | 1 | 2, mmVal: number) => {
    const next: Vec3 = [...comp.position];
    next[axis] = Number((mmVal / 10).toFixed(2));
    onUpdateComponent(comp.id, { position: next });
  };

  return (
    <div className="panel-scroll">
      {runtimeNotice && (
        <div className="diag-card diag-critical">
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700, fontSize: 11.5 }}>
            <AlertCircle size={14} color="#dc2626" />
            <span>{runtimeNotice}</span>
          </div>
        </div>
      )}
      {/* Contextual Wire Inspector (matches BenchTwin-style cable card) */}
      {selectedWire && (
        <div className="budget-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 13 }}>Wire</strong>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
              {selectedWire.from.componentId}.{selectedWire.from.pinId} → {selectedWire.to.componentId}.{selectedWire.to.pinId}
            </span>
          </div>

          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginTop: 4 }}>COLOR</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {WIRE_COLORS.map((hex) => (
              <button
                key={hex}
                type="button"
                aria-label={`Set wire color ${hex}`}
                className={`swatch ${selectedWire.color === hex ? 'active' : ''}`}
                style={{ background: hex }}
                onClick={() => onUpdateWire(selectedWire.id, { color: hex })}
              />
            ))}
          </div>
          <div className="part-meta">
            Use red for power and black for ground. It makes physical builds easier to verify.
          </div>

          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginTop: 4 }}>CABLE</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700 }}>
            {wireMetric ? `${wireMetric.routedMm} mm long, cut ${wireMetric.cutMm} mm` : 'Length unavailable'}
          </div>
          <div className="part-meta">
            Style:{' '}
            {(selectedWire.style ?? 'routed') === 'routed'
              ? 'Harness cable tray'
              : selectedWire.style === 'direct'
                ? 'Direct taut'
                : 'Formed jumper'}{' '}
            · Clearance {Math.round((selectedWire.clearanceCm ?? 0.45) * 10)} mm
            {selectedWire.waypoints && selectedWire.waypoints.length > 0
              ? ` · ${selectedWire.waypoints.length} tie pt${selectedWire.waypoints.length === 1 ? '' : 's'}`
              : ' · No tie points yet'}
          </div>

          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 4 }}>
            <button
              type="button"
              className={`btn btn-sm ${(selectedWire.style ?? 'routed') === 'routed' ? 'btn-accent' : ''}`}
              onClick={() => onUpdateWire(selectedWire.id, { style: 'routed' as WireStyle })}
            >
              Tidy Route
            </button>
            <button
              type="button"
              className={`btn btn-sm ${selectedWire.style === 'direct' ? 'btn-accent' : ''}`}
              onClick={() => onUpdateWire(selectedWire.id, { style: 'direct' as WireStyle })}
            >
              Direct Taut
            </button>
            <button
              type="button"
              className={`btn btn-sm ${selectedWire.style === 'arched' ? 'btn-accent' : ''}`}
              onClick={() => onUpdateWire(selectedWire.id, { style: 'arched' as WireStyle })}
            >
              Arched Jumper
            </button>
          </div>

          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 2 }}>
            <button
              type="button"
              className={`btn btn-sm ${routingWireId === selectedWire.id ? 'btn-accent' : ''}`}
              onClick={() =>
                onToggleRouteByHand(routingWireId === selectedWire.id ? null : selectedWire.id)
              }
            >
              {routingWireId === selectedWire.id ? 'Done routing' : 'Route by hand'}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                onToggleRouteByHand(null);
                onUpdateWire(selectedWire.id, { waypoints: [] });
              }}
            >
              Clear route
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                onUpdateWire(selectedWire.id, {
                  waypoints: [],
                  clearanceCm: Number((((selectedWire.clearanceCm ?? 0.45) + 0.35) % 1.8 + 0.25).toFixed(2)),
                })
              }
            >
              <RefreshCw size={11} /> Lay out again
            </button>
          </div>

          <button
            type="button"
            className="btn"
            style={{ justifyContent: 'center', color: 'var(--red)', borderColor: 'rgba(220,38,38,0.4)', marginTop: 4 }}
            onClick={onDeleteSelected}
          >
            <Trash2 size={13} /> Delete wire
          </button>
        </div>
      )}

      {/* Contextual Component Inspector */}
      {selectedComp && (
        <div className="budget-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 13 }}>{selectedComp.label}</strong>
            <span className="pill">{getPartSpec(selectedComp.kind).massGrams} g</span>
          </div>

          <input
            type="text"
            className="search-box"
            aria-label="Component Label"
            value={selectedComp.label}
            onChange={(ev) => onUpdateComponent(selectedComp.id, { label: ev.target.value })}
          />

          <div className="num-grid">
            <label className="num-field">
              X (mm)
              <input
                type="number"
                step={5}
                value={Math.round(selectedComp.position[0] * 10)}
                onChange={(ev) => updatePosMm(selectedComp, 0, Number(ev.target.value))}
              />
            </label>
            <label className="num-field">
              Lift Z (mm)
              <input
                type="number"
                step={2}
                value={Math.round(selectedComp.position[1] * 10)}
                onChange={(ev) => updatePosMm(selectedComp, 1, Number(ev.target.value))}
              />
            </label>
            <label className="num-field">
              Y (mm)
              <input
                type="number"
                step={5}
                value={Math.round(selectedComp.position[2] * 10)}
                onChange={(ev) => updatePosMm(selectedComp, 2, Number(ev.target.value))}
              />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                onUpdateComponent(selectedComp.id, {
                  rotationY: selectedComp.rotationY + Math.PI / 12,
                })
              }
            >
              <RotateCw size={11} /> +15°
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => onDuplicateComponent(selectedComp.id)}
            >
              <Copy size={11} /> Duplicate
            </button>
            <button
              type="button"
              className="btn btn-sm"
              style={{ color: 'var(--red)', borderColor: 'rgba(220,38,38,0.4)' }}
              onClick={onDeleteSelected}
            >
              <Trash2 size={11} /> Delete
            </button>
          </div>

          {getPartSpec(selectedComp.kind).pins.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                PINOUT &amp; LIVE NET VOLTAGES
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 150, overflowY: 'auto' }}>
                {getPartSpec(selectedComp.kind).pins.map((p) => {
                  const net = analysis.pinToNet.get(pinKey({ componentId: selectedComp.id, pinId: p.id }));
                  const vStr = net?.isGround
                    ? '0.0 V GND'
                    : net?.voltage !== null && net?.voltage !== undefined
                      ? `${net.voltage.toFixed(1)} V`
                      : net && net.pins.length > 1
                        ? net.id
                        : 'Open';
                  return (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 11,
                        fontFamily: 'var(--font-mono)',
                        padding: '2px 5px',
                        borderRadius: 4,
                        background: 'var(--bg-panel)',
                      }}
                    >
                      <span>{p.label}</span>
                      <span style={{ color: vStr === 'Open' ? 'var(--text-muted)' : 'var(--accent-strong)' }}>
                        {vStr}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {!selectedWire && !selectedComp && (
        <div className="part-meta" style={{ padding: '4px 2px' }}>
          Select a part or a wire on the 3D bench to inspect cable cut-length, color, mm coordinates, or pins.
        </div>
      )}

      {/* Collapsible Circuit Checks Accordion */}
      <div className="budget-card">
        <button
          type="button"
          onClick={() => setChecksOpen((o) => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            width: '100%',
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {checksOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Circuit checks
          </span>
          <span
            className={
              analysis.hasCriticalFault || analysis.hasError
                ? 'pill pill-err'
                : analysis.diagnostics.length > 0
                  ? 'pill pill-warn'
                  : 'pill pill-ok'
            }
          >
            {analysis.diagnostics.length === 0 ? 'All clear' : `${analysis.diagnostics.length} issues`}
          </span>
        </button>

        {checksOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            {analysis.diagnostics.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--green)' }}>
                <CheckCircle2 size={14} />
                <span>No electrical rule issues found. Verify physically with a multimeter before powering hardware.</span>
              </div>
            ) : (
              analysis.diagnostics.map((d) => (
                <div key={d.id} className={`diag-card diag-${d.severity}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700, fontSize: 11.5 }}>
                    {severityIcon(d.severity)}
                    <span>{d.title}</span>
                  </div>
                  <div className="part-meta">{d.detail}</div>
                  <div className="part-meta" style={{ color: 'var(--accent-strong)', fontWeight: 500 }}>
                    Fix: {d.fix}
                  </div>
                  {d.componentIds.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
                      {d.componentIds.map((cid) => (
                        <button key={cid} type="button" className="btn btn-sm" onClick={() => onSelectComponent(cid)}>
                          Select {cid}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
