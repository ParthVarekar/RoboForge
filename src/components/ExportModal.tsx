import { useState } from 'react';
import type React from 'react';
import { Check, Copy, Download, X } from 'lucide-react';
import { getPartSpec } from '../catalog/partsCatalog';
import type { CircuitAnalysis } from '../engine/circuit';
import { buildRoboForgeBridgeSpec } from '../engine/roboforgeExport';
import { serializeStudioProject, type StudioProject } from '../schema/projectSchema';

export interface ExportModalProps {
  project: StudioProject;
  analysis: CircuitAnalysis;
  onClose: () => void;
}

/**
 * "Build it for real" manufacturing sheet & RoboForge export modal displaying:
 * 1) Full BOM with estimated unit/total costs & Wire Harness Cut-List (routed + cut lengths in mm)
 * 2) RoboForge Bridge Spec JSON (`simlab/` + `/rover`)
 * 3) Complete Studio Project JSON.
 */
export function ExportModal({ project, analysis, onClose }: ExportModalProps): React.ReactElement {
  const [tab, setTab] = useState<'build' | 'bridge' | 'project'>('build');
  const [copied, setCopied] = useState(false);

  // Aggregate BOM quantities by component kind
  const bomMap = new Map<string, { name: string; qty: number; massG: number; unitUsd: number; rfId: string }>();
  for (const c of project.components) {
    const spec = getPartSpec(c.kind);
    const prev = bomMap.get(c.kind);
    if (prev) {
      prev.qty += 1;
    } else {
      bomMap.set(c.kind, {
        name: spec.name,
        qty: 1,
        massG: spec.massGrams,
        unitUsd: spec.unitPriceUsd,
        rfId: spec.roboforgePartId,
      });
    }
  }
  const bomRows = [...bomMap.values()];

  const totalWireMm = [...analysis.wireMetrics.values()].reduce((acc, m) => acc + m.cutMm, 0);

  const jsonPayload =
    tab === 'bridge'
      ? JSON.stringify(buildRoboForgeBridgeSpec(project, analysis), null, 2)
      : serializeStudioProject(project);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(jsonPayload);
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch {
      const ta = document.createElement('textarea');
      ta.value = jsonPayload;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = () => {
    const blob = new Blob([jsonPayload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      tab === 'bridge'
        ? 'roboforge-bridge-spec.json'
        : `${project.name.toLowerCase().replace(/\W+/g, '_')}.studio.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(ev) => ev.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 14px',
            borderBottom: '1px solid var(--border)',
            fontWeight: 700,
          }}
        >
          <span>Build It For Real — BOM, Wire Cut-List &amp; RoboForge Bridge</span>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            <X size={13} /> Close
          </button>
        </div>

        <div className="tabs-bar">
          <button
            type="button"
            className={`tab-btn ${tab === 'build' ? 'active' : ''}`}
            onClick={() => setTab('build')}
          >
            BOM &amp; Wire Cut-List
          </button>
          <button
            type="button"
            className={`tab-btn ${tab === 'bridge' ? 'active' : ''}`}
            onClick={() => setTab('bridge')}
          >
            RoboForge Bridge Spec
          </button>
          <button
            type="button"
            className={`tab-btn ${tab === 'project' ? 'active' : ''}`}
            onClick={() => setTab('project')}
          >
            Project JSON
          </button>
        </div>

        {tab === 'build' ? (
          <div className="panel-scroll" style={{ maxHeight: '62vh' }}>
            <div className="budget-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <div className="metric-box">
                <div className="metric-label">Total Mass</div>
                <div className="metric-val">{analysis.budget.totalMassGrams} g</div>
              </div>
              <div className="metric-box">
                <div className="metric-label">Est. Parts Cost</div>
                <div className="metric-val">${analysis.budget.totalCostUsd.toFixed(2)}</div>
              </div>
              <div className="metric-box">
                <div className="metric-label">Total Wire Cut</div>
                <div className="metric-val">{(totalWireMm / 1000).toFixed(2)} m</div>
              </div>
              <div className="metric-box">
                <div className="metric-label">Est. Runtime</div>
                <div className="metric-val">
                  {analysis.budget.estimatedRuntimeMin !== null
                    ? `~${analysis.budget.estimatedRuntimeMin} min`
                    : '—'}
                </div>
              </div>
            </div>

            <div style={{ fontWeight: 700, fontSize: 12, marginTop: 4 }}>
              1. Bill of Materials ({project.components.length} items)
            </div>
            <table className="bom-table">
              <thead>
                <tr>
                  <th>Part</th>
                  <th>Qty</th>
                  <th>Mass</th>
                  <th>Est. Unit</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {bomRows.map((row) => (
                  <tr key={row.rfId}>
                    <td>{row.name}</td>
                    <td>{row.qty}</td>
                    <td>{row.massG * row.qty} g</td>
                    <td>${row.unitUsd.toFixed(2)}</td>
                    <td style={{ fontWeight: 600 }}>${(row.unitUsd * row.qty).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ fontWeight: 700, fontSize: 12, marginTop: 8 }}>
              2. Wire Harness Cut-List ({project.wires.length} cables, includes +30 mm strip slack)
            </div>
            <table className="bom-table">
              <thead>
                <tr>
                  <th>Color</th>
                  <th>From Pin</th>
                  <th>To Pin</th>
                  <th>Routed</th>
                  <th>Cut Length</th>
                </tr>
              </thead>
              <tbody>
                {project.wires.map((w) => {
                  const m = analysis.wireMetrics.get(w.id);
                  return (
                    <tr key={w.id}>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 12,
                            height: 12,
                            borderRadius: 3,
                            background: w.color,
                            border: '1px solid var(--border-strong)',
                          }}
                        />
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>
                        {w.from.componentId}.{w.from.pinId}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>
                        {w.to.componentId}.{w.to.pinId}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{m?.routedMm ?? 0} mm</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                        {m?.cutMm ?? 0} mm
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="part-meta" style={{ marginTop: 4 }}>
              All masses, prices, wire lengths, and runtimes are datasheet estimates from the simulated bench.
              Verify continuity and polarity on physical hardware before applying battery power.
            </div>
          </div>
        ) : (
          <pre className="modal-pre">{jsonPayload}</pre>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '10px 14px',
            borderTop: '1px solid var(--border)',
          }}
        >
          {tab !== 'build' && (
            <>
              <button type="button" className="btn" onClick={handleCopy}>
                {copied ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy JSON'}
              </button>
              <button type="button" className="btn btn-run" onClick={handleDownload}>
                <Download size={14} /> Download JSON
              </button>
            </>
          )}
          {tab === 'build' && (
            <button type="button" className="btn btn-accent" onClick={() => setTab('bridge')}>
              View RoboForge Bridge JSON →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
