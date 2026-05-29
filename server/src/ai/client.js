import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// org-profile.md is loaded on every request rather than at startup so that
// edits made via the Eligibility tab take effect immediately without a restart.
export function getOrgProfile() {
  return fs.readFileSync(path.join(__dirname, 'org-profile.md'), 'utf8');
}

// ── Provider config ───────────────────────────────────────────────────────
// We default to GitHub Models but everything is overridable via env so we
// can point at any OpenAI-compatible endpoint (Ollama, OpenAI direct,
// OpenRouter, vLLM, etc.) without code changes.
//
//   GitHub Models (default):
//     AI_BASE_URL=https://models.github.ai/inference   (implicit)
//     GITHUB_TOKEN=ghp_xxx
//     GITHUB_MODEL=openai/gpt-4.1-mini
//
//   Local Ollama:
//     AI_BASE_URL=http://localhost:11434/v1
//     GITHUB_TOKEN=ollama        (any non-empty value — Ollama ignores it)
//     GITHUB_MODEL=llama3.2:3b   (or qwen2.5:7b-instruct, etc.)
//     AI_MIN_GAP_MS=0            (no remote rate-limit to worry about)
//
//   OpenAI direct / OpenRouter / Azure: set AI_BASE_URL accordingly.
const DEFAULT_BASE = 'https://models.github.ai/inference';

// Read provider config lazily on every call. Doing this at module load would
// be wrong: ES imports hoist above dotenv.config() in index.js, so any env var
// referenced at the top level here would see the value BEFORE .env is loaded.
function providerConfig() {
  const base = (process.env.AI_BASE_URL || process.env.GITHUB_MODELS_ENDPOINT?.replace(/\/chat\/completions$/, '') || DEFAULT_BASE).replace(/\/$/, '');
  const endpoint = `${base}/chat/completions`;
  const provider = /localhost|127\.0\.0\.1|:11434/.test(base) ? 'ollama'
                : /openrouter/.test(base)                     ? 'openrouter'
                : /api\.openai\.com/.test(base)               ? 'openai'
                : /models\.github\.ai/.test(base)             ? 'github-models'
                : 'custom';
  return { base, endpoint, provider, isLocal: provider === 'ollama' };
}

// ── Simple global throttle + queue ────────────────────────────────────────
// The GitHub Models free tier rate-limits aggressively (tokens/min and
// requests/min). We serialise calls and enforce a minimum gap between them.
// For local Ollama, there's no upstream limit so the default gap is 0.
const MAX_RETRIES = Number(process.env.AI_MAX_RETRIES ?? 4);
let lastCallAt = 0;
let inflight = Promise.resolve();

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function gatedFetch(body) {
  const { endpoint, provider, isLocal } = providerConfig();
  const minGap = Number(process.env.AI_MIN_GAP_MS ?? (isLocal ? 0 : 1500));

  // Chain calls so only one is in flight at a time.
  const run = inflight.then(async () => {
    const wait = Math.max(0, minGap - (Date.now() - lastCallAt));
    if (wait > 0) await sleep(wait);

    const headers = { 'Content-Type': 'application/json' };
    // Local providers (Ollama) don't require auth; everything else does.
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await fetch(endpoint, { method: 'POST', headers, body });
      lastCallAt = Date.now();

      if (res.ok) return res;

      // Retry on 429 (rate limit) and 5xx with exponential backoff.
      if (res.status === 429 || res.status >= 500) {
        const text = await res.text();
        const ra = Number(res.headers.get('retry-after')) || 0;
        const xReset = Number(res.headers.get('x-ratelimit-timeremaining') || res.headers.get('x-ratelimit-reset')) || 0;
        const xResetSec = xReset > 1e9 ? Math.max(0, xReset - Math.floor(Date.now() / 1000)) : xReset;
        const fromBody = (text.match(/wait\s+(\d+)\s+second/i) || [])[1];
        const bodySec = fromBody ? Number(fromBody) : 0;
        const suggested = Math.max(ra, xResetSec, bodySec) * 1000;
        const expBackoff = 2_000 * Math.pow(2, attempt);
        const MAX_BACKOFF_MS = 60_000;
        if (suggested > MAX_BACKOFF_MS) {
          throw new Error(`${provider} ${res.status}: rate-limited for ${Math.round(suggested/1000)}s — giving up (likely daily quota). Body: ${text.slice(0,200)}`);
        }
        const backoff = Math.min(MAX_BACKOFF_MS, Math.max(suggested, expBackoff));
        if (attempt < MAX_RETRIES) {
          console.warn(`[ai] ${res.status} — retrying in ${Math.round(backoff/1000)}s (attempt ${attempt+1}/${MAX_RETRIES})`);
          await sleep(backoff);
          continue;
        }
        throw new Error(`${provider} error ${res.status} after ${MAX_RETRIES} retries: ${text.slice(0,200)}`);
      }
      // Non-retriable
      throw new Error(`${provider} error ${res.status}: ${(await res.text()).slice(0,200)}`);
    }
    throw new Error('unreachable');
  });
  // Whatever happens, free the next caller.
  inflight = run.then(() => {}, () => {});
  return run;
}

export async function chat(messages, { model } = {}) {
  const { isLocal, provider } = providerConfig();
  // Only require a token for hosted providers.
  if (!isLocal && !process.env.GITHUB_TOKEN) {
    throw new Error(`No auth token set. For ${provider}, set GITHUB_TOKEN in .env. For local Ollama, set AI_BASE_URL=http://localhost:11434/v1`);
  }
  const chosenModel = model || process.env.GITHUB_MODEL || 'openai/gpt-4.1-nano';
  const body = JSON.stringify({ model: chosenModel, messages, temperature: 0.4 });
  const res = await gatedFetch(body);
  const data = await res.json();
  return { content: data.choices?.[0]?.message?.content ?? '', model: chosenModel };
}
