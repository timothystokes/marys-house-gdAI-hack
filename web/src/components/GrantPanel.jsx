import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { scoreColor, fitLabel, fmtAmount, fmtDeadline } from '../lib/utils.js';
import SubScoreRadar from './SubScoreRadar.jsx';

export default function GrantPanel({ grantId }) {
  const [grant, setGrant] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [copyMsg, setCopyMsg] = useState(null);

  useEffect(() => {
    setGrant(null);
    setDrafts([]);
    setError(null);
    api.grants.get(grantId).then(setGrant).catch(e => setError(e.message));
    api.drafts.listForGrant(grantId).then(setDrafts).catch(() => {});
  }, [grantId]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const draft = await api.drafts.create(grantId);
      setDrafts(prev => [draft, ...prev]);
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy(content) {
    try {
      await navigator.clipboard.writeText(content);
      setCopyMsg('Copied!');
      setTimeout(() => setCopyMsg(null), 2000);
    } catch {
      setCopyMsg('Failed');
      setTimeout(() => setCopyMsg(null), 2000);
    }
  }

  function handleDownload(draft) {
    const filename = `draft-${grant?.title?.slice(0, 30).replace(/\s+/g, '-') ?? grantId}.txt`;
    const blob = new Blob([draft.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!grant && !error) {
    return (
      <div className="detail-empty">
        <span className="spinner" />
        <span style={{ color: 'var(--text-3)', fontSize: 14, marginTop: 8 }}>Loading…</span>
      </div>
    );
  }

  if (error && !grant) {
    return (
      <div className="detail-empty">
        <div className="error-msg">{error}</div>
      </div>
    );
  }

  const fit      = fitLabel(grant.score);
  const color    = scoreColor(grant.score);
  const deadline = fmtDeadline(grant.deadline);

  return (
    <div className="panel-content">
      {/* ── Header ── */}
      <div className="panel-header">
        <span className={`pill panel-fit-label ${fit.cls}`}>
          {fit.emoji} {fit.label} Match
        </span>
        <h1 className="panel-title">{grant.title}</h1>
        <div className="panel-meta-row">
          <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{grant.funder}</span>
          <span className="dot">·</span>
          <span className="pill pill-type">{grant.funder_type}</span>
          <span className="dot">·</span>
          <span className={`pill pill-${grant.status}`}>{grant.status.replace('_', ' ')}</span>
        </div>
      </div>

      {/* ── Key stats ── */}
      <div className="panel-stats">
        <div className="panel-stat">
          <h3>Funding Range</h3>
          <div className="panel-stat-val" style={{ fontSize: 16 }}>{fmtAmount(grant)}</div>
          {grant.currency && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{grant.currency}</div>
          )}
        </div>
        <div className="panel-stat">
          <h3>Deadline</h3>
          <div className="panel-stat-val" style={{ fontSize: 15 }}>{grant.deadline || '—'}</div>
          {deadline && (
            <div style={{ fontSize: 12, color: deadline.urgent ? '#f87171' : 'var(--text-3)', marginTop: 4 }}>
              {deadline.text}
            </div>
          )}
        </div>
        <div className="panel-stat" style={{ borderColor: `${color}55` }}>
          <h3>AI Fit Score</h3>
          <div className="big-score-val" style={{ color }}>
            {grant.score ?? '—'}
            <span style={{ fontSize: 15, fontWeight: 400, color: 'var(--text-3)' }}>/100</span>
          </div>
          {grant.score_rationale && (
            <div className="score-rationale">💡 {grant.score_rationale}</div>
          )}
        </div>
      </div>

      {/* ── Sub-score breakdown ── */}
      <div className="glass-block">
        <h3>Score Breakdown</h3>
        <SubScoreRadar grant={grant} />
        <p className="sub-scores-note">
          Final score weights — Mission 35% · Eligibility 25% · Funding 15% · Win 15% · Timing 10%.
          Eligibility acts as a gate: a low eligibility score caps the final.
        </p>
      </div>

      {/* ── Eligibility ── */}
      <div className="glass-block">
        <h3>Eligibility</h3>
        <p>{grant.eligibility || 'No eligibility information available.'}</p>
      </div>

      {/* ── Description ── */}
      <div className="glass-block">
        <h3>Description</h3>
        <p>{grant.description || 'No description available.'}</p>
      </div>

      {/* ── Source ── */}
      <div className="glass-block">
        <h3>Source</h3>
        <a href={grant.source_url} target="_blank" rel="noreferrer" className="source-link">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          {grant.source_url}
        </a>
      </div>

      {/* ── Draft Application ── */}
      <div className="glass-block">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ margin: 0 }}>Draft Application</h3>
          <div className="draft-actions">
            {drafts.length > 0 && (
              <>
                <button className="btn-secondary" onClick={() => handleCopy(drafts[0].content)}>
                  {copyMsg ?? '📋 Copy'}
                </button>
                <button className="btn-secondary" onClick={() => handleDownload(drafts[0])}>
                  📥 .txt
                </button>
              </>
            )}
            <button className="btn-primary" onClick={handleGenerate} disabled={generating}>
              {generating
                ? <><span className="spinner" /> Generating…</>
                : drafts.length ? '🔄 Regenerate' : '✨ Generate Draft'
              }
            </button>
          </div>
        </div>

        {error && <div className="error-msg">{error}</div>}

        {drafts.length === 0 && !generating && (
          <p style={{ color: 'var(--text-3)', fontSize: 13, lineHeight: 1.6 }}>
            No draft yet. Click <strong style={{ color: 'var(--text-2)' }}>Generate Draft</strong> to create an AI-powered application pre-filled with Mary's House details.
          </p>
        )}

        {drafts.map(d => (
          <div key={d.id} className="draft-article">
            <div className="draft-meta">
              Generated {new Date(d.created_at).toLocaleString()} · {d.model}
            </div>
            <pre className="draft-content">{d.content}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
