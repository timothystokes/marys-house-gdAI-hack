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
import { db } from '../db/db.js';
import { startStatus, updateStatus, finishStatus, failStatus, isRunning } from './status.js';

const DEFAULT_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 (compatible; MarysHouseGrantFinderBot/0.1; +fundraising@maryshouse.org.au)";
const USER_AGENT = process.env.SPIDER_USER_AGENT || DEFAULT_UA;
const ASSET_EXT = /\.(png|jpe?g|gif|svg|webp|pdf|zip|mp4|mp3|css|js|ico|woff2?)(\?|$)/i;
const GRANT_SIGNALS = /\b(grant|funding|apply|application|deadline|round|fellowship|scholarship)\b/i;

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
  insertGrant: db.prepare(`
    INSERT OR IGNORE INTO grants (
      source_id, title, funder, funder_type, amount_min, amount_max, currency,
      deadline, eligibility, description, source_url, status
    ) VALUES (
      @source_id, @title, @funder, NULL, @amount_min, @amount_max, 'AUD',
      @deadline, NULL, @description, @source_url, 'open'
    )
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

function extractGrant($, url) {
  const title = ($('h1').first().text() || $('title').text() || '').trim();
  const bodyText = $('main, article, body').first().text().replace(/\s+/g, ' ').trim().slice(0, 4000);
  if (!title || !GRANT_SIGNALS.test(title + ' ' + bodyText)) return null;

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

  // Seed the queue with the source URL if we've never seen it.
  stmts.enqueue.run(source.id, normaliseUrl(source.url, source.url) || source.url, 0);
  // Re-queue previously failed pages so "Search now" acts as a retry.
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

          // Extract grant candidate
          const grant = extractGrant($, row.url);
          if (grant) {
            const info = stmts.insertGrant.run({
              source_id: source.id,
              funder: source.name,
              ...grant,
            });
            if (info.changes > 0) insertedGrants++;
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

