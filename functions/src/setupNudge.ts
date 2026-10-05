import * as logger from 'firebase-functions/logger';
import { getAuth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { lineItemsEmailItems } from './emailItems';
import { appOrigin } from './guestSessions';
import { untraditionalEvent, untraditionalIdentify } from './untraditionalCio';

/**
 * "Finish setting up your box" nudge: account holders with a Hanukkah box draft who have not
 * committed it yet (no shipping address and/or no card). One Customer.io event per household,
 * ever; the campaign itself lives in the Untraditional workspace.
 */

const HOLIDAY_ID = 'hanukkah-2026';
export const SETUP_NUDGE_EVENT = 'grapejuice_account_setup_needed';
/** Give people a day to finish on their own before emailing. */
const MIN_DRAFT_AGE_MS = 24 * 60 * 60 * 1000;
const UTM = 'utm_source=lifecycle&utm_medium=email&utm_campaign=account_setup';

export type SetupNudgeCandidate = {
  lineItems: unknown;
  draftUpdatedAt?: unknown;
  setupNudgeSentAt?: unknown;
  hasCommittedOrder: boolean;
};

export function draftItemCount(lineItems: unknown): number {
  if (!Array.isArray(lineItems)) return 0;
  return lineItems.reduce<number>((sum, line) => {
    const qty = line && typeof line === 'object' ? (line as { quantity?: unknown }).quantity : 0;
    return sum + (typeof qty === 'number' && qty > 0 ? qty : 0);
  }, 0);
}

export function setupNudgeSkipReason(c: SetupNudgeCandidate, now: Date): string | null {
  if (c.setupNudgeSentAt) return 'already_sent';
  if (c.hasCommittedOrder) return 'committed';
  if (draftItemCount(c.lineItems) === 0) return 'empty_draft';
  const updated = typeof c.draftUpdatedAt === 'string' ? Date.parse(c.draftUpdatedAt) : NaN;
  if (Number.isFinite(updated) && now.getTime() - updated < MIN_DRAFT_AGE_MS) return 'too_recent';
  return null;
}

/** "November 7" in Eastern time, for copy like "until November 7". */
export function lockDateLabel(lockAt: string): string {
  return new Date(lockAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/New_York' });
}

async function ownerEmail(db: Firestore, ownerId: string | undefined): Promise<string | null> {
  if (!ownerId) return null;
  const user = await db.doc(`users/${ownerId}`).get();
  const fromDoc = user.data()?.email;
  if (typeof fromDoc === 'string' && fromDoc.includes('@')) return fromDoc.trim();
  const authUser = await getAuth()
    .getUser(ownerId)
    .catch(() => null);
  return authUser?.email ?? null;
}

async function hasCommittedOrder(db: Firestore, householdId: string): Promise<boolean> {
  const snap = await db
    .collection(`households/${householdId}/orders`)
    .where('holidayId', '==', HOLIDAY_ID)
    .where('status', '==', 'committed')
    .limit(1)
    .get();
  return !snap.empty;
}

export async function runSetupNudgeBatch(
  db: Firestore,
  lockAt: string,
  now: Date = new Date()
): Promise<{ sent: number; skipped: Record<string, number> }> {
  const drafts = await db.collectionGroup('boxDrafts').get();
  const skipped: Record<string, number> = {};
  const skip = (reason: string) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };
  let sent = 0;
  const origin = appOrigin();
  const checkoutUrl = `${origin}/checkout?${UTM}`;
  const boxUrl = `${origin}/box?${UTM}`;
  const lockDate = lockDateLabel(lockAt);

  for (const draftDoc of drafts.docs) {
    const householdRef = draftDoc.ref.parent.parent;
    if (draftDoc.id !== HOLIDAY_ID || householdRef?.parent.id !== 'households') continue;
    const draft = draftDoc.data();
    const household = (await householdRef.get()).data() ?? {};
    const reason = setupNudgeSkipReason(
      {
        lineItems: draft.lineItems,
        draftUpdatedAt: draft.updatedAt,
        setupNudgeSentAt: household.setupNudgeSentAt,
        hasCommittedOrder: await hasCommittedOrder(db, householdRef.id),
      },
      now
    );
    if (reason) {
      skip(reason);
      continue;
    }

    const email = await ownerEmail(db, household.ownerId as string | undefined);
    if (!email) {
      skip('no_email');
      continue;
    }

    try {
      const { items, more } = await lineItemsEmailItems(db, draft.lineItems, boxUrl);
      const hasCard = Boolean(household.cardOnFileAt);
      await untraditionalIdentify(email, {
        grapejuice_account: true,
        grapejuice_setup_complete: false,
        grapejuice_box_item_count: draftItemCount(draft.lineItems),
        grapejuice_card_on_file: hasCard,
      });
      const delivered = await untraditionalEvent(email, SETUP_NUDGE_EVENT, {
        checkout_url: checkoutUrl,
        box_url: boxUrl,
        lock_date: lockDate,
        has_card: hasCard,
        items,
        items_more: more,
      });
      if (!delivered) {
        skip('cio_not_configured');
        continue;
      }
      await householdRef.set({ setupNudgeSentAt: now.toISOString() }, { merge: true });
      sent += 1;
    } catch (err) {
      logger.error('Setup nudge failed', { householdId: householdRef.id, err: String(err) });
      skip('error');
    }
  }

  logger.info('Setup nudge batch complete', { sent, skipped });
  return { sent, skipped };
}
