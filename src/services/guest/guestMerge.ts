import type { BoxLineItem } from '../../types/pilot';

/** True when the signed-out box was built (ms) after the account box was last saved (ISO). */
export function guestRebuiltSince(builtAtMs: number | undefined, accountUpdatedAt: string | undefined): boolean {
  if (!builtAtMs) return false;
  const saved = accountUpdatedAt ? Date.parse(accountUpdatedAt) : NaN;
  return Number.isNaN(saved) || builtAtMs > saved;
}

/** The account's box plus any paid add-ons from the signed-out box it doesn't already have. */
export function mergeGuestAddOns(account: BoxLineItem[], guest: BoxLineItem[]): BoxLineItem[] {
  const slots = new Set(account.map((li) => li.slotId));
  const added = guest.filter((li) => (li.unitCents ?? 0) > 0 && li.program !== 'pilot' && !slots.has(li.slotId));
  return added.length ? [...account, ...added] : account;
}
