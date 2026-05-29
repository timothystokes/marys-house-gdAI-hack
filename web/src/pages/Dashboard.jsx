import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import GrantPanel from '../components/GrantPanel.jsx';
import { scoreColor, fitLabel, fmtAmount, daysUntil } from '../lib/utils.js';

const TAG_RULES = [
  { label: 'Women',      emoji: '👩', regex: /women|woman|domestic|family violence|dfv|gender/i },
  { label: 'Children',   emoji: '🧒', regex: /child|children|youth|young people|childhood|0-8|early childhood/i },
  { label: 'Housing',    emoji: '🏠', regex: /housing|accommodation|refuge|homelessness|affordable housing/i },
  { label: 'Wellbeing',  emoji: '💚', regex: /health|mental health|wellbeing|trauma|recovery|therapeutic/i },
  { label: 'Technology', emoji: '💻', regex: /digital|technology|data|transformation|software|capability/i },
  { label: 'Indigenous', emoji: '🌏', regex: /indigenous|aboriginal|torres strait/i },
  { label: 'Community',  emoji: '🤝', regex: /community|outreach|social sector/i },
  { label: 'Employment', emoji: '💼', regex: /employment|workforce|economic|re-entering/i },
];

function getGrantTags(grant) {
  const text = `${grant.title} ${grant.description || ''} ${grant.eligibility || ''} ${grant.funder || ''}`;
  return TAG_RULES.filter(t => t.regex.test(text)).map(t => t.label);
}

export default function Dashboard() {
  const [grants, setGrants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [funderType, setFunderType] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('score');
  const [selectedId, setSelectedId] = useState(null);
  const [activeTag, setActiveTag] = useState(null);
  const [starred, setStarred] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('starred-grants') || '[]')); }
    catch { return new Set(); }
  });

  const toggleStar = (id, e) => {
    e.stopPropagation();
    setStarred(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem('starred-grants', JSON.stringify([...next]));
      return next;
    });
  };

  useEffect(() => {
    if (sort === 'favourites') return; // favourites is client-side only
    setLoading(true);
    api.grants.list({
      sort,
      order: sort === 'deadline' ? 'asc' : 'desc',
      ...(q && { q }),
      ...(funderType && { funderType }),
      ...(status && { status }),
    })
      .then(data => {
        setGrants(data);
        if (!selectedId && data.length > 0) setSelectedId(data[0].id);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, funderType, status, sort]);

  // Derive available tags from current grants
  const availableTags = useMemo(() => {
    const counts = {};
    for (const g of grants) {
      for (const tag of getGrantTags(g)) {
        counts[tag] = (counts[tag] || 0) + 1;
      }
    }
    return TAG_RULES.filter(r => counts[r.label]).map(r => ({ ...r, count: counts[r.label] }));
  }, [grants]);

  // Apply tag + favourites filter client-side
  const visibleGrants = useMemo(() => {
    let filtered = activeTag ? grants.filter(g => getGrantTags(g).includes(activeTag)) : grants;
    if (sort === 'favourites') filtered = filtered.filter(g => starred.has(g.id));
    return filtered;
  }, [grants, activeTag, starred, sort]);

  const stats = useMemo(() => {
    const total    = visibleGrants.length;
    const high     = visibleGrants.filter(g => (g.score ?? 0) >= 85).length;
    const closing  = visibleGrants.filter(g => g.status === 'closing_soon').length;
    const maxTotal = visibleGrants.reduce((s, g) => s + (g.amount_max || 0), 0);
    return { total, high, closing, maxTotal };
  }, [visibleGrants]);

  return (
    <div className="workspace">

      {/* ──────────── LEFT: list column ──────────── */}
      <div className="list-col">

        {/* Tag chips */}
        {availableTags.length > 0 && (
          <div className="tag-filter-bar">
            {availableTags.map(t => (
              <button
                key={t.label}
                className={`tag-chip${activeTag === t.label ? ' tag-chip-active' : ''}`}
                onClick={() => setActiveTag(activeTag === t.label ? null : t.label)}
              >
                <span>{t.emoji}</span> {t.label}
                <span className="tag-chip-count">{t.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="list-filters">
          <div className="search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              className="search-input"
              placeholder="Search grants…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          <div className="filter-row">
            <select className="filter-select" value={funderType} onChange={e => setFunderType(e.target.value)}>
              <option value="">All funders</option>
              <option value="government">Government</option>
              <option value="philanthropic">Philanthropic</option>
              <option value="corporate">Corporate</option>
              <option value="community">Community</option>
            </select>
            <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="closing_soon">Closing soon</option>
              <option value="closed">Closed</option>
            </select>
            <select className="filter-select" value={sort} onChange={e => setSort(e.target.value)}>
              <option value="score">Best fit</option>
              <option value="deadline">Deadline</option>
              <option value="amount">Amount</option>
              <option value="favourites">⭐ Favourites</option>
            </select>
          </div>
        </div>

        {/* Stats chips */}
        <div className="stats-bar">
          <div className="stat-chip">
            <div className="stat-chip-val">{stats.total}</div>
            <div className="stat-chip-lbl">Grants</div>
          </div>
          <div className="stat-chip">
            <div className="stat-chip-val" style={{ color: '#10b981' }}>{stats.high}</div>
            <div className="stat-chip-lbl">High fit</div>
          </div>
          <div className="stat-chip">
            <div className="stat-chip-val" style={{ color: '#f59e0b' }}>{stats.closing}</div>
            <div className="stat-chip-lbl">Closing</div>
          </div>
          <div className="stat-chip">
            <div className="stat-chip-val" style={{ color: '#60a5fa' }}>
              ${(stats.maxTotal / 1e6).toFixed(1)}M
            </div>
            <div className="stat-chip-lbl">Ceiling</div>
          </div>
        </div>

        {/* Scrollable grant list */}
        <div className="grant-list-scroll">
          {loading && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              <span className="spinner" style={{ marginRight: 8 }} />
              Loading…
            </div>
          )}
          {!loading && visibleGrants.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              No grants match your filters.
            </div>
          )}
          {visibleGrants.map(g => (
            <GrantRow
              key={g.id}
              grant={g}
              selected={g.id === selectedId}
              starred={starred.has(g.id)}
              onStar={e => toggleStar(g.id, e)}
              onClick={() => setSelectedId(g.id)}
            />
          ))}
        </div>
      </div>

      {/* ──────────── RIGHT: detail panel ──────────── */}
      <div className="detail-col">
        {selectedId
          ? <GrantPanel key={selectedId} grantId={selectedId} />
          : (
            <div className="detail-empty">
              <div className="detail-empty-icon">📋</div>
              <h3>Select a grant</h3>
              <p>Click any grant in the list to view details, assess eligibility, and generate a draft application.</p>
            </div>
          )
        }
      </div>

    </div>
  );
}

function GrantRow({ grant: g, selected, starred, onStar, onClick }) {
  const days  = daysUntil(g.deadline);
  const color = scoreColor(g.score);

  return (
    <div
      className={`grant-row${selected ? ' selected' : ''}${starred ? ' starred' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      aria-pressed={selected}
    >
      <div className="score-mini" style={{ background: color }}>
        {g.score ?? '—'}
        <span className="score-mini-lbl">fit</span>
      </div>

      <div className="grant-row-body">
        <div className="grant-row-title">{g.title}</div>
        <div className="grant-row-meta">
          <span>{g.funder}</span>
          <span className="dot">·</span>
          <span className={`pill pill-${g.status}`} style={{ fontSize: '10px', padding: '1px 7px' }}>
            {g.status.replace('_', ' ')}
          </span>
          {days != null && (
            <>
              <span className="dot">·</span>
              <span style={{ color: days < 0 ? 'var(--text-3)' : days < 14 ? '#f87171' : days < 30 ? '#fbbf24' : 'var(--text-3)' }}>
                {days < 0 ? 'closed' : `${days}d`}
              </span>
            </>
          )}
        </div>
        <SubScoreChips grant={g} />
        <div className="grant-row-amount">{fmtAmount(g)}</div>
      </div>

      <button
        className={`star-btn${starred ? ' star-btn-on' : ''}`}
        onClick={onStar}
        title={starred ? 'Unpin' : 'Pin to top'}
        aria-label={starred ? 'Unpin grant' : 'Pin grant to top'}
      >
        {starred ? '★' : '☆'}
      </button>
    </div>
  );
}

function SubScoreChips({ grant }) {
  const dims = [
    { k: 'eligibility_fit', l: 'Elig' },
    { k: 'mission_fit',     l: 'Miss' },
    { k: 'funding_value',   l: 'Fund' },
    { k: 'win_likelihood',  l: 'Win'  },
    { k: 'timing_score',    l: 'Time' },
  ];
  if (!dims.some(d => grant[d.k] != null)) return null;
  return (
    <div className="sub-chips">
      {dims.map(d => {
        const v = grant[d.k];
        if (v == null) return null;
        return (
          <span key={d.k} className="sub-chip" style={{ background: scoreColor(v) }} title={`${d.l}: ${v}`}>
            {d.l}<span className="sub-chip-v">{v}</span>
          </span>
        );
      })}
    </div>
  );
}
