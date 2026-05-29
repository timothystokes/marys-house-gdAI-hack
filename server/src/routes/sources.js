import { Router } from 'express';
import { db } from '../db/db.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM sources ORDER BY created_at DESC').all());
});

router.post('/', (req, res) => {
  const { name, url, enabled = 1 } = req.body || {};
  if (!name || !url) return res.status(400).json({ error: 'name and url required' });
  try {
    const info = db.prepare('INSERT INTO sources (name, url, enabled) VALUES (?, ?, ?)').run(name, url, enabled ? 1 : 0);
    res.status(201).json(db.prepare('SELECT * FROM sources WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.patch('/:id', (req, res) => {
  const { name, url, enabled } = req.body || {};
  const current = db.prepare('SELECT * FROM sources WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'not_found' });
  db.prepare('UPDATE sources SET name = ?, url = ?, enabled = ? WHERE id = ?').run(
    name ?? current.name,
    url ?? current.url,
    enabled === undefined ? current.enabled : (enabled ? 1 : 0),
    req.params.id,
  );
  res.json(db.prepare('SELECT * FROM sources WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM sources WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
