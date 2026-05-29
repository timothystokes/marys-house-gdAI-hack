import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';

const fmtAmount = (g) => {
  if (!g.amount_max && !g.amount_min) return '—';
  const f = (n) => n ? `$${n.toLocaleString()}` : '?';
  return `${f(g.amount_min)} – ${f(g.amount_max)}`;
};

const daysUntil = (d) => {
  if (!d) return null;
  return Math.ceil((new Date(d) - new Date()) / (1000 * 60 * 60 * 24));
};

const scoreColor = (s) => {
  if (s == null) return '#9ca3af';
  if (s >= 85) return '#10b981';
  if (s >= 70) return '#3b82f6';
  if (s >= 50) return '#f59e0b';
  return '#ef4444';
};

export default function Dashboard() {
  const [grants, setGrants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [funderType, setFunderType] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('score');

  useEffect(() => {
    setLoading(true);
    api.grants.list({ sort, order: sort === 'deadline' ? 'asc' : 'desc',
      ...(q && { q }), ...(funderType && { funderType }), ...(status && { status }) })
      .then(setGrants).catch(console.error).finally(() => setLoading(false));
  }, [q, funderType, status, sort]);

  const stats = useMemo(() => {
    const total = grants.length;
    const high = grants.filter(g => (g.score ?? 0) >= 85).length;
    const closing = grants.filter(g => g.status === 'closing_soon').length;
    const maxTotal = grants.reduce((s, g) => s + (g.amount_max || 0), 0);
    return { total, high, closing, maxTotal };
  }, [grants]);

  return (
    <div className="dashboard">
      <section className="hero">
        <h1>Grant Opportunities</h1>
        <p>Ranked by AI fit and likely value for Mary's House Services.</p>
      </section>

      <section className="stats">
        <Stat label="Open grants" value={stats.total} />
        <Stat label="High-fit (≥85)" value={stats.high} accent="#10b981" />
        <Stat label="Closing soon" value={stats.closing} accent="#f59e0b" />
        <Stat label="Total ceiling" value={`$${(stats.maxTotal / 1e6).toFixed(1)}M`} accent="#3b82f6" />
      </section>

      <section className="filters">
        <input placeholder="Search title, funder, description…" value={q} onChange={e => setQ(e.target.value)} />
        <select value={funderType} onChange={e => setFunderType(e.target.value)}>
          <option value="">All funder types</option>
          <option value="government">Government</option>
          <option value="philanthropic">Philanthropic</option>
          <option value="corporate">Corporate</option>
          <option value="community">Community</option>
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="closing_soon">Closing soon</option>
          <option value="closed">Closed</option>
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)}>
          <option value="score">Sort: Best fit</option>
          <option value="deadline">Sort: Deadline</option>
          <option value="amount">Sort: Amount</option>
          <option value="title">Sort: Title</option>
        </select>
      </section>

      {loading ? <div className="empty">Loading…</div> :
        grants.length === 0 ? <div className="empty">No grants match your filters.</div> :
          <ul className="grants">
            {grants.map(g => {
              const days = daysUntil(g.deadline);
              return (
                <li key={g.id} className="grant-card">
                  <div className="score-badge" style={{ background: scoreColor(g.score) }}>
                    <div className="score-value">{g.score ?? '—'}</div>
                    <div className="score-label">fit</div>
                  </div>
                  <div className="grant-body">
                    <div className="grant-head">
                      <Link to={`/grants/${g.id}`} className="grant-title">{g.title}</Link>
                      <span className={`pill pill-${g.status}`}>{g.status.replace('_', ' ')}</span>
                    </div>
                    <div className="grant-meta">
                      <span><strong>{g.funder}</strong></span>
                      <span className="dot">·</span>
                      <span>{g.funder_type}</span>
                      <span className="dot">·</span>
                      <span>{fmtAmount(g)}</span>
                      {days != null && (
                        <>
                          <span className="dot">·</span>
                          <span style={{ color: days < 14 ? '#ef4444' : days < 30 ? '#f59e0b' : 'inherit' }}>
                            {days < 0 ? 'closed' : `${days} days left`}
                          </span>
                        </>
                      )}
                    </div>
                    {g.score_rationale && <p className="rationale">💡 {g.score_rationale}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
      }
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="stat">
      <div className="stat-value" style={{ color: accent }}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
