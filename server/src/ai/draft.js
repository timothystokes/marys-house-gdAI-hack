import { chat, getOrgProfile } from './client.js';

export async function generateDraft(grant) {
  const messages = [
    {
      role: 'system',
      content: `You are a grant-writing assistant for Mary's House Services. Produce a clear, evidence-based first-draft grant application using only the organisation profile and grant details provided. Mark any assumed figures with [TBD]. Use the funder's likely tone.\n\nORGANISATION PROFILE:\n${getOrgProfile()}`,
    },
    {
      role: 'user',
      content: `Draft an application for this grant:\n\nTitle: ${grant.title}\nFunder: ${grant.funder}\nAmount: ${grant.amount_min ?? '?'} - ${grant.amount_max ?? '?'} ${grant.currency}\nDeadline: ${grant.deadline}\nEligibility: ${grant.eligibility}\nDescription: ${grant.description}\nSource: ${grant.source_url}\n\nReturn Markdown with sections: Project Summary, Need, Approach, Outcomes & Measurement, Budget Overview, About Mary's House.`,
    },
  ];
  return chat(messages);
}
