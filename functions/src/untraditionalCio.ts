import * as logger from 'firebase-functions/logger';

/**
 * Customer.io *Track* API for the Untraditional workspace (208456).
 *
 * The App API key in email.ts can only send transactional messages. Identifying people and
 * firing campaign-trigger events (guest box recovery) needs Track API credentials:
 *   Customer.io → Untraditional workspace → Settings → API Credentials → Track API Keys.
 *
 * Env (functions/.env.grapejuice-pilot, same pattern as CUSTOMERIO_APP_API_KEY):
 *   UNTRADITIONAL_CIO_SITE_ID
 *   UNTRADITIONAL_CIO_TRACK_API_KEY
 *   UNTRADITIONAL_CIO_TRACK_URL   optional, default https://track.customer.io/api/v1
 *
 * Every helper is a no-op (with a warning) when the credentials are missing, so a deploy
 * without them cannot break sign-up, checkout, or the lead endpoint.
 */

const TRACK_BASE_URL = process.env.UNTRADITIONAL_CIO_TRACK_URL?.trim() || 'https://track.customer.io/api/v1';

function authHeader(): string | null {
  const siteId = process.env.UNTRADITIONAL_CIO_SITE_ID?.trim() || '';
  const apiKey = process.env.UNTRADITIONAL_CIO_TRACK_API_KEY?.trim() || '';
  if (!siteId || !apiKey) return null;
  return `Basic ${Buffer.from(`${siteId}:${apiKey}`).toString('base64')}`;
}

export function untraditionalCioConfigured(): boolean {
  return authHeader() !== null;
}

async function trackRequest(method: 'PUT' | 'POST', path: string, body: unknown): Promise<boolean> {
  const auth = authHeader();
  if (!auth) {
    logger.warn('untraditionalCio: UNTRADITIONAL_CIO_SITE_ID / TRACK_API_KEY not set, skipping', { method, path });
    return false;
  }
  const res = await fetch(`${TRACK_BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Customer.io Track ${res.status}: ${text}`);
  }
  return true;
}

type AttributeValue = string | number | boolean | null;

function compact(input: Record<string, AttributeValue | undefined>): Record<string, AttributeValue> {
  const out: Record<string, AttributeValue> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Create-or-update a person keyed by email. Attributes with `undefined` are dropped. */
export async function untraditionalIdentify(
  email: string,
  attributes: Record<string, AttributeValue | undefined>
): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes('@')) return false;
  return trackRequest('PUT', `/customers/${encodeURIComponent(normalized)}`, {
    ...compact(attributes),
    email: normalized,
  });
}

/** Fire a campaign-trigger event for a person keyed by email. */
export async function untraditionalEvent(
  email: string,
  name: string,
  data: Record<string, AttributeValue | undefined>
): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes('@')) return false;
  return trackRequest('POST', `/customers/${encodeURIComponent(normalized)}/events`, {
    name,
    data: compact(data),
  });
}

/** Delete a person (data-rights request). 404 is treated as already gone. */
export async function untraditionalDeletePerson(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes('@')) return false;
  const auth = authHeader();
  if (!auth) {
    logger.warn('untraditionalCio: credentials not set, skipping delete');
    return false;
  }
  const res = await fetch(`${TRACK_BASE_URL}/customers/${encodeURIComponent(normalized)}`, {
    method: 'DELETE',
    headers: { Authorization: auth },
  });
  if (res.ok || res.status === 404) return true;
  throw new Error(`Customer.io Track ${res.status}: ${await res.text()}`);
}

/**
 * Best-effort exit signal for recovery campaigns (account created / order placed).
 * Never throws — marketing state must not break sign-up or checkout.
 */
export async function untraditionalMarkSafe(
  email: string | null | undefined,
  attributes: Record<string, AttributeValue | undefined>
): Promise<void> {
  if (!email || !untraditionalCioConfigured()) return;
  try {
    await untraditionalIdentify(email, attributes);
  } catch (err) {
    logger.warn('untraditionalCio: identify failed (non-fatal)', { err: String(err) });
  }
}
