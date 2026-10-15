/**
 * Pilot Participants rules with no Firestore access (see pilotParticipants.ts).
 * The agreement text must match src/services/pilot/pilotAgreement.ts word for word: the client shows
 * it, the server rebuilds it and refuses to enroll when the two differ.
 */
import { createHash } from 'node:crypto';

export const PILOT_PICK_COUNT = 3;
export const PILOT_AGREEMENT_VERSION = '2026-10-14';
export const PILOT_SURVEY_DUE_LABEL = 'January 15, 2027';
/** End of Jan 15, 2027 in New York. */
export const PILOT_SURVEY_DUE_AT = '2027-01-16T04:59:59.000Z';

/** Approved items in display order (stuffies spread out), with the names the page and agreement use. */
export const PILOT_DEFAULT_ITEMS: ReadonlyArray<{ id: string; name: string }> = [
  { id: 'toddler-play-menorah', name: 'Toddler play menorah' },
  { id: 'crispy-the-latke-stuffie', name: 'Crispy the Latke stuffie' },
  { id: 'airdry-clay-dreidel', name: 'Air-dry clay dreidel' },
  { id: 'party-bag-of-gelt', name: 'Party bag of gelt' },
  { id: 'shamash-the-menorah-stuffie', name: 'Shamash the Menorah stuffie' },
  { id: 'dreidel-cookie-cutters', name: 'Dreidel cookie cutters' },
  { id: 'gimmel-the-dreidel-stuffie', name: 'Gimmel the Dreidel stuffie' },
  { id: 'airdry-clay-menorah', name: 'Air-dry clay menorah' },
  { id: 'jelly-the-sufganiyah-stuffie', name: 'Jelly the Sufganiyah stuffie' },
];

export type PilotPick = { itemId: string; name: string; deferredChargeCents: number };

export type PilotLine = {
  slotId: string;
  itemId: string;
  quantity: 1;
  includedQty: 1;
  unitCents: 0;
  label: string;
  program: 'pilot';
  deferredChargeCents: number;
};

type AnyLine = { itemId?: unknown; program?: unknown; [key: string]: unknown };

export function isPilotLine(line: AnyLine | null | undefined): boolean {
  return line?.program === 'pilot';
}

export function pilotLineFor(pick: PilotPick): PilotLine {
  return {
    slotId: `pilot-${pick.itemId}`,
    itemId: pick.itemId,
    quantity: 1,
    includedQty: 1,
    unitCents: 0,
    label: pick.name,
    program: 'pilot',
    deferredChargeCents: pick.deferredChargeCents,
  };
}

/**
 * Box lines with exactly the enrollment's pilot lines: any pilot line the client dropped or edited is
 * restored, stray ones removed. `changed` is false when the input already matched.
 */
export function mergePilotLines<L extends AnyLine>(
  lines: L[],
  pilotLines: PilotLine[]
): { lines: Array<L | PilotLine>; changed: boolean } {
  const rest = lines.filter((li) => !isPilotLine(li));
  const current = lines.filter((li) => isPilotLine(li));
  const same =
    current.length === pilotLines.length &&
    pilotLines.every((p) => current.some((c) => JSON.stringify(sortKeys(c)) === JSON.stringify(sortKeys(p))));
  if (same) return { lines, changed: false };
  return { lines: [...rest, ...pilotLines], changed: true };
}

function sortKeys(o: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Picks must be PILOT_PICK_COUNT distinct approved items, none already in the box as a regular line.
 * Returns an error message for the participant, or null when the picks are fine.
 */
export function pickProblem(
  picks: string[],
  approvedIds: string[],
  boxLines: AnyLine[],
  nameOf: (id: string) => string
): string | null {
  if (picks.length !== PILOT_PICK_COUNT) return `Pick ${PILOT_PICK_COUNT} items.`;
  if (new Set(picks).size !== picks.length) return 'Pick three different items.';
  const bad = picks.find((id) => !approvedIds.includes(id));
  if (bad) return 'One of those items isn’t part of the pilot. Refresh and pick again.';
  const inBox = new Set(boxLines.filter((li) => !isPilotLine(li)).map((li) => String(li.itemId ?? '')));
  const dup = picks.find((id) => inBox.has(id));
  if (dup) return `${nameOf(dup)} is already in your box. Pick something else.`;
  return null;
}

export function formatPilotDollars(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/** `Nov 7`. Date-only strings are calendar days (UTC); timestamps are read in New York. */
export function formatPilotDay(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const timeZone = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? 'UTC' : 'America/New_York';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone });
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Keep in sync with src/services/pilot/pilotAgreement.ts. */
export function pilotAgreementText(picks: Array<{ name: string; deferredChargeCents: number }>): string {
  const total = formatPilotDollars(picks.reduce((s, p) => s + p.deferredChargeCents, 0));
  return [
    `I'm joining Grapejuice Pilot Participants. I'll get these three items free: ${joinNames(picks.map((p) => p.name))} (value ${total}).`,
    `I agree to complete the post-Hanukkah survey by ${PILOT_SURVEY_DUE_LABEL}. If I don't, I authorize Grapejuice to charge my card on file ${total} plus applicable tax, once, after that date.`,
    `Grapejuice may invite me to a paid follow-up conversation; that's optional and not guaranteed.`,
  ].join('\n');
}

export function agreementHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Families scoring below this on the "Jewish" slider (0–100) are invited automatically. */
export const PILOT_AUTO_INVITE_MAX_JEWISH = 50;

/** The invite greets by first name, so a lone initial ("J", "J.") isn't enough. */
export function hasRealFirstName(name: string | null | undefined): boolean {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  return first.replace(/[.,'’\-_]/g, '').length >= 2;
}

export type AutoInviteCandidate = {
  jewish: number | null;
  email: string | null;
  name: string | null;
  hasDraftLines: boolean;
  committed: boolean;
  playthrough: boolean;
  isTest: boolean;
  alreadyInvited: boolean;
};

export function isAutoInviteEligible(c: AutoInviteCandidate): boolean {
  return (
    c.jewish != null &&
    c.jewish < PILOT_AUTO_INVITE_MAX_JEWISH &&
    !!c.email?.includes('@') &&
    hasRealFirstName(c.name) &&
    c.hasDraftLines &&
    !c.committed &&
    !c.playthrough &&
    !c.isTest &&
    !c.alreadyInvited
  );
}

/** `j•••@example.com` — enough for someone to recognize their own address. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '•••';
  return `${local[0]}•••@${domain}`;
}
