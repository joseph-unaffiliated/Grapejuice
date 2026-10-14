/**
 * Participant agreement text. Must match functions/src/pilotRules.ts `pilotAgreementText` word for
 * word: enrollPilot rebuilds it and refuses to enroll when what the family saw differs.
 */
export const PILOT_SURVEY_DUE_LABEL = 'January 15, 2027';

export function formatPilotDollars(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function pilotAgreementText(picks: Array<{ name: string; deferredChargeCents: number }>): string {
  const total = formatPilotDollars(picks.reduce((s, p) => s + p.deferredChargeCents, 0));
  return [
    `I'm joining Grapejuice Pilot Participants. I'll get these three items free: ${joinNames(picks.map((p) => p.name))} (value ${total}).`,
    `I agree to complete the post-Hanukkah survey by ${PILOT_SURVEY_DUE_LABEL}. If I don't, I authorize Grapejuice to charge my card on file ${total} plus applicable tax, once, after that date.`,
    `Grapejuice may invite me to a paid follow-up conversation; that's optional and not guaranteed.`,
  ].join('\n');
}
