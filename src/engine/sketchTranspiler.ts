import { HAL_API, HAL_AWAITED, HAL_CLASSES, HAL_NAMES, HAL_UNAVAILABLE, INCLUDE_ADVICE, KNOWN_INCLUDES, halClass, halEntry } from './halApi';

/**
 * Translates the Arduino/ESP32 C++ subset the virtual ESP32 runs into an async JavaScript module body.
 *
 * Design rules:
 * - Every pass keeps line breaks where they were, so a line in the generated body is the same line in the sketch
 *   (errors and markers point at the right line).
 * - Positions are found on a copy with comments removed and string/char contents blanked, then edits are applied to
 *   the real text at those offsets, so nothing inside a string literal is ever rewritten.
 * - Static checks report problems the way a compiler would (line, column, plain message) before anything runs.
 */

export interface SketchProblem {
  /** 1-based sketch line. */
  line: number;
  /** 1-based column. */
  column: number;
  endColumn?: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface TranspileResult {
  ok: true;
  jsSource: string;
  hasSetup: boolean;
  hasLoop: boolean;
  /** Lines in jsSource before the sketch body: generated line - lineOffset = sketch line. */
  lineOffset: number;
  warnings: SketchProblem[];
}

export interface TranspileError {
  ok: false;
  /** First problem as one line ("Line 12: ..."). */
  message: string;
  line?: number;
  column?: number;
  problems: SketchProblem[];
}

/** Name the generated code runs under, so runtime stack traces can be mapped back to sketch lines. */
export const SKETCH_SOURCE_URL = 'sketch.ino.js';

/**
 * Two header lines before the sketch body: strict mode, then the HAL names the sketch can use plus the integer
 * helpers. A name the sketch defines itself (its own map() or a variable called max) is left out, so the sketch's
 * version wins as it would in C++.
 */
function headerLines(redefined: ReadonlySet<string>): [string, string] {
  const names = HAL_NAMES.filter((n) => !redefined.has(n));
  return [
    '"use strict";',
    `const { ${names.join(', ')} } = __hal; const __i32 = (v) => Number(v) | 0, __u32 = (v) => Number(v) >>> 0, __i16 = (v) => (Number(v) << 16) >> 16, __u16 = (v) => Number(v) & 0xffff, __i8 = (v) => (Number(v) << 24) >> 24, __u8 = (v) => Number(v) & 0xff, __i64 = (v) => Math.trunc(Number(v)) || 0, __arr = (d, f) => (d.length ? Array.from({ length: d[0] }, () => __arr(d.slice(1), f)) : f);`,
  ];
}
const HEADER_LINE_COUNT = 2;

/* ------------------------------------------------------------------ text utilities */

interface Edit {
  start: number;
  end: number;
  text: string;
}

function applyEdits(src: string, edits: Edit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let out = src;
  let guard = Infinity;
  for (const e of sorted) {
    if (e.end > guard) continue; // overlapping edit: keep the later one only
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
    guard = e.start;
  }
  return out;
}

const newlines = (s: string) => s.split('\n').length - 1;
const keepNewlines = (s: string) => '\n'.repeat(newlines(s));

/** Comments become spaces (newlines kept), so columns and lines stay where they were. */
function stripComments(src: string): string {
  let out = '';
  let state: 'code' | 'line' | 'block' | 'str' | 'chr' = 'code';
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i]!;
    const d = src[i + 1];
    if (state === 'code') {
      if (c === '/' && d === '/') {
        state = 'line';
        out += '  ';
        i += 1;
      } else if (c === '/' && d === '*') {
        state = 'block';
        out += '  ';
        i += 1;
      } else {
        if (c === '"') state = 'str';
        else if (c === "'") state = 'chr';
        out += c;
      }
    } else if (state === 'line') {
      if (c === '\n') {
        state = 'code';
        out += c;
      } else out += ' ';
    } else if (state === 'block') {
      if (c === '*' && d === '/') {
        state = 'code';
        out += '  ';
        i += 1;
      } else out += c === '\n' ? '\n' : ' ';
    } else {
      if (c === '\\' && d !== undefined && d !== '\n') {
        out += c + d;
        i += 1;
        continue;
      }
      if ((state === 'str' && c === '"') || (state === 'chr' && c === "'") || c === '\n') state = 'code';
      out += c;
    }
  }
  return out;
}

/** String and char contents become spaces (quotes kept): structural scans can then ignore literals. */
function maskLiterals(code: string): string {
  let out = '';
  let q = '';
  for (let i = 0; i < code.length; i += 1) {
    const c = code[i]!;
    if (q) {
      if (c === '\\' && code[i + 1] !== undefined && code[i + 1] !== '\n') {
        out += '  ';
        i += 1;
      } else if (c === q || c === '\n') {
        q = '';
        out += c;
      } else out += ' ';
      continue;
    }
    if (c === '"' || c === "'") q = c;
    out += c;
  }
  return out;
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') starts.push(i + 1);
  return starts;
}

function posOf(starts: number[], idx: number): { line: number; column: number } {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((starts[mid] ?? 0) <= idx) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: idx - (starts[lo] ?? 0) + 1 };
}

const PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}' };

/** Index of the bracket closing the one at `open`, or -1. */
function matchClose(masked: string, open: number): number {
  const o = masked[open]!;
  const c = PAIRS[o];
  if (!c) return -1;
  let depth = 0;
  for (let i = open; i < masked.length; i += 1) {
    if (masked[i] === o) depth += 1;
    else if (masked[i] === c) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function matchOpenBackward(masked: string, close: number): number {
  const c = masked[close]!;
  const o = c === ')' ? '(' : c === ']' ? '[' : '{';
  let depth = 0;
  for (let i = close; i >= 0; i -= 1) {
    if (masked[i] === c) depth += 1;
    else if (masked[i] === o) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * End of an expression starting at `from`: the first ';' or ',' at depth 0, or the bracket that closes an enclosing
 * group (for-loop increments end at ')').
 */
function expressionEnd(masked: string, from: number): number {
  let depth = 0;
  for (let i = from; i < masked.length; i += 1) {
    const ch = masked[i]!;
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) return i;
      depth -= 1;
    } else if ((ch === ';' || ch === ',') && depth === 0) return i;
  }
  return masked.length;
}

/** Start of the receiver expression ending just before index `end` (a.b(c)[d].e  <- start of `a`). */
function receiverStart(masked: string, end: number): number {
  const skipSpaceBack = (j: number) => {
    let k = j;
    while (k >= 0 && /\s/.test(masked[k]!)) k -= 1;
    return k;
  };
  let i = skipSpaceBack(end - 1);
  for (;;) {
    if (i < 0) return 0;
    const ch = masked[i]!;
    if (ch === ')' || ch === ']') {
      // a call or index: keep going to whatever it applies to (callee name, array name)
      const o = matchOpenBackward(masked, i);
      if (o < 0) return i + 1;
      const before = skipSpaceBack(o - 1);
      if (before >= 0 && /[\w$)\]]/.test(masked[before]!)) {
        i = before;
        continue;
      }
      return o;
    }
    let atom: number;
    if (ch === '"' || ch === "'") {
      atom = masked.lastIndexOf(ch, i - 1);
      if (atom < 0) return i + 1;
    } else if (/[\w$]/.test(ch)) {
      atom = i;
      while (atom > 0 && /[\w$]/.test(masked[atom - 1]!)) atom -= 1;
    } else return i + 1;
    const dot = skipSpaceBack(atom - 1);
    if (dot >= 0 && masked[dot] === '.') {
      i = skipSpaceBack(dot - 1);
      continue;
    }
    return atom;
  }
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array<number>(n).fill(0)]);
  for (let j = 1; j <= n; j += 1) dp[0]![j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1]!.toLowerCase() === b[j - 1]!.toLowerCase() ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[m]![n]!;
}

function suggest(name: string, candidates: Iterable<string>): string {
  let best = '';
  let bestD = Infinity;
  for (const c of candidates) {
    const d = levenshtein(name, c);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return bestD <= Math.max(1, Math.floor(name.length / 4)) + 1 && best ? ` (did you mean '${best}'?)` : '';
}

/* ------------------------------------------------------------------ C++ types */

const TYPE_ALTS = [
  'unsigned\\s+long\\s+long',
  'unsigned\\s+long',
  'unsigned\\s+int',
  'unsigned\\s+short',
  'unsigned\\s+char',
  'signed\\s+char',
  'long\\s+long',
  'long\\s+double',
  'long\\s+int',
  'short\\s+int',
  'unsigned',
  'signed',
  'int',
  'float',
  'double',
  'bool',
  'boolean',
  'char',
  'long',
  'short',
  'byte',
  'word',
  'String',
  'size_t',
  'uint8_t',
  'uint16_t',
  'uint32_t',
  'uint64_t',
  'int8_t',
  'int16_t',
  'int32_t',
  'int64_t',
  'auto',
];

const TYPE_WORDS = new Set(['unsigned', 'signed', 'int', 'float', 'double', 'bool', 'boolean', 'char', 'long', 'short', 'byte', 'word', 'String', 'size_t', 'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t', 'int8_t', 'int16_t', 'int32_t', 'int64_t', 'auto', 'void']);

type Coercer = '__i32' | '__u32' | '__i16' | '__u16' | '__i8' | '__u8' | '__i64' | null;

function typeRegexSource(enums: ReadonlySet<string>): string {
  return `\\b(?:${[...TYPE_ALTS, ...[...enums].map((e) => e.replace(/[^\w]/g, ''))].join('|')})\\b`;
}

/** How a C++ type maps to the simulator: integer wrap/truncation on assignment, and the value it starts with. */
function typeInfo(typeText: string, enums: ReadonlySet<string>): { coercer: Coercer; def: string; kind: 'int' | 'float' | 'other' } {
  const s = typeText.replace(/\s+/g, ' ').trim();
  if (enums.has(s)) return { coercer: '__i32', def: '0', kind: 'int' };
  switch (s) {
    case 'float':
    case 'double':
    case 'long double':
      return { coercer: null, def: '0', kind: 'float' };
    case 'bool':
    case 'boolean':
      return { coercer: null, def: 'false', kind: 'other' };
    case 'String':
      return { coercer: null, def: '""', kind: 'other' };
    case 'char':
    case 'signed char':
      return { coercer: null, def: '""', kind: 'other' };
    case 'auto':
      return { coercer: null, def: 'undefined', kind: 'other' };
    case 'uint8_t':
    case 'byte':
    case 'unsigned char':
      return { coercer: '__u8', def: '0', kind: 'int' };
    case 'int8_t':
      return { coercer: '__i8', def: '0', kind: 'int' };
    case 'int16_t':
    case 'short':
    case 'short int':
      return { coercer: '__i16', def: '0', kind: 'int' };
    case 'uint16_t':
    case 'unsigned short':
    case 'word':
      return { coercer: '__u16', def: '0', kind: 'int' };
    case 'unsigned':
    case 'unsigned int':
    case 'unsigned long':
    case 'uint32_t':
    case 'size_t':
      return { coercer: '__u32', def: '0', kind: 'int' };
    case 'long long':
    case 'int64_t':
    case 'unsigned long long':
    case 'uint64_t':
      return { coercer: '__i64', def: '0', kind: 'int' };
    default:
      return { coercer: '__i32', def: '0', kind: 'int' };
  }
}

function castCoercer(typeText: string): string {
  const s = typeText.replace(/\s+/g, ' ').trim();
  if (s === 'float' || s === 'double') return 'Number';
  if (s === 'bool' || s === 'boolean') return 'Boolean';
  if (s === 'String') return 'String';
  if (s === 'char') return 'String.fromCharCode';
  return typeInfo(s, new Set()).coercer ?? '__i32';
}

/* ------------------------------------------------------------------ static checks */

const KEYWORDS = new Set([
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'default',
  'return',
  'break',
  'continue',
  'sizeof',
  'true',
  'false',
  'const',
  'static',
  'volatile',
  'void',
  'catch',
  'typeof',
  'function',
  'async',
  'await',
]);

const JS_ALLOWED_CALLS = new Set(['String', 'Number', 'Boolean', 'parseInt', 'parseFloat', 'isNaN', 'F', 'int', 'long', 'float', 'double', 'byte', 'bool', 'char', 'word']);

const UNSUPPORTED: Array<[RegExp, string]> = [
  [/\bclass\s+[A-Za-z_]/, 'classes are not supported by the simulator; use functions and global variables'],
  [/\bstruct\s+[A-Za-z_]/, 'structs are not supported by the simulator; use separate variables or arrays'],
  [/\btemplate\s*</, 'templates are not supported by the simulator'],
  [/->/, "pointers ('->') are not supported by the simulator"],
  [/\bnew\s+[A-Za-z_]/, "'new' (dynamic memory) is not supported by the simulator"],
  [/\bdelete\s*(?:\[\s*\])?\s*[A-Za-z_]/, "'delete' is not supported by the simulator"],
  [/[A-Za-z_]\w*\s*::\s*[A-Za-z_~]/, "namespaces and '::' are not supported by the simulator"],
  [/^\s*#\s*(?:if|ifdef|ifndef|elif|else|endif|undef|error)\b/, 'preprocessor conditionals (#if, #ifdef...) are not supported by the simulator'],
  [/^\s*#\s*define\s+[A-Za-z_]\w*\(/, 'macros with parameters are not supported; write a function instead'],
  [/\bgoto\b/, "'goto' is not supported by the simulator"],
  [/\bfor\s*\([^;()]*\b[A-Za-z_]\w*\s*:(?!:)/, 'range-based for loops are not supported; use for (int i = 0; i < count; i++)'],
  [/\b(?:typedef|union|operator|enum\s+class|virtual|namespace|try|throw)\b/, 'this C++ feature is not supported by the simulator'],
  [/\b(?:int|long|float|double|char|byte|bool|uint8_t|uint16_t|uint32_t|int16_t|int32_t|String|void)\s*\*\s*[A-Za-z_(]/, 'pointers are not supported by the simulator; use arrays and indexes'],
];

/** Library classes a sketch can declare objects of (Adafruit_SSD1306, LiquidCrystal_I2C). */
const LIB_CLASSES = new Set(HAL_CLASSES.map((c) => c.name));

/** `&name` as a call argument. Only `&Wire` (the I2C bus) and a GFX font such as `&FreeSans9pt7b` are understood. */
const ADDRESS_OF = /([(,]\s*)&(?!&)\s*([A-Za-z_]\w*)/g;
const isFontName = (n: string) => /pt\d+b$|^(?:Org_01|Picopixel|TomThumb)$/.test(n);

/** Objects the sketch declares from a library class: name -> class. */
function findLibraryObjects(masked: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = new RegExp(`(?:^|[;{}\\n])[ \\t]*(?:static\\s+)?(${[...LIB_CLASSES].join('|')})\\s+([A-Za-z_]\\w*)\\s*[(;=]`, 'g');
  for (const m of masked.matchAll(re)) out.set(m[2]!, m[1]!);
  return out;
}

function checkBrackets(masked: string, starts: number[]): SketchProblem | null {
  const stack: Array<{ ch: string; idx: number }> = [];
  for (let i = 0; i < masked.length; i += 1) {
    const ch = masked[i]!;
    if (ch === '(' || ch === '[' || ch === '{') stack.push({ ch, idx: i });
    else if (ch === ')' || ch === ']' || ch === '}') {
      const top = stack.pop();
      const p = posOf(starts, i);
      if (!top) return { ...p, message: `unexpected '${ch}' (no matching '${ch === ')' ? '(' : ch === ']' ? '[' : '{'}')`, severity: 'error' };
      if (PAIRS[top.ch] !== ch) {
        const o = posOf(starts, top.idx);
        return { ...p, message: `expected '${PAIRS[top.ch]}' to close the '${top.ch}' on line ${o.line} before '${ch}'`, severity: 'error' };
      }
    }
  }
  const open = stack.pop();
  if (open) {
    const p = posOf(starts, open.idx);
    return { ...p, message: `'${open.ch}' is never closed: expected '${PAIRS[open.ch]}' before the end of the sketch`, severity: 'error' };
  }
  return null;
}

/**
 * Lines that end a statement without ';'. Deliberately conservative: only flags a line at bracket depth 0 that does
 * not end in an operator or opener, is not a control header, and is followed by a line that cannot continue it.
 */
function checkSemicolons(masked: string): SketchProblem[] {
  const lines = masked.split('\n');
  const out: SketchProblem[] = [];
  let depth = 0;
  const braces: Array<'block' | 'init'> = [];
  let prevTail = '';
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i]!;
    const startDepth = depth;
    const inInit = braces[braces.length - 1] === 'init';
    for (let j = 0; j < raw.length; j += 1) {
      const ch = raw[j]!;
      if (ch === '(' || ch === '[') depth += 1;
      else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
      else if (ch === '{') {
        const before = (prevTail + raw.slice(0, j)).replace(/\s+$/, '');
        braces.push(/(?:=|,|\{|\benum\b[^;{}]*)$/.test(before) ? 'init' : 'block');
      } else if (ch === '}') braces.pop();
    }
    const t = raw.trim();
    if (t) prevTail = t;
    if (startDepth > 0 || depth > 0 || inInit || braces[braces.length - 1] === 'init') continue;
    if (!t || t.startsWith('#')) continue;
    if (/[;{},:([\\]$/.test(t)) continue;
    if (/(?:&&|\|\||[+\-*/%=<>?&|^!.~])$/.test(t)) continue;
    if (/^(?:\}\s*)?(?:else|do)$/.test(t)) continue;
    if (/^(?:\}\s*)?(?:else\s+)?(?:if|for|while|switch)\s*\(.*\)$/.test(t)) continue;
    if (/^(?:case\b|default\b)/.test(t)) continue;
    let k = i + 1;
    while (k < lines.length && !lines[k]!.trim()) k += 1;
    const nt = k < lines.length ? lines[k]!.trim() : '';
    if (nt && /^(?:[{.?:)\]+\-*/%=<>&|^,]|\|\||&&)/.test(nt)) continue;
    if (!/[\w)\]"']$/.test(t)) continue;
    // function header whose '{' follows after a blank line or comment is handled by the '{' check above
    out.push({ line: i + 1, column: raw.replace(/\s+$/, '').length + 1, message: "expected ';' at the end of this line", severity: 'error' });
    if (out.length >= 3) break;
  }
  return out;
}

function staticChecks(masked: string, userFns: ReadonlySet<string>, userVars: ReadonlySet<string>, libObjects: ReadonlyMap<string, string>): SketchProblem[] {
  const starts = lineStarts(masked);
  const problems: SketchProblem[] = [];
  const lines = masked.split('\n');

  lines.forEach((ln, i) => {
    for (const [re, message] of UNSUPPORTED) {
      const m = re.exec(ln);
      if (m) {
        problems.push({ line: i + 1, column: m.index + 1, endColumn: m.index + m[0].length + 1, message, severity: 'error' });
        break;
      }
    }
  });

  for (const am of masked.matchAll(ADDRESS_OF)) {
    const name = am[2]!;
    if (name === 'Wire' || isFontName(name)) continue;
    const at = (am.index ?? 0) + am[1]!.length;
    const pos = posOf(starts, at);
    const lineText = lines[pos.line - 1] ?? '';
    problems.push({
      ...pos,
      endColumn: pos.column + name.length + 1,
      message: /getTextBounds\s*\(/.test(lineText)
        ? 'getTextBounds() returns its results through pointers (&x1, &w ...), which the simulator does not support; with the built-in font each character is 6 x 8 pixels times the text size'
        : `passing '${name}' by address (&${name}) is not supported by the simulator; use a global variable or a return value instead`,
      severity: 'error',
    });
  }

  const bracket = checkBrackets(masked, starts);
  if (bracket) problems.push(bracket);

  // statements outside any function (only where a new statement can start, not on a continued line)
  let depth = 0;
  let parens = 0;
  let prevEnded = true;
  lines.forEach((ln, i) => {
    const t = ln.trim();
    if (depth === 0 && parens === 0 && prevEnded && t && !t.startsWith('#')) {
      const m = /^(?:if|for|while|switch|do)\b|^[A-Za-z_]\w*(?:\s*\.\s*[A-Za-z_]\w*)*\s*\(/.exec(t);
      const word = /^[A-Za-z_]\w*/.exec(t)?.[0] ?? '';
      if (m && !TYPE_WORDS.has(word) && !['static', 'const', 'inline', 'volatile', 'enum', 'IRAM_ATTR', 'constexpr'].includes(word)) {
        problems.push({ line: i + 1, column: ln.indexOf(t) + 1, message: 'this statement is outside any function: move it into setup() or loop()', severity: 'error' });
      }
    }
    for (const ch of ln) {
      if (ch === '{') depth += 1;
      else if (ch === '}') depth = Math.max(0, depth - 1);
      else if (ch === '(' || ch === '[') parens += 1;
      else if (ch === ')' || ch === ']') parens = Math.max(0, parens - 1);
    }
    if (t) prevEnded = t.startsWith('#') || /[;{}]$/.test(t);
  });

  if (!bracket) problems.push(...checkSemicolons(masked));

  // calls to names that are not declared, and members the simulator's objects do not have
  const callable = new Set<string>([...HAL_API.filter((e) => e.kind === 'function').map((e) => e.name), ...Object.keys(HAL_AWAITED), ...userFns, ...JS_ALLOWED_CALLS, ...LIB_CLASSES]);
  const callRe = /([A-Za-z_]\w*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = callRe.exec(masked))) {
    const name = m[1]!;
    const idx = m.index;
    let b = idx - 1;
    while (b >= 0 && /\s/.test(masked[b]!)) b -= 1;
    if (masked[b] === '.') continue;
    const prevWord = /([A-Za-z_]\w*)\s*[*&]?\s*$/.exec(masked.slice(Math.max(0, idx - 40), idx))?.[1];
    if (prevWord && (TYPE_WORDS.has(prevWord) || prevWord === 'function' || LIB_CLASSES.has(prevWord))) continue;
    if (KEYWORDS.has(name) || callable.has(name)) {
      if (name === 'sizeof') {
        const idiom = /^sizeof\s*\(\s*(\w+)\s*\)\s*\/\s*sizeof\s*\(\s*\1\s*\[\s*0\s*\]\s*\)/.exec(masked.slice(idx));
        const prevIdiom = /sizeof\s*\(\s*(\w+)\s*\)\s*\/\s*$/.exec(masked.slice(Math.max(0, idx - 60), idx));
        if (!idiom && !prevIdiom) {
          problems.push({ ...posOf(starts, idx), endColumn: posOf(starts, idx).column + 6, message: "'sizeof' is only supported as sizeof(array) / sizeof(array[0])", severity: 'error' });
        }
      }
      continue;
    }
    const p = posOf(starts, idx);
    const why = HAL_UNAVAILABLE[name];
    problems.push({
      ...p,
      endColumn: p.column + name.length,
      message: why
        ? `'${name}' is not available in the simulator: ${why}`
        : userVars.has(name)
          ? `'${name}' is a variable, not a function`
          : `'${name}' was not declared in this scope${suggest(name, callable)}`,
      severity: 'error',
    });
  }
  const objectNames = ['Serial', 'imu', 'oled', 'Wire', ...libObjects.keys()];
  const memberRe = new RegExp(`(?<![\\w.])(${[...new Set(objectNames)].join('|')})\\s*\\.\\s*([A-Za-z_]\\w*)`, 'g');
  // preprocessor lines (#include <Wire.h>) are not member accesses
  const noDirectives = masked.replace(/^[ \t]*#[^\n]*/gm, (s) => ' '.repeat(s.length));
  while ((m = memberRe.exec(noDirectives))) {
    const objName = m[1]!;
    const libClass = libObjects.get(objName);
    const obj = libClass ? halClass(libClass) : halEntry(objName);
    const member = m[2]!;
    if (!obj?.members?.some((x) => x.name === member)) {
      const at = m.index + m[0].length - member.length;
      const p = posOf(starts, at);
      const why = HAL_UNAVAILABLE[member];
      problems.push({
        ...p,
        endColumn: p.column + member.length,
        message:
          objName === 'Serial' && member === 'read'
            ? "'Serial.read()' is not modelled: use Serial.readStringUntil('\\n') to read a line"
            : objName === 'Wire' && ['read', 'requestFrom', 'available'].includes(member)
              ? `'Wire.${member}()' is not modelled: raw I2C reads are not simulated; read the MPU6050 with the imu object`
              : why
                ? `'${member}' is not available in the simulator: ${why}`
                : `'${objName}' has no member named '${member}'${suggest(member, (obj?.members ?? []).map((x) => x.name))}`,
        severity: 'error',
      });
    }
  }

  // one problem per position, in reading order
  const seen = new Set<string>();
  return problems
    .filter((p) => {
      const key = `${p.line}:${p.column}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.line - b.line || a.column - b.column)
    .slice(0, 25);
}

/* ------------------------------------------------------------------ transforms */

function transformEnums(text: string, enums: Set<string>): string {
  const masked = maskLiterals(text);
  const re = /\benum\s+([A-Za-z_]\w*)?\s*\{([^{}]*)\}\s*;/g;
  const edits: Edit[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    if (m[1]) enums.add(m[1]);
    let next = 0;
    let base = '';
    const decls: string[] = [];
    for (const item of text.slice(m.index + m[0].indexOf('{') + 1, m.index + m[0].lastIndexOf('}')).split(',')) {
      const it = item.trim();
      if (!it) continue;
      const [name, value] = it.split('=').map((s) => s.trim());
      if (!name) continue;
      if (value !== undefined && value !== '') {
        base = value;
        next = 0;
      }
      decls.push(`${name} = ${base ? (next ? `(${base}) + ${next}` : base) : String(next)}`);
      next += 1;
    }
    const original = text.slice(m.index, m.index + m[0].length);
    edits.push({ start: m.index, end: m.index + m[0].length, text: `const ${decls.join(', ')};${keepNewlines(original)}` });
  }
  return applyEdits(text, edits);
}

function transformDirectives(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const inc = /^\s*#\s*include\b/.test(line);
      if (inc || /^\s*#\s*pragma\b/.test(line)) return '';
      const def = /^(\s*)#\s*define\s+([A-Za-z_]\w*)\s*(.*)$/.exec(line);
      if (def) return `${def[1]}const ${def[2]} = ${def[3]?.trim() || 'true'};`;
      return line;
    })
    .join('\n');
}

/**
 * Library objects: `Adafruit_SSD1306 display(128, 64, &Wire, -1);` becomes `const display = Adafruit_SSD1306(128,
 * 64, Wire, -1);` (also the `= Class(args)` and no-argument forms); `&Wire` becomes the bus object and
 * `&FreeSans9pt7b` the font's name.
 */
function transformLibraryObjects(text: string): string {
  const masked = maskLiterals(text);
  const edits: Edit[] = [];
  const re = new RegExp(`(^|[;{}\\n])([ \\t]*)((?:static\\s+)?)(${[...LIB_CLASSES].join('|')})(\\s+)([A-Za-z_]\\w*)\\s*`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    const start = m.index + m[1]!.length + m[2]!.length;
    let i = m.index + m[0].length;
    const cls = m[4]!;
    const name = m[6]!;
    let args = '';
    if (masked[i] === '=') {
      i += 1;
      while (/\s/.test(masked[i] ?? '')) i += 1;
      if (masked.startsWith(cls, i)) i += cls.length;
      while (/\s/.test(masked[i] ?? '')) i += 1;
    }
    if (masked[i] === '(') {
      const close = matchClose(masked, i);
      if (close < 0) continue;
      args = text.slice(i + 1, close);
      i = close + 1;
    }
    while (/[ \t]/.test(masked[i] ?? '')) i += 1;
    if (masked[i] !== ';') continue;
    const original = text.slice(start, i + 1);
    edits.push({ start, end: i + 1, text: `const ${name} = ${cls}(${args.replace(/\n/g, ' ')});${keepNewlines(original)}` });
    re.lastIndex = i + 1;
  }
  let out = applyEdits(text, edits);
  const masked2 = maskLiterals(out);
  const amp: Edit[] = [];
  for (const am of masked2.matchAll(ADDRESS_OF)) {
    const name = am[2]!;
    const at = (am.index ?? 0) + am[1]!.length;
    const end = at + masked2.slice(at).indexOf(name) + name.length;
    if (name === 'Wire') amp.push({ start: at, end, text: 'Wire' });
    else if (isFontName(name)) amp.push({ start: at, end, text: `"${name}"` });
  }
  out = applyEdits(out, amp);
  return out;
}

/** Non-ASCII characters in string literals become their UTF-8 bytes (\xNN), as the C++ compiler stores them. */
function transformStringBytes(text: string): string {
  let out = '';
  let q = '';
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]!;
    if (q) {
      if (c === '\\' && i + 1 < text.length) {
        out += c + text[i + 1];
        i += 1;
        continue;
      }
      if (c === q || c === '\n') q = '';
      const cp = c.codePointAt(0) ?? 0;
      if (q === '"' && cp > 0x7f) {
        const ch = String.fromCodePoint(cp);
        for (const byte of new TextEncoder().encode(ch)) out += `\\x${byte.toString(16).padStart(2, '0')}`;
        if (cp > 0xffff) i += 1;
        continue;
      }
      out += c;
      continue;
    }
    if (c === '"' || c === "'") q = c;
    out += c;
  }
  return out;
}

/** Warnings for `#include`s the simulator does not provide. */
function includeWarnings(stripped: string): SketchProblem[] {
  const out: SketchProblem[] = [];
  stripped.split('\n').forEach((line, i) => {
    const m = /^(\s*)#\s*include\s*[<"]([^>"]+)[>"]/.exec(line);
    if (!m) return;
    const header = m[2]!.trim();
    if (KNOWN_INCLUDES.has(header) || header.startsWith('Fonts/')) return;
    const advice = INCLUDE_ADVICE[header];
    out.push({
      line: i + 1,
      column: m[1]!.length + 1,
      endColumn: line.trimEnd().length + 1,
      message: advice
        ? `<${header}>: ${advice}`
        : `<${header}> is not part of the simulator; only the ESP32 core, Wire, Adafruit_SSD1306 (Adafruit_GFX) and LiquidCrystal_I2C are available, so calls into it will fail`,
      severity: 'warning',
    });
  });
  return out;
}

/** A display draws a string's bytes, so "°" (two UTF-8 bytes) shows as two other symbols; say how to get the symbol. */
function displayTextWarnings(stripped: string, displayObjects: readonly string[]): SketchProblem[] {
  if (!displayObjects.length) return [];
  const out: SketchProblem[] = [];
  // only text handed to a display's print/write call (Serial shows UTF-8 fine)
  const call = new RegExp(`\\b(?:${displayObjects.join('|')})\\s*\\.\\s*(?:print|println|write|printstr)\\s*\\(\\s*(?:F\\s*\\(\\s*)?$`);
  stripped.split('\n').forEach((line, i) => {
    const m = /"(?:[^"\\\n]|\\.)*"/g;
    for (const s of line.matchAll(m)) {
      const k = s[0].search(/[\u0080-￿]/);
      if (k < 0 || !call.test(line.slice(0, s.index ?? 0))) continue;
      const ch = String.fromCodePoint(s[0].codePointAt(k) ?? 63);
      out.push({
        line: i + 1,
        column: (s.index ?? 0) + k + 1,
        endColumn: (s.index ?? 0) + k + 2,
        message: `'${ch}' is not plain ASCII: a display draws its UTF-8 bytes as other symbols.${ch === '\u00b0' ? ' For the degree sign write (char)247 on the OLED or (char)223 on the LCD.' : ''}`,
        severity: 'warning',
      });
      if (out.length >= 3) return;
    }
  });
  return out;
}

function transformLiterals(text: string): string {
  const masked = maskLiterals(text);
  const edits: Edit[] = [];
  const fRe = /(\b\d+\.\d*|\B\.\d+|\b\d+)([eE][+-]?\d+)?[fF]\b/g;
  let m: RegExpExecArray | null;
  while ((m = fRe.exec(masked))) {
    if (!m[0].includes('.') && !m[2]) continue; // 5f is not a C++ literal; leave it for the parser to flag
    edits.push({ start: m.index, end: m.index + m[0].length, text: `${m[1]}${m[2] ?? ''}` });
  }
  const iRe = /\b(0[xX][0-9a-fA-F]+|0[bB][01]+|\d+)(?:[uU][lL]{0,2}|[lL]{1,2}[uU]?)\b/g;
  while ((m = iRe.exec(masked))) edits.push({ start: m.index, end: m.index + m[0].length, text: m[1]! });
  // Arduino's binary constants B0 .. B11111111 (used for custom LCD characters and bitmaps)
  const bRe = /(?<![\w.$])B([01]{1,8})\b/g;
  while ((m = bRe.exec(masked))) edits.push({ start: m.index, end: m.index + m[0].length, text: `0b${m[1]}` });
  return applyEdits(text, edits);
}

/** Start/end of the operand after a C-style cast: a (group), a name with calls/indexes/members, or a number. */
function operandEnd(masked: string, from: number): number {
  let i = from;
  while (i < masked.length && /[ \t]/.test(masked[i]!)) i += 1;
  if (masked[i] === '-' || masked[i] === '+' || masked[i] === '!') i += 1;
  if (masked[i] === '(') {
    const c = matchClose(masked, i);
    return c < 0 ? i : c + 1;
  }
  if (/\d/.test(masked[i] ?? '')) {
    while (i < masked.length && /[\w.]/.test(masked[i]!)) i += 1;
    return i;
  }
  while (i < masked.length) {
    while (i < masked.length && /[\w$]/.test(masked[i]!)) i += 1;
    let j = i;
    while (j < masked.length && /[ \t]/.test(masked[j]!)) j += 1;
    if (masked[j] === '(' || masked[j] === '[') {
      const c = matchClose(masked, j);
      if (c < 0) return j;
      i = c + 1;
      continue;
    }
    if (masked[j] === '.' && /[A-Za-z_]/.test(masked[j + 1] ?? '')) {
      i = j + 1;
      continue;
    }
    return i;
  }
  return i;
}

function transformCasts(text: string, typeSrc: string): string {
  let out = text;
  for (let pass = 0; pass < 4; pass += 1) {
    const masked = maskLiterals(out);
    const re = new RegExp(`\\(\\s*(${typeSrc})\\s*\\)(?=\\s*[\\w(+\\-!.])`, 'g');
    const edits: Edit[] = [];
    let m: RegExpExecArray | null;
    let lastEnd = -1;
    while ((m = re.exec(masked))) {
      if (m.index < lastEnd) continue;
      const opStart = m.index + m[0].length;
      const opEnd = operandEnd(masked, opStart);
      if (opEnd <= opStart) continue;
      const operand = out.slice(opStart, opEnd).trim();
      edits.push({ start: m.index, end: opEnd, text: `${castCoercer(m[1]!)}(${operand})` });
      lastEnd = opEnd;
    }
    if (!edits.length) break;
    out = applyEdits(out, edits);
  }
  // functional casts: int(x), float(x), byte(x)
  const masked = maskLiterals(out);
  const fRe = /(?<![\w.$])(int|long|float|double|byte|bool|char|word)(\s*)\(/g;
  const edits: Edit[] = [];
  let m: RegExpExecArray | null;
  while ((m = fRe.exec(masked))) edits.push({ start: m.index, end: m.index + m[1]!.length, text: castCoercer(m[1]!) });
  return applyEdits(out, edits);
}

function stripParamTypes(raw: string, typeSrc: string): { text: string; names: string[] } {
  const nl = keepNewlines(raw);
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'void') return { text: nl, names: [] };
  const names: string[] = [];
  const parts = trimmed.split(',').map((param) => {
    const cleaned = param
      .trim()
      .replace(new RegExp(`^(?:const\\s+)?(?:${typeSrc})\\s*[*&]?\\s*`), '')
      .replace(/\[\s*\d*\s*\]$/, '')
      .replace(/\s*=.*$/, '');
    if (/^[A-Za-z_]\w*$/.test(cleaned)) names.push(cleaned);
    return cleaned;
  });
  return { text: parts.join(', ') + nl, names };
}

function transformFunctions(text: string, typeSrc: string, params: Set<string>): string {
  const masked = maskLiterals(text);
  // groups: 1 lead, 2 indent, 3 qualifiers, 4 return type, 5 separator, 6 name, 7 params, 8 space before { or ;, 9 { or ;
  const re = new RegExp(
    `(^|[;}\\n])([ \\t]*)((?:(?:static|inline|IRAM_ATTR)\\s+)*)(void|${typeSrc})(\\s*[*&]?\\s+)([A-Za-z_]\\w*)\\s*\\(([^;{}()]*)\\)(\\s*)([{;])`,
    'g',
  );
  const edits: Edit[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    const start = m.index + m[1]!.length + m[2]!.length;
    const end = m.index + m[0].length;
    const nameEnd = start + m[3]!.length + m[4]!.length + m[5]!.length + m[6]!.length;
    const open = masked.indexOf('(', nameEnd);
    const close = end - 1 - m[8]!.length - 1;
    if (m[9] === ';') {
      edits.push({ start, end, text: keepNewlines(text.slice(start, end)) }); // prototype: not needed in JavaScript
    } else {
      const ps = stripParamTypes(text.slice(open + 1, close), typeSrc);
      ps.names.forEach((n) => params.add(n));
      edits.push({ start, end, text: `async function ${m[6]}(${ps.text})${keepNewlines(text.slice(start, open))}${m[8]}{` });
    }
    re.lastIndex = end;
  }
  return applyEdits(text, edits);
}

interface DeclContext {
  enums: ReadonlySet<string>;
  intVars: Map<string, Coercer | 'ambiguous'>;
  allVars: Set<string>;
  warnings: SketchProblem[];
}

/** Turns brace initialisers into array literals ({1, 2} -> [1, 2], nested too), leaving strings alone. */
function bracesToBrackets(init: string): string {
  const masked = maskLiterals(init);
  let out = '';
  for (let i = 0; i < init.length; i += 1) {
    out += masked[i] === '{' ? '[' : masked[i] === '}' ? ']' : init[i];
  }
  return out;
}

function transformDeclarations(text: string, typeSrc: string, ctx: DeclContext): string {
  const masked = maskLiterals(text);
  const starts = lineStarts(text);
  const re = new RegExp(`(^|[;{}(\\n]|(?<!:):(?!:))([ \\t]*)((?:(?:const|static|volatile|constexpr)\\s+)*)(${typeSrc})(\\s+)(?=[A-Za-z_])`, 'g');
  const edits: Edit[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    const declStart = m.index + m[1]!.length + m[2]!.length;
    const afterType = m.index + m[0].length;
    const quals = m[3] ?? '';
    const typeText = m[4]!;
    const info = typeInfo(typeText, ctx.enums);
    // gather the declarators up to ';' at depth 0
    let depth = 0;
    let end = -1;
    const commas: number[] = [];
    let abort = false;
    for (let i = afterType; i < masked.length; i += 1) {
      const ch = masked[i]!;
      if (ch === '(' || ch === '[' || ch === '{') depth += 1;
      else if (ch === ')' || ch === ']' || ch === '}') {
        depth -= 1;
        if (depth < 0) {
          abort = true;
          break;
        }
      } else if (ch === ',' && depth === 0) commas.push(i);
      else if (ch === ';' && depth === 0) {
        end = i;
        break;
      }
    }
    if (abort || end < 0) continue;
    const bounds = [afterType, ...commas.map((c) => c + 1)];
    const segEnds = [...commas, end];
    const segments: string[] = [];
    let ok = true;
    for (let s = 0; s < bounds.length; s += 1) {
      const a = bounds[s]!;
      const b = segEnds[s]!;
      const segMasked = masked.slice(a, b);
      const dm = /^(\s*)([A-Za-z_]\w*)(\s*)((?:\[[^\]]*\]\s*)*)(?:=)?/.exec(segMasked);
      if (!dm) {
        ok = false;
        break;
      }
      const restIdx = a + dm[0].length;
      if (masked.slice(a + dm[1]!.length + dm[2]!.length).trimStart().startsWith('(')) {
        ok = false;
        break;
      }
      const name = dm[2]!;
      const lead = text.slice(a, a + dm[1]!.length);
      const hasInit = dm[0].trimEnd().endsWith('=');
      const init = hasInit ? text.slice(restIdx, b) : '';
      const dims = [...dm[4]!.matchAll(/\[([^\]]*)\]/g)].map((x) => x[1]!.trim());
      const trail = hasInit ? '' : text.slice(a + dm[0].length, b);
      ctx.allVars.add(name);
      let built: string;
      if (dims.length) {
        if (hasInit) built = `${name}/*@d*/ = ${maskLiterals(init).trim().startsWith('"') ? init.trim() : bracesToBrackets(init).trim()}${keepNewlines(init)}`;
        else built = `${name}/*@d*/ = __arr([${dims.map((d) => d || '0').join(', ')}], ${info.def})${trail}`;
      } else if (hasInit) {
        built = info.coercer ? `${name}/*@d*/ = ${info.coercer}(${init.trim()})${keepNewlines(init)}` : `${name}/*@d*/ = ${init.trim()}${keepNewlines(init)}`;
      } else {
        built = `${name}/*@d*/ = ${info.def}${trail}`;
      }
      segments.push(`${lead}${built}`);
      if (!/\bconst(?:expr)?\b/.test(quals) && !dims.length) {
        // integer variables wrap/truncate on assignment like C++; a name also used with another type is left alone
        const mine: Coercer | 'ambiguous' = info.kind === 'int' ? info.coercer : 'ambiguous';
        const prev = ctx.intVars.get(name);
        ctx.intVars.set(name, prev === undefined || prev === mine ? mine : 'ambiguous');
      }
    }
    if (!ok) continue;
    if (/\bstatic\b/.test(quals)) {
      // a static local keeps its value between calls on a real board; here it would restart each call
      let braceDepth = 0;
      for (let i = 0; i < declStart; i += 1) {
        if (masked[i] === '{') braceDepth += 1;
        else if (masked[i] === '}') braceDepth -= 1;
      }
      if (braceDepth > 0) {
        const p = posOf(starts, declStart);
        ctx.warnings.push({ ...p, endColumn: p.column + quals.trim().length, message: "'static' inside a function: the simulator resets this variable on every call; declare it above the function to keep its value", severity: 'warning' });
      }
    }
    const kw = /\bconst(?:expr)?\b/.test(quals) ? 'const' : 'let';
    const head = text.slice(declStart, afterType);
    edits.push({ start: declStart, end, text: `${kw} ${segments.join(',')}${keepNewlines(head)}` });
    re.lastIndex = end;
  }
  return applyEdits(text, edits);
}

function transformAssignments(text: string, ctx: DeclContext, params: ReadonlySet<string>): string {
  const names = [...ctx.intVars.entries()].filter((e): e is [string, Exclude<Coercer, null>] => e[1] !== 'ambiguous' && e[1] !== null && !params.has(e[0]));
  if (!names.length) return text;
  const byName = new Map(names);
  const masked = maskLiterals(text);
  const re = new RegExp(`(?<![\\w.$])(${names.map((n) => n[0]).join('|')})(\\s*)(<<=|>>=|\\+=|-=|\\*=|\\/=|%=|&=|\\|=|\\^=|=)(?!=)`, 'g');
  const edits: Edit[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    const name = m[1]!;
    const op = m[3]!;
    const rhsStart = m.index + m[0].length;
    const rhsEnd = expressionEnd(masked, rhsStart);
    const rhs = text.slice(rhsStart, rhsEnd);
    const co = byName.get(name)!;
    const value = op === '=' ? rhs.trim() : `${name} ${op.slice(0, -1)} (${rhs.trim()})`;
    edits.push({ start: m.index, end: rhsEnd, text: `${name} = ${co}(${value})${keepNewlines(rhs)}` });
    re.lastIndex = rhsEnd;
  }
  return applyEdits(text, edits);
}

function transformStringMethods(text: string): string {
  let out = text;
  // statement forms that change the String in place in Arduino
  out = out.replace(/^([ \t]*)([A-Za-z_]\w*)\s*\.\s*(trim|toUpperCase|toLowerCase)\s*\(\s*\)\s*;/gm, '$1$2 = $2.$3();');
  const masked = maskLiterals(out);
  const edits: Edit[] = [];
  let m: RegExpExecArray | null;
  const lenRe = /\.\s*length\s*\(\s*\)/g;
  while ((m = lenRe.exec(masked))) edits.push({ start: m.index, end: m.index + m[0].length, text: '.length' });
  const cRe = /\.\s*c_str\s*\(\s*\)/g;
  while ((m = cRe.exec(masked))) edits.push({ start: m.index, end: m.index + m[0].length, text: '' });
  const convRe = /\.\s*(toInt|toFloat|toDouble)\s*\(\s*\)/g;
  while ((m = convRe.exec(masked))) {
    const rs = receiverStart(masked, m.index);
    const fn = m[1] === 'toInt' ? '__hal.toInt' : '__hal.toFloat';
    edits.push({ start: rs, end: m.index + m[0].length, text: `${fn}(${out.slice(rs, m.index)})` });
  }
  const eqRe = /\.\s*(equals|equalsIgnoreCase)\s*\(/g;
  while ((m = eqRe.exec(masked))) {
    const rs = receiverStart(masked, m.index);
    edits.push({ start: rs, end: m.index + m[0].length, text: `__hal.${m[1] === 'equals' ? 'strEquals' : 'strEqualsIgnoreCase'}(${out.slice(rs, m.index)}, ` });
  }
  const sizeRe = /sizeof\s*\(\s*(\w+)\s*\)\s*\/\s*sizeof\s*\(\s*\1\s*\[\s*0\s*\]\s*\)/g;
  while ((m = sizeRe.exec(masked))) edits.push({ start: m.index, end: m.index + m[0].length, text: `${m[1]}.length` });
  // F("text") keeps strings in flash on AVR; here it is just the string
  const fRe = /(?<![\w.$])F\s*\(/g;
  while ((m = fRe.exec(masked))) edits.push({ start: m.index, end: m.index + m[0].length, text: '(' });
  return applyEdits(out, edits);
}

/**
 * Loop guards go into the loop condition, so every loop form is covered: braces or not, do/while, empty bodies,
 * and conditions with nested calls like while (millis() - t < 500). The guard lets the page breathe and runs the
 * watchdog that stops a loop which never calls delay().
 */
function transformLoopGuards(text: string): string {
  const masked = maskLiterals(text);
  const starts = lineStarts(text);
  const re = /\b(while|for)\s*\(/g;
  const edits: Edit[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    const open = m.index + m[0].length - 1;
    const close = matchClose(masked, open);
    if (close < 0) continue;
    const line = posOf(starts, m.index).line;
    const guard = `await __hal.guard(${line})`;
    if (m[1] === 'while') {
      const cond = text.slice(open + 1, close);
      edits.push({ start: open + 1, end: close, text: `(${guard}), (${cond.trim()})${keepNewlines(cond)}` });
    } else {
      const header = masked.slice(open + 1, close);
      const semis: number[] = [];
      let depth = 0;
      for (let i = 0; i < header.length; i += 1) {
        const ch = header[i]!;
        if (ch === '(' || ch === '[' || ch === '{') depth += 1;
        else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
        else if (ch === ';' && depth === 0) semis.push(i);
      }
      if (semis.length !== 2) continue;
      const a = open + 1 + semis[0]! + 1;
      const b = open + 1 + semis[1]!;
      const cond = text.slice(a, b);
      edits.push({ start: a, end: b, text: ` (${guard}, ${cond.trim() ? `(${cond.trim()})` : 'true'})${keepNewlines(cond)}` });
    }
  }
  return applyEdits(text, edits);
}

function transformAwaits(text: string, userFns: ReadonlySet<string>): string {
  const masked = maskLiterals(text);
  const edits: Edit[] = [];
  let m: RegExpExecArray | null;
  for (const [name, target] of Object.entries(HAL_AWAITED)) {
    const re = new RegExp(`(?<![\\w.$])${name}(?=\\s*\\()`, 'g');
    while ((m = re.exec(masked))) edits.push({ start: m.index, end: m.index + name.length, text: `await ${target}` });
  }
  for (const fnName of userFns) {
    if (fnName === 'setup' || fnName === 'loop') continue;
    const re = new RegExp(`(?<!function\\s+)(?<!await\\s+)(?<![\\w.$])${fnName}(?=\\s*\\()`, 'g');
    while ((m = re.exec(masked))) edits.push({ start: m.index, end: m.index, text: 'await ' });
  }
  return applyEdits(text, edits);
}

/* ------------------------------------------------------------------ errors from the JavaScript parser */

function friendlyParseMessage(msg: string): string {
  if (/Unexpected end of input/i.test(msg)) return "missing '}' or ')' before the end of the sketch";
  const tok = /Unexpected token '?([^']+)'?/i.exec(msg);
  if (tok) return `unexpected '${tok[1]}'`;
  const id = /Unexpected identifier '?([^']+)'?/i.exec(msg);
  if (id) return `unexpected '${id[1]}' (is a ';' or an operator missing before it?)`;
  const num = /Unexpected number/i.exec(msg);
  if (num) return 'unexpected number (is an operator missing?)';
  if (/missing \) after argument list/i.test(msg)) return "missing ')' or ',' in a function call";
  if (/Invalid left-hand side/i.test(msg)) return 'the left side of this assignment cannot be assigned to';
  if (/has already been declared/i.test(msg)) return msg.replace(/^Identifier /, '').replace(/'(\w+)' has already been declared/, "'$1' is declared twice in the same scope");
  if (/Assignment to constant/i.test(msg)) return 'assignment to a const variable';
  return msg;
}

/**
 * Sketch line of a parse error: the shortest prefix of the body that still fails once it is completed. The Function
 * constructor wraps the body in its own braces, so an unfinished prefix cannot be told apart by its message; instead
 * each prefix gets its open brackets closed (and a 0 to finish a dangling operator) and counts as failing only if
 * neither completion parses.
 */
function locateParseError(bodyLines: string[]): number | null {
  const parses = (src: string) => {
    try {
      new Function('__hal', `"use strict";\n${src}`);
      return true;
    } catch {
      return false;
    }
  };
  const fails = (k: number): boolean => {
    const prefix = bodyLines.slice(0, k).join('\n');
    const masked = maskLiterals(prefix);
    const stack: string[] = [];
    for (const ch of masked) {
      if (ch === '(' || ch === '[' || ch === '{') stack.push(PAIRS[ch]!);
      else if ((ch === ')' || ch === ']' || ch === '}') && stack[stack.length - 1] === ch) stack.pop();
    }
    const closers = stack.reverse().join('');
    return !parses(`${prefix}\n${closers}`) && !parses(`${prefix}\n0${closers}`);
  };
  if (!fails(bodyLines.length)) return null;
  let lo = 1;
  let hi = bodyLines.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (fails(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/* ------------------------------------------------------------------ entry point */

/**
 * Translates an Arduino/ESP32 C++ sketch into the async JavaScript body the virtual ESP32 runs, after checking it the
 * way a compiler would. Problems carry the sketch line and column for the editor's markers.
 */
export function transpileArduinoSketch(source: string): TranspileResult | TranspileError {
  const fail = (problems: SketchProblem[]): TranspileError => {
    const first = problems[0];
    return {
      ok: false,
      message: first ? `Line ${first.line}: ${first.message}` : 'Sketch could not be compiled',
      line: first?.line,
      column: first?.column,
      problems,
    };
  };
  try {
    const commentFree = stripComments(source.replace(/\r\n?/g, '\n'));
    // PROGMEM (keep in flash) only matters on AVR boards; drop it so the declaration reads as a plain array
    const stripped = commentFree.replace(/\bPROGMEM\b/g, (w, at: number) => (maskLiterals(commentFree).slice(at, at + w.length) === w ? ' '.repeat(w.length) : w));
    const enums = new Set<string>();
    // enum type names are needed before anything else looks for declarations
    for (const em of maskLiterals(stripped).matchAll(/\benum\s+([A-Za-z_]\w*)\s*\{/g)) if (em[1]) enums.add(em[1]);
    const typeSrc = typeRegexSource(enums);
    const masked0 = maskLiterals(stripped);

    const userFns = new Set<string>();
    for (const fm of masked0.matchAll(new RegExp(`\\b(?:void|${typeSrc})\\s*[*&]?\\s+([A-Za-z_]\\w*)\\s*\\([^;{}]*\\)\\s*[{;]`, 'g'))) if (fm[1]) userFns.add(fm[1]);
    const userVars = new Set<string>();
    for (const vm of masked0.matchAll(new RegExp(`(?:${typeSrc})\\s+([A-Za-z_]\\w*)\\s*(?:[=;,\\[])`, 'g'))) if (vm[1] && !userFns.has(vm[1])) userVars.add(vm[1]);

    const libObjects = findLibraryObjects(masked0);
    const defineNames = new Set<string>();
    for (const dm of stripped.matchAll(/^\s*#\s*define\s+([A-Za-z_]\w*)/gm)) if (dm[1]) defineNames.add(dm[1]);
    const problems = staticChecks(masked0, userFns, userVars, libObjects);
    const errors = problems.filter((p) => p.severity === 'error');
    if (errors.length) return fail(errors);

    const displayObjects = [...libObjects.keys(), ...(libObjects.has('oled') ? [] : ['oled'])];
    const ctx: DeclContext = { enums, intVars: new Map(), allVars: new Set(), warnings: [...includeWarnings(stripped), ...displayTextWarnings(stripped, displayObjects)] };
    const params = new Set<string>();
    let code = transformEnums(stripped, enums);
    code = transformDirectives(code);
    code = transformLibraryObjects(code);
    code = transformLiterals(code);
    code = transformCasts(code, typeSrc);
    code = transformFunctions(code, typeSrc, params);
    code = transformDeclarations(code, typeSrc, ctx);
    code = transformAssignments(code, ctx, params);
    code = transformStringMethods(code);
    code = transformLoopGuards(code);
    code = transformAwaits(code, userFns);
    code = transformStringBytes(code);

    const hasSetup = /async function\s+setup\s*\(/.test(code);
    const hasLoop = /async function\s+loop\s*\(/.test(code);
    const wrapped = [
      ...headerLines(new Set([...userFns, ...ctx.allVars, ...defineNames, ...libObjects.keys()])),
      code,
      `return { setup: ${hasSetup ? 'setup' : 'null'}, loop: ${hasLoop ? 'loop' : 'null'} };`,
      `//# sourceURL=${SKETCH_SOURCE_URL}`,
    ].join('\n');

    try {
      new Function('__hal', wrapped);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const bodyLines = code.split('\n');
      const line = locateParseError(bodyLines) ?? 1;
      const srcLine = source.split('\n')[line - 1] ?? '';
      const col = Math.max(1, srcLine.length - srcLine.trimStart().length + 1);
      return fail([{ line, column: col, endColumn: srcLine.length + 1, message: friendlyParseMessage(msg), severity: 'error' }]);
    }
    if (!hasSetup && !hasLoop) {
      return fail([{ line: 1, column: 1, message: 'the sketch needs a setup() or a loop() function', severity: 'error' }]);
    }
    return { ok: true, jsSource: wrapped, hasSetup, hasLoop, lineOffset: HEADER_LINE_COUNT, warnings: ctx.warnings };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail([{ line: 1, column: 1, message: `the sketch could not be translated: ${msg}`, severity: 'error' }]);
  }
}
