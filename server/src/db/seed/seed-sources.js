import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, db } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedsPath = path.resolve(__dirname, '../../spider/seeds.json');

initDb();

if (!fs.existsSync(seedsPath)) {
  console.error(`[seed:sources] not found: ${seedsPath}`);
  process.exit(1);
}

const seeds = JSON.parse(fs.readFileSync(seedsPath, 'utf8'));
if (!Array.isArray(seeds)) {
  console.error('[seed:sources] seeds.json must be a JSON array');
  process.exit(1);
}

const upsert = db.prepare(`
  INSERT INTO sources (name, url, enabled, max_pages, max_depth, request_delay_ms)
  VALUES (@name, @url, 1, @max_pages, @max_depth, @request_delay_ms)
  ON CONFLICT(url) DO UPDATE SET
    name = excluded.name,
    max_pages = excluded.max_pages,
    max_depth = excluded.max_depth,
    request_delay_ms = excluded.request_delay_ms
`);

let n = 0;
for (const s of seeds) {
  if (!s.url || !s.name) { console.warn('[seed:sources] skipping invalid entry:', s); continue; }
  upsert.run({
    name: s.name,
    url: s.url,
    max_pages: s.maxPages ?? 25,
    max_depth: s.maxDepth ?? 2,
    request_delay_ms: s.requestDelayMs ?? 1000,
  });
  n++;
}
console.log(`[seed:sources] upserted ${n} source(s) from ${path.relative(process.cwd(), seedsPath)}`);
