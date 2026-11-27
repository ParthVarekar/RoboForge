import { offlineTurn } from './offline';
import { catalogForPrompt, parsePlan, type BuildPlan } from './plan';

/** The AI's instructions: what it may use, how to talk, and the exact JSON to answer with. */
export function systemPrompt(plan: BuildPlan | null): string {
  return [
    'You are the design assistant in RoboForge Studio, a simulator for small ESP32 robots and quadcopters.',
    'Talk with the user briefly to decide what to build, then give a build plan. Code places, wires and programs the',
    'parts; you only decide which platform and which add-on parts.',
    '',
    'Platforms and the add-on parts you may use (use these exact kind ids):',
    catalogForPrompt(),
    '',
    'Rules:',
    '- Never list the platform\'s own parts (chassis, motors, driver, battery, buck converter, ESP32) or wiring parts',
    '  (resistors, capacitor, splices): they are added automatically.',
    '- Ask at most two short questions in the whole conversation, and only when the answer changes the build. If the',
    '  user says you choose, choose sensible parts yourself.',
    '- If the user asks for something not in the list, say plainly that this tab cannot add it yet and leave it out. Many',
    '  more parts (servos, GPS, DHT22, BME280, relays, buzzer, line sensor, LED stick) are in the Parts list:',
    '  tell the user to add those by hand after building. Never put in a different part as if it were the same thing.',
    '- At most one screen (oled_ssd1306, lcd1602_i2c or lcd2004_i2c) and one camera. The 2WD rover deck is small: a',
    '  16x2 or 20x4 LCD does not fit on it, so use the OLED on a rover.',
    '- Use plain words. Do not promise that anything is safe, guaranteed or proven.',
    '',
    'Answer with ONE JSON object and nothing else:',
    '{"reply": "1 to 3 short sentences to the user", "plan": null}',
    'or, once the build is clear (or when changing an existing plan, give the whole updated plan):',
    '{"reply": "...", "plan": {"title": "short name", "summary": "one sentence", "platform": "rover|drone|bench",',
    ' "parts": [{"kind": "hcsr04", "qty": 1, "role": "what it does", "placement": "front|back|any"}]}}',
    '',
    plan ? `The current plan is:\n${JSON.stringify(plan)}` : 'There is no plan yet.',
  ].join('\n');
}

/**
 * One turn of the design chat. When the studio's dev server has an OpenRouter key, the AI answers (through
 * /api/design/chat, which keeps the key on the server); otherwise, or when the AI fails or returns no usable plan, the
 * offline planner does. Either way the result is a reply and, once the build is clear, a checked plan.
 */

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface DesignTurnResult {
  reply: string;
  plan: BuildPlan | null;
  source: 'ai' | 'offline';
  /** Why the offline planner answered instead of the AI, when it did. */
  notice?: string;
  dropped?: Array<{ kind: string; reason: string }>;
}

export interface AiStatus {
  configured: boolean;
  model?: string;
}

let statusCache: Promise<AiStatus> | null = null;

/** Whether the dev server can reach the AI (asked once per page). */
export function aiStatus(): Promise<AiStatus> {
  if (!statusCache) {
    statusCache = fetch('/api/design/status')
      .then((r) => (r.ok ? (r.json() as Promise<AiStatus>) : { configured: false }))
      .catch(() => ({ configured: false }));
  }
  return statusCache;
}

/** The first JSON object in a text (models sometimes wrap it in prose or a code fence). */
export function firstJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < text.length; i += 1) {
    const c = text[i]!;
    if (inStr) {
      if (c === '\\') i += 1;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Reads the AI's answer: `{ "reply": "...", "plan": null | {...} }`. */
export function readAiAnswer(raw: string): { reply: string; plan: BuildPlan | null; dropped: Array<{ kind: string; reason: string }>; error?: string } {
  const obj = firstJsonObject(raw) as { reply?: unknown; plan?: unknown } | null;
  if (!obj || typeof obj !== 'object') return { reply: '', plan: null, dropped: [], error: 'the answer was not JSON' };
  const reply = typeof obj.reply === 'string' ? obj.reply.trim() : '';
  if (obj.plan === null || obj.plan === undefined) return { reply, plan: null, dropped: [] };
  const parsed = parsePlan(obj.plan);
  if ('error' in parsed) return { reply, plan: null, dropped: [], error: parsed.error };
  return { reply, plan: parsed.plan, dropped: parsed.dropped };
}

export async function designTurn(history: readonly ChatMessage[], text: string, plan: BuildPlan | null, useAi: boolean): Promise<DesignTurnResult> {
  const offline = (notice?: string): DesignTurnResult => {
    const t = offlineTurn(
      text,
      plan,
      history.filter((m) => m.role === 'user').map((m) => m.text),
    );
    return { reply: t.reply, plan: t.plan, source: 'offline', notice };
  };
  if (!useAi || !(await aiStatus()).configured) return offline();
  try {
    const res = await fetch('/api/design/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: systemPrompt(plan), messages: [...history, { role: 'user', text }] }),
    });
    const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string; kind?: string };
    if (!res.ok || typeof body.text !== 'string') {
      return offline(`The AI is not available right now (${body.error ?? `HTTP ${res.status}`}), so the built-in planner answered.`);
    }
    const ans = readAiAnswer(body.text);
    if (ans.error) return offline(`The AI's answer could not be used (${ans.error}), so the built-in planner answered.`);
    if (!ans.plan && !ans.reply) return offline('The AI gave an empty answer, so the built-in planner answered.');
    // a question back from the AI keeps the current plan; a new plan replaces it
    return { reply: ans.reply || 'Here is the plan.', plan: ans.plan ?? plan, source: 'ai', dropped: ans.dropped };
  } catch (err) {
    return offline(`Could not reach the AI (${err instanceof Error ? err.message : String(err)}), so the built-in planner answered.`);
  }
}
