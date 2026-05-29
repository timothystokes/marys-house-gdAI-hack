import { useEffect, useState } from 'react';
import { scoreColor } from '../lib/utils.js';

const DIMS = [
  { key: 'mission_fit',     label: 'Mission',     hint: 'DFV / women & children alignment' },
  { key: 'eligibility_fit', label: 'Eligibility', hint: 'How well Mary\u2019s House meets the criteria — gating factor' },
  { key: 'funding_value',   label: 'Funding',     hint: 'Magnitude & usefulness of the $ on offer' },
  { key: 'win_likelihood',  label: 'Win chance',  hint: 'Probability of winning given competitiveness' },
  { key: 'timing_score',    label: 'Timing',      hint: 'Lead time before the deadline' },
];

const CX = 130, CY = 130, R = 88;
const N = DIMS.length;

function pointOnAxis(i, scale) {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / N;
  return [CX + R * scale * Math.cos(angle), CY + R * scale * Math.sin(angle)];
}

function labelPos(i) {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / N;
  const lx = CX + (R + 22) * Math.cos(angle);
  const ly = CY + (R + 22) * Math.sin(angle);
  return [lx, ly];
}

// Animate from 0 to `target` over `duration` ms; restarts when `key` changes.
function useTween(target, duration, key) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setV(eased * target);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    setV(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, key]);
  return v;
}

function LegendItem({ dim, value, animKey }) {
  const tweened = useTween(value ?? 0, 700, animKey);
  const display = Math.round(tweened);
  const color = scoreColor(value);
  return (
    <div className="radar-legend-row" title={dim.hint}>
      <span className="radar-legend-dot" style={{ background: color }} />
      <span className="radar-legend-label">{dim.label}</span>
      <span className="radar-legend-bar">
        <span
          className="radar-legend-bar-fill"
          style={{ width: `${value == null ? 0 : tweened}%`, background: color }}
        />
      </span>
      <span className="radar-legend-val" style={{ color }}>
        {value == null ? '—' : display}
      </span>
    </div>
  );
}

export default function SubScoreRadar({ grant }) {
  const values = DIMS.map(d => grant[d.key]);
  const hasAny = values.some(v => v != null);

  // Hooks must always run regardless of conditional rendering.
  const scale = useTween(1, 800, grant.id);

  if (!hasAny) {
    return <div className="sub-scores-empty">No sub-score breakdown yet — re-assess this opportunity to populate.</div>;
  }

  // Grid pentagon rings at 20/40/60/80/100
  const gridRings = [0.2, 0.4, 0.6, 0.8, 1.0].map((s, idx) => {
    const pts = DIMS.map((_, i) => pointOnAxis(i, s).join(',')).join(' ');
    return <polygon key={idx} points={pts} className="radar-grid" />;
  });

  // Axes from centre to outer ring
  const axes = DIMS.map((_, i) => {
    const [x, y] = pointOnAxis(i, 1);
    return <line key={i} x1={CX} y1={CY} x2={x} y2={y} className="radar-axis" />;
  });

  // Data polygon (animated via `scale`)
  const dataPts = DIMS.map((_, i) =>
    pointOnAxis(i, ((values[i] ?? 0) / 100) * scale).join(',')
  ).join(' ');

  // Vertex circles at each data point
  const vertices = DIMS.map((d, i) => {
    const v = values[i];
    if (v == null) return null;
    const [x, y] = pointOnAxis(i, (v / 100) * scale);
    return <circle key={i} cx={x} cy={y} r={5} fill={scoreColor(v)} className="radar-vertex" />;
  });

  // Axis labels
  const labels = DIMS.map((d, i) => {
    const [x, y] = labelPos(i);
    return (
      <text key={i} x={x} y={y} className="radar-label" textAnchor="middle" dominantBaseline="middle">
        {d.label}
      </text>
    );
  });

  return (
    <div className="radar-wrap">
      <svg viewBox="0 0 260 260" className="radar-svg" aria-hidden="true">
        <defs>
          <filter id="radar-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="radar-fill" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor="var(--rose-600, #c0392b)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--rose-600, #c0392b)" stopOpacity="0.08" />
          </radialGradient>
        </defs>
        <g>{gridRings}</g>
        <g>{axes}</g>
        <polygon points={dataPts} className="radar-data" filter="url(#radar-glow)" />
        <g>{vertices}</g>
        <g>{labels}</g>
      </svg>
      <div className="radar-legend">
        {DIMS.map(d => (
          <LegendItem key={d.key} dim={d} value={grant[d.key]} animKey={grant.id} />
        ))}
      </div>
    </div>
  );
}
