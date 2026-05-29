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
  },
  eligibility: {
    get: () => req('/eligibility'),
    save: (content) => req('/eligibility', { method: 'PUT', body: JSON.stringify({ content }) }),
  },
};
