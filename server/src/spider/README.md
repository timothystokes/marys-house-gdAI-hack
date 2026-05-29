# Spider seed sources

`seeds.json` is the source-of-truth for seed URLs the spider crawls.

## Format
```json
[
  {
    "name": "Human-readable source name",
    "url": "https://example.org/grants",
    "maxPages": 30,           // optional, default 25 — page budget per crawl run
    "maxDepth": 2,            // optional, default 2 — link-following depth from seed
    "requestDelayMs": 1500    // optional, default 1000 — polite delay between requests
  }
]
```

## Rules
- **Same-origin only** — the spider will never follow links to a different hostname than the seed URL.
- Each seed has its own page budget; the spider stops fetching once `maxPages` is reached for that source.
- `crawl_pages` rows persist between runs, so re-crawling resumes / dedupes rather than refetching pages already marked `done`.

## Loading seeds into the database
```bash
npm run seed:sources
```
This runs an upsert — existing sources (matched by URL) get their budgets refreshed, new ones are inserted, and nothing else is touched.

## Triggering a crawl
- **UI:** Sources page → "Search now" (per source) or "🔍 Search all enabled sources".
- **API:** `POST /api/sources/:id/crawl` or `POST /api/sources/crawl-all`.

## Adding sources
Edit `seeds.json` and re-run `npm run seed:sources`. (Or add them ad-hoc through the Sources UI — the seed file just gives you a checked-in, reproducible starting point.)
