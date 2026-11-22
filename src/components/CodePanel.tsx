import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { AlertTriangle, Check, CheckCircle2, Maximize2, Minimize2, Play, Square, XCircle } from 'lucide-react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { SKETCH_TEMPLATES } from '../catalog/presets';
import { transpileArduinoSketch, type SketchProblem } from '../engine/sketchTranspiler';
import type { ConfirmRequest } from './ConfirmDialog';
import { registerSketchLanguage } from './sketchLanguage';

// Monaco runs fully offline from Vite's local worker bundle
const monacoEnv = self as unknown as { MonacoEnvironment?: { getWorker: () => Worker } };
if (!monacoEnv.MonacoEnvironment) {
  monacoEnv.MonacoEnvironment = { getWorker: () => new editorWorker() };
}

export interface CodePanelProps {
  code: string;
  theme: 'light' | 'dark';
  /** Kept mounted while another tab is shown, so undo history, cursor and scroll survive tab switches. */
  hidden: boolean;
  isRunning: boolean;
  /** Fault from the last run, with its sketch line. Cleared from view as soon as the code is edited. */
  runtimeProblem: SketchProblem | null;
  /** A message without a sketch line (a run blocked by the circuit check, a failed import). */
  notice: string | null;
  savedAt: number | null;
  wide: boolean;
  /** Bumped by the app (Ctrl+S outside the editor) to verify now. */
  verifyRequest: number;
  onChangeCode: (nextCode: string) => void;
  onRun: () => void;
  onStop: () => void;
  onSave: () => void;
  onToggleWide: () => void;
  onConfirm: (request: ConfirmRequest) => void;
}

const LINT_DELAY_MS = 450;
const ESCAPE_CONTEXT = '!suggestWidgetVisible && !findWidgetVisible && !parameterHintsVisible && !inSnippetMode && !renameInputVisible';

function markerSeverity(p: SketchProblem): monaco.MarkerSeverity {
  return p.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning;
}

/**
 * Sketch editor: Monaco with app-matched themes, live checking (squiggles and a Problems list with exact lines),
 * Verify / Run / Stop with keyboard shortcuts, undoable example loading, a status bar, and autocomplete, hover and
 * parameter help for the virtual ESP32's API.
 */
export function CodePanel(props: CodePanelProps): React.ReactElement {
  // onChangeCode, onRun, onStop and onSave are read through `cb` so the editor's commands always use the latest ones
  const { code, theme, hidden, isRunning, runtimeProblem, notice, savedAt, wide, verifyRequest, onConfirm, onToggleWide } = props;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const suppressRef = useRef(false);
  const lintTimer = useRef<number | null>(null);
  const [lint, setLint] = useState<SketchProblem[]>([]);
  const [verifyState, setVerifyState] = useState<'idle' | 'ok' | 'problems'>('idle');
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [lineCount, setLineCount] = useState(1);
  const [runtimeVisible, setRuntimeVisible] = useState(false);

  // latest callbacks for editor commands registered once
  const cb = useRef(props);
  cb.current = props;

  const runLint = useCallback((text: string) => {
    const res = transpileArduinoSketch(text);
    const problems = res.ok ? res.warnings : res.problems;
    setLint(problems);
    return problems;
  }, []);

  const verify = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (lintTimer.current) window.clearTimeout(lintTimer.current);
    const problems = runLint(editor.getValue());
    setVerifyState(problems.some((p) => p.severity === 'error') ? 'problems' : 'ok');
  }, [runLint]);

  // create the editor once
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return undefined;
    registerSketchLanguage();
    const editor = monaco.editor.create(el, {
      value: cb.current.code,
      language: 'cpp',
      theme: cb.current.theme === 'dark' ? 'roboforge-dark' : 'roboforge-light',
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Cascadia Mono', Consolas, 'Courier New', monospace",
      fontSize: 13,
      lineHeight: 20,
      fontLigatures: false,
      minimap: { enabled: false },
      automaticLayout: true,
      tabSize: 2,
      insertSpaces: true,
      detectIndentation: false,
      scrollBeyondLastLine: false,
      wordWrap: 'off',
      padding: { top: 8, bottom: 8 },
      renderLineHighlight: 'all',
      bracketPairColorization: { enabled: true },
      guides: { indentation: true, bracketPairs: 'active' },
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      stickyScroll: { enabled: true },
      fixedOverflowWidgets: true,
      lineNumbersMinChars: 3,
      glyphMargin: false,
      folding: true,
      quickSuggestions: { other: true, comments: false, strings: false },
      wordBasedSuggestions: 'currentDocument',
      parameterHints: { enabled: true },
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      overviewRulerBorder: false,
      ariaLabel: 'Sketch editor',
    });
    editorRef.current = editor;
    setLineCount(editor.getModel()?.getLineCount() ?? 1);

    const content = editor.onDidChangeModelContent(() => {
      setLineCount(editor.getModel()?.getLineCount() ?? 1);
      setVerifyState('idle');
      setRuntimeVisible(false);
      if (lintTimer.current) window.clearTimeout(lintTimer.current);
      lintTimer.current = window.setTimeout(() => runLint(editor.getValue()), LINT_DELAY_MS);
      if (!suppressRef.current) cb.current.onChangeCode(editor.getValue());
    });
    const caret = editor.onDidChangeCursorPosition((e) => setCursor({ line: e.position.lineNumber, column: e.position.column }));

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      verify();
      cb.current.onSave();
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => cb.current.onRun());
    editor.addCommand(
      monaco.KeyCode.Escape,
      () => {
        if (cb.current.isRunning) cb.current.onStop();
      },
      ESCAPE_CONTEXT,
    );

    runLint(editor.getValue());
    return () => {
      if (lintTimer.current) window.clearTimeout(lintTimer.current);
      content.dispose();
      caret.dispose();
      editor.dispose();
      editorRef.current = null;
    };
    // created once; later changes reach it through the effects below and the callback ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // code changed outside the editor (preset, import, app undo): apply it as an undoable edit, not setValue
  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model || model.getValue() === code) return;
    suppressRef.current = true;
    editor.pushUndoStop();
    editor.executeEdits('external', [{ range: model.getFullModelRange(), text: code, forceMoveMarkers: true }]);
    editor.pushUndoStop();
    suppressRef.current = false;
    if (lintTimer.current) window.clearTimeout(lintTimer.current);
    runLint(code);
  }, [code, runLint]);

  useEffect(() => {
    monaco.editor.setTheme(theme === 'dark' ? 'roboforge-dark' : 'roboforge-light');
  }, [theme]);

  useEffect(() => {
    setRuntimeVisible(Boolean(runtimeProblem));
  }, [runtimeProblem]);

  useEffect(() => {
    if (verifyRequest > 0) verify();
  }, [verifyRequest, verify]);

  const problems: SketchProblem[] = [...(runtimeVisible && runtimeProblem ? [runtimeProblem] : []), ...lint];
  const errors = problems.filter((p) => p.severity === 'error').length;
  const warnings = problems.length - errors;

  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (!model) return;
    const lines = model.getLineCount();
    monaco.editor.setModelMarkers(
      model,
      'roboforge',
      problems
        .filter((p) => p.line >= 1 && p.line <= lines)
        .map((p) => {
          const maxCol = model.getLineMaxColumn(p.line);
          const startColumn = Math.min(Math.max(1, p.column), maxCol);
          const endColumn = Math.min(Math.max(p.endColumn ?? maxCol, startColumn + 1), maxCol);
          return {
            severity: markerSeverity(p),
            startLineNumber: p.line,
            startColumn: endColumn > startColumn ? startColumn : 1,
            endLineNumber: p.line,
            endColumn: endColumn > startColumn ? endColumn : maxCol,
            message: p.message,
            source: 'RoboForge',
          };
        }),
    );
    // problems is rebuilt each render; its content is what matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(problems)]);

  const goTo = (p: SketchProblem) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.revealLineInCenterIfOutsideViewport(p.line);
    editor.setPosition({ lineNumber: p.line, column: Math.max(1, p.column) });
    editor.focus();
  };

  const replaceWith = (text: string) => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) return;
    editor.pushUndoStop();
    editor.executeEdits('load-example', [{ range: model.getFullModelRange(), text, forceMoveMarkers: true }]);
    editor.pushUndoStop();
    editor.setPosition({ lineNumber: 1, column: 1 });
    editor.revealLine(1);
    editor.focus();
  };

  const loadExample = (id: string) => {
    const tpl = SKETCH_TEMPLATES.find((t) => t.id === id);
    const current = editorRef.current?.getValue() ?? code;
    if (!tpl || tpl.code === current) return;
    const untouched = SKETCH_TEMPLATES.some((t) => t.code === current) || !current.trim();
    if (untouched) replaceWith(tpl.code);
    else
      onConfirm({
        title: 'Replace the sketch?',
        message: `Load the "${tpl.label}" example in place of your current sketch? Your code is not lost: press Ctrl+Z in the editor to get it back.`,
        confirmLabel: 'Load example',
        onConfirm: () => replaceWith(tpl.code),
      });
  };

  const savedLabel = savedAt ? new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <div className="code-panel" style={{ display: hidden ? 'none' : 'flex' }}>
      <div className="code-toolbar">
        <div className="code-toolbar-group">
          <button type="button" className="btn btn-sm" title="Check the sketch (Ctrl+S)" onClick={verify}>
            <Check size={12} /> Verify
          </button>
          {isRunning ? (
            <button type="button" className="btn btn-sm btn-stop" title="Stop the sketch (Esc in the editor)" onClick={props.onStop}>
              <Square size={11} /> Stop
            </button>
          ) : (
            <button type="button" className="btn btn-sm btn-run" title="Upload and run on the virtual ESP32 (Ctrl+Enter)" onClick={props.onRun}>
              <Play size={11} /> Run
            </button>
          )}
          {verifyState === 'ok' && errors === 0 && (
            <span className="pill pill-ok" role="status">
              <CheckCircle2 size={10} /> Verified
            </span>
          )}
          {verifyState === 'problems' && errors > 0 && (
            <span className="pill pill-err" role="status">
              {errors} error{errors === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <div className="code-toolbar-group">
          <select
            className="select-input"
            aria-label="Load example sketch"
            value=""
            style={{ maxWidth: 170 }}
            onChange={(ev) => {
              loadExample(ev.target.value);
              ev.target.value = '';
            }}
          >
            <option value="" disabled>
              Load example…
            </option>
            {SKETCH_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-sm btn-icon" title={wide ? 'Narrow the editor' : 'Widen the editor'} aria-label={wide ? 'Narrow the editor' : 'Widen the editor'} onClick={onToggleWide}>
            {wide ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        </div>
      </div>

      {notice && (
        <div className="code-notice" role="alert">
          {notice}
        </div>
      )}

      <div ref={hostRef} className="code-editor-host" />

      {problems.length > 0 && (
        <div className="problems-list" role="list" aria-label="Problems">
          {problems.map((p, i) => (
            <button key={`${p.line}:${p.column}:${i}`} type="button" role="listitem" className={`problem-row ${p.severity}`} onClick={() => goTo(p)}>
              {p.severity === 'error' ? <XCircle size={12} /> : <AlertTriangle size={12} />}
              <span className="problem-line">Ln {p.line}</span>
              <span className="problem-msg">{p.message}</span>
            </button>
          ))}
        </div>
      )}

      <div className="code-status">
        <span>
          Ln {cursor.line}, Col {cursor.column}
        </span>
        <span>{lineCount} lines</span>
        <span>Spaces: 2</span>
        <span className="code-status-spacer" />
        {errors + warnings === 0 ? (
          <span className="status-ok">
            <CheckCircle2 size={11} /> No problems
          </span>
        ) : (
          <span className={errors ? 'status-err' : 'status-warn'}>
            {errors ? <XCircle size={11} /> : <AlertTriangle size={11} />} {errors} error{errors === 1 ? '' : 's'}, {warnings} warning{warnings === 1 ? '' : 's'}
          </span>
        )}
        {isRunning && <span className="status-run">● Running</span>}
        {savedLabel && <span title="Your build and sketch are saved in this browser">Saved {savedLabel}</span>}
      </div>
    </div>
  );
}
