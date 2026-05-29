import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// org-profile.md is loaded on every request rather than at startup so that
// edits made via the Eligibility tab take effect immediately without a restart.
export function getOrgProfile() {
  return fs.readFileSync(path.join(__dirname, 'org-profile.md'), 'utf8');
}

const ENDPOINT = process.env.GITHUB_MODELS_ENDPOINT || 'https://models.github.ai/inference/chat/completions';

// ── Simple global throttle + queue ────────────────────────────────────────
// The GitHub Models free tier rate-limits aggressively (tokens/min and
// requests/min). We serialise calls and enforce a minimum gap between them.
const MIN_GAP_MS = Number(process.env.AI_MIN_GAP_MS ?? 1500);
const MAX_RETRIES = Number(process.env.AI_MAX_RETRIES ?? 4);
let lastCallAt = 0;
let inflight = Promise.resolve();

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function gatedFetch(body) {
  // Chain calls so only one is in flight at a time.
  const run = inflight.then(async () => {
    const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastCallAt));
    if (wait > 0) await sleep(wait);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        },
        body,
      });
      lastCallAt = Date.now();

      if (res.ok) return res;

      // Retry on 429 (rate limit) and 5xx with exponential backoff.
      if (res.status === 429 || res.status >= 500) {
        const text = await res.text();
        // Retry-After is seconds (per RFC). x-ratelimit-reset on GitHub Models
        // can be either seconds-until-reset OR an absolute Unix epoch — the
        // latter (e.g. for daily quotas) gives nonsensical multi-hour waits, so
        // we always cap below.
        const ra = Number(res.headers.get('retry-after')) || 0;
        const xReset = Number(res.headers.get('x-ratelimit-timeremaining') || res.headers.get('x-ratelimit-reset')) || 0;
        // If it looks like an epoch (>1e9 ≈ year 2001+), convert to "from now".
        const xResetSec = xReset > 1e9 ? Math.max(0, xReset - Math.floor(Date.now() / 1000)) : xReset;
        const fromBody = (text.match(/wait\s+(\d+)\s+second/i) || [])[1];
        const bodySec = fromBody ? Number(fromBody) : 0;
        const suggested = Math.max(ra, xResetSec, bodySec) * 1000;
        const expBackoff = 2_000 * Math.pow(2, attempt);
        const MAX_BACKOFF_MS = 60_000; // never wait more than a minute between attempts
        // If the server says "come back in many minutes", give up immediately —
        // daily-quota waits are useless for an interactive request.
        if (suggested > MAX_BACKOFF_MS) {
          throw new Error(`GitHub Models ${res.status}: rate-limited for ${Math.round(suggested/1000)}s — giving up (likely daily quota). Body: ${text.slice(0,200)}`);
        }
        const backoff = Math.min(MAX_BACKOFF_MS, Math.max(suggested, expBackoff));
        if (attempt < MAX_RETRIES) {
          console.warn(`[ai] ${res.status} — retrying in ${Math.round(backoff/1000)}s (attempt ${attempt+1}/${MAX_RETRIES})`);
          await sleep(backoff);
          continue;
        }
        throw new Error(`GitHub Models error ${res.status} after ${MAX_RETRIES} retries: ${text.slice(0,200)}`);
      }
      // Non-retriable
      throw new Error(`GitHub Models error ${res.status}: ${(await res.text()).slice(0,200)}`);
    }
    throw new Error('unreachable');
  });
  // Whatever happens, free the next caller.
  inflight = run.then(() => {}, () => {});
  return run;
}

export async function chat(messages, { model } = {}) {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN is not set. Get one at https://github.com/settings/tokens');
  }
  const chosenModel = model || process.env.GITHUB_MODEL || 'openai/gpt-4.1-nano';
  const body = JSON.stringify({ model: chosenModel, messages, temperature: 0.4 });
  const res = await gatedFetch(body);
  const data = await res.json();
  return { content: data.choices?.[0]?.message?.content ?? '', model: chosenModel };
}
