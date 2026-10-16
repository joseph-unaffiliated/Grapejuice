import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';

/** Callables in functions/src/pilotParticipants.ts. */

function callable<Req, Res>(name: string) {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  return httpsCallable<Req, Res>(functions, name);
}

export type PilotDates = { lockAt: string | null; arrivesBy: string | null; surveyDueLabel: string };

export type PilotItem = {
  id: string;
  name: string;
  memberPriceCents: number;
  imageUrl: string | null;
  inBox: boolean;
};

export type PilotBoxView = {
  kind: 'order' | 'draft' | 'none';
  items: Array<{ itemId: string; name: string; imageUrl: string | null; quantity: number }>;
  address: string | null;
  cardOnFile: boolean;
};

export type PilotJoined = {
  status: 'enrolled' | 'awaiting_checkout';
  picks: Array<{ itemId: string; name: string; deferredChargeCents: number; imageUrl: string | null }>;
  totalCents: number;
};

export type PilotInviteView =
  | { state: 'unavailable' }
  | { state: 'closed'; firstName: string }
  | { state: 'sign_in'; firstName: string; maskedEmail: string; dates: PilotDates }
  | { state: 'wrong_account'; firstName: string; maskedEmail: string }
  | { state: 'ready'; firstName: string; dates: PilotDates; box: PilotBoxView; items: PilotItem[]; pickCount: number }
  | { state: 'joined'; firstName: string; dates: PilotDates; box: PilotBoxView; enrollment: PilotJoined };

export async function getPilotInvite(token: string): Promise<PilotInviteView> {
  const { data } = await callable<{ token: string }, PilotInviteView>('getPilotInvite')({ token });
  return data;
}

export async function enrollPilot(input: {
  token: string;
  itemIds: string[];
  typedName: string;
  agreed: boolean;
  quoteConsent: boolean;
  agreementText: string;
}): Promise<{ status: 'enrolled' | 'awaiting_checkout'; totalCents: number }> {
  const { data } = await callable<typeof input, { status: 'enrolled' | 'awaiting_checkout'; totalCents: number }>(
    'enrollPilot'
  )(input);
  return data;
}

export type AdminPilotInvite = {
  token: string;
  link: string;
  email: string;
  name: string;
  status: string;
  accountCreated: boolean;
  createdAt: string;
  createdByEmail: string;
  source: 'auto' | 'manual';
  jewishScore: number | null;
  /** Onboarding Hanukkah slider (0–100). Null when unanswered. */
  hanukkahScore: number | null;
  householdId: string | null;
  /** Ship-to state, else IP region. */
  location: string | null;
  locationFromIp: boolean;
  /** Kids' planner ages, youngest first ("3", "7", "18+"). */
  kidAges: string[];
  boxKind: 'order' | 'draft' | 'none';
  /** Item names currently in their draft or open order. */
  boxItems: string[];
  emailedAt: string | null;
  followUpAt: string | null;
  openedAt: string | null;
  enrolledAt: string | null;
  joinedAt: string | null;
  picks: string[];
  deferredTotalCents: number;
  quoteConsent: boolean;
  orderId: string | null;
};

const admin = (data: Record<string, unknown>) =>
  callable<Record<string, unknown>, Record<string, unknown>>('adminPilotParticipants')(data).then((r) => r.data);

export const adminPilot = {
  async list(): Promise<AdminPilotInvite[]> {
    return ((await admin({ action: 'list' })).invites as AdminPilotInvite[]) ?? [];
  },
  async createInvite(input: { email: string; name: string }) {
    return (await admin({ action: 'createInvite', ...input })) as {
      token: string;
      link: string;
      existing: boolean;
      accountCreated: boolean;
    };
  },
  async cancelInvite(token: string) {
    await admin({ action: 'cancelInvite', token });
  },
  async markEmailed(token: string, done: boolean) {
    return (await admin({ action: 'markEmailed', token, done })) as { at: string | null };
  },
  async markFollowUp(token: string, done: boolean) {
    return (await admin({ action: 'markFollowUp', token, done })) as { at: string | null };
  },
  async autoInvite() {
    return (await admin({ action: 'autoInvite' })) as { locked: boolean; created: number; eligible: number };
  },
};
