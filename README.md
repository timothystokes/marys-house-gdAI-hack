# Mary's House Grant Finder

An AI-powered grant and philanthropy discovery platform for [Mary's House Services](https://www.maryshouse.org.au/) — an Australian not-for-profit providing safety, support and independence for women and children affected by domestic violence.

This project automatically spiders curated web sources for grant and philanthropy opportunities, ranks them by their likely value and fit for Mary's House, and assists fundraising staff in generating draft applications.

---

## ⚡ Quick start

Prerequisites: **Node.js ≥ 20**.

```bash
# 1. Install all workspace dependencies (server + web)
npm install

# 2. Seed the SQLite database with sample sources and grants
npm run seed

# 3. Run the backend API and React UI together (recommended)
npm run dev
#   → API:  http://localhost:3001
#   → Web:  http://localhost:5173

# OR run them separately in two terminals
npm run dev:server   # Express API on :3001 (auto-reloads)
npm run dev:web      # Vite React UI on :5173 (proxies /api → :3001)
```

> 💡 The dashboard, sources admin, and grant detail pages all work against the seeded data without any AI key. To use the **Generate draft** button (and live AI scoring later), copy `.env.example` to `.env` and set `GITHUB_TOKEN` to a [GitHub personal access token](https://github.com/settings/tokens) with access to [GitHub Models](https://github.com/marketplace/models).

Useful endpoints once the server is running:

| Endpoint | Purpose |
|---|---|
| `GET  /api/health` | Liveness check |
| `GET  /api/grants?sort=score` | Ranked grants list (filter: `q`, `funderType`, `status`) |
| `GET  /api/grants/:id` | Single grant detail |
| `GET/POST/PATCH/DELETE /api/sources` | Manage scrape sources |
| `POST /api/drafts/:grantId` | Generate AI draft application (requires `GITHUB_TOKEN`) |

To reset the database at any time, re-run `npm run seed` (it clears existing data first).

---

## 🎯 Problem

Fundraising teams at NFPs like Mary's House spend hundreds of hours each year:

- Manually searching dozens of grant directories, foundation websites and government portals.
- Triaging which opportunities are actually relevant and worth pursuing.
- Drafting initial application content from scratch for each grant.

This tool aims to compress that work from days to minutes.

## 🧭 Solution Overview

A backend scraper (spider) collects grant opportunities from a **configurable list of sources**. Each opportunity is enriched and scored by an LLM against Mary's House's mission and funding needs. A React web UI presents a ranked list and, on demand, generates a draft application tailored to the selected grant.

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  Spider /    │──▶│  Normaliser  │──▶│ AI Ranker &  │──▶│  React Web   │
│  Scrapers    │   │  + SQLite    │   │ Draft Writer │   │     UI       │
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
       ▲                                                         │
       │                                                         │
       └──────── Admin-managed source list ◀─────────────────────┘
```

## ✨ Core Features

### Backend (Node.js)
- **Configurable spider** — admins add/remove grant source URLs via the UI; no code changes required.
- **Scheduled crawling** — periodic re-scrape to surface new opportunities and detect closing deadlines.
- **Normalisation** — extracted grants stored in a consistent schema (title, funder, amount, eligibility, deadline, description, source URL).
- **AI propensity scoring** — each grant scored 0–100 against Mary's House's profile, with a short rationale.
- **Draft application generator** — produces a first-draft application for any selected grant, grounded in Mary's House's mission, services and impact data.

### Frontend (React)
- **Ranked grants dashboard** — sortable/filterable by score, deadline, amount, funder type.
- **Grant detail view** — full description, eligibility, AI rationale, link to source.
- **One-click draft generation** — produce, edit and export a draft application (Markdown / DOCX).
- **Source management** — admin screen to add/remove/enable scrape sources.

## 🧱 Tech Stack

| Layer       | Choice                                          |
|-------------|-------------------------------------------------|
| Backend     | **Node.js** (Express, scheduled jobs)           |
| Scraping    | Playwright / Cheerio (handles static + JS sites)|
| Database    | **SQLite** (zero-config, file-based)            |
| AI / LLM    | **GitHub Models** (free for development; supports GPT / Claude / Llama via a single GitHub token) |
| Frontend    | **React** (Vite)                                |
| Styling     | TBD (Tailwind likely)                           |

## 🚀 Getting Started

> ⚠️ Scaffolding is in progress. Commands below will be wired up as the codebase lands.

### Prerequisites
- Node.js ≥ 20
- A GitHub personal access token with access to [GitHub Models](https://github.com/marketplace/models), exported as `GITHUB_TOKEN`.

### Install
```bash
npm install
```

### Run (dev)
```bash
# Run BOTH the backend API and React frontend together (recommended)
npm run dev

# …or run them individually in separate terminals
npm run dev:server   # Backend API on :3001
npm run dev:web      # React frontend on :5173
```

> ⚠️ The UI needs the API server running, otherwise the dashboard will appear empty. `npm run dev` starts both for you.

### Environment variables
Copy `.env.example` to `.env` and fill in:
```
GITHUB_TOKEN=ghp_...
GITHUB_MODEL=openai/gpt-4o-mini      # or any model available on GitHub Models
DATABASE_URL=file:./data/grants.db
PORT=3001
```

## 📁 Project Structure (planned)

```
.
├── server/              # Node.js backend
│   ├── src/
│   │   ├── spider/      # Scraper engine + per-source adapters
│   │   ├── ai/          # GitHub Models client, prompts, scoring, drafting
│   │   ├── db/          # SQLite schema + migrations
│   │   ├── routes/      # REST API
│   │   └── jobs/        # Scheduled crawl jobs
│   └── package.json
├── web/                 # React frontend (Vite)
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   └── api/
│   └── package.json
├── data/                # SQLite DB + scraped artifacts (gitignored)
└── README.md
```

## 🧠 About Mary's House

Mary's House Services is a Sydney-based NFP supporting women and children affected by domestic and family violence. Their work spans:

- Crisis accommodation and refuge services
- Outreach and case management
- Children's wellbeing programs
- Community education and advocacy

Funding from grants, philanthropic trusts and corporate giving directly enables frontline services. More info: <https://www.maryshouse.org.au/>.

> The AI ranker and draft generator use Mary's House's public mission, services and impact statements as grounding context. An editable organisation profile lives in `server/src/ai/org-profile.md` so non-developers can refine it over time.

## 📋 Requirements

### Functional
1. Admin can add, edit, disable and remove grant source URLs through the web UI.
2. Spider periodically fetches each enabled source and extracts grant opportunities.
3. New and updated grants are persisted in SQLite with deduplication.
4. Each grant is scored (0–100) for fit/propensity with a short AI-generated rationale.
5. Users can browse, filter and sort grants by score, deadline, amount and funder.
6. Users can generate, edit and export an AI-drafted application for any grant.
7. Closing/expired grants are flagged but not deleted (kept for history).

### Non-functional
- **Free to run during development** — uses GitHub Models free tier and SQLite.
- **Respectful scraping** — honours `robots.txt`, sensible rate limits, identifying User-Agent.
- **Privacy** — no beneficiary or client data is sent to any third-party LLM; only Mary's House public profile + public grant data.
- **Auditability** — every AI score and draft records the model name, prompt version and timestamp.
- **Portability** — runs locally on a laptop; deployable to a single small VM or container.

### Out of scope (for now)
- Multi-tenant support for other NFPs.
- Full application submission / e-signing workflows.
- CRM integration (Salesforce, HubSpot, etc.).

## 🛣️ Roadmap

- [ ] Backend scaffold (Express + SQLite + Vite React app)
- [ ] Source management API + UI
- [ ] First spider adapter (generic HTML + one known directory)
- [ ] GitHub Models integration (scoring)
- [ ] Ranked dashboard UI
- [ ] Draft application generator
- [ ] Scheduled re-crawl
- [ ] Export to DOCX / Markdown

## 🤝 Contributing

This project was started during a Mary's House / GitHub AI hackathon. Issues and PRs welcome.

## 📄 License

TBD — likely MIT, to be confirmed with Mary's House.
