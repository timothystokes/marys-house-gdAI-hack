import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// org-profile.md is loaded on every request rather than at startup so that
// edits made via the Eligibility tab take effect immediately without a restart.
export function getOrgProfile() {
  return fs.readFileSync(path.join(__dirname, 'org-profile.md'), 'utf8');
}

const ENDPOINT = 'https://models.inference.ai.azure.com/chat/completions';

export async function chat(messages, { model } = {}) {
  const token = process.env.GITHUB_TOKEN;
  const chosenModel = model || process.env.GITHUB_MODEL || 'gpt-4o-mini';
  if (!token) throw new Error('GITHUB_TOKEN is not set. Get one at https://github.com/settings/tokens');

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ model: chosenModel, messages, temperature: 0.4 }),
  });
  if (!res.ok) throw new Error(`GitHub Models error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { content: data.choices?.[0]?.message?.content ?? '', model: chosenModel };
}
