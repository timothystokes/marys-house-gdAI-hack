const base = '/api';

async function req(path, opts = {}) {
  const res = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  grants: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return req(`/grants${qs ? '?' + qs : ''}`);
    },
    get: (id) => req(`/grants/${id}`),
  },
  sources: {
    list: () => req('/sources'),
    create: (body) => req('/sources', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => req(`/sources/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id) => req(`/sources/${id}`, { method: 'DELETE' }),
    crawl: (id) => req(`/sources/${id}/crawl`, { method: 'POST' }),
    crawlAll: () => req('/sources/crawl-all', { method: 'POST' }),
  },
  drafts: {
    create: (grantId) => req(`/drafts/${grantId}`, { method: 'POST' }),
    listForGrant: (grantId) => req(`/drafts/grant/${grantId}`),
    // Generate a fresh draft and download it as .docx in one round-trip.
    // Returns { blob, filename } so the caller can trigger the browser save.
    generateAndDownload: async (grantId) => {
      const res = await fetch(`${base}/drafts/${grantId}/docx`, { method: 'POST' });
      if (!res.ok) {
        let msg = `${res.status} ${res.statusText}`;
        try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* noop */ }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const cd = res.headers.get('content-disposition') || '';
      const m = cd.match(/filename="([^"]+)"/);
      const filename = m ? decodeURIComponent(m[1]) : 'Grant Application - Draft.docx';
      return { blob, filename, draftId: res.headers.get('x-draft-id'), model: res.headers.get('x-model') };
    },
    // Download an already-generated draft as .docx (no AI call).
    downloadDocx: async (draftId) => {
      const res = await fetch(`${base}/drafts/${draftId}/docx`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const blob = await res.blob();
      const cd = res.headers.get('content-disposition') || '';
      const m = cd.match(/filename="([^"]+)"/);
      const filename = m ? decodeURIComponent(m[1]) : 'Grant Application - Draft.docx';
      return { blob, filename };
    },
  },
  eligibility: {
    get: () => req('/eligibility'),
    save: (content) => req('/eligibility', { method: 'PUT', body: JSON.stringify({ content }) }),
  },
};
