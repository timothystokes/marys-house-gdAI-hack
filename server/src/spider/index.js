// Spider engine. Real per-site adapters will live alongside this file.
// For now, until adapters are written, we run a "demo" crawler that
// generates a handful of plausible grants so the end-to-end flow
// (trigger -> insert -> dashboard refresh) can be exercised.
import { db } from '../db/db.js';

const DEMO_TEMPLATES = [
  {
    title: 'Community Resilience Grant',
    funder_hint: 'Community Foundation',
    funder_type: 'philanthropic',
    amount_min: 20000, amount_max: 80000,
    eligibility: 'Australian NFPs delivering community-based programs.',
    description: 'Funds community-led initiatives strengthening resilience and wellbeing, including services supporting women and children at risk.',
    score: 78,
    score_rationale: 'Good alignment with Mary\'s House outreach work; modest dollar value.',
  },
  {
    title: 'Family Safety Innovation Fund',
    funder_hint: 'State Government',
    funder_type: 'government',
    amount_min: 75000, amount_max: 350000,
    eligibility: 'Registered DFV services in Australia.',
    description: 'Supports innovative approaches to preventing and responding to family and domestic violence.',
    score: 92,
    score_rationale: 'Direct match for Mary\'s House core service delivery; substantial funding ceiling.',
  },
  {
    title: 'Children\'s Mental Health Program Support',
    funder_hint: 'Foundation',
    funder_type: 'philanthropic',
    amount_min: 15000, amount_max: 120000,
    eligibility: 'Charities running evidence-based child mental health programs.',
    description: 'Trauma-informed mental health support for children, including those exposed to domestic violence.',
    score: 85,
    score_rationale: 'Strong fit for the children\'s wellbeing program.',
  },
  {
    title: 'Workforce Capability Building Grant',
    funder_hint: 'Industry Body',
    funder_type: 'corporate',
    amount_min: 10000, amount_max: 50000,
    eligibility: 'NFPs investing in staff training and capability.',
    description: 'Co-funds professional development and capability uplift for community sector staff.',
    score: 62,
    score_rationale: 'Useful capability funding; smaller value and indirect impact.',
  },
];

function futureDateDays(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const insertGrant = db.prepare(`
  INSERT INTO grants (
    source_id, title, funder, funder_type, amount_min, amount_max, currency,
    deadline, eligibility, description, source_url, score, score_rationale, status
  ) VALUES (
    @source_id, @title, @funder, @funder_type, @amount_min, @amount_max, 'AUD',
    @deadline, @eligibility, @description, @source_url, @score, @score_rationale, @status
  )
`);

const touchSource = db.prepare("UPDATE sources SET last_crawled_at = datetime('now') WHERE id = ?");

export function crawlSource(source) {
  // Pick 1-2 random templates per crawl
  const picks = [...DEMO_TEMPLATES].sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 2));
  const inserted = [];
  for (const tpl of picks) {
    const funder = `${tpl.funder_hint} via ${source.name}`;
    const deadline = futureDateDays(30 + Math.floor(Math.random() * 120));
    const status = (new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24) < 30 ? 'closing_soon' : 'open';
    const source_url = `${source.url.replace(/\/$/, '')}/${slug(tpl.title)}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    try {
      const info = insertGrant.run({
        source_id: source.id,
        title: tpl.title,
        funder,
        funder_type: tpl.funder_type,
        amount_min: tpl.amount_min,
        amount_max: tpl.amount_max,
        deadline,
        eligibility: tpl.eligibility,
        description: tpl.description,
        source_url,
        score: tpl.score,
        score_rationale: tpl.score_rationale,
        status,
      });
      inserted.push(info.lastInsertRowid);
    } catch (e) {
      // UNIQUE constraint -> already exists, skip
      if (!/UNIQUE/.test(e.message)) throw e;
    }
  }
  touchSource.run(source.id);
  return { sourceId: source.id, inserted: inserted.length };
}

export function crawlAll() {
  const sources = db.prepare('SELECT * FROM sources WHERE enabled = 1').all();
  return sources.map(crawlSource);
}

