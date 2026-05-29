// Opportunity assessment agent.
//
// Given the text of a funding opportunity page (plus any heuristic hints and
// linked PDF text), this calls the LLM once with the current org-profile.md
// loaded fresh and returns a fully-populated grant record with sub-scores
// and a final propensity score.
//
// Sub-scores (each 0-100):
//   mission_fit       Alignment with DFV / women & children / crisis & recovery.
//   eligibility_fit   How well Mary's House meets stated eligibility (DGR, location, size, etc).
//   funding_value     Magnitude and usefulness of the $ amount on offer.
//   win_likelihood    Estimated probability of winning given competitiveness & fit.
//   timing            Lead time before the deadline — enough to write a strong application?
//
// Final score: eligibility is a hard gate.
//   * eligibility_fit <= 20  →  final = round(eligibility_fit * 0.4)    // capped low
//   * eligibility_fit <= 50  →  final = round(eligibility_fit * 0.8)    // soft cap
//   * else                   →  weighted average of all five sub-scores
//
// We compute the final score deterministically in code (not via the model) so
// the math is transparent and tunable from one place.

import { chat, getOrgProfile } from './client.js';

const WEIGHTS = {
  mission_fit:     0.35,
  eligibility_fit: 0.25,
  funding_value:   0.15,
  win_likelihood:  0.15,
  timing:          0.10,
};

const SYSTEM_PROMPT = `You are a grant analyst for Mary's House Services, an Australian not-for-profit providing
specialist domestic and family violence (DFV) services on Sydney's Northern Beaches.

You will be given the text of a web page (and optionally an attached PDF guidelines document) that may
describe a funding opportunity, plus the organisation profile of Mary's House.

Your job: extract structured information about the opportunity and rate its fit across five dimensions.

Return ONLY a single JSON object with EXACTLY these fields (no prose, no markdown fences):
{
  "title":            string,              // <= 200 chars
  "funder":           string|null,
  "funder_type":      "government"|"philanthropic"|"corporate"|"community"|null,
  "amount_min":       integer|null,        // AUD
  "amount_max":       integer|null,        // AUD
  "deadline":         string|null,         // YYYY-MM-DD; null if unknown/rolling
  "eligibility":      string,              // <= 500 chars summary of stated eligibility requirements
  "description":      string,              // <= 800 chars plain-language summary of what's funded
  "status":           "open"|"closing_soon"|"closed",
  "is_opportunity":   boolean,             // false if page is not a real opportunity (about page, news, etc.)

  "mission_fit":      integer,             // 0-100  DFV / women & children / crisis & recovery alignment
  "eligibility_fit":  integer,             // 0-100  How well Mary's House meets eligibility criteria
  "funding_value":    integer,             // 0-100  Magnitude & usefulness of the grant amount
  "win_likelihood":   integer,             // 0-100  Probability of winning given competitiveness
  "timing":           integer,             // 0-100  Lead time before deadline (low if < 2 weeks or closed)

  "rationale":        string               // <= 320 chars summarising your overall reasoning
}

Sub-score guidance:
  mission_fit       100 = directly funds DFV crisis/recovery for women & children in NSW.
                    50  = broader social services or women's health; possible adjacent fit.
                    0   = medical research, environment, sport — unrelated.

  eligibility_fit   100 = NFP / DGR Item 1 / NSW-eligible / size matches; clearly eligible.
                    50  = probably eligible but unclear on one criterion.
                    0   = explicitly ineligible (e.g. universities only, overseas only, individuals only).
                    USE THIS HONESTLY — if the page says "for universities only" and Mary's House is
                    a DFV service NFP, score this 0 even if mission fit is high.

  funding_value     100 = $100k+ unrestricted multi-year. 50 = $20-50k single year. 10 = < $5k or in-kind only.

  win_likelihood    100 = small targeted round, few likely applicants, strong alignment.
                    50  = competitive but plausible. 10 = open national round, hundreds of applicants.

  timing            100 = 6+ weeks lead time, deadline known. 50 = 2-4 weeks. 0 = past deadline or < 1 week.

If the page is NOT an opportunity (about us, news article, etc.), set is_opportunity=false and you
may zero out the sub-scores.`;

function safeParseJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function clampInt(v, min, max) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

function clampStr(v, max) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function normaliseDeadline(v) {
  if (!v || typeof v !== 'string') return null;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function inferStatus(rawStatus, deadline) {
  const allowed = new Set(['open', 'closing_soon', 'closed']);
  let s = allowed.has(rawStatus) ? rawStatus : 'open';
  if (deadline) {
    const today = new Date().toISOString().slice(0, 10);
    if (deadline < today) return 'closed';
    const days = (new Date(deadline) - new Date(today)) / 86400000;
    if (days <= 14 && s === 'open') s = 'closing_soon';
  }
  return s;
}

/**
 * Combine sub-scores into a final 0-100 score, with eligibility as a hard gate.
 * Exported so the same formula can be used elsewhere (e.g. re-scoring without
 * re-calling the LLM).
 */
export function computeFinalScore({ mission_fit, eligibility_fit, funding_value, win_likelihood, timing }) {
  const m = clampInt(mission_fit, 0, 100) ?? 0;
  const e = clampInt(eligibility_fit, 0, 100) ?? 0;
  const f = clampInt(funding_value, 0, 100) ?? 0;
  const w = clampInt(win_likelihood, 0, 100) ?? 0;
  const t = clampInt(timing, 0, 100) ?? 0;

  if (e <= 20) return Math.round(e * 0.4);
  if (e <= 50) return Math.round(e * 0.8);

  const weighted =
    m * WEIGHTS.mission_fit +
    e * WEIGHTS.eligibility_fit +
    f * WEIGHTS.funding_value +
    w * WEIGHTS.win_likelihood +
    t * WEIGHTS.timing;
  return Math.max(0, Math.min(100, Math.round(weighted)));
}

/**
 * @param {object} input
 * @param {string} input.pageText    Plaintext from the opportunity page.
 * @param {string} input.url         Source URL (for context).
 * @param {string} [input.sourceName]  Configured Source name (used as funder fallback).
 * @param {string} [input.pdfText]   Extracted text from linked guideline PDFs (optional).
 * @param {object} [input.hints]     Heuristic hints from the spider (title, amounts, deadline).
 * @returns {Promise<null | object>}
 */
export async function assessOpportunity({ pageText, url, sourceName, pdfText, hints = {} }) {
  const trimmed = (pageText || '').replace(/\s+/g, ' ').trim().slice(0, 12000);
  if (!trimmed) return null;
  const trimmedPdf = pdfText ? pdfText.replace(/\s+/g, ' ').trim().slice(0, 12000) : '';

  const hintBlock = [
    hints.title ? `Suggested title: ${hints.title}` : null,
    hints.amount_min || hints.amount_max ? `Detected amount(s): ${hints.amount_min ?? '?'} - ${hints.amount_max ?? '?'} AUD` : null,
    hints.deadline ? `Detected date in text: ${hints.deadline}` : null,
    sourceName ? `Source name (likely funder or aggregator): ${sourceName}` : null,
  ].filter(Boolean).join('\n');

  const messages = [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\n--- MARY'S HOUSE ORGANISATION PROFILE ---\n${getOrgProfile()}` },
    {
      role: 'user',
      content:
        `URL: ${url}\n\n` +
        `Hints:\n${hintBlock || '(none)'}\n\n` +
        `--- PAGE TEXT ---\n${trimmed}\n--- END PAGE TEXT ---\n` +
        (trimmedPdf ? `\n--- LINKED PDF TEXT ---\n${trimmedPdf}\n--- END PDF TEXT ---\n` : '') +
        `\nReturn the JSON object now.`,
    },
  ];

  let raw;
  try {
    const { content } = await chat(messages);
    raw = safeParseJson(content);
  } catch (e) {
    console.warn(`[assess] AI call failed for ${url}: ${e.message}`);
    return null;
  }
  if (!raw) return null;

  const deadline = normaliseDeadline(raw.deadline);
  const status = inferStatus(raw.status, deadline);

  const mission_fit     = clampInt(raw.mission_fit,     0, 100) ?? 0;
  const eligibility_fit = clampInt(raw.eligibility_fit, 0, 100) ?? 0;
  const funding_value   = clampInt(raw.funding_value,   0, 100) ?? 0;
  const win_likelihood  = clampInt(raw.win_likelihood,  0, 100) ?? 0;
  const timing          = clampInt(raw.timing,          0, 100) ?? 0;
  const score = computeFinalScore({ mission_fit, eligibility_fit, funding_value, win_likelihood, timing });

  return {
    title:           clampStr(raw.title, 300) || hints.title || 'Untitled opportunity',
    funder:          clampStr(raw.funder, 200) || sourceName || null,
    funder_type:     ['government', 'philanthropic', 'corporate', 'community'].includes(raw.funder_type) ? raw.funder_type : null,
    amount_min:      clampInt(raw.amount_min, 0, 100_000_000) ?? hints.amount_min ?? null,
    amount_max:      clampInt(raw.amount_max, 0, 100_000_000) ?? hints.amount_max ?? null,
    currency:        'AUD',
    deadline,
    eligibility:     clampStr(raw.eligibility, 500) || '',
    description:     clampStr(raw.description, 800) || '',
    status,
    is_opportunity:  raw.is_opportunity !== false,

    // Sub-scores
    mission_fit,
    eligibility_fit,
    funding_value,
    win_likelihood,
    timing_score: timing,

    // Final
    score,
    score_rationale: clampStr(raw.rationale, 320) || '',

    // Full blob for future fields
    assessment_json: JSON.stringify({
      sub_scores: { mission_fit, eligibility_fit, funding_value, win_likelihood, timing },
      weights: WEIGHTS,
      raw,
      assessed_at: new Date().toISOString(),
    }),
  };
}
