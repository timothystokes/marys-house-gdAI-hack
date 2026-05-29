import { chat, ORG_PROFILE } from './client.js';

export async function scoreGrant(grant) {
  const messages = [
    {
      role: 'system',
      content: `You score grant opportunities for Mary's House Services. Return ONLY JSON: {"score": 0-100, "rationale": "<= 2 sentences"}. Higher score = stronger fit and higher likely value.\n\nORGANISATION PROFILE:\n${ORG_PROFILE}`,
    },
    {
      role: 'user',
      content: `Grant:\nTitle: ${grant.title}\nFunder: ${grant.funder}\nAmount: ${grant.amount_min ?? '?'}-${grant.amount_max ?? '?'} ${grant.currency}\nEligibility: ${grant.eligibility}\nDescription: ${grant.description}`,
    },
  ];
  const { content } = await chat(messages);
  try {
    const json = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    return { score: Math.max(0, Math.min(100, Math.round(json.score ?? 0))), rationale: json.rationale ?? '' };
  } catch {
    return { score: 0, rationale: 'Could not parse AI response.' };
  }
}
