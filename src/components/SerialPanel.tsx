import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { Send, Trash2 } from 'lucide-react';
import type { SerialEntry } from '../engine/runtime';

export interface SerialPanelProps {
  entries: SerialEntry[];
  onClear: () => void;
  onSendInput: (text: string) => void;
}

function levelColor(level: SerialEntry['level']): string {
  if (level === 'error') return '#f87171';
  if (level === 'warn') return '#fbbf24';
  if (level === 'rx') return '#38bdf8';
  return '#e2e8f0';
}

/**
 * Right-dock Serial Monitor showing live timestamped ESP32 Serial output and command input.
 */
export function SerialPanel({
  entries,
  onClear,
  onSendInput,
}: SerialPanelProps): React.ReactElement {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [entries.length]);

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    onSendInput(trimmed);
    setInput('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>
          SERIAL MONITOR · 115200 BAUD
        </span>
        <button type="button" className="btn btn-sm" onClick={onClear}>
          <Trash2 size={12} /> Clear
        </button>
      </div>

      <div className="serial-log">
        {entries.length === 0 ? (
          <div style={{ color: 'var(--text-muted)' }}>
            Press &quot;Run Sketch&quot; to start the virtual ESP32 and view Serial.println() output.
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="serial-row">
              <span className="serial-ts">[{String(entry.timeMs).padStart(6, ' ')} ms]</span>
              <span style={{ color: levelColor(entry.level), wordBreak: 'break-word' }}>
                {entry.text}
              </span>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <form className="serial-input-row" onSubmit={submit}>
        <input
          type="text"
          className="search-box"
          placeholder="Send serial command (e.g. f, b, l, r, s)..."
          value={input}
          onChange={(ev) => setInput(ev.target.value)}
        />
        <button type="submit" className="btn">
          <Send size={13} />
          Send
        </button>
      </form>
    </div>
  );
}
