/**
 * Unclaimed paid gift notes. Templates stay at id 0 until the renders are approved, so sendEmail skips them.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { grapejuiceEmailHtml, type EmailThumb } from './emailLayout';
import { lineItemsEmailItems } from './emailItems';
import { sendEmail } from './email';
import { unclaimedGiftShipDecision, type UnclaimedGiftShipReason } from './giftShip';

const DAY_MS = 86_400_000;
/** The follow-up waits until the original gift email is at least two days old. */
const RECIPIENT_FOLLOW_UP_MS = 2 * DAY_MS;
/** Off: no nudge email to the giver asking them to follow up with the recipient. The recipient follow-up is unaffected. */
export const GIVER_NUDGE_EMAIL_ENABLED = false;

export function unclaimedGiftNoteDue(input: {
  paid: boolean;
  status: string | null | undefined;
  /** When the original gift email went out. The follow-up does not send before this is 48 hours old. */
  firstNotifiedAt: string | null;
  recipientSentAt: string | null;
  senderSentAt: string | null;
  now: number;
}): 'recipient' | 'sender' | null {
  if (!input.paid) return null;
  if (input.status === 'claimed') return null;
  if (input.senderSentAt) return null;
  if (!input.recipientSentAt) {
    const first = Date.parse(input.firstNotifiedAt ?? '');
    if (Number.isNaN(first) || input.now - first < RECIPIENT_FOLLOW_UP_MS) return null;
    return 'recipient';
  }
  const sent = Date.parse(input.recipientSentAt);
  if (Number.isNaN(sent) || input.now - sent < DAY_MS) return null;
  return 'sender';
}

export function renderGiftRecipientEmail(input: {
  giverName: string;
  claimUrl: string;
  items: EmailThumb[];
}): { subject: string; html: string } {
  const giver = input.giverName.trim() || 'Someone';
  return {
    subject: `Where should we send your gift from ${giver}?`,
    html: grapejuiceEmailHtml({
      campaign: 'gift_unclaimed_recipient',
      preheader: "If you don't claim your gift, it will not ship",
      title: 'We just need one more thing',
      paragraphs: [
        `Before we can process your gift from ${giver}, we just need to know where we should send it. Please add in the missing details. Thanks!`,
      ],
      thumbs: input.items,
      thumbsMarginTop: 36,
      ctaLabel: 'Add shipping info',
      ctaUrl: input.claimUrl,
    }),
  };
}

/** The giver is emailed only when an address or a payment is still missing. */
export function shouldEmailGiftSender(reason: UnclaimedGiftShipReason): boolean {
  return reason === 'no_address' || reason === 'owes_addons';
}

export function renderGiftSenderEmail(input: { boxUrl: string }): { subject: string; html: string } {
  return {
    subject: "The box you gifted hasn't been accepted yet",
    html: grapejuiceEmailHtml({
      campaign: 'gift_unclaimed_sender',
      preheader: 'We could use your help reaching them',
      title: "We tried reaching them, but didn't hear back",
      paragraphs: [
        "Thanks for sending a Hanukkah box as a gift! We let them know as soon as you did it and followed up again yesterday and didn't hear back yet. Any chance you could give them a nudge? Thanks!",
        'We still need a few things from them in order for their box to go out in time.',
      ],
      ctaLabel: 'Review my gift',
      ctaUrl: input.boxUrl,
    }),
  };
}

function paidInvite(data: FirebaseFirestore.DocumentData): boolean {
  return data.paymentStatus === 'paid' || Boolean(data.claimEmailSentAt);
}

function shipReason(data: FirebaseFirestore.DocumentData): UnclaimedGiftShipReason {
  const address = data.shippingAddress as Record<string, unknown> | undefined;
  const complete = Boolean(
    address?.name && address.line1 && address.city && address.stateProvince && address.postalCode
  );
  const lines = Array.isArray(data.lineItems) ? data.lineItems : [];
  const prepaid = typeof data.prepaidAddOnCents === 'number' ? data.prepaidAddOnCents : 0;
  const upgrade = lines.reduce((sum: number, line: { unitCents?: number; quantity?: number }) => {
    return sum + Math.max(0, line?.unitCents ?? 0) * Math.max(1, line?.quantity ?? 1);
  }, 0);
  return unclaimedGiftShipDecision({
    addressComplete: complete,
    upgradeCents: Math.max(0, upgrade - Math.max(0, prepaid)),
  }).reason;
}

/**
 * Recipient follow-up once the original gift email is 48 hours old. A day after that, the giver only if an address or a payment is still missing.
 * sendEmail returns skipped while the template id is 0, and nothing is marked sent.
 */
export async function runUnclaimedGiftNotes(db: Firestore, now = new Date()): Promise<{ considered: number }> {
  const invites = await db.collection('giftInvites').get();
  let considered = 0;
  const appBase = process.env.PILOT_APP_BASE_URL ?? 'https://grapejuice.co';
  for (const doc of invites.docs) {
    const data = doc.data();
    const firstNotifiedAt =
      typeof data.claimEmailSentAt === 'string'
        ? data.claimEmailSentAt
        : typeof data.createdAt === 'string'
          ? data.createdAt
          : null;
    const due = unclaimedGiftNoteDue({
      paid: paidInvite(data),
      status: typeof data.status === 'string' ? data.status : null,
      firstNotifiedAt,
      recipientSentAt: typeof data.recipientNoteSentAt === 'string' ? data.recipientNoteSentAt : null,
      senderSentAt:
        typeof data.senderNoteSentAt === 'string'
          ? data.senderNoteSentAt
          : typeof data.senderNoteSkippedAt === 'string'
            ? data.senderNoteSkippedAt
            : null,
      now: now.getTime(),
    });
    if (!due) continue;
    if (due === 'sender' && !GIVER_NUDGE_EMAIL_ENABLED) continue;
    considered += 1;
    if (due === 'recipient') {
      const giver = typeof data.giverName === 'string' ? data.giverName : 'Someone';
      const token = typeof data.claimToken === 'string' ? data.claimToken : '';
      const to = typeof data.recipientEmail === 'string' ? data.recipientEmail : '';
      const claimUrl = `${appBase}/gift/claim?token=${token}`;
      const picked = await lineItemsEmailItems(db, data.lineItems, claimUrl);
      const rendered = renderGiftRecipientEmail({
        giverName: giver,
        claimUrl,
        items: picked.items.map((item) => ({ name: item.name, imageUrl: item.image_url })),
      });
      const result = await sendEmail({
        to,
        template: 'gift-unclaimed-recipient',
        data: { subject: rendered.subject, html: rendered.html, giver_name: giver },
      });
      if (result === 'sent') {
        await doc.ref.set({ recipientNoteSentAt: now.toISOString() }, { merge: true });
      }
      continue;
    }
    const reason = shipReason(data);
    if (!shouldEmailGiftSender(reason)) {
      await doc.ref.set({ senderNoteSkippedAt: now.toISOString() }, { merge: true });
      continue;
    }
    const to = typeof data.giverEmail === 'string' ? data.giverEmail : '';
    const rendered = renderGiftSenderEmail({
      boxUrl: `${appBase}/my-gifts/box/${encodeURIComponent(doc.id)}`,
    });
    const result = await sendEmail({
      to,
      template: 'gift-unclaimed-sender',
      data: { subject: rendered.subject, html: rendered.html },
    });
    if (result === 'sent') {
      await doc.ref.set({ senderNoteSentAt: now.toISOString() }, { merge: true });
    }
  }
  return { considered };
}
