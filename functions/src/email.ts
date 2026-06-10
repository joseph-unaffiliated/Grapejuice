const apiKey = process.env.CUSTOMERIO_APP_API_KEY ?? '';
const BASE_URL = 'https://api.customer.io/v1';
const FROM_EMAIL = process.env.CUSTOMERIO_FROM_EMAIL ?? 'hello@grapejuice.co';

const TEMPLATE_IDS: Record<string, number> = {
  'order-confirmed': parseInt(process.env.CUSTOMERIO_TEMPLATE_ORDER_CONFIRMED ?? '0', 10) || 10,
  'partner-invite': parseInt(process.env.CUSTOMERIO_TEMPLATE_PARTNER_INVITE ?? '0', 10) || 0,
};

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
