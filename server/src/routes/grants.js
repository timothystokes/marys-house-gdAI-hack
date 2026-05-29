import { Router } from 'express';
import { db } from '../db/db.js';

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

export default router;
