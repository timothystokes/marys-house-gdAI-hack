import { Router } from 'express';
import { db } from '../db/db.js';
import { assessOpportunity } from '../ai/assess.js';
import * as cheerio from 'cheerio';

const router = Router();

router.get('/', (req, res) => {
  const { sort = 'score', order = 'desc', status, funderType, q } = req.query;
  const allowedSort = { score: 'score', deadline: 'deadline', amount: 'amount_max', title: 'title' };
  const sortCol = allowedSort[sort] || 'score';
  const dir = order === 'asc' ? 'ASC' : 'DESC';

  const where = [];
  const params = {};
  if (status) { where.push('status = @status'); params.status = status; }
  if (funderType) { where.push('funder_type = @funderType'); params.funderType = funderType; }
  if (q) { where.push('(title LIKE @q OR funder LIKE @q OR description LIKE @q)'); params.q = `%${q}%`; }

  const sql = `
    SELECT g.*, s.name AS source_name
    FROM grants g LEFT JOIN sources s ON g.source_id = s.id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ${sortCol} ${dir} NULLS LAST
  `;
  res.json(db.prepare(sql).all(params));
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT g.*, s.name AS source_name
    FROM grants g LEFT JOIN sources s ON g.source_id = s.id
    WHERE g.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json(row);
});

// Re-fetch the source URL and re-assess a single grant against the current
// eligibility profile. Returns the updated row.
router.post('/:id/reassess', async (req, res) => {
  const row = db.prepare('SELECT * FROM grants WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const source = row.source_id ? db.prepare('SELECT * FROM sources WHERE id = ?').get(row.source_id) : null;
  try {
    const html = await (await fetch(row.source_url, {
      headers: { 'User-Agent': process.env.SPIDER_USER_AGENT || 'MarysHouseGrantFinderBot/0.1' },
    })).text();
    const $ = cheerio.load(html);
    $('script,style,noscript,nav,footer,header,aside,form').remove();
    const pageText = ($('main').first().text() || $('article').first().text() || $('body').text())
      .replace(/\s+/g, ' ').trim().slice(0, 14000);
    const assessed = await assessOpportunity({
      pageText,
      url: row.source_url,
      sourceName: source?.name,
      hints: { title: row.title, amount_min: row.amount_min, amount_max: row.amount_max, deadline: row.deadline },
    });
    if (!assessed) return res.status(502).json({ error: 'assessment_failed' });
    db.prepare(`
      UPDATE grants SET
        title=@title, funder=@funder, funder_type=@funder_type,
        amount_min=@amount_min, amount_max=@amount_max, currency=@currency,
        deadline=@deadline, eligibility=@eligibility, description=@description, status=@status,
        mission_fit=@mission_fit, eligibility_fit=@eligibility_fit, funding_value=@funding_value,
        win_likelihood=@win_likelihood, timing_score=@timing_score,
        score=@score, score_rationale=@score_rationale,
        assessment_json=@assessment_json,
        assessed_at=datetime('now'), updated_at=datetime('now')
      WHERE id=@id
    `).run({ id: row.id, ...assessed });
    res.json(db.prepare('SELECT * FROM grants WHERE id = ?').get(row.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Re-score every grant in the background. Returns 202 immediately.
router.post('/reassess-all', (_req, res) => {
  const ids = db.prepare('SELECT id FROM grants').all().map(r => r.id);
  (async () => {
    for (const id of ids) {
      try {
        await fetch(`http://localhost:${process.env.PORT || 3001}/api/grants/${id}/reassess`, { method: 'POST' });
      } catch (e) { console.warn(`[reassess-all] grant ${id} failed: ${e.message}`); }
    }
    console.log(`[reassess-all] finished ${ids.length} grants`);
  })();
  res.status(202).json({ queued: ids.length });
});

export default router;
