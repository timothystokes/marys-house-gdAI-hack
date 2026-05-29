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

  async function save(s, patch) {
    setMessage(null);
    try { await api.sources.update(s.id, patch); refresh(); }
    catch (e) { setMessage(`Error: ${e.message}`); }
  }

  const anyRunning = sources.some(s => s.crawl?.status === 'running');

  return (
    <div className="sources-page">
      <div className="page-header">
        <h1 className="page-title">Scrape Sources</h1>
        <button onClick={crawlAll} disabled={anyRunning} className="btn-primary">
          {anyRunning
            ? <><span className="spinner" /> Crawl in progress…</>
            : '🔍 Search all enabled'}
        </button>
      </div>
      <p className="page-sub">Each of these sources is crawled for funding opportunities. Edit, enable/disable, or trigger a search any time.</p>

      {message && <div className="info-msg">{message}</div>}

      <form onSubmit={handleAdd} className="source-form">
        <input
          placeholder="Source name (e.g. Philanthropy Australia)"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <input
          placeholder="https://..."
          value={url}
          onChange={e => setUrl(e.target.value)}
        />
        <button type="submit" className="btn-primary">Add source</button>
      </form>

      <ul className="source-list">
        {sources.map(s => (
          <SourceRow
            key={s.id}
            source={s}
            onCrawl={crawlOne}
            onToggle={toggle}
            onRemove={remove}
            onSave={save}
          />
        ))}
      </ul>
    </div>
  );
}

function SourceRow({ source: s, onCrawl, onToggle, onRemove, onSave }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: s.name, url: s.url,
    max_pages: s.max_pages, max_depth: s.max_depth, request_delay_ms: s.request_delay_ms,
  });

  useEffect(() => {
    setForm({
      name: s.name, url: s.url,
      max_pages: s.max_pages, max_depth: s.max_depth, request_delay_ms: s.request_delay_ms,
    });
  }, [s.id, s.name, s.url, s.max_pages, s.max_depth, s.request_delay_ms]);

  const c = s.crawl;
  const running = c?.status === 'running';
  const pct = c?.maxPages ? Math.min(100, Math.round((c.fetched / c.maxPages) * 100)) : 0;

  async function save() {
    await onSave(s, {
      name: form.name,
      url: form.url,
      max_pages: Number(form.max_pages),
      max_depth: Number(form.max_depth),
      request_delay_ms: Number(form.request_delay_ms),
    });
    setEditing(false);
  }

  return (
    <li className="source-row">
      <div className="source-main">
        {editing ? (
          <div className="source-edit">
            <label>Name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
            <label>URL<input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} /></label>
            <div className="source-edit-row">
              <label>Max pages<input type="number" min="1" max="1000" value={form.max_pages} onChange={e => setForm({ ...form, max_pages: e.target.value })} /></label>
              <label>Max depth<input type="number" min="0" max="10" value={form.max_depth} onChange={e => setForm({ ...form, max_depth: e.target.value })} /></label>
              <label>Delay (ms)<input type="number" min="0" max="60000" step="100" value={form.request_delay_ms} onChange={e => setForm({ ...form, request_delay_ms: e.target.value })} /></label>
            </div>
            <div className="source-edit-actions">
              <button onClick={save} className="btn-primary">Save</button>
              <button onClick={() => setEditing(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <div className="source-name">{s.name}</div>
            <a href={s.url} target="_blank" rel="noreferrer" className="source-url">{s.url}</a>
            <div className="source-crawled">
              Settings: {s.max_pages} pages · depth {s.max_depth} · {s.request_delay_ms}ms delay
              {s.last_crawled_at && <> · last crawled {s.last_crawled_at}</>}
            </div>
          </>
        )}

        {c && !editing && (
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
                {c.budgetReached && ' (page limit reached)'}
              </div>
            )}
            {c.status === 'error' && <div className="crawl-line crawl-error">⚠ {c.error}</div>}
          </div>
        )}
      </div>

      {!editing && (
        <div className="source-actions">
          <label className="toggle">
            <input type="checkbox" checked={!!s.enabled} onChange={() => onToggle(s)} />
            <span>{s.enabled ? 'Enabled' : 'Disabled'}</span>
          </label>
          <button onClick={() => setEditing(true)} disabled={running} className="btn-secondary">Edit</button>
          <button
            onClick={() => onCrawl(s)}
            disabled={!s.enabled || running}
            className="btn-secondary"
          >
            {running ? <><span className="spinner" /> Searching…</> : 'Search now'}
          </button>
          <button onClick={() => onRemove(s)} className="btn-danger">Remove</button>
        </div>
      )}
    </li>
  );
}
