import { useEffect, useState } from 'react';
import type React from 'react';
import { CheckCircle2, Circle, Plus } from 'lucide-react';
import { PART_CATEGORIES, PARTS_CATALOG, type PartCategory } from '../catalog/partsCatalog';
import { getPartThumbnailSvg } from '../catalog/partThumbnails';
import type { CircuitAnalysis } from '../engine/circuit';
import type { ComponentKind } from '../schema/projectSchema';
import { cancelPartThumbnail, requestPartThumbnail } from '../viewport/partPreview';

/** Render of the part's real 3D model; the flat icon shows until it is ready, or stays if WebGL is unavailable. */
function PartThumb({ kind, alt }: { kind: ComponentKind; alt: string }): React.ReactElement {
  const [src, setSrc] = useState(() => getPartThumbnailSvg(kind));
  useEffect(() => {
    const onReady = (url: string) => setSrc(url);
    const hit = requestPartThumbnail(kind, onReady);
    if (hit) setSrc(hit);
    return () => cancelPartThumbnail(kind, onReady);
  }, [kind]);
  return <img src={src} alt={alt} className="part-thumb" draggable={false} />;
}

/** Drag-and-drop type carrying a part kind from the list to the 3D bench. */
export const PART_DRAG_TYPE = 'application/x-roboforge-part';

/** Starts dragging a part card: the part kind travels with the drag, and the thumbnail is the drag image. */
function startPartDrag(ev: React.DragEvent<HTMLDivElement>, kind: ComponentKind): void {
  ev.dataTransfer.setData(PART_DRAG_TYPE, kind);
  ev.dataTransfer.effectAllowed = 'copy';
  const img = ev.currentTarget.querySelector('img');
  if (img) ev.dataTransfer.setDragImage(img, img.width / 2, img.height / 2);
}

export interface PartsPanelProps {
  analysis: CircuitAnalysis;
  onAddPart: (kind: ComponentKind) => void;
}

type LeftTab = 'parts' | 'shapes' | 'tasks';

/**
 * Left CAD sidebar with three tabs: searchable hardware Parts (with rendered 3D thumbnails,
 * SIMULATED badge, and unit pricing), structural CAD Shapes, and live Bringup Tasks.
 */
export function PartsPanel({ analysis, onAddPart }: PartsPanelProps): React.ReactElement {
  const [tab, setTab] = useState<LeftTab>('parts');
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState<PartCategory | 'All'>('All');
  const [simulatedOnly, setSimulatedOnly] = useState(false);

  const hardwareParts = Object.values(PARTS_CATALOG).filter((p) => p.category !== 'CAD Shapes');
  const shapeParts = Object.values(PARTS_CATALOG).filter((p) => p.category === 'CAD Shapes');

  const filteredParts = hardwareParts.filter((part) => {
    if (simulatedOnly && !part.simulated) return false;
    const matchesCat = activeCat === 'All' || part.category === activeCat;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      part.name.toLowerCase().includes(q) ||
      part.description.toLowerCase().includes(q) ||
      part.category.toLowerCase().includes(q);
    return matchesCat && matchesQuery;
  });

  const doneTasks = analysis.checklist.filter((t) => t.done).length;
  const totalTasks = analysis.checklist.length;

  return (
    <aside className="side-panel">
      <div className="tabs-bar">
        <button
          type="button"
          className={`tab-btn ${tab === 'parts' ? 'active' : ''}`}
          onClick={() => setTab('parts')}
        >
          Parts
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === 'shapes' ? 'active' : ''}`}
          onClick={() => setTab('shapes')}
        >
          Shapes
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === 'tasks' ? 'active' : ''}`}
          onClick={() => setTab('tasks')}
        >
          Tasks{' '}
          <span className={doneTasks === totalTasks ? 'pill pill-ok' : 'pill'}>
            {doneTasks}/{totalTasks}
          </span>
        </button>
      </div>

      {tab === 'parts' && (
        <div className="panel-scroll">
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Click a component to add it, or drag it onto the 3D bench.
          </div>

          <input
            type="text"
            className="search-box"
            placeholder="Search parts: ESP32, OLED, motor..."
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
          />

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <button
              type="button"
              className={`btn btn-sm ${activeCat === 'All' ? 'btn-accent' : ''}`}
              onClick={() => setActiveCat('All')}
            >
              All {hardwareParts.length}
            </button>
            {PART_CATEGORIES.filter((c) => c !== 'CAD Shapes').map((cat) => (
              <button
                key={cat}
                type="button"
                className={`btn btn-sm ${activeCat === cat ? 'btn-accent' : ''}`}
                onClick={() => setActiveCat(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={simulatedOnly}
              onChange={(ev) => setSimulatedOnly(ev.target.checked)}
            />
            Simulated only
          </label>

          {filteredParts.map((part) => (
            <div
              key={part.kind}
              className="part-card"
              role="button"
              tabIndex={0}
              draggable
              onDragStart={(ev) => startPartDrag(ev, part.kind)}
              title="Click to add, or drag onto the bench"
              onClick={() => onAddPart(part.kind)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') onAddPart(part.kind);
              }}
            >
              <PartThumb kind={part.kind} alt={part.name} />
              <div className="part-card-top">
                <span>{part.name}</span>
                <Plus size={13} color="var(--accent)" />
              </div>
              <div className="part-meta">{part.description}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                <span className="pill" title={part.simulated ? 'Runs in the simulator' : part.pins.length ? 'Wired and checked by the circuit check; its behaviour is not simulated yet' : 'Structure only'}>
                  {part.simulated ? 'SIMULATED' : part.pins.length ? 'WIRING ONLY' : 'MECHANICAL'}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600 }}>
                  ${part.unitPriceUsd.toFixed(2)} · {part.massGrams}g
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'shapes' && (
        <div className="panel-scroll">
          <div className="budget-card">
            <div style={{ fontSize: 11, fontWeight: 700 }}>LIVE BUILD SUMMARY</div>
            <div className="budget-grid">
              <div className="metric-box">
                <div className="metric-label">Total Mass</div>
                <div className="metric-val">{analysis.budget.totalMassGrams} g</div>
              </div>
              <div className="metric-box">
                <div className="metric-label">Est. Cost</div>
                <div className="metric-val">${analysis.budget.totalCostUsd.toFixed(0)}</div>
              </div>
              <div className="metric-box">
                <div className="metric-label">Est. Runtime</div>
                <div className="metric-val">
                  {analysis.budget.estimatedRuntimeMin !== null
                    ? `~${analysis.budget.estimatedRuntimeMin} min`
                    : '—'}
                </div>
              </div>
              <div className="metric-box">
                <div className="metric-label">CoM Offset</div>
                <div className="metric-val" style={{ fontSize: 11 }}>
                  {(analysis.budget.comCm[0] * 10).toFixed(0)}, {(analysis.budget.comCm[2] * 10).toFixed(0)} mm
                </div>
              </div>
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Add structural plates, anodized standoffs, and custom printable mounting blocks:
          </div>

          {shapeParts.map((part) => (
            <div
              key={part.kind}
              className="part-card"
              role="button"
              tabIndex={0}
              draggable
              onDragStart={(ev) => startPartDrag(ev, part.kind)}
              title="Click to add, or drag onto the bench"
              onClick={() => onAddPart(part.kind)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') onAddPart(part.kind);
              }}
            >
              <PartThumb kind={part.kind} alt={part.name} />
              <div className="part-card-top">
                <span>{part.name}</span>
                <Plus size={13} color="var(--accent)" />
              </div>
              <div className="part-meta">{part.description}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'tasks' && (
        <div className="panel-scroll">
          <div className="budget-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700 }}>BRINGUP CHECKLIST</span>
              <span className={doneTasks === totalTasks ? 'pill pill-ok' : 'pill pill-warn'}>
                {doneTasks} / {totalTasks} DONE
              </span>
            </div>
            <div className="part-meta">
              Updates live as you wire power, sensors, motor channels, and resolve circuit checks.
            </div>
          </div>

          {analysis.checklist.map((item) => (
            <div
              key={item.id}
              className="diag-card"
              style={{
                borderColor: item.done ? 'rgba(22,163,74,0.35)' : undefined,
                background: item.done ? 'rgba(22,163,74,0.06)' : undefined,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600 }}>
                {item.done ? (
                  <CheckCircle2 size={15} color="#16a34a" />
                ) : (
                  <Circle size={15} color="#94a3b8" />
                )}
                <span>{item.label}</span>
              </div>
              {!item.done && <div className="part-meta" style={{ paddingLeft: 22 }}>{item.hint}</div>}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
