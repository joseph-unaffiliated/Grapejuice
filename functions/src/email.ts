const apiKey = process.env.CUSTOMERIO_APP_API_KEY ?? '';
const BASE_URL = 'https://api.customer.io/v1';
const FROM_EMAIL = process.env.CUSTOMERIO_FROM_EMAIL ?? 'hello@grapejuice.co';

const TEMPLATE_IDS: Record<string, number> = {
  'order-confirmed': parseInt(process.env.CUSTOMERIO_TEMPLATE_ORDER_CONFIRMED ?? '0', 10) || 10,
  'partner-invite': parseInt(process.env.CUSTOMERIO_TEMPLATE_PARTNER_INVITE ?? '0', 10) || 0,
  'debrief-reminder': parseInt(process.env.CUSTOMERIO_TEMPLATE_DEBRIEF_REMINDER ?? '0', 10) || 0,
  'lock-reminder': parseInt(process.env.CUSTOMERIO_TEMPLATE_LOCK_REMINDER ?? '0', 10) || 0,
  'gift-claim': parseInt(process.env.CUSTOMERIO_TEMPLATE_GIFT_CLAIM ?? '0', 10) || 0,
  'debrief-amazon': parseInt(process.env.CUSTOMERIO_TEMPLATE_DEBRIEF_AMAZON ?? '0', 10) || 0,
};

/** Env vars for Customer.io transactional templates:
 *  CUSTOMERIO_APP_API_KEY, CUSTOMERIO_FROM_EMAIL
 *  CUSTOMERIO_TEMPLATE_DEBRIEF_REMINDER, CUSTOMERIO_TEMPLATE_DEBRIEF_REMINDER_SMS, CUSTOMERIO_SMS_FROM
 *  CUSTOMERIO_TEMPLATE_LOCK_REMINDER, CUSTOMERIO_TEMPLATE_LOCK_REMINDER_SMS
 *  CUSTOMERIO_TEMPLATE_GIFT_CLAIM, CUSTOMERIO_TEMPLATE_ORDER_CONFIRMED
 */

export async function sendEmail({
  to,
  template,
  data,
}: {
  to: string;
  template: string;
  data: Record<string, unknown>;
}): Promise<void> {
  const transactionalMessageId = TEMPLATE_IDS[template];
  if (!transactionalMessageId) {
    console.warn('sendEmail: unknown template', template);
    return;
  }
  if (!to?.includes('@')) return;
  if (!apiKey) {
    console.warn('sendEmail: CUSTOMERIO_APP_API_KEY not set, skipping', { to, template });
    return;
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
}

/** Debrief outreach — up to 2 reminder attempts (Q5 panel). Stub when template/key missing. */
export async function sendDebriefReminderEmail({
  to,
  attempt,
  claimUrl,
}: {
  to: string;
  attempt: 1 | 2;
  claimUrl?: string;
}): Promise<void> {
  const template = 'debrief-reminder';
  const transactionalMessageId = TEMPLATE_IDS[template];
  if (!transactionalMessageId || !apiKey) {
    console.warn('sendDebriefReminderEmail: stub (Customer.io not configured)', { to, attempt });
    return;
  }
  await sendEmail({
    to,
    template,
    data: { attempt, claimUrl: claimUrl ?? 'https://app.grapejuice.co' },
  });
}

/** Magic link for gift recipient claim. */
export async function sendGiftClaimEmail({
  to,
  giverName,
  claimUrl,
  message,
}: {
  to: string;
  giverName: string;
  claimUrl: string;
  message?: string;
}): Promise<void> {
  const template = 'gift-claim';
  const transactionalMessageId = TEMPLATE_IDS[template];
  if (!transactionalMessageId || !apiKey) {
    console.warn('sendGiftClaimEmail: stub (Customer.io not configured)', { to, giverName });
    return;
  }
  await sendEmail({ to, template, data: { giverName, claimUrl, message: message ?? '' } });
}

/** Q5 panel — $20 Amazon gift card fallback after 2 debrief nudges + 14 days. */
export async function sendDebriefAmazonFallbackEmail({
  to,
  claimUrl,
}: {
  to: string;
  claimUrl?: string;
}): Promise<void> {
  const templateId = parseInt(process.env.CUSTOMERIO_TEMPLATE_DEBRIEF_AMAZON ?? '0', 10) || 0;
  if (!templateId || !apiKey) {
    console.warn('sendDebriefAmazonFallbackEmail: stub (template not configured)', { to, claimUrl });
    return;
  }
  await sendEmail({
    to,
    template: 'debrief-amazon',
    data: { claimUrl: claimUrl ?? 'https://app.grapejuice.co' },
  });
}

/** Lock countdown — up to 2 reminder attempts before customization closes. */
export async function sendLockReminderEmail({
  to,
  attempt,
  daysRemaining,
  myBoxUrl,
}: {
  to: string;
  attempt: 1 | 2;
  daysRemaining: number;
  myBoxUrl: string;
}): Promise<void> {
  const template = 'lock-reminder';
  const transactionalMessageId = TEMPLATE_IDS[template];
  if (!transactionalMessageId || !apiKey) {
    console.warn('sendLockReminderEmail: stub (Customer.io not configured)', { to, attempt });
    return;
  }
  await sendEmail({
    to,
    template,
    data: { attempt, daysRemaining, myBoxUrl },
  });
}
