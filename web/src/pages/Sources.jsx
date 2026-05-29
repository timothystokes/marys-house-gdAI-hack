import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function Sources() {
  const [sources, setSources] = useState([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

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

  return (
    <div className="sources">
      <h1>Scrape Sources</h1>
      <p className="muted">Add or remove the websites the spider crawls for grant opportunities.</p>

      <form onSubmit={handleAdd} className="source-form">
        <input placeholder="Source name (e.g. Philanthropy Australia)" value={name} onChange={e => setName(e.target.value)} />
        <input placeholder="https://..." value={url} onChange={e => setUrl(e.target.value)} />
        <button type="submit" className="btn-primary">Add source</button>
      </form>

      <ul className="source-list">
        {sources.map(s => (
          <li key={s.id} className="source-row">
            <div>
              <div className="source-name">{s.name}</div>
              <a href={s.url} target="_blank" rel="noreferrer" className="source-url">{s.url}</a>
              {s.last_crawled_at && <div className="muted">Last crawled: {s.last_crawled_at}</div>}
            </div>
            <div className="source-actions">
              <label className="toggle">
                <input type="checkbox" checked={!!s.enabled} onChange={() => toggle(s)} />
                <span>{s.enabled ? 'Enabled' : 'Disabled'}</span>
              </label>
              <button onClick={() => remove(s)} className="btn-danger">Remove</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
