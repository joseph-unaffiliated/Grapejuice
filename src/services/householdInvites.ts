import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import type { PartnerInvite } from '../types/pilot';

type CreateInviteData = { householdId: string; email: string; invitedByName: string };
type AcceptInviteData = { inviteId: string };
type ListInvitesData = { householdId: string };

export async function createPartnerInvite(data: CreateInviteData): Promise<PartnerInvite> {
  if (!functions) throw new Error('Firebase Functions not configured');
  const fn = httpsCallable<CreateInviteData, PartnerInvite>(functions, 'createPartnerInvite');
  const res = await fn(data);
  return res.data;
}

export async function acceptPartnerInvite(data: AcceptInviteData): Promise<{ ok: true }> {
  if (!functions) throw new Error('Firebase Functions not configured');
  const fn = httpsCallable<AcceptInviteData, { ok: true }>(functions, 'acceptPartnerInvite');
  const res = await fn(data);
  return res.data;
}

export async function listPartnerInvites(data: ListInvitesData): Promise<PartnerInvite[]> {
  if (!functions) return [];
  const fn = httpsCallable<ListInvitesData, PartnerInvite[]>(functions, 'listPartnerInvites');
  const res = await fn(data);
  return res.data;
}
