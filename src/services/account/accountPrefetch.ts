import { listPartnerInvites } from '../householdInvites';
import type { PartnerInvite } from '../../types/pilot';
import { createHouseholdReadCache } from './householdReadCache';

const invites = createHouseholdReadCache<PartnerInvite[]>((householdId) =>
  listPartnerInvites({ householdId }).catch(() => [])
);

/** Start the partner-invite read from Home, the menu, or My Box. Safe to call often. */
export function prefetchPartnerInvites(householdId: string): void {
  if (!householdId) return;
  void invites.load(householdId).catch(() => undefined);
}

/** Last settled invite list, so the account row can paint before a refresh returns. */
export function peekPartnerInvites(householdId: string | null | undefined): PartnerInvite[] | null {
  if (!householdId) return null;
  return invites.peek(householdId);
}

/**
 * Join an in-flight read or start one. A finished read is not reused as the
 * network call — callers paint from `peekPartnerInvites` and then apply this result.
 */
export function loadPartnerInvites(
  householdId: string,
  options?: { fresh?: boolean }
): Promise<PartnerInvite[]> {
  return invites.load(householdId, options);
}
