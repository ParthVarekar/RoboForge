import * as monaco from 'monaco-editor';
import { HAL_API, halEntry, halMember, type HalEntry } from '../engine/halApi';

/**
 * Editor support for sketches: light/dark themes that match the app, autocomplete (virtual ESP32 API, C++ words,
 * snippets), hover help and parameter hints. Registered once per page so remounting the editor never doubles them.
 */

let registered = false;

const KEYWORDS = [
  'void', 'int', 'long', 'unsigned', 'float', 'double', 'bool', 'byte', 'char', 'String', 'const', 'static', 'uint8_t', 'uint16_t',
  'uint32_t', 'int16_t', 'int32_t', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue',
  'return', 'true', 'false', 'enum',
];

const SNIPPETS: Array<{ label: string; detail: string; body: string }> = [
  { label: 'setup/loop', detail: 'Sketch skeleton', body: 'void setup() {\n\t${1:Serial.begin(115200);}\n}\n\nvoid loop() {\n\t$0\n\tdelay(${2:10});\n}' },
  { label: 'for', detail: 'Counting loop', body: 'for (int ${1:i} = 0; ${1:i} < ${2:count}; ${1:i}++) {\n\t$0\n}' },
  { label: 'while', detail: 'Loop with a pause', body: 'while (${1:condition}) {\n\t$0\n\tdelay(${2:10});\n}' },
  { label: 'if', detail: 'If statement', body: 'if (${1:condition}) {\n\t$0\n}' },
  { label: 'ifelse', detail: 'If / else', body: 'if (${1:condition}) {\n\t$2\n} else {\n\t$0\n}' },
  { label: 'switch', detail: 'Switch on a value', body: 'switch (${1:value}) {\n\tcase ${2:0}:\n\t\t$0\n\t\tbreak;\n\tdefault:\n\t\tbreak;\n}' },
  { label: 'every', detail: 'Run every N ms without blocking (needs a global unsigned long)', body: 'if (millis() - ${1:lastMs} >= ${2:500}) {\n\t${1:lastMs} = millis();\n\t$0\n}' },
  { label: 'drive', detail: 'DRV8833 motor helper (IN1/IN2 on 25/26, IN3/IN4 on 27/14)', body: 'void drive(int left, int right) {\n\tanalogWrite(25, left > 0 ? left : 0);\n\tanalogWrite(26, left < 0 ? -left : 0);\n\tanalogWrite(27, right > 0 ? right : 0);\n\tanalogWrite(14, right < 0 ? -right : 0);\n}' },
];

function docMarkdown(e: HalEntry): monaco.IMarkdownString {
  return { value: ['```cpp', e.signature, '```', e.doc, ...(e.params?.length ? ['', ...e.params.map((p) => `- \`${p.name}\`: ${p.doc}`)] : [])].join('\n') };
}

function completionKind(e: HalEntry): monaco.languages.CompletionItemKind {
  if (e.kind === 'constant') return monaco.languages.CompletionItemKind.Constant;
  if (e.kind === 'object') return monaco.languages.CompletionItemKind.Module;
  return monaco.languages.CompletionItemKind.Function;
}

function item(e: HalEntry, range: monaco.IRange): monaco.languages.CompletionItem {
  return {
    label: e.name,
    kind: completionKind(e),
    detail: e.signature,
    documentation: docMarkdown(e),
    insertText: e.kind === 'function' ? (e.snippet ?? `${e.name}()`) : e.name,
    insertTextRules: e.kind === 'function' ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
    range,
    sortText: `0_${e.name}`,
  };
}

/** Text before a position, scanning back at most `limit` characters (enough for any one call). */
function textBefore(model: monaco.editor.ITextModel, position: monaco.Position, limit = 3000): string {
  const end = model.getOffsetAt(position);
  return model.getValue().slice(Math.max(0, end - limit), end);
}

export function registerSketchLanguage(): void {
  if (registered) return;
  registered = true;

  monaco.editor.defineTheme('roboforge-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '64748b', fontStyle: 'italic' },
      { token: 'keyword', foreground: '6d28d9' },
      { token: 'keyword.directive', foreground: 'be185d' },
      { token: 'number', foreground: 'b45309' },
      { token: 'string', foreground: '15803d' },
      { token: 'delimiter', foreground: '475569' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#0f172a',
      'editorGutter.background': '#f8fafc',
      'editorLineNumber.foreground': '#94a3b8',
      'editorLineNumber.activeForeground': '#0f172a',
      'editor.lineHighlightBackground': '#f1f5f9',
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': '#99f6e480',
      'editor.inactiveSelectionBackground': '#ccfbf180',
      'editorCursor.foreground': '#0d9488',
      'editorIndentGuide.background1': '#e2e8f0',
      'editorIndentGuide.activeBackground1': '#94a3b8',
      'editorBracketMatch.background': '#99f6e455',
      'editorBracketMatch.border': '#0d9488',
      'editorWidget.background': '#ffffff',
      'editorWidget.border': '#cbd5e1',
      'editorSuggestWidget.selectedBackground': '#ccfbf1',
      'editorError.foreground': '#dc2626',
      'editorWarning.foreground': '#d97706',
      'scrollbarSlider.background': '#cbd5e180',
      'scrollbarSlider.hoverBackground': '#94a3b880',
    },
  });
  monaco.editor.defineTheme('roboforge-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '64748b', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c4b5fd' },
      { token: 'keyword.directive', foreground: 'f472b6' },
      { token: 'number', foreground: 'fbbf24' },
      { token: 'string', foreground: '86efac' },
      { token: 'delimiter', foreground: '94a3b8' },
    ],
    colors: {
      'editor.background': '#0d1424',
      'editor.foreground': '#e2e8f0',
      'editorGutter.background': '#0b1120',
      'editorLineNumber.foreground': '#475569',
      'editorLineNumber.activeForeground': '#e2e8f0',
      'editor.lineHighlightBackground': '#141e33',
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': '#1e3a5f',
      'editor.inactiveSelectionBackground': '#1e3a5f80',
      'editorCursor.foreground': '#38bdf8',
      'editorIndentGuide.background1': '#24324d',
      'editorIndentGuide.activeBackground1': '#33476b',
      'editorBracketMatch.background': '#38bdf833',
      'editorBracketMatch.border': '#38bdf8',
      'editorWidget.background': '#141e33',
      'editorWidget.border': '#33476b',
      'editorSuggestWidget.selectedBackground': '#1d2a44',
      'editorError.foreground': '#ef4444',
      'editorWarning.foreground': '#f59e0b',
      'scrollbarSlider.background': '#33476b80',
      'scrollbarSlider.hoverBackground': '#47608f80',
    },
  });

  monaco.languages.registerCompletionItemProvider('cpp', {
    triggerCharacters: ['.'],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
      const before = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1);
      const member = /\b(Serial|imu|oled)\s*\.\s*$/.exec(before);
      if (member) {
        return { suggestions: (halEntry(member[1]!)?.members ?? []).map((m) => item(m, range)) };
      }
      if (/\.\s*$/.test(before)) return { suggestions: [] };
      const suggestions: monaco.languages.CompletionItem[] = HAL_API.map((e) => item(e, range));
      for (const kw of KEYWORDS) {
        suggestions.push({ label: kw, kind: monaco.languages.CompletionItemKind.Keyword, insertText: kw, range, sortText: `2_${kw}` });
      }
      for (const s of SNIPPETS) {
        suggestions.push({
          label: s.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: s.detail,
          insertText: s.body,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          sortText: `1_${s.label}`,
        });
      }
      return { suggestions };
    },
  });

  monaco.languages.registerHoverProvider('cpp', {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const before = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1);
      const member = /\b(Serial|imu|oled)\s*\.\s*$/.exec(before);
      const entry = member ? halMember(member[1]!, word.word) : /\.\s*$/.test(before) ? undefined : halEntry(word.word);
      if (!entry) return null;
      return {
        range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
        contents: [docMarkdown(entry)],
      };
    },
  });

  monaco.languages.registerSignatureHelpProvider('cpp', {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [','],
    provideSignatureHelp(model, position) {
      const text = textBefore(model, position).replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, (s) => ' '.repeat(s.length));
      let depth = 0;
      let commas = 0;
      let open = -1;
      for (let i = text.length - 1; i >= 0; i -= 1) {
        const ch = text[i]!;
        if (ch === ')' || ch === ']') depth += 1;
        else if (ch === '(' || ch === '[') {
          if (depth === 0) {
            if (ch === '(') open = i;
            break;
          }
          depth -= 1;
        } else if (ch === ',' && depth === 0) commas += 1;
        else if ((ch === ';' || ch === '{' || ch === '}') && depth === 0) break;
      }
      if (open < 0) return null;
      const callee = /(?:\b(Serial|imu|oled)\s*\.\s*)?([A-Za-z_]\w*)\s*$/.exec(text.slice(0, open));
      if (!callee) return null;
      const entry = callee[1] ? halMember(callee[1], callee[2]!) : halEntry(callee[2]!);
      if (!entry || entry.kind !== 'function') return null;
      const label = entry.signature;
      const paren = label.indexOf('(');
      const parameters = (entry.params ?? []).map((p) => {
        const m = new RegExp(`\\b${p.name}\\b`).exec(label.slice(paren));
        return {
          label: m && paren >= 0 ? ([paren + m.index, paren + m.index + p.name.length] as [number, number]) : p.name,
          documentation: p.doc,
        };
      });
      return {
        value: {
          signatures: [{ label, documentation: entry.doc, parameters }],
          activeSignature: 0,
          activeParameter: Math.min(commas, Math.max(0, parameters.length - 1)),
        },
        dispose: () => undefined,
      };
    },
  });
}
