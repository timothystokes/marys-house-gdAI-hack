// In-memory live crawl status, keyed by source id.
// Persisted progress lives in the crawl_pages table; this map exists
// purely so the UI can poll for fast feedback during an in-flight run.
const statuses = new Map();

export function startStatus(sourceId, maxPages) {
  statuses.set(sourceId, {
    sourceId,
    status: 'running',
    fetched: 0,
    inserted: 0,
    maxPages,
    lastUrl: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    pendingRemaining: null,
    budgetReached: false,
    error: null,
  });
}

export function updateStatus(sourceId, patch) {
  const cur = statuses.get(sourceId);
  if (!cur) return;
  statuses.set(sourceId, { ...cur, ...patch });
}

export function finishStatus(sourceId, result) {
  const cur = statuses.get(sourceId) || { sourceId };
  statuses.set(sourceId, {
    ...cur,
    status: 'idle',
    fetched: result.fetched ?? cur.fetched ?? 0,
    inserted: result.inserted ?? cur.inserted ?? 0,
    pendingRemaining: result.pendingRemaining ?? null,
    budgetReached: result.budgetReached ?? false,
    finishedAt: new Date().toISOString(),
    error: null,
  });
}

export function failStatus(sourceId, error) {
  const cur = statuses.get(sourceId) || { sourceId };
  statuses.set(sourceId, {
    ...cur,
    status: 'error',
    error: String(error?.message || error),
    finishedAt: new Date().toISOString(),
  });
}

export function getStatus(sourceId) {
  return statuses.get(sourceId) || null;
}

export function getAllStatuses() {
  return [...statuses.values()];
}

export function isRunning(sourceId) {
  return statuses.get(sourceId)?.status === 'running';
}
