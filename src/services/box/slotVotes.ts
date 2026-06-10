import type { ActiveProfile, SlotVoteEntry, SlotVotes } from '../types/pilot';

export function emptySlotVotes(): SlotVotes {
  return {};
}

export function getVotersForOption(
  slotVotes: SlotVotes,
  slotId: string,
  itemId: string
): SlotVoteEntry[] {
  return slotVotes[slotId]?.[itemId] ?? [];
}

export function voteCount(slotVotes: SlotVotes, slotId: string, itemId: string): number {
  return getVotersForOption(slotVotes, slotId, itemId).length;
}

export function hasVoted(
  slotVotes: SlotVotes,
  slotId: string,
  itemId: string,
  voterId: string
): boolean {
  return getVotersForOption(slotVotes, slotId, itemId).some((v) => v.voterId === voterId);
}

export function findVoterChoice(
  slotVotes: SlotVotes,
  slotId: string,
  voterId: string
): string | null {
  const slot = slotVotes[slotId];
  if (!slot) return null;
  for (const [itemId, voters] of Object.entries(slot)) {
    if (voters.some((v) => v.voterId === voterId)) return itemId;
  }
  return null;
}

/** Toggle thumbs-up: one vote per voter per slot. */
export function toggleSlotVote(
  slotVotes: SlotVotes,
  slotId: string,
  itemId: string,
  voter: SlotVoteEntry
): SlotVotes {
  const next: SlotVotes = { ...slotVotes };
  const slot = { ...(next[slotId] ?? {}) };

  for (const [optId, voters] of Object.entries(slot)) {
    const filtered = voters.filter((v) => v.voterId !== voter.voterId);
    if (filtered.length) slot[optId] = filtered;
    else delete slot[optId];
  }

  const alreadyOnThis = (next[slotId]?.[itemId] ?? []).some((v) => v.voterId === voter.voterId);
  if (!alreadyOnThis) {
    slot[itemId] = [...(slot[itemId] ?? []), voter];
  }

  if (Object.keys(slot).length) next[slotId] = slot;
  else delete next[slotId];

  return next;
}

export function buildVoter(
  activeProfile: ActiveProfile,
  parentUid: string,
  parentName: string,
  childId: string | undefined,
  childName: string | undefined
): SlotVoteEntry | null {
  const votedAt = new Date().toISOString();
  if (activeProfile.type === 'parent') {
    return {
      voterId: parentUid,
      voterName: parentName || 'Grown-up',
      voterType: 'parent',
      votedAt,
    };
  }
  if (!childId) return null;
  return {
    voterId: childId,
    voterName: childName || 'Kid',
    voterType: 'child',
    votedAt,
  };
}

export function isWrappableSlot(slotId: string): boolean {
  const base = slotId.replace(/-\w+$/, '').split('-')[0] ?? slotId;
  return slotId.startsWith('gift-') || base === 'gelt' || slotId.startsWith('gelt');
}

export function isVotablePerKidSlot(slotId: string): boolean {
  return slotId.startsWith('story-') || slotId.startsWith('gift-');
}

export function topPickItemId(slotVotes: SlotVotes, slotId: string): string | null {
  const slot = slotVotes[slotId];
  if (!slot) return null;
  let bestId: string | null = null;
  let bestCount = 0;
  for (const [itemId, voters] of Object.entries(slot)) {
    if (voters.length > bestCount) {
      bestCount = voters.length;
      bestId = itemId;
    }
  }
  return bestCount > 0 ? bestId : null;
}

export function hasAnySlotVotes(slotVotes: SlotVotes): boolean {
  return Object.keys(slotVotes).length > 0;
}
