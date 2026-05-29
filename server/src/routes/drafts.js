import { Router } from 'express';
import { db } from '../db/db.js';
import { generateDraft } from '../ai/draft.js';
import { markdownToDocxBuffer } from '../application/docx.js';

const router = Router();

// Filesystem-safe filename derived from the opportunity title.
function safeFilename(title, ext = 'docx') {
  const base = (title || 'grant-application')
    .replace(/[\\/:*?"<>|]+/g, ' ')   // strip Windows/Unix path-unsafe chars
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'grant-application';
  return `${base} - Draft.${ext}`;
}

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

// Download a specific draft as a Word (.docx) document. Filename is derived
// from the opportunity title so the user gets a meaningful download.
router.get('/:draftId/docx', async (req, res) => {
  const draft = db.prepare('SELECT * FROM drafts WHERE id = ?').get(req.params.draftId);
  if (!draft) return res.status(404).json({ error: 'draft_not_found' });
  const grant = db.prepare('SELECT title FROM grants WHERE id = ?').get(draft.grant_id);
  const filename = safeFilename(grant?.title);
  try {
    const buf = await markdownToDocxBuffer(draft.content, { title: grant?.title });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Convenience: generate-if-needed + return the latest draft as .docx in a
// single request, so the UI button doesn't need a two-step flow.
router.post('/:grantId/docx', async (req, res) => {
  const grant = db.prepare('SELECT * FROM grants WHERE id = ?').get(req.params.grantId);
  if (!grant) return res.status(404).json({ error: 'grant_not_found' });
  try {
    const { content, model } = await generateDraft(grant);
    const info = db.prepare('INSERT INTO drafts (grant_id, content, model) VALUES (?, ?, ?)')
      .run(grant.id, content, model);
    const filename = safeFilename(grant.title);
    const buf = await markdownToDocxBuffer(content, { title: grant.title });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('X-Draft-Id', String(info.lastInsertRowid));
    res.setHeader('X-Model', model || '');
    res.send(buf);
  } catch (e) {
    // Surface rate-limit errors as 429 so the UI can react appropriately.
    const msg = e.message || String(e);
    const status = /429|rate.?limit/i.test(msg) ? 429 : 500;
    res.status(status).json({ error: msg });
  }
});

export default router;
