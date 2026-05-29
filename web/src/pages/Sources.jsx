import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function Sources() {
  const [sources, setSources] = useState([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [crawling, setCrawling] = useState({});
  const [message, setMessage] = useState(null);

  const refresh = () => api.sources.list().then(setSources);
  useEffect(() => { refresh(); }, []);

  async function handleAdd(e) {
    e.preventDefault();
    if (!name || !url) return;
    await api.sources.create({ name, url });
    setName(''); setUrl('');
    refresh();
  }

  async function toggle(s) {
    await api.sources.update(s.id, { enabled: !s.enabled });
    refresh();
  }

  async function remove(s) {
    if (!confirm(`Remove "${s.name}"?`)) return;
    await api.sources.remove(s.id);
    refresh();
  }

  async function crawlOne(s) {
    setCrawling(c => ({ ...c, [s.id]: true }));
    setMessage(null);
    try {
      const result = await api.sources.crawl(s.id);
      setMessage(`Crawled "${s.name}" — ${result.inserted} new grant${result.inserted === 1 ? '' : 's'} added.`);
      refresh();
    } catch (e) {
      setMessage(`Error: ${e.message}`);
    } finally {
      setCrawling(c => ({ ...c, [s.id]: false }));
    }
  }

  async function crawlAll() {
    setCrawling(c => ({ ...c, all: true }));
    setMessage(null);
    try {
      const result = await api.sources.crawlAll();
      setMessage(`Crawled ${result.sourcesCrawled} source${result.sourcesCrawled === 1 ? '' : 's'} — ${result.grantsInserted} new grant${result.grantsInserted === 1 ? '' : 's'} added.`);
      refresh();
    } catch (e) {
      setMessage(`Error: ${e.message}`);
    } finally {
      setCrawling(c => ({ ...c, all: false }));
    }
  }

  return (
    <div className="sources-page">
      <div className="page-header">
        <h1 className="page-title">Scrape Sources</h1>
        <button onClick={crawlAll} disabled={crawling.all} className="btn-primary">
          {crawling.all
            ? <><span className="spinner" /> Searching…</>
            : '🔍 Search all enabled'}
        </button>
      </div>
      <p className="page-sub">Add or remove the websites the spider crawls for grant opportunities.</p>

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
          <li key={s.id} className="source-row">
            <div>
              <div className="source-name">{s.name}</div>
              <a href={s.url} target="_blank" rel="noreferrer" className="source-url">{s.url}</a>
              {s.last_crawled_at && (
                <div className="source-crawled">Last crawled: {s.last_crawled_at}</div>
              )}
            </div>
            <div className="source-actions">
              <label className="toggle">
                <input type="checkbox" checked={!!s.enabled} onChange={() => toggle(s)} />
                <span>{s.enabled ? 'Enabled' : 'Disabled'}</span>
              </label>
              <button
                onClick={() => crawlOne(s)}
                disabled={!s.enabled || crawling[s.id]}
                className="btn-secondary"
              >
                {crawling[s.id] ? <><span className="spinner" /> Searching…</> : 'Search now'}
              </button>
              <button onClick={() => remove(s)} className="btn-danger">Remove</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
