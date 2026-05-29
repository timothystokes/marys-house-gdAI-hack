import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDb } from './db/db.js';
import grantsRouter from './routes/grants.js';
import sourcesRouter from './routes/sources.js';
import draftsRouter from './routes/drafts.js';

dotenv.config({ path: '../.env' });
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

initDb();

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use('/api/grants', grantsRouter);
app.use('/api/sources', sourcesRouter);
app.use('/api/drafts', draftsRouter);

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port}`);
});
