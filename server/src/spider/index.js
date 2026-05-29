// Real web spider with DB-backed crawl queue + visited set.
//
// Design:
//   * crawl_pages table holds both the queue (status='pending') and visited
//     set (status='done'|'failed'|'skipped'); (source_id, url) is unique.
//   * Each crawl run respects per-source budgets: max_pages, max_depth,
//     request_delay_ms.
//   * Same-origin only: any extracted link with a different hostname than
//     the seed is dropped.
//   * Pages whose text matches grant signals are extracted into the
//     grants table with whatever heuristics we can pull (title, amount,
//     deadline). AI scoring is a separate concern and runs later.
//
// To replace this generic crawler with a per-site adapter, swap out
// `extractGrant()` and `extractLinks()` for site-specific logic.

import * as cheerio from 'cheerio';
import { createRequire } from 'node:module';
import { db } from '../db/db.js';
import { startStatus, updateStatus, finishStatus, failStatus, isRunning } from './status.js';
import { assessOpportunity } from '../ai/assess.js';

// pdf-parse v2.x exports a PDFParse class (different from v1's function API).
// We lazy-load with createRequire so a missing/incompatible install can't crash startup.
const requireCjs = createRequire(import.meta.url);
let _pdfParseClass = null;
function getPdfParser() {
  if (_pdfParseClass !== null) return _pdfParseClass;
  try {
    const mod = requireCjs('pdf-parse');
    _pdfParseClass = mod.PDFParse || mod.default?.PDFParse || null;
    if (!_pdfParseClass) throw new Error('pdf-parse PDFParse class not exported');
  } catch (e) {
    console.warn('[spider] pdf-parse unavailable, PDF extraction disabled:', e.message);
    _pdfParseClass = false;
  }
  return _pdfParseClass;
}

const DEFAULT_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 (compatible; MarysHouseGrantFinderBot/0.1; +fundraising@maryshouse.org.au)";
const USER_AGENT = process.env.SPIDER_USER_AGENT || DEFAULT_UA;
const ASSET_EXT = /\.(png|jpe?g|gif|svg|webp|pdf|zip|mp4|mp3|css|js|ico|woff2?)(\?|$)/i;
const GRANT_SIGNALS = /\b(grant|funding|apply|application|deadline|round|fellowship|scholarship)\b/i;
const GUIDELINE_HINT = /(guideline|criteria|fact[-_ ]?sheet|info|fund|grant|apply|eligibility)/i;
// Titles / URL slugs that strongly indicate a directory/landing/help page (not a specific opportunity).
const NON_OPPORTUNITY_TITLE = /\b(home|welcome|sign\s*in|log\s*in|register|contact|about|faq|help|search|browse|directory|list(?:ing)?s?|index|category|categories|news|blog|media|privacy|terms|accessibility|glossary|sitemap|disclaimer|forecast|upcoming|landing)\b/i;
const NON_OPPORTUNITY_URL = /\/(home|search|browse|index|about|contact|faq|help|news|blog|media|privacy|terms|accessibility|glossary|sitemap|forecast|categor(?:y|ies)|tag|login|register|signin|signup|account|profile)\b/i;
// Minimum AI fit to bother saving. Below this we drop the row entirely so the
// UI isn't polluted with clearly-ineligible noise; tune via env if desired.
const MIN_SAVE_SCORE = Number(process.env.MIN_SAVE_SCORE ?? 10);
const MAX_PDF_BYTES = 2 * 1024 * 1024;      // 2 MB
const MAX_PDFS_PER_OPP = 2;

// ---------- Prepared statements ----------
const stmts = {
  enqueue: db.prepare(`
    INSERT OR IGNORE INTO crawl_pages (source_id, url, depth, status)
    VALUES (?, ?, ?, 'pending')
  `),
  nextPending: db.prepare(`
    SELECT * FROM crawl_pages WHERE source_id = ? AND status = 'pending'
    ORDER BY depth ASC, id ASC LIMIT 1
  `),
  countDone: db.prepare(`
    SELECT COUNT(*) AS n FROM crawl_pages WHERE source_id = ? AND status IN ('done', 'failed', 'skipped')
  `),
  markInProgress: db.prepare(`UPDATE crawl_pages SET status = 'in_progress' WHERE id = ?`),
  markDone: db.prepare(`UPDATE crawl_pages SET status = 'done', http_status = ?, fetched_at = datetime('now') WHERE id = ?`),
  markFailed: db.prepare(`UPDATE crawl_pages SET status = 'failed', http_status = ?, error = ?, fetched_at = datetime('now') WHERE id = ?`),
  markSkipped: db.prepare(`UPDATE crawl_pages SET status = 'skipped', error = ?, fetched_at = datetime('now') WHERE id = ?`),
  // Re-queue previously failed pages so "Search now" acts as a retry trigger.
  requeueFailed: db.prepare(`UPDATE crawl_pages SET status = 'pending', error = NULL, http_status = NULL WHERE source_id = ? AND status = 'failed'`),
  // Re-queue done/skipped pages so re-crawling refreshes assessments on every page we've seen.
  requeueAll: db.prepare(`UPDATE crawl_pages SET status = 'pending', error = NULL, http_status = NULL WHERE source_id = ? AND status IN ('done', 'failed', 'skipped')`),
  insertGrant: db.prepare(`
    INSERT INTO grants (
      source_id, title, funder, funder_type, amount_min, amount_max, currency,
      deadline, eligibility, description, source_url, status,
      mission_fit, eligibility_fit, funding_value, win_likelihood, timing_score,
      score, score_rationale, assessment_json, assessed_at
    ) VALUES (
      @source_id, @title, @funder, @funder_type, @amount_min, @amount_max, @currency,
      @deadline, @eligibility, @description, @source_url, @status,
      @mission_fit, @eligibility_fit, @funding_value, @win_likelihood, @timing_score,
      @score, @score_rationale, @assessment_json, @assessed_at
    )
    ON CONFLICT(source_url) DO UPDATE SET
      title           = excluded.title,
      funder          = excluded.funder,
      funder_type     = excluded.funder_type,
      amount_min      = excluded.amount_min,
      amount_max      = excluded.amount_max,
      currency        = excluded.currency,
      deadline        = excluded.deadline,
      eligibility     = excluded.eligibility,
      description     = excluded.description,
      status          = excluded.status,
      mission_fit     = excluded.mission_fit,
      eligibility_fit = excluded.eligibility_fit,
      funding_value   = excluded.funding_value,
      win_likelihood  = excluded.win_likelihood,
      timing_score    = excluded.timing_score,
      score           = excluded.score,
      score_rationale = excluded.score_rationale,
      assessment_json = excluded.assessment_json,
      assessed_at     = excluded.assessed_at,
      updated_at      = datetime('now')
  `),
  updateGrantAssessment: db.prepare(`
    UPDATE grants SET
      title           = @title,
      funder          = @funder,
      funder_type     = @funder_type,
      amount_min      = @amount_min,
      amount_max      = @amount_max,
      currency        = @currency,
      deadline        = @deadline,
      eligibility     = @eligibility,
      description     = @description,
      status          = @status,
      mission_fit     = @mission_fit,
      eligibility_fit = @eligibility_fit,
      funding_value   = @funding_value,
      win_likelihood  = @win_likelihood,
      timing_score    = @timing_score,
      score           = @score,
      score_rationale = @score_rationale,
      assessment_json = @assessment_json,
      assessed_at     = datetime('now'),
      updated_at      = datetime('now')
    WHERE source_url = @source_url
  `),
  touchSource: db.prepare("UPDATE sources SET last_crawled_at = datetime('now') WHERE id = ?"),
};

// ---------- Helpers ----------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function normaliseUrl(href, base) {
  try {
    const u = new URL(href, base);
    u.hash = '';
    // Drop trailing slash for consistency (except root)
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch { return null; }
}

function sameOrigin(a, b) {
  try { return new URL(a).hostname === new URL(b).hostname; }
  catch { return false; }
}

function extractLinks($, baseUrl, seedUrl) {
  const out = new Set();
  $('a[href]').each((_, el) => {
    const raw = $(el).attr('href');
    if (!raw) return;
    if (/^(mailto:|tel:|javascript:|#)/i.test(raw)) return;
    const abs = normaliseUrl(raw, baseUrl);
    if (!abs) return;
    if (!/^https?:/i.test(abs)) return;
    if (ASSET_EXT.test(abs)) return;
    if (!sameOrigin(abs, seedUrl)) return;
    out.add(abs);
  });
  return [...out];
}

function cleanPageText($) {
  // Remove noise elements before extracting text so the LLM sees mostly content.
  $('script, style, noscript, nav, footer, header, aside, form, iframe, svg').remove();
  const root = $('main').first().length ? $('main').first()
             : $('article').first().length ? $('article').first()
             : $('body');
  return root.text().replace(/\s+/g, ' ').trim();
}

function extractGrant($, url) {
  const title = ($('h1').first().text() || $('title').text() || '').trim();
  const bodyText = cleanPageText($).slice(0, 4000); // hint-extraction text
  if (!title || !GRANT_SIGNALS.test(title + ' ' + bodyText)) return null;

  // Cheap pre-filter: skip obvious directory/help/landing pages before paying for the LLM.
  // Note: we still let through pages whose title looks suspect IF the URL clearly identifies
  // a specific opportunity (e.g. contains an id like GO1234, /grant/123/, etc.).
  const looksLikeSpecificUrl = /\/(GO|GR|GA|grant|round|program)[\/\-]?\d+/i.test(url);
  if (!looksLikeSpecificUrl) {
    if (NON_OPPORTUNITY_TITLE.test(title)) return null;
    if (NON_OPPORTUNITY_URL.test(url)) return null;
  }

  const description = ($('meta[name="description"]').attr('content')
    || $('p').first().text() || bodyText.slice(0, 400)).trim().slice(0, 800);

  // Dollar amounts: $10,000 or $1.5m / $1.5 million
  const amounts = [];
  const re = /\$\s?([\d,]+(?:\.\d+)?)\s?(million|m|k|thousand)?/gi;
  let m;
  while ((m = re.exec(bodyText)) && amounts.length < 20) {
    let n = parseFloat(m[1].replace(/,/g, ''));
    if (Number.isNaN(n)) continue;
    const unit = (m[2] || '').toLowerCase();
    if (unit === 'million' || unit === 'm') n *= 1_000_000;
    else if (unit === 'thousand' || unit === 'k') n *= 1_000;
    if (n >= 1000 && n <= 50_000_000) amounts.push(Math.round(n));
  }
  const amount_min = amounts.length ? Math.min(...amounts) : null;
  const amount_max = amounts.length ? Math.max(...amounts) : null;

  // Deadline: look for "closes / deadline / by" + date
  let deadline = null;
  const dateRe = /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+20\d{2})|(20\d{2}-\d{2}-\d{2})/i;
  const around = bodyText.match(new RegExp(`(?:close[sd]?|deadline|due|by|apply by|closing)\\s*[^.]{0,40}?(${dateRe.source})`, 'i'));
  const fallback = bodyText.match(dateRe);
  const found = around?.[1] || fallback?.[0];
  if (found) {
    const d = new Date(found);
    if (!Number.isNaN(d.getTime())) deadline = d.toISOString().slice(0, 10);
  }

  return { title: title.slice(0, 300), description, amount_min, amount_max, deadline, source_url: url };
}

// Collect same-origin PDF links that look like grant guidelines/criteria/fact-sheets.
function findGuidelinePdfs($, baseUrl, seedUrl) {
  const out = [];
  const seen = new Set();
  $('a[href]').each((_, el) => {
    const raw = $(el).attr('href');
    if (!raw) return;
    const abs = normaliseUrl(raw, baseUrl);
    if (!abs || !/^https?:/i.test(abs)) return;
    if (!/\.pdf(\?|$)/i.test(abs)) return;
    if (!sameOrigin(abs, seedUrl)) return;
    const linkText = ($(el).text() || '').trim();
    // Either the URL filename or visible link text should hint at guidelines.
    if (!GUIDELINE_HINT.test(abs) && !GUIDELINE_HINT.test(linkText)) return;
    if (seen.has(abs)) return;
    seen.add(abs);
    out.push(abs);
  });
  return out.slice(0, MAX_PDFS_PER_OPP);
}

async function fetchPdfText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/pdf' },
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!/pdf/i.test(ct) && !/\.pdf(\?|$)/i.test(url)) return null;
    const len = Number(res.headers.get('content-length') || 0);
    if (len && len > MAX_PDF_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_PDF_BYTES) return null;
    const PDFParse = getPdfParser();
    if (!PDFParse) return null;
    const parser = new PDFParse({ data: buf });
    try {
      const data = await parser.getText();
      return (data?.text || '').slice(0, 20000);
    } finally {
      // Best-effort cleanup; v2 exposes destroy() to free pdfjs resources.
      try { await parser.destroy?.(); } catch { /* noop */ }
    }
  } catch (e) {
    console.warn(`[spider] PDF fetch failed ${url}: ${e.message}`);
    return null;
  } finally { clearTimeout(t); }
}

async function fetchHtml(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
    });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok) return { status: res.status, html: null, contentType: ct, error: `HTTP ${res.status}` };
    if (!/text\/html|application\/xhtml/i.test(ct)) return { status: res.status, html: null, contentType: ct, error: 'non-html' };
    return { status: res.status, html: await res.text(), contentType: ct, error: null };
  } finally { clearTimeout(t); }
}

// ---------- Public API ----------
export async function crawlSource(source, { onProgress } = {}) {
  if (isRunning(source.id)) {
    return { sourceId: source.id, fetched: 0, inserted: 0, pendingRemaining: null, budgetReached: false, skippedReason: 'already_running' };
  }

  const maxPages = source.max_pages ?? 25;
  const maxDepth = source.max_depth ?? 2;
  const delay = source.request_delay_ms ?? 1000;

  startStatus(source.id, maxPages);

  if (!process.env.GITHUB_TOKEN) {
    console.warn('[spider] ⚠️  GITHUB_TOKEN is not set — opportunities will be saved without AI assessment (no scores, no sub-scores). Add it to .env and re-crawl.');
  }

  // Seed the queue with the source URL if we've never seen it.
  stmts.enqueue.run(source.id, normaliseUrl(source.url, source.url) || source.url, 0);
  // Re-crawl semantics: only retry previously failed pages — leave 'done' and
  // 'skipped' alone so we don't burn LLM quota re-assessing opportunities we
  // already know about. New pages discovered via outbound links are still
  // enqueued and processed normally.
  stmts.requeueFailed.run(source.id);

  let fetchedThisRun = 0;
  let insertedGrants = 0;

  try {
    while (fetchedThisRun < maxPages) {
      const row = stmts.nextPending.get(source.id);
      if (!row) break;
      stmts.markInProgress.run(row.id);
      updateStatus(source.id, { lastUrl: row.url });

      try {
        const { status, html, error } = await fetchHtml(row.url);
        if (!html) {
          if (error === 'non-html') stmts.markSkipped.run(error, row.id);
          else stmts.markFailed.run(status || null, error || 'unknown', row.id);
        } else {
          const $ = cheerio.load(html);

          // Extract grant candidate (heuristic pre-filter)
          const grant = extractGrant($, row.url);
          if (grant) {
            // Pull richer text from the cleaned DOM for assessment.
            const fullText = cleanPageText($).slice(0, 6000);

            // Look for linked guideline PDFs on the same origin and pull their text.
            let pdfText = '';
            const pdfs = findGuidelinePdfs($, row.url, source.url);
            for (const pdfUrl of pdfs) {
              if (delay > 0) await sleep(Math.min(delay, 500));
              const text = await fetchPdfText(pdfUrl);
              if (text) {
                pdfText += `\n[PDF: ${pdfUrl}]\n${text}`;
                updateStatus(source.id, { lastUrl: `${row.url}  (+pdf)` });
              }
              if (pdfText.length > 18000) break;
            }

            // Hand to AI assessment agent.
            let assessed = null;
            try {
              assessed = await assessOpportunity({
                pageText: fullText,
                url: row.url,
                sourceName: source.name,
                pdfText: pdfText || undefined,
                hints: grant,
              });
            } catch (e) {
              console.warn(`[spider] assess failed for ${row.url}: ${e.message}`);
            }

            if (assessed && assessed.is_opportunity !== false) {
              // Drop clearly-ineligible noise (e.g. medical research, aged-care-only grants).
              // Keep the crawl_pages row as 'done' so we don't re-process; just don't save the grant.
              if ((assessed.score ?? 0) < MIN_SAVE_SCORE) {
                console.log(`[spider] skip low-fit (${assessed.score}) ${row.url} — ${assessed.title}`);
              } else {
                const info = stmts.insertGrant.run({
                  source_id: source.id,
                  source_url: row.url,
                  assessed_at: new Date().toISOString(),
                  ...assessed,
                });
                if (info.changes > 0) insertedGrants++;
              }
            } else if (!assessed) {
              // AI unavailable — fall back to heuristic insert so we don't lose the page.
              const info = stmts.insertGrant.run({
                source_id: source.id,
                source_url: row.url,
                title: grant.title,
                funder: source.name,
                funder_type: null,
                amount_min: grant.amount_min,
                amount_max: grant.amount_max,
                currency: 'AUD',
                deadline: grant.deadline,
                eligibility: '',
                description: grant.description,
                status: 'open',
                mission_fit: null,
                eligibility_fit: null,
                funding_value: null,
                win_likelihood: null,
                timing_score: null,
                score: null,
                score_rationale: 'Pending AI assessment.',
                assessment_json: null,
                assessed_at: null,
              });
              if (info.changes > 0) insertedGrants++;
            }
            // else: assessed.is_opportunity === false → skip insert; page is not a real opportunity.
          }

          // Enqueue same-origin links if we have depth budget
          if (row.depth < maxDepth) {
            const links = extractLinks($, row.url, source.url);
            for (const link of links) stmts.enqueue.run(source.id, link, row.depth + 1);
          }

          stmts.markDone.run(status, row.id);
          fetchedThisRun++;
          updateStatus(source.id, { fetched: fetchedThisRun, inserted: insertedGrants });
          onProgress?.({ url: row.url, depth: row.depth, fetched: fetchedThisRun, maxPages });
        }
      } catch (e) {
        stmts.markFailed.run(null, String(e?.message || e).slice(0, 500), row.id);
      }

      if (delay > 0) await sleep(delay);
    }

    stmts.touchSource.run(source.id);
    const queued = db.prepare(`SELECT COUNT(*) AS n FROM crawl_pages WHERE source_id = ? AND status = 'pending'`).get(source.id).n;
    const result = {
      sourceId: source.id,
      fetched: fetchedThisRun,
      inserted: insertedGrants,
      pendingRemaining: queued,
      budgetReached: fetchedThisRun >= maxPages,
    };
    finishStatus(source.id, result);
    return result;
  } catch (e) {
    failStatus(source.id, e);
    throw e;
  }
}

export async function crawlAll() {
  const sources = db.prepare('SELECT * FROM sources WHERE enabled = 1').all();
  const results = [];
  for (const s of sources) results.push(await crawlSource(s));
  return results;
}

