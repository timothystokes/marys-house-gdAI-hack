import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';

export default function Sources() {
  const [sources, setSources] = useState([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [message, setMessage] = useState(null);
  const pollRef = useRef(null);

  const refresh = () => api.sources.list().then(setSources).catch(() => {});

  useEffect(() => { refresh(); }, []);

  // Poll every 1.5s while ANY source is actively crawling
  useEffect(() => {
    const anyRunning = sources.some(s => s.crawl?.status === 'running');
    if (anyRunning && !pollRef.current) {
      pollRef.current = setInterval(refresh, 1500);
    } else if (!anyRunning && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [sources]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!name || !url) return;
    await api.sources.create({ name, url });
    setName(''); setUrl('');
    refresh();
  }

  async function toggle(s) { await api.sources.update(s.id, { enabled: !s.enabled }); refresh(); }
  async function remove(s) { if (!confirm(`Remove "${s.name}"?`)) return; await api.sources.remove(s.id); refresh(); }

  async function crawlOne(s) {
    setMessage(null);
    try { await api.sources.crawl(s.id); refresh(); }
    catch (e) { setMessage(`Error: ${e.message}`); }
  }

  async function crawlAll() {
    setMessage(null);
    try { await api.sources.crawlAll(); refresh(); }
    catch (e) { setMessage(`Error: ${e.message}`); }
  }

  const anyRunning = sources.some(s => s.crawl?.status === 'running');

  return (
    <div className="sources">
      <div className="block-head">
        <h1>Scrape Sources</h1>
        <button onClick={crawlAll} disabled={anyRunning} className="btn-primary">
          {anyRunning ? 'Crawl in progress…' : '🔍 Search all enabled sources'}
        </button>
      </div>
      <p className="muted">Add or remove the websites the spider crawls for funding opportunities.</p>

      {message && <div className="info">{message}</div>}

      <form onSubmit={handleAdd} className="source-form">
        <input placeholder="Source name (e.g. Philanthropy Australia)" value={name} onChange={e => setName(e.target.value)} />
        <input placeholder="https://..." value={url} onChange={e => setUrl(e.target.value)} />
        <button type="submit" className="btn-primary">Add source</button>
      </form>

      <ul className="source-list">
        {sources.map(s => <SourceRow key={s.id} source={s} onCrawl={crawlOne} onToggle={toggle} onRemove={remove} />)}
      </ul>
    </div>
  );
}

function SourceRow({ source: s, onCrawl, onToggle, onRemove }) {
  const c = s.crawl;
  const running = c?.status === 'running';
  const pct = c?.maxPages ? Math.min(100, Math.round((c.fetched / c.maxPages) * 100)) : 0;

  return (
    <li className="source-row">
      <div className="source-main">
        <div className="source-name">{s.name}</div>
        <a href={s.url} target="_blank" rel="noreferrer" className="source-url">{s.url}</a>
        <div className="muted source-budget">
          budget: {s.max_pages} pages · depth {s.max_depth} · {s.request_delay_ms}ms delay
          {s.last_crawled_at && <> · last crawled {s.last_crawled_at}</>}
        </div>
        {c && (
          <div className={`crawl-status crawl-${c.status}`}>
            {running && (
              <>
                <div className="crawl-bar"><div className="crawl-bar-fill" style={{ width: `${pct}%` }} /></div>
                <div className="crawl-line">
                  <strong>Crawling…</strong> {c.fetched}/{c.maxPages} pages · {c.inserted} opportunit{c.inserted === 1 ? 'y' : 'ies'} found
                </div>
                {c.lastUrl && <div className="crawl-url" title={c.lastUrl}>↳ {c.lastUrl}</div>}
              </>
            )}
            {c.status === 'idle' && c.finishedAt && (
              <div className="crawl-line crawl-done">
                ✓ Last run: fetched {c.fetched} page{c.fetched === 1 ? '' : 's'}, {c.inserted} new opportunit{c.inserted === 1 ? 'y' : 'ies'}
                {c.pendingRemaining > 0 && <>, {c.pendingRemaining} URL{c.pendingRemaining === 1 ? '' : 's'} still queued</>}
                {c.budgetReached && ' (budget reached)'}
              </div>
            )}
            {c.status === 'error' && <div className="crawl-line crawl-error">⚠ {c.error}</div>}
          </div>
        )}
      </div>
      <div className="source-actions">
        <label className="toggle">
          <input type="checkbox" checked={!!s.enabled} onChange={() => onToggle(s)} />
          <span>{s.enabled ? 'Enabled' : 'Disabled'}</span>
        </label>
        <button onClick={() => onCrawl(s)} disabled={!s.enabled || running} className="btn-secondary">
          {running ? 'Searching…' : 'Search now'}
        </button>
        <button onClick={() => onRemove(s)} className="btn-danger">Remove</button>
      </div>
    </li>
  );
}
