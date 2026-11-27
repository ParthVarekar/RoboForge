import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * The Design tab's link to the AI, inside the studio's own dev server: the browser sends the conversation here and
 * this forwards it to OpenRouter with the key, so the key never reaches the browser. The key and model come from
 * the git-ignored `config/llm.json` (`{"api_key": "...", "model": "..."}`, the same file the RoboForge dashboard
 * uses) or the OPENROUTER_API_KEY environment variable. Never log, print or return the key.
 *
 *   GET  /api/design/status  -> { configured, model }
 *   POST /api/design/chat    -> { text } or { error, kind }   body: { system, messages: [{ role, text }] }
 *
 * Only the configured model is used (AGENTS.md: Nemotron 3.5 Super VL by default). A production build has no such
 * endpoint; the Design tab then uses its built-in planner.
 */

const DEFAULT_MODEL = 'nvidia/nemotron-3.5-super-vl:free';
const MAX_BODY = 64_000;
const TIMEOUT_MS = 120_000;

interface LlmConfig {
  key: string | null;
  model: string;
  baseUrl: string;
}

function readConfig(root: string): LlmConfig {
  const candidates = [process.env.ROBOFORGE_LLM_CONFIG, resolve(root, 'config/llm.json'), resolve(root, '../config/llm.json')].filter(
    (p): p is string => Boolean(p),
  );
  let file: Record<string, unknown> = {};
  for (const p of candidates) {
    try {
      const d = JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, '')) as unknown;
      if (d && typeof d === 'object') {
        file = d as Record<string, unknown>;
        break;
      }
    } catch {
      // missing or unreadable: try the next place
    }
  }
  const key = String(file.api_key ?? process.env.OPENROUTER_API_KEY ?? '').trim();
  return {
    key: key || null,
    model: String(file.model ?? DEFAULT_MODEL),
    baseUrl: String(process.env.OPENROUTER_BASE_URL ?? file.base_url ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, ''),
  };
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => {
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf8');
      if (data.length > MAX_BODY) {
        fail(new Error('request too large'));
        req.destroy();
      }
    });
    req.on('end', () => ok(data));
    req.on('error', fail);
  });
}

/** Error text with anything that looks like a key removed. */
function scrub(text: string, key: string | null): string {
  let t = text.replace(/sk-or-[\w-]+/g, '[key]');
  if (key) t = t.split(key).join('[key]');
  return t.slice(0, 300);
}

function kindOf(status: number): string {
  if (status === 401 || status === 403) return 'auth';
  if (status === 402) return 'credits';
  if (status === 429) return 'rate_limit';
  if (status === 404 || status === 400) return 'model_unavailable';
  return 'unavailable';
}

export function designAi(): Plugin {
  let root = process.cwd();
  return {
    name: 'roboforge-design-ai',
    configResolved(cfg) {
      root = cfg.root;
    },
    configureServer(server) {
      server.middlewares.use('/api/design/status', (req, res) => {
        if (req.method !== 'GET') return send(res, 405, { error: 'GET only' });
        const c = readConfig(root);
        send(res, 200, { configured: c.key !== null, model: c.model });
      });
      server.middlewares.use('/api/design/chat', (req, res) => {
        void (async () => {
          if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
          const c = readConfig(root);
          if (!c.key) return send(res, 503, { error: 'no OpenRouter key on the dev server', kind: 'no_key' });
          let body: { system?: unknown; messages?: unknown };
          try {
            body = JSON.parse(await readBody(req)) as typeof body;
          } catch (err) {
            return send(res, 400, { error: err instanceof Error ? err.message : 'bad request', kind: 'bad_request' });
          }
          const system = typeof body.system === 'string' ? body.system.slice(0, 16_000) : '';
          const msgs = Array.isArray(body.messages) ? body.messages : [];
          const messages = [
            { role: 'system', content: system },
            ...msgs
              .slice(-16)
              .filter((m): m is { role: string; text: string } => Boolean(m) && typeof (m as { text?: unknown }).text === 'string')
              .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text.slice(0, 4000) })),
          ];
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
          try {
            const r = await fetch(`${c.baseUrl}/chat/completions`, {
              method: 'POST',
              signal: ctrl.signal,
              headers: {
                Authorization: `Bearer ${c.key}`,
                'Content-Type': 'application/json',
                'X-Title': 'RoboForge Studio',
              },
              body: JSON.stringify({ model: c.model, messages, temperature: 0.3, max_tokens: 900 }),
            });
            const raw = await r.text();
            if (!r.ok) return send(res, 502, { error: `OpenRouter ${r.status}: ${scrub(raw, c.key)}`, kind: kindOf(r.status) });
            const data = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> };
            const text = data.choices?.[0]?.message?.content ?? '';
            if (!text.trim()) return send(res, 502, { error: 'the model returned an empty answer', kind: 'bad_response' });
            send(res, 200, { text, model: c.model });
          } catch (err) {
            const aborted = err instanceof Error && err.name === 'AbortError';
            send(res, 504, { error: aborted ? 'the AI took too long to answer' : scrub(err instanceof Error ? err.message : String(err), c.key), kind: aborted ? 'timeout' : 'network' });
          } finally {
            clearTimeout(timer);
          }
        })();
      });
    },
  };
}
