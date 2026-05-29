import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../../../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'grants.db');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_crawled_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS grants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      funder TEXT,
      funder_type TEXT,           -- government | philanthropic | corporate | community
      amount_min INTEGER,
      amount_max INTEGER,
      currency TEXT DEFAULT 'AUD',
      deadline TEXT,
      eligibility TEXT,
      description TEXT,
      source_url TEXT NOT NULL UNIQUE,
      score INTEGER,              -- 0-100 propensity score
      score_rationale TEXT,
      status TEXT DEFAULT 'open', -- open | closing_soon | closed
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grant_id INTEGER NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      model TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_grants_score ON grants(score DESC);
    CREATE INDEX IF NOT EXISTS idx_grants_deadline ON grants(deadline);
  `);
}
