# Mary's House Funding Opportunity Finder

An AI-powered grant and philanthropy discovery platform for **[Mary's House Services](https://www.maryshouse.org.au/)** — an Australian not-for-profit providing safety, support and independence for women and children affected by domestic and family violence.

The platform automatically crawls curated funding sources, scores every opportunity for fit against Mary's House's mission and eligibility, and generates a first-draft application as a downloadable Word document.

---

## ⚡ Quick start

Prerequisites: **Node.js ≥ 20**.

```bash
# 1. Install all workspace dependencies (server + web)
npm install

# 2. Configure your GitHub Models token (used for AI scoring + draft generation)
cp .env.example .env
#   → edit .env and set GITHUB_TOKEN to a personal access token
#     with access to https://github.com/marketplace/models

# 3. Load the seed sources into the DB (idempotent)
npm run seed:sources

# 4. Run the backend API and React UI together
npm run dev
#   → API:  http://localhost:3001
#   → Web:  http://localhost:5173
```

Open http://localhost:5173, jump to **Sources**, and click **🔍 Crawl** on any source to fetch + score its opportunities.

To run the two halves separately:
```bash
npm run dev:server   # Express API on :3001 (auto-reloads)
npm run dev:web      # Vite React UI on :5173 (proxies /api → :3001)
```

### Environment

`.env` (root):
```
GITHUB_TOKEN=ghp_...                       # classic PAT works best
GITHUB_MODEL=openai/gpt-4.1-mini           # default; any GitHub Models model id
AI_MIN_GAP_MS=1500                         # min gap between AI calls (rate-limit safety)
PORT=3001
```

If GitHub Models returns a daily-quota 429 the server now **fails fast** with a clear error rather than hanging — switch model tier (`openai/gpt-4.1-mini` is High tier; `openai/gpt-4.1-nano` is Low) or wait for the quota reset.

---

## 🧭 What it does

```
┌─────────────┐   ┌─────────────┐   ┌──────────────┐   ┌─────────────┐   ┌────────────┐
│   Sources   │──▶│   Spider    │──▶│  AI Assess   │──▶│   SQLite    │──▶│  React UI  │
│ (UI / seed) │   │ (HTML+PDF)  │   │  (5 scores)  │   │             │   │            │
└─────────────┘   └─────────────┘   └──────────────┘   └─────────────┘   └─────┬──────┘
                                                                                │
                                          ┌─────────────────────────────────────┘
                                          ▼
                                  ┌──────────────────┐
                                  │  Draft Generator │──▶ .docx download
                                  │ (template + LLM) │
                                  └──────────────────┘
```

1. **Crawl** — for each enabled source, the spider walks pages (and any linked PDF guidelines), cleans the text, and presents each page to the AI agent.
2. **Triage** — a three-layer filter drops obvious non-opportunities: a URL/title regex pre-filter, an `is_opportunity` decision by the LLM, then a minimum-score threshold.
3. **Assess** — every surviving opportunity is scored on five sub-scores (mission, eligibility, funding value, win likelihood, timing). Eligibility acts as a hard gate, so a hard disqualifier caps the final score.
4. **Browse** — the React UI ranks opportunities by final score and shows an animated radar chart breakdown per grant.
5. **Draft** — one click sends the funder + opportunity context, the organisation profile, and a templated application form to the LLM and returns a downloadable, Arial-formatted `.docx`.

---

## ✨ Implemented features

### Backend (Node.js + Express + SQLite)
- **Configurable sources** — add/remove/enable scrape sources via UI or `npm run seed:sources` from `server/src/spider/seeds.json`.
- **Polite spider** — same-origin link following, `robots.txt`-friendly defaults, identifying User-Agent, depth/page caps per source.
- **PDF guideline extraction** — picks up linked `.pdf` files (e.g. funder application guidelines) and parses them locally via `pdf-parse` v2.
- **Three-layer junk filter** — regex pre-filter on titles/URLs → LLM `is_opportunity` flag → `MIN_SAVE_SCORE` threshold drops anything that slips through.
- **AI assessment agent** with five sub-scores grounded in `server/src/ai/org-profile.md`:
  | Score | Weight |
  |---|---|
  | mission_fit       | 35% |
  | eligibility_fit   | 25% (hard gate) |
  | funding_value     | 15% |
  | win_likelihood    | 15% |
  | timing_score      | 10% |
- **Eligibility gating** — if eligibility ≤ 20 the final score is forced into the single digits, regardless of the other dimensions, so disqualified opportunities don't crowd the top of the list.
- **Hot-reloadable grounding files** — `org-profile.md` and `application/template.md` are re-read from disk on every AI call; non-developers can edit them and see the impact immediately.
- **Recrawl semantics** — pages already marked `done` are left alone; only `failed` pages are retried. Use the explicit reassess endpoints to re-score everything against an updated profile.
- **GitHub Models client** — serialised queue with configurable inter-call gap, exponential backoff honouring `Retry-After` / `x-ratelimit-reset`, hard ceiling on retry waits, and fast-fail on daily-quota exhaustion.
- **Draft generation** — combines the latest template, organisation profile, and assessed opportunity into a detailed application; placeholders the AI cannot answer come back as `[TBD: …]` markers. Output is converted into a Word document (Arial body, black headings, hairline rules between sections, sanitised filename based on the opportunity title).

### Frontend (React + Vite)
- **Dashboard** — sortable, filterable list of opportunities with score chips for each of the five sub-dimensions.
- **Detail panel** — opportunity title, funder, type, status, a short description paragraph, headline funding + deadline stats, a side-by-side **AI Fit Score** + **animated radar Score Breakdown**, eligibility text, source link, and the Draft Application section.
- **Generate Draft (.docx)** — one button generates the application, downloads it, and updates the "Latest draft generated …" caption. A second button re-downloads the most recent draft from the DB without re-running the LLM.
- **Sources page** — list of crawl sources with per-source crawl button.
- **Eligibility editor** — edit `org-profile.md` from the browser; saves straight back to disk for the next AI call.
- **About** — full-screen presentation embedded in a persistent iframe so the current slide and scroll position are retained when navigating between tabs.

---

## 🔌 API surface

| Endpoint | Purpose |
|---|---|
| `GET  /api/health` | Liveness check |
| `GET  /api/grants?sort=score&order=desc` | Ranked grants list. Filters: `q`, `funderType`, `status` |
| `GET  /api/grants/:id` | Single grant detail incl. all sub-scores + raw assessment JSON |
| `POST /api/grants/:id/reassess` | Re-run the AI assessment against the current profile |
| `POST /api/grants/reassess-all` | Re-assess every saved grant (uses LLM quota — heads up) |
| `GET/POST/PATCH/DELETE /api/sources` | Manage scrape sources |
| `POST /api/sources/:id/crawl` | Crawl a single source now |
| `POST /api/sources/crawl-all` | Crawl every enabled source |
| `GET  /api/eligibility` / `PUT /api/eligibility` | Read/write `org-profile.md` |
| `POST /api/drafts/:grantId` | Generate a draft and store it (returns JSON) |
| `POST /api/drafts/:grantId/docx` | Generate a draft, store it, **stream the `.docx`** in one request |
| `GET  /api/drafts/:draftId/docx` | Download an existing draft as `.docx` (no LLM call) |
| `GET  /api/drafts/grant/:grantId` | List existing drafts for a grant |

---

## 🧱 Tech stack

| Layer       | Choice                                            |
|-------------|---------------------------------------------------|
| Backend     | Node.js, Express, `better-sqlite3`                |
| Spider      | `node-fetch`, `cheerio`, `pdf-parse` v2 (local PDFs) |
| AI          | **GitHub Models** (`https://models.github.ai/inference`) — defaults to `openai/gpt-4.1-mini` |
| Word export | `docx` — Arial body, paragraph spacing, hairline rule per heading |
| Database    | SQLite (file at `data/grants.db`)                 |
| Frontend    | React 18 + Vite + React Router                    |
| Charts      | Hand-rolled SVG (no chart lib)                    |

---

## 📁 Project structure

```
.
├── server/
│   └── src/
│       ├── spider/              # Crawler, link extraction, junk filters, seed loader
│       ├── ai/
│       │   ├── client.js        # Throttled GitHub Models client
│       │   ├── assess.js        # 5-score assessment agent + gated final score
│       │   ├── draft.js         # Application drafter
│       │   └── org-profile.md   # Editable eligibility/mission grounding
│       ├── application/
│       │   ├── template.md      # Australian gov-style application template
│       │   └── docx.js          # Markdown → .docx converter
│       ├── db/db.js             # Schema + migrations + prepared statements
│       └── routes/              # grants, sources, drafts, eligibility, health
├── web/
│   ├── public/
│   │   └── about.html           # Standalone presentation served at /about
│   └── src/
│       ├── pages/               # Dashboard, GrantDetail, Sources, Eligibility, About
│       ├── components/          # GrantPanel, SubScoreRadar, etc.
│       ├── api/client.js        # Typed-ish API wrappers (drafts include docx helpers)
│       └── styles/app.css
└── data/grants.db               # SQLite store (gitignored)
```

---

## 🔧 Data & maintenance commands

| Command | Effect |
|---|---|
| `npm run seed:sources` | Idempotent upsert of `server/src/spider/seeds.json` into the `sources` table. Re-run any time you edit the seed file. |
| `npm run seed:demo` | **⚠️ Destructive** — wipes sources/grants/drafts and inserts demo data for UI work. |

Reset the database manually:
```bash
sqlite3 data/grants.db "DELETE FROM drafts; DELETE FROM grants; DELETE FROM crawl_pages; DELETE FROM sources;"
```

---

## 🧠 About Mary's House

Mary's House Services is a Sydney-based NFP supporting women and children affected by domestic and family violence — through crisis accommodation, outreach and case management, children's wellbeing programs, and community advocacy. Funding from grants, philanthropic trusts and corporate giving directly enables frontline services.

The AI assessment and draft generator use Mary's House's public mission, services and impact statements as grounding context. An editable organisation profile lives in `server/src/ai/org-profile.md` so non-developers can refine it over time — including a `## NOT ELIGIBLE FOR (HARD DISQUALIFIERS)` section that the assessment agent treats as a hard gate.

More info: <https://www.maryshouse.org.au/>.

---

## 🛡️ Operational notes

- **No beneficiary data** ever leaves the server. The only context sent to the LLM is Mary's House's public profile + publicly available grant text.
- **Auditability** — every draft row records the model that produced it and the timestamp. Every grant row records the model used for assessment and an `assessment_json` blob with the raw sub-scores and rationale.
- **Polite crawling** — sensible page/depth caps, configurable inter-page delay, identifying User-Agent. PDF parsing is local; nothing is forwarded to a third-party PDF service.
- **Out of scope (for now)** — full submission workflows, multi-tenant for other NFPs, CRM integration.

---

## 🤝 Contributing

Started during a Mary's House / GitHub AI hackathon. Issues and PRs welcome.

## 📄 License

TBD — likely MIT, to be confirmed with Mary's House.
