import { Router } from 'express';
import { db } from '../db/db.js';
import { crawlSource, crawlAll } from '../spider/index.js';
import { getStatus, getAllStatuses } from '../spider/status.js';

const router = Router();

// Helper: attach live crawl status to a source row
function withStatus(row) {
  return { ...row, crawl: getStatus(row.id) };
}

// Normalise user-entered URLs: add https:// if no scheme, strip trailing whitespace.
function normaliseUrl(raw) {
  if (!raw) return raw;
  let u = String(raw).trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { return new URL(u).toString(); } catch { return null; }
}

router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM sources ORDER BY created_at DESC').all();
  res.json(rows.map(withStatus));
});

// Aggregate crawl status (handy for global polling)
router.get('/crawl-status', (_req, res) => {
  res.json(getAllStatuses());
});

router.post('/', (req, res) => {
  const { name, enabled = 1 } = req.body || {};
  const url = normaliseUrl(req.body?.url);
  if (!name || !url) return res.status(400).json({ error: 'name and a valid url are required' });
  try {
    const info = db.prepare('INSERT INTO sources (name, url, enabled) VALUES (?, ?, ?)').run(name, url, enabled ? 1 : 0);
    res.status(201).json(withStatus(db.prepare('SELECT * FROM sources WHERE id = ?').get(info.lastInsertRowid)));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.patch('/:id', (req, res) => {
  const { name, enabled } = req.body || {};
  const url = req.body?.url !== undefined ? normaliseUrl(req.body.url) : undefined;
  if (req.body?.url !== undefined && !url) return res.status(400).json({ error: 'invalid url' });
  const current = db.prepare('SELECT * FROM sources WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'not_found' });
  db.prepare('UPDATE sources SET name = ?, url = ?, enabled = ? WHERE id = ?').run(
    name ?? current.name,
    url ?? current.url,
    enabled === undefined ? current.enabled : (enabled ? 1 : 0),
    req.params.id,
  );
  res.json(withStatus(db.prepare('SELECT * FROM sources WHERE id = ?').get(req.params.id)));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM sources WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// Trigger a crawl for all enabled sources (fire-and-forget, returns immediately)
router.post('/crawl-all', (_req, res) => {
  const sources = db.prepare('SELECT * FROM sources WHERE enabled = 1').all();
  // Run in background; client polls /api/sources for live status.
  crawlAll().catch(e => console.error('[crawl-all] failed:', e));
  res.status(202).json({ sourcesQueued: sources.length });
});

// Trigger a crawl for a single source (fire-and-forget)
router.post('/:id/crawl', (req, res) => {
  const source = db.prepare('SELECT * FROM sources WHERE id = ?').get(req.params.id);
  if (!source) return res.status(404).json({ error: 'not_found' });
  crawlSource(source).catch(e => console.error(`[crawl ${source.id}] failed:`, e));
  res.status(202).json({ sourceId: source.id, started: true });
});

export default router;
