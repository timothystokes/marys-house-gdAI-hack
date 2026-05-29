import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chat, getOrgProfile } from './client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.resolve(__dirname, '../application/template.md');

/**
 * Load the application template fresh on each call so non-developers can edit
 * server/src/application/template.md and have changes apply immediately.
 */
export function getApplicationTemplate() {
  return fs.readFileSync(TEMPLATE_PATH, 'utf8');
}

const SYSTEM_PROMPT = `You are a senior grant writer for Mary's House Services, an Australian DFV NFP.

Your job: take the supplied APPLICATION TEMPLATE and produce a fully-populated draft application
for the supplied OPPORTUNITY. Use the ORGANISATION PROFILE as the source of truth for everything
about Mary's House (mission, services, beneficiaries, eligibility, funding needs).

Rules:
  * Preserve the template's structure exactly — same headings, same field labels, in the same order.
  * Replace every <placeholder> with concrete, plausible content drawn from the profile + opportunity.
  * Where a specific number, date, or detail isn't available from the profile/opportunity, write
    [TBD: <what's needed>] so the fundraiser knows what to fill in. Never invent figures.
  * Under "## Application", produce a comprehensive set of sub-sections appropriate to the opportunity's
    likely application form: Project Summary, Statement of Need, Proposed Approach, Activities & Timeline,
    Outcomes & Measurement, Risk & Mitigation, Budget Overview, Sustainability, About Mary's House,
    Alignment with Funder Priorities. Tailor depth and emphasis to the opportunity's funder type and amount.
  * Match the funder's likely tone — formal & evidence-based for government, mission-led & values-driven
    for philanthropic, outcomes-focused for corporate.
  * Use Australian English spelling. Reference NSW context where relevant.
  * Output ONLY the completed Markdown document — no commentary, no code fences, no preamble.`;

export async function generateDraft(grant) {
  const today = new Date().toISOString().slice(0, 10);
  const amountStr = grant.amount_min || grant.amount_max
    ? `${grant.amount_min ?? '?'} – ${grant.amount_max ?? '?'} ${grant.currency || 'AUD'}`
    : 'Not specified';

  const messages = [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\n--- ORGANISATION PROFILE ---\n${getOrgProfile()}\n\n--- APPLICATION TEMPLATE ---\n${getApplicationTemplate()}` },
    {
      role: 'user',
      content:
        `Today's date: ${today}\n\n` +
        `OPPORTUNITY DETAILS\n` +
        `Title:        ${grant.title}\n` +
        `Funder:       ${grant.funder || '(unknown)'}\n` +
        `Funder type:  ${grant.funder_type || '(unknown)'}\n` +
        `Amount:       ${amountStr}\n` +
        `Deadline:     ${grant.deadline || 'Not specified / rolling'}\n` +
        `Status:       ${grant.status || 'open'}\n` +
        `Eligibility:  ${grant.eligibility || '(not extracted)'}\n` +
        `Description:  ${grant.description || '(not extracted)'}\n` +
        `Source URL:   ${grant.source_url}\n\n` +
        `ASSESSMENT (fit against Mary's House)\n` +
        `Overall score:    ${grant.score ?? '—'}/100\n` +
        `Mission fit:      ${grant.mission_fit ?? '—'}\n` +
        `Eligibility fit:  ${grant.eligibility_fit ?? '—'}\n` +
        `Funding value:    ${grant.funding_value ?? '—'}\n` +
        `Win likelihood:   ${grant.win_likelihood ?? '—'}\n` +
        `Timing:           ${grant.timing_score ?? '—'}\n` +
        (grant.score_rationale ? `Rationale:        ${grant.score_rationale}\n` : '') +
        `\nProduce the completed application now, filling in every <placeholder> in the template.`,
    },
  ];
  return chat(messages);
}
