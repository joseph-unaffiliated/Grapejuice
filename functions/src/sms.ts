import { getCustomerioAppApiKey } from './email';

const BASE_URL = 'https://api.customer.io/v1';

/** Customer.io transactional SMS — stub when key / template missing. */
export async function sendDebriefReminderSms({
  to,
  attempt,
  claimUrl,
}: {
  to: string;
  attempt: 1 | 2;
  claimUrl: string;
}): Promise<void> {
  const transactionalMessageId = parseInt(process.env.CUSTOMERIO_TEMPLATE_DEBRIEF_REMINDER_SMS ?? '0', 10) || 0;
  const apiKey = getCustomerioAppApiKey();
  if (!transactionalMessageId || !apiKey) {
    console.warn('sendDebriefReminderSms: stub (Customer.io SMS not configured)', { to, attempt });
    return;
  }
  if (!to?.replace(/\D/g, '').length) return;

  const from = process.env.CUSTOMERIO_SMS_FROM?.trim();
  const res = await fetch(`${BASE_URL}/send/sms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      to,
      ...(from ? { from } : {}),
      transactional_message_id: transactionalMessageId,
      message_data: { attempt, claimUrl },
      identifiers: { id: to },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Customer.io SMS ${res.status}: ${text}`);
  }
}

/** Lock countdown SMS — stub when template/key missing. */
export async function sendLockReminderSms({
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
  const transactionalMessageId = parseInt(process.env.CUSTOMERIO_TEMPLATE_LOCK_REMINDER_SMS ?? '0', 10) || 0;
  const apiKey = getCustomerioAppApiKey();
  if (!transactionalMessageId || !apiKey) {
    console.warn('sendLockReminderSms: stub (Customer.io SMS not configured)', { to, attempt });
    return;
  }
  if (!to?.replace(/\D/g, '').length) return;

  const from = process.env.CUSTOMERIO_SMS_FROM?.trim();
  const res = await fetch(`${BASE_URL}/send/sms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      to,
      ...(from ? { from } : {}),
      transactional_message_id: transactionalMessageId,
      message_data: { attempt, daysRemaining, myBoxUrl },
      identifiers: { id: to },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Customer.io SMS ${res.status}: ${text}`);
  }
}
