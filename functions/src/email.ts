import { defineSecret } from 'firebase-functions/params';
import type { EmailItem } from './emailItems';

/** Customer.io App API key — bind on every function that calls sendEmail / SMS. */
export const customerioAppApiKey = defineSecret('CUSTOMERIO_APP_API_KEY');

const BASE_URL = 'https://api.customer.io/v1';
/** Address-only env override still allowed; default includes display name for inbox From. */
const FROM_EMAIL =
  process.env.CUSTOMERIO_FROM_EMAIL ?? 'Grapejuice <hello@grapejuice.co>';

const TEMPLATE_IDS: Record<string, number> = {
  'order-confirmed': parseInt(process.env.CUSTOMERIO_TEMPLATE_ORDER_CONFIRMED ?? '0', 10) || 10,
  /** À la carte / marketplace — must not reuse Hanukkah-box copy. */
  'marketplace-order-confirmed':
    parseInt(process.env.CUSTOMERIO_TEMPLATE_MARKETPLACE_ORDER_CONFIRMED ?? '0', 10) || 13,
  /** Collaborator invite with a sign-in accept link — transactional message 20. */
  'partner-invite': parseInt(process.env.CUSTOMERIO_TEMPLATE_PARTNER_INVITE ?? '0', 10) || 20,
  'debrief-reminder': parseInt(process.env.CUSTOMERIO_TEMPLATE_DEBRIEF_REMINDER ?? '0', 10) || 0,
  'lock-reminder': parseInt(process.env.CUSTOMERIO_TEMPLATE_LOCK_REMINDER ?? '0', 10) || 0,
  'gift-claim': parseInt(process.env.CUSTOMERIO_TEMPLATE_GIFT_CLAIM ?? '0', 10) || 0,
  /** Gift box nobody has confirmed an address for yet — transactional message 18 (draft until approved). */
  'gift-confirm-reminder':
    parseInt(process.env.CUSTOMERIO_TEMPLATE_GIFT_CONFIRM_REMINDER ?? '0', 10) || 0,
  'debrief-amazon': parseInt(process.env.CUSTOMERIO_TEMPLATE_DEBRIEF_AMAZON ?? '0', 10) || 0,
  'box-discount': parseInt(process.env.CUSTOMERIO_TEMPLATE_BOX_DISCOUNT ?? '0', 10) || 0,
  welcome: parseInt(process.env.CUSTOMERIO_TEMPLATE_WELCOME ?? '0', 10) || 12,
  /** Hanukkah box — transactional message 15. */
  'box-shipped': parseInt(process.env.CUSTOMERIO_TEMPLATE_BOX_SHIPPED ?? '0', 10) || 15,
  /** Marketplace / à la carte — transactional message 16. */
  'order-shipped': parseInt(process.env.CUSTOMERIO_TEMPLATE_ORDER_SHIPPED ?? '0', 10) || 16,
  /** Hanukkah box off-session decline — transactional message 43 (shared HTML). */
  'box-charge-failed': parseInt(process.env.CUSTOMERIO_TEMPLATE_BOX_CHARGE_FAILED ?? '0', 10) || 43,
  /** Passwordless login / save-this-box link — transactional message 19 (sends fail until it's published). */
  'login-link': parseInt(process.env.CUSTOMERIO_TEMPLATE_LOGIN_LINK ?? '0', 10) || 19,
  /** Draft box holds an almost-sold-out item — transactional message 21 (docs/customerio-inventory-low.html). */
  'inventory-low': parseInt(process.env.CUSTOMERIO_TEMPLATE_INVENTORY_LOW ?? '0', 10) || 21,
  /** Sold-out item swapped out of a draft box — transactional message 22 (docs/customerio-inventory-swapped.html). */
  'inventory-swapped': parseInt(process.env.CUSTOMERIO_TEMPLATE_INVENTORY_SWAPPED ?? '0', 10) || 22,
  /** Six-digit sign-in code — transactional message 23 (docs/customerio-login-code.html). */
  'login-code': parseInt(process.env.CUSTOMERIO_TEMPLATE_LOGIN_CODE ?? '0', 10) || 23,
  /** Pilot Participants "You're in" — skipped until a transactional message exists for it. */
  'pilot-joined': parseInt(process.env.CUSTOMERIO_TEMPLATE_PILOT_JOINED ?? '0', 10) || 0,
  /** Conversion program. Values are Customer.io transactional message ids. */
  'program-pilot-invite': parseInt(process.env.CUSTOMERIO_TEMPLATE_PROGRAM_PILOT_INVITE ?? '0', 10) || 25,
  'program-pilot-d3': parseInt(process.env.CUSTOMERIO_TEMPLATE_PROGRAM_PILOT_D3 ?? '0', 10) || 26,
  'program-pilot-d7': parseInt(process.env.CUSTOMERIO_TEMPLATE_PROGRAM_PILOT_D7 ?? '0', 10) || 27,
  'program-d1': parseInt(process.env.CUSTOMERIO_TEMPLATE_PROGRAM_D1 ?? '0', 10) || 28,
  'program-s6': parseInt(process.env.CUSTOMERIO_TEMPLATE_PROGRAM_S6 ?? '0', 10) || 29,
  'program-d4': parseInt(process.env.CUSTOMERIO_TEMPLATE_PROGRAM_D4 ?? '0', 10) || 30,
  'program-d8': parseInt(process.env.CUSTOMERIO_TEMPLATE_PROGRAM_D8 ?? '0', 10) || 31,
  'program-abandoner': parseInt(process.env.CUSTOMERIO_TEMPLATE_PROGRAM_ABANDONER ?? '0', 10) || 32,
  'program-wave2': parseInt(process.env.CUSTOMERIO_TEMPLATE_PROGRAM_WAVE2 ?? '0', 10) || 33,
  'program-lock-t1': parseInt(process.env.CUSTOMERIO_TEMPLATE_PROGRAM_LOCK_T1 ?? '0', 10) || 34,
  'program-survey': parseInt(process.env.CUSTOMERIO_TEMPLATE_PROGRAM_SURVEY ?? '0', 10) || 35,
  'program-lock-t1-committed': parseInt(process.env.CUSTOMERIO_TEMPLATE_PROGRAM_LOCK_T1_COMMITTED ?? '0', 10) || 37,
  'program-lock-sorry': parseInt(process.env.CUSTOMERIO_TEMPLATE_PROGRAM_LOCK_SORRY ?? '0', 10) || 38,
  'program-lock-charged': parseInt(process.env.CUSTOMERIO_TEMPLATE_PROGRAM_LOCK_CHARGED ?? '0', 10) || 39,
  'program-extend-draft': parseInt(process.env.CUSTOMERIO_TEMPLATE_PROGRAM_EXTEND_DRAFT ?? '0', 10) || 40,
  'program-extend-new': parseInt(process.env.CUSTOMERIO_TEMPLATE_PROGRAM_EXTEND_NEW ?? '0', 10) || 41,
  'program-order-cancelled': parseInt(process.env.CUSTOMERIO_TEMPLATE_PROGRAM_ORDER_CANCELLED ?? '0', 10) || 42,
};

/** Env vars for Customer.io transactional templates:
 *  CUSTOMERIO_APP_API_KEY (Firebase secret — see getCustomerioAppApiKey)
 *  CUSTOMERIO_FROM_EMAIL
 *  CUSTOMERIO_TEMPLATE_DEBRIEF_REMINDER, CUSTOMERIO_TEMPLATE_DEBRIEF_REMINDER_SMS, CUSTOMERIO_SMS_FROM
 *  CUSTOMERIO_TEMPLATE_LOCK_REMINDER, CUSTOMERIO_TEMPLATE_LOCK_REMINDER_SMS
 *  CUSTOMERIO_TEMPLATE_GIFT_CLAIM, CUSTOMERIO_TEMPLATE_GIFT_CONFIRM_REMINDER, CUSTOMERIO_TEMPLATE_ORDER_CONFIRMED
 *  CUSTOMERIO_TEMPLATE_MARKETPLACE_ORDER_CONFIRMED
 *  CUSTOMERIO_TEMPLATE_BOX_DISCOUNT, CUSTOMERIO_TEMPLATE_WELCOME
 *  CUSTOMERIO_TEMPLATE_BOX_SHIPPED, CUSTOMERIO_TEMPLATE_ORDER_SHIPPED
 *  CUSTOMERIO_TEMPLATE_BOX_CHARGE_FAILED, CUSTOMERIO_TEMPLATE_LOGIN_LINK
 *  CUSTOMERIO_TEMPLATE_INVENTORY_LOW, CUSTOMERIO_TEMPLATE_INVENTORY_SWAPPED
 *
 *  Set once: npx firebase-tools functions:secrets:set CUSTOMERIO_APP_API_KEY --project grapejuice-pilot
 */

/** Resolve App API key from the bound secret (or env fallback). Call only inside a function invocation. */
export function getCustomerioAppApiKey(): string {
  try {
    const fromSecret = customerioAppApiKey.value()?.trim();
    if (fromSecret) return fromSecret;
  } catch {
    /* Secret not bound on this function */
  }
  return process.env.CUSTOMERIO_APP_API_KEY?.trim() || '';
}

export async function sendEmail({
  to,
  template,
  data,
}: {
  to: string;
  template: string;
  data: Record<string, unknown>;
}): Promise<'sent' | 'skipped'> {
  if (!(template in TEMPLATE_IDS)) {
    console.warn('sendEmail: unknown template', template);
    return 'skipped';
  }
  const transactionalMessageId = TEMPLATE_IDS[template];
  if (!transactionalMessageId) {
    console.warn('sendEmail: template not configured', template);
    return 'skipped';
  }
  if (!to?.includes('@')) return 'skipped';
  const apiKey = getCustomerioAppApiKey();
  if (!apiKey) {
    console.warn('sendEmail: CUSTOMERIO_APP_API_KEY not set, skipping', { to, template });
    return 'skipped';
  }
  const res = await fetch(`${BASE_URL}/send/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      to,
      transactional_message_id: transactionalMessageId,
      message_data: data,
      identifiers: { email: to },
      from: FROM_EMAIL,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Customer.io ${res.status}: ${text}`);
  }
  return 'sent';
}

/** December debrief reminders (attempts 1–2): a completed debrief earns the $80 credit through Dec 31. */
export async function sendDebriefReminderEmail({
  to,
  attempt,
  claimUrl,
}: {
  to: string;
  attempt: 1 | 2;
  claimUrl?: string;
}): Promise<boolean> {
  const template = 'debrief-reminder';
  const transactionalMessageId = TEMPLATE_IDS[template];
  if (!transactionalMessageId || !getCustomerioAppApiKey()) {
    console.warn('sendDebriefReminderEmail: stub (Customer.io not configured)', { to, attempt });
    return false;
  }
  return (
    (await sendEmail({
      to,
      template,
      data: { attempt, claimUrl: claimUrl ?? 'https://app.grapejuice.co' },
    })) === 'sent'
  );
}

/** Magic link for gift recipient claim. */
export async function sendGiftClaimEmail({
  to,
  giverName,
  claimUrl,
  message,
  kind,
  deadlineLabel,
  arrivesByLabel,
}: {
  to: string;
  giverName: string;
  claimUrl: string;
  message?: string;
  kind: 'box' | 'credit';
  deadlineLabel: string;
  arrivesByLabel: string;
}): Promise<void> {
  const template = 'gift-claim';
  const transactionalMessageId = TEMPLATE_IDS[template];
  if (!transactionalMessageId || !getCustomerioAppApiKey()) {
    console.warn('sendGiftClaimEmail: stub (Customer.io not configured)', { to, giverName });
    return;
  }
  await sendEmail({
    to,
    template,
    data: { giverName, claimUrl, message: message ?? '', kind, deadlineLabel, arrivesByLabel },
  });
}

/** Gift box still needs an address before lock. Returns false when stubbed so the caller doesn't mark it sent. */
export async function sendGiftConfirmReminderEmail(data: {
  to: string;
  giverName: string;
  ctaUrl: string;
  claimed: boolean;
  hasGiverAddress: boolean;
  finalNotice: boolean;
  deadlineLabel: string;
  arrivesByLabel: string;
}): Promise<boolean> {
  const template = 'gift-confirm-reminder';
  if (!TEMPLATE_IDS[template] || !getCustomerioAppApiKey()) return false;
  const { to, ...messageData } = data;
  return (await sendEmail({ to, template, data: messageData })) === 'sent';
}

/** January debrief email (message 8): finish by Jan 31, then pick the $80 credit or a $20 Amazon gift card. */
export async function sendDebriefChoiceEmail({
  to,
  claimUrl,
  final,
}: {
  to: string;
  claimUrl?: string;
  final: boolean;
}): Promise<boolean> {
  const template = 'debrief-amazon';
  if (!TEMPLATE_IDS[template] || !getCustomerioAppApiKey()) {
    console.warn('sendDebriefChoiceEmail: stub (template not configured)', { to, final });
    return false;
  }
  return (
    (await sendEmail({
      to,
      template,
      data: { claimUrl: claimUrl ?? 'https://app.grapejuice.co', final },
    })) === 'sent'
  );
}

/** Lock countdown — up to 2 reminder attempts before customization closes. */
export async function sendLockReminderEmail({
  to,
  attempt,
  daysRemaining,
  myBoxUrl,
  checkoutUrl,
  lockDate,
  hasCard,
  items,
  itemsMore,
}: {
  to: string;
  attempt: 1 | 2;
  daysRemaining: number;
  myBoxUrl: string;
  checkoutUrl: string;
  lockDate: string;
  hasCard: boolean;
  items: EmailItem[];
  itemsMore: number;
}): Promise<void> {
  const template = 'lock-reminder';
  const transactionalMessageId = TEMPLATE_IDS[template];
  if (!transactionalMessageId || !getCustomerioAppApiKey()) {
    console.warn('sendLockReminderEmail: stub (Customer.io not configured)', { to, attempt });
    return;
  }
  await sendEmail({
    to,
    template,
    data: {
      attempt,
      daysRemaining,
      myBoxUrl,
      box_url: myBoxUrl,
      checkout_url: checkoutUrl,
      lock_date: lockDate,
      has_card: hasCard,
      items,
      items_more: itemsMore,
    },
  });
}
