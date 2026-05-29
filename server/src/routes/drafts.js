import { Router } from 'express';
import { db } from '../db/db.js';
import { generateDraft } from '../ai/draft.js';

const router = Router();

router.post('/:grantId', async (req, res) => {
  const grant = db.prepare('SELECT * FROM grants WHERE id = ?').get(req.params.grantId);
  if (!grant) return res.status(404).json({ error: 'grant_not_found' });
  try {
    const { content, model } = await generateDraft(grant);
    const info = db.prepare('INSERT INTO drafts (grant_id, content, model) VALUES (?, ?, ?)')
      .run(grant.id, content, model);
    res.status(201).json(db.prepare('SELECT * FROM drafts WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/grant/:grantId', (req, res) => {
  res.json(db.prepare('SELECT * FROM drafts WHERE grant_id = ? ORDER BY created_at DESC').all(req.params.grantId));
});

export default router;
