export const scoreColor = (s) => {
  if (s == null) return 'rgba(255,255,255,0.25)';
  if (s >= 85) return '#10b981';
  if (s >= 70) return '#60a5fa';
  if (s >= 50) return '#f59e0b';
  return '#ef4444';
};

export const fitLabel = (s) => {
  if (s == null) return { emoji: '—', label: 'Unknown', cls: '' };
  if (s >= 85) return { emoji: '🟢', label: 'Strong', cls: 'fit-strong' };
  if (s >= 70) return { emoji: '🟡', label: 'Possible', cls: 'fit-possible' };
  if (s >= 50) return { emoji: '🟠', label: 'Partial', cls: 'fit-partial' };
  return { emoji: '🔴', label: 'Weak', cls: 'fit-weak' };
};

export const fmtAmount = (g) => {
  if (!g.amount_max && !g.amount_min) return '—';
  const f = (n) => n ? `$${n.toLocaleString()}` : '?';
  return `${f(g.amount_min)} – ${f(g.amount_max)}`;
};

export const daysUntil = (d) => {
  if (!d) return null;
  return Math.ceil((new Date(d) - new Date()) / 864e5);
};

export const fmtDeadline = (d) => {
  const days = daysUntil(d);
  if (days == null) return null;
  if (days < 0) return { text: 'Closed', urgent: false };
  if (days === 0) return { text: 'Today!', urgent: true };
  if (days === 1) return { text: '1 day left', urgent: true };
  return { text: `${days} days left`, urgent: days < 14 };
};
