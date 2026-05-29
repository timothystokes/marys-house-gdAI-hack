import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client.js';

export default function GrantDetail() {
  const { id } = useParams();
  const [grant, setGrant] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.grants.get(id).then(setGrant).catch(e => setError(e.message));
    api.drafts.listForGrant(id).then(setDrafts).catch(() => {});
  }, [id]);

  async function handleGenerate() {
    setGenerating(true); setError(null);
    try {
      const draft = await api.drafts.create(id);
      setDrafts([draft, ...drafts]);
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  if (!grant) return <div className="empty">Loading grant…</div>;

  return (
    <div className="detail">
      <Link to="/" className="back">← Back to dashboard</Link>
      <h1>{grant.title}</h1>
      <div className="meta-row">
        <strong>{grant.funder}</strong>
        <span className="pill">{grant.funder_type}</span>
        <span className={`pill pill-${grant.status}`}>{grant.status.replace('_', ' ')}</span>
      </div>

      <div className="grid">
        <div className="card">
          <h3>Amount</h3>
          <p>${(grant.amount_min ?? 0).toLocaleString()} – ${(grant.amount_max ?? 0).toLocaleString()} {grant.currency}</p>
        </div>
        <div className="card">
          <h3>Deadline</h3>
          <p>{grant.deadline || '—'}</p>
        </div>
        <div className="card">
          <h3>AI Fit Score</h3>
          <p className="big-score">{grant.score ?? '—'}/100</p>
          {grant.score_rationale && <p className="rationale">{grant.score_rationale}</p>}
        </div>
      </div>

      <section className="block">
        <h3>Eligibility</h3>
        <p>{grant.eligibility}</p>
      </section>

      <section className="block">
        <h3>Description</h3>
        <p>{grant.description}</p>
      </section>

      <section className="block">
        <h3>Source</h3>
        <p><a href={grant.source_url} target="_blank" rel="noreferrer">{grant.source_url}</a></p>
      </section>

      <section className="block">
        <div className="block-head">
          <h3>Draft Application</h3>
          <button onClick={handleGenerate} disabled={generating} className="btn-primary">
            {generating ? 'Generating…' : drafts.length ? 'Regenerate draft' : 'Generate draft'}
          </button>
        </div>
        {error && <div className="error">{error}</div>}
        {drafts.length === 0 && !generating && <p className="muted">No draft yet. Click "Generate draft" to create one with AI.</p>}
        {drafts.map(d => (
          <article key={d.id} className="draft">
            <div className="draft-meta">Generated {new Date(d.created_at).toLocaleString()} · {d.model}</div>
            <pre className="draft-content">{d.content}</pre>
          </article>
        ))}
      </section>
    </div>
  );
}
