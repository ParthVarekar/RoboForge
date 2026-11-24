/**
 * Arduino `Print` formatting shared by Serial and the display libraries, and the byte view of text: inside a sketch,
 * strings hold one byte per character (the translator turns non-ASCII characters in string literals into their
 * UTF-8 bytes, as the C++ compiler stores them), so `(char)247` and "°" behave as they do on the board.
 */

/** HEX/BIN/OCT/DEC for whole numbers, decimal places otherwise; bools print 1/0. */
export function formatPrintValue(val: unknown, format?: number): string {
  if (typeof val === 'number' && typeof format === 'number') {
    if (Number.isInteger(val) && (format === 2 || format === 8 || format === 16)) return (val >>> 0).toString(format).toUpperCase();
    if (Number.isInteger(val) && format === 10) return String(val);
    return val.toFixed(Math.max(0, Math.min(10, Math.round(format))));
  }
  if (typeof val === 'boolean') return val ? '1' : '0';
  return String(val);
}

/** The bytes a sketch string stands for: characters up to 0xFF are bytes, anything above is UTF-8 encoded. */
export function textBytes(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp <= 0xff) out.push(cp);
    else for (const b of new TextEncoder().encode(ch)) out.push(b);
  }
  return out;
}

const utf8 = new TextDecoder('utf-8', { fatal: false });

/**
 * What a serial monitor shows for sketch text: the bytes decoded as UTF-8 (a stray high byte becomes the
 * replacement character, as in the Arduino IDE). Text that is plain ASCII, or already holds characters above 0xFF,
 * is returned as it is.
 */
export function decodeSketchText(text: string): string {
  let high = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c > 0xff) return text;
    if (c > 0x7f) high = true;
  }
  if (!high) return text;
  return utf8.decode(Uint8Array.from(text, (ch) => ch.charCodeAt(0) & 0xff));
}

/** Sketch-side form of text typed by the user (the Serial tab): UTF-8 bytes, one per character. */
export function encodeSketchText(text: string): string {
  if (!/[\u0080-￿]/.test(text)) return text;
  return String.fromCharCode(...new TextEncoder().encode(text));
}
