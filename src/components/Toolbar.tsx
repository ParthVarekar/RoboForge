import type React from 'react';
import {
  Box,
  Compass,
  Cpu,
  Moon,
  OctagonAlert,
  Play,
  Redo2,
  ShieldAlert,
  ShieldCheck,
  Square,
  Sun,
  Undo2,
  Upload,
  Wrench,
} from 'lucide-react';
import { STUDIO_PRESETS } from '../catalog/presets';

export type StudioViewMode = 'workbench' | 'arena';

export interface ToolbarProps {
  mode: StudioViewMode;
  onModeChange: (mode: StudioViewMode) => void;
  presetId: string;
  onSelectPreset: (presetId: string) => void;
  isRunning: boolean;
  onRun: () => void;
  onStop: () => void;
  onEstop: () => void;
  circuitProtection: boolean;
  onToggleProtection: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenExport: () => void;
  onImportJson: (jsonText: string) => void;
}

/**
 * Precision CAD Studio top navigation bar with project selector, Undo/Redo,
 * Workbench/Arena switcher, Run/Stop/E-STOP controls, Build-for-Real modal, and theme switch.
 */
export function Toolbar({
  mode,
  onModeChange,
  presetId,
  onSelectPreset,
  isRunning,
  onRun,
  onStop,
  onEstop,
  circuitProtection,
  onToggleProtection,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  theme,
  onToggleTheme,
  onOpenExport,
  onImportJson,
}: ToolbarProps): React.ReactElement {
  const handleFileChange = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    file.text().then(onImportJson);
    ev.target.value = '';
  };

  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <div className="brand">
          <Cpu size={17} color="#0d9488" />
          <span>RoboForge Studio</span>
          <span className="brand-badge">Trial</span>
        </div>

        <button type="button" className="btn btn-sm" disabled={!canUndo} title="Undo (Ctrl+Z)" onClick={onUndo}>
          <Undo2 size={13} />
        </button>
        <button type="button" className="btn btn-sm" disabled={!canRedo} title="Redo (Ctrl+Y)" onClick={onRedo}>
          <Redo2 size={13} />
        </button>

        <select
          className="select-input"
          value={presetId}
          aria-label="Starter Preset"
          onChange={(ev) => onSelectPreset(ev.target.value)}
        >
          {STUDIO_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>

        <div className="segmented" role="tablist" aria-label="Workspace Mode">
          <button
            type="button"
            className={mode === 'workbench' ? 'active' : ''}
            onClick={() => onModeChange('workbench')}
          >
            <Box size={13} />
            Bench
          </button>
          <button
            type="button"
            className={mode === 'arena' ? 'active' : ''}
            onClick={() => onModeChange('arena')}
          >
            <Compass size={13} />
            Arena
          </button>
        </div>

        {!isRunning ? (
          <button type="button" className="btn btn-run" onClick={onRun}>
            <Play size={13} />
            Run
          </button>
        ) : (
          <button type="button" className="btn btn-stop" onClick={onStop}>
            <Square size={13} />
            Stop
          </button>
        )}

        <button type="button" className="btn btn-estop" onClick={onEstop}>
          <OctagonAlert size={13} />
          E-STOP
        </button>
      </div>

      <div className="toolbar-group">
        <button
          type="button"
          className="btn"
          title="Blocks execution when critical shorts or overvoltage exist"
          onClick={onToggleProtection}
        >
          {circuitProtection ? (
            <ShieldCheck size={13} color="#16a34a" />
          ) : (
            <ShieldAlert size={13} color="#dc2626" />
          )}
          <span>Guard: {circuitProtection ? 'ON' : 'OFF'}</span>
        </button>

        <button type="button" className="btn btn-accent" onClick={onOpenExport}>
          <Wrench size={13} />
          Build it for real
        </button>

        <label className="btn" style={{ margin: 0 }}>
          <Upload size={13} />
          Import
          <input type="file" accept=".json" hidden onChange={handleFileChange} />
        </label>

        <button
          type="button"
          className="btn btn-sm"
          title="Toggle Light / Dark CAD Theme"
          aria-label="Toggle Light or Dark Theme"
          onClick={onToggleTheme}
        >
          {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
        </button>
      </div>
    </header>
  );
}
