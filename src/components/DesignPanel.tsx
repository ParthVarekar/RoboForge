import { Bot, Download, Hammer, Pause, Play, RotateCcw, Send, SkipForward, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { getPartSpec } from '../catalog/partsCatalog';
import { analyzeCircuit } from '../engine/circuit';
import { assemble, bomCsv, bomMarkdown, footprint, type AssembledBuild } from '../engine/design/assemble';
import { aiStatus, designTurn, type ChatMessage } from '../engine/design/designChat';
import { partLabel } from '../engine/design/offline';
import { PLATFORM_INFO, type BuildPlan } from '../engine/design/plan';

/**
 * The Design tab: a short chat about what to build, the blueprint of the assembled result (top view, parts list,
 * power, pins, notes) and the Build button that assembles it on the bench step by step.
 */

export interface BuildPlayback {
  step: number;
  total: number;
  label: string;
  paused: boolean;
}

export interface DesignPanelProps {
  playback: BuildPlayback | null;
  onBuild: (build: AssembledBuild) => void;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
}

const EXAMPLES = [
  'A rover that avoids walls and shows the distance on a screen',
  'A desk gadget with a 16x2 LCD, two buttons and a status light',
  'You pick: a robot car for exploring a room',
  'An FPV quadcopter',
];

const KIND_COLOR: Record<string, string> = {
  esp32_devkit: '#334155',
  drv8833: '#b91c1c',
  battery_2s: '#2563eb',
  lm2596_buck: '#1d4ed8',
  cap_1000uf: '#1f2937',
  hcsr04: '#0284c7',
  mpu6050: '#1d4f9e',
  oled_ssd1306: '#0f172a',
  lcd1602_i2c: '#15803d',
  lcd2004_i2c: '#15803d',
  esp32_cam: '#111827',
  led_5mm: '#22c55e',
  tactile_button: '#52525b',
  resistor_10k: '#a16207',
  wire_splice: '#64748b',
};

function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Top view of the assembled build: every part's footprint, the deck outline for a rover. */
function BlueprintView({ build }: { build: AssembledBuild }): React.ReactElement {
  const parts = build.project.components.filter((c) => c.kind !== 'chassis_2wd' && c.kind !== 'frame_quad_5in');
  const rects = parts.map((c) => ({ c, r: footprint(c.kind, c.position, c.rotationY) }));
  const deck = build.project.components.find((c) => c.kind === 'chassis_2wd' || c.kind === 'frame_quad_5in');
  const all = rects.map((x) => x.r);
  if (deck) all.push(footprint(deck.kind, deck.position, deck.rotationY));
  const x0 = Math.min(...all.map((r) => r.x0)) - 1;
  const x1 = Math.max(...all.map((r) => r.x1)) + 1;
  const z0 = Math.min(...all.map((r) => r.z0)) - 1;
  const z1 = Math.max(...all.map((r) => r.z1)) + 1;
  const deckR = deck ? footprint(deck.kind, deck.position, deck.rotationY) : null;
  return (
    <svg className="design-blueprint" viewBox={`${x0} ${z0} ${x1 - x0} ${z1 - z0}`} role="img" aria-label="Top view of the planned build">
      <defs>
        <pattern id="bp-grid" width="1" height="1" patternUnits="userSpaceOnUse">
          <path d="M 1 0 L 0 0 0 1" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="0.03" />
        </pattern>
      </defs>
      <rect x={x0} y={z0} width={x1 - x0} height={z1 - z0} fill="url(#bp-grid)" />
      {deckR && <rect x={deckR.x0} y={deckR.z0} width={deckR.x1 - deckR.x0} height={deckR.z1 - deckR.z0} rx={0.6} fill="currentColor" fillOpacity={0.06} stroke="currentColor" strokeOpacity={0.35} strokeWidth={0.06} />}
      {rects.map(({ c, r }) =>
        c.kind === 'wire_splice' ? (
          <circle key={c.id} cx={c.position[0]} cy={c.position[2]} r={0.28} fill={KIND_COLOR[c.kind]} />
        ) : (
          <g key={c.id}>
            <rect x={r.x0} y={r.z0} width={r.x1 - r.x0} height={r.z1 - r.z0} rx={0.15} fill={KIND_COLOR[c.kind] ?? '#64748b'} fillOpacity={0.82} />
            {r.x1 - r.x0 > 2.2 && (
              <text x={(r.x0 + r.x1) / 2} y={(r.z0 + r.z1) / 2} fontSize={0.62} textAnchor="middle" dominantBaseline="middle" fill="#f8fafc">
                {getPartSpec(c.kind).shortName}
              </text>
            )}
          </g>
        ),
      )}
      <text x={x0 + 0.4} y={z0 + 0.8} fontSize={0.6} fill="currentColor" fillOpacity={0.55}>
        front ↑
      </text>
    </svg>
  );
}

export function DesignPanel({ playback, onBuild, onPause, onResume, onSkip }: DesignPanelProps): React.ReactElement {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', text: 'Tell me what you want to build: what it should do, and any parts you already have. Keep it short; I may ask one or two things, then I draw up the blueprint and parts list.' },
  ]);
  const [plan, setPlan] = useState<BuildPlan | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [useAi, setUseAi] = useState(true);
  const [aiReady, setAiReady] = useState<{ configured: boolean; model?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let live = true;
    void aiStatus().then((s) => {
      if (live) setAiReady(s);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const build = useMemo(() => (plan ? assemble(plan) : null), [plan]);
  const analysis = useMemo(() => (build ? analyzeCircuit(build.project) : null), [build]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setInput('');
    setNotice(null);
    const history = messages.slice(1);
    setMessages((m) => [...m, { role: 'user', text: t }]);
    setBusy(true);
    try {
      const res = await designTurn(history, t, plan, useAi);
      setMessages((m) => [...m, { role: 'assistant', text: res.reply }]);
      if (res.notice) setNotice(res.notice);
      if (res.plan) setPlan(res.plan);
    } finally {
      setBusy(false);
    }
  };

  const removePart = (kind: string) => {
    if (!plan) return;
    setPlan({ ...plan, parts: plan.parts.filter((p) => p.kind !== kind) });
    setMessages((m) => [...m, { role: 'assistant', text: `Removed the ${partLabel(kind)}.` }]);
  };

  const reset = () => {
    setPlan(null);
    setNotice(null);
    setMessages((m) => [m[0]!]);
  };

  const cost = build ? build.bom.reduce((s, b) => s + b.unitPriceUsd * b.qty, 0) : 0;
  const mass = build ? build.bom.reduce((s, b) => s + b.massGrams * b.qty, 0) : 0;
  const issues = analysis ? analysis.diagnostics.filter((d) => d.severity !== 'info') : [];
  const building = playback !== null && playback.step < playback.total;

  return (
    <div className="panel-scroll design-panel">
      <div className="design-head">
        <Sparkles size={14} color="var(--accent)" />
        <span>Design with AI</span>
        <label className="design-ai-toggle" title={aiReady?.configured ? `AI model: ${aiReady.model ?? ''}` : 'No OpenRouter key on the dev server: the built-in planner answers'}>
          <input type="checkbox" checked={useAi && Boolean(aiReady?.configured)} disabled={!aiReady?.configured} onChange={(e) => setUseAi(e.target.checked)} />
          {aiReady?.configured ? 'AI' : 'AI off (no key)'}
        </label>
      </div>

      <div className="design-log" ref={logRef}>
        {messages.map((m, i) => (
          <div key={i} className={`design-msg ${m.role}`}>
            {m.role === 'assistant' && <Bot size={12} />}
            <span>{m.text}</span>
          </div>
        ))}
        {busy && <div className="design-msg assistant thinking">Thinking…</div>}
        {messages.length === 1 && (
          <div className="design-examples">
            {EXAMPLES.map((e) => (
              <button key={e} type="button" className="btn btn-sm" onClick={() => void send(e)}>
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
      {notice && <div className="design-notice">{notice}</div>}

      <form
        className="design-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <textarea
          value={input}
          rows={2}
          placeholder={plan ? 'Change it: "add a button", "use an LCD instead"…' : 'What should it do?'}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
        />
        <button type="submit" className="btn btn-accent" disabled={busy || !input.trim()} aria-label="Send">
          <Send size={13} />
        </button>
      </form>

      {build && plan && (
        <div className="design-card">
          <div className="design-card-title">
            <strong>{build.project.name}</strong>
            <span className="pill">{PLATFORM_INFO[plan.platform].name}</span>
          </div>
          <BlueprintView build={build} />

          {playback ? (
            <div className="design-progress">
              <div className="design-progress-bar">
                <span style={{ width: `${Math.round((100 * playback.step) / Math.max(1, playback.total))}%` }} />
              </div>
              <div className="design-progress-row">
                <span>{building ? `${playback.step}/${playback.total} · ${playback.label}` : `Built: ${playback.total} steps`}</span>
                {building && (
                  <span style={{ display: 'flex', gap: 4 }}>
                    <button type="button" className="btn btn-sm" onClick={playback.paused ? onResume : onPause}>
                      {playback.paused ? <Play size={12} /> : <Pause size={12} />}
                    </button>
                    <button type="button" className="btn btn-sm" onClick={onSkip} title="Finish now">
                      <SkipForward size={12} />
                    </button>
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="design-actions">
              <button type="button" className="btn btn-run" onClick={() => onBuild(build)}>
                <Hammer size={13} /> Build on the bench
              </button>
              <button type="button" className="btn btn-sm" onClick={reset} title="Start a new design">
                <RotateCcw size={12} />
              </button>
            </div>
          )}

          <div className="design-section">Parts list</div>
          <table className="design-bom">
            <tbody>
              {build.bom.map((b) => (
                <tr key={b.kind}>
                  <td className="qty">{b.qty}×</td>
                  <td>
                    <div>{b.name}</div>
                    <div className="why">
                      <span className={`src src-${b.source}`}>{b.source === 'asked' ? 'asked for' : b.source === 'platform' ? 'platform' : 'needed'}</span> {b.why}
                    </div>
                  </td>
                  <td className="num">${(b.unitPriceUsd * b.qty).toFixed(2)}</td>
                  <td>
                    {b.source === 'asked' && !playback && (
                      <button type="button" className="icon-x" title={`Remove the ${partLabel(b.kind)}`} onClick={() => removePart(b.kind)}>
                        <X size={11} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="design-totals">
            <span>
              ≈ ${cost.toFixed(2)} · {mass} g
            </span>
            {analysis?.budget.estimatedRuntimeMin !== null && analysis?.budget.estimatedRuntimeMin !== undefined && <span>~{analysis.budget.estimatedRuntimeMin} min on the battery</span>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn btn-sm" onClick={() => download(`${build.project.name.replace(/[^\w-]+/g, '_')}_parts.md`, bomMarkdown(build), 'text/markdown')}>
              <Download size={12} /> Parts list (.md)
            </button>
            <button type="button" className="btn btn-sm" onClick={() => download(`${build.project.name.replace(/[^\w-]+/g, '_')}_parts.csv`, bomCsv(build), 'text/csv')}>
              <Download size={12} /> CSV
            </button>
          </div>

          <div className="design-section">Pins</div>
          <ul className="design-list">
            {build.pins.map((p) => (
              <li key={p.what}>
                <strong>{p.what}:</strong> {p.pin}
              </li>
            ))}
          </ul>

          {(build.dropped.length > 0 || build.notes.length > 1 || issues.length > 0) && (
            <>
              <div className="design-section">Notes</div>
              <ul className="design-list notes">
                {build.dropped.map((d, i) => (
                  <li key={`d${i}`}>
                    Left out the {partLabel(d.kind)}: {d.reason}.
                  </li>
                ))}
                {build.notes.slice(1).map((n) => (
                  <li key={n}>{n}</li>
                ))}
                {issues.map((d) => (
                  <li key={d.id}>Circuit check: {d.title}</li>
                ))}
              </ul>
            </>
          )}
          <div className="design-foot">
            Layout, pins and wires are worked out by rules, not by the AI. The starter sketch goes into the Code tab when the build is placed. Checked in the
            simulator only.
          </div>
        </div>
      )}
    </div>
  );
}
