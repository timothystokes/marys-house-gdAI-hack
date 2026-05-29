import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_PATH = path.resolve(__dirname, '../ai/org-profile.md');

const router = Router();

router.get('/', (_req, res) => {
  try {
    const content = fs.readFileSync(PROFILE_PATH, 'utf8');
    const stat = fs.statSync(PROFILE_PATH);
    res.json({ content, updatedAt: stat.mtime.toISOString(), path: 'server/src/ai/org-profile.md' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/', (req, res) => {
  const { content } = req.body || {};
  if (typeof content !== 'string') return res.status(400).json({ error: 'content (string) required' });
  try {
    fs.writeFileSync(PROFILE_PATH, content, 'utf8');
    const stat = fs.statSync(PROFILE_PATH);
    res.json({ content, updatedAt: stat.mtime.toISOString(), path: 'server/src/ai/org-profile.md' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
