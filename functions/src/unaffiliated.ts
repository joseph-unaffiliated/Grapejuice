import * as logger from './logger';
import { onRequest } from './sentry';
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, signForward, verifyForwardSignature } from './retentionLead';
import { untraditionalIdentify } from './untraditionalCio';

/**
 * Unaffiliated (newsletter network) readers who reach grapejuice.co from an Unaffiliated email.
 * Their email links carry `userID={{customer.id}}`; the web app keeps it as
 * `attribution.unaffiliatedUserID` and reports the visit to magic.unaffiliated.co/api/site-visit,
 * which records IP geo on the Unaffiliated side and forwards it here.
 *
 *   unaffiliatedVisit (magic → here): email + IP geo → Untraditional Customer.io person.
 *   reportUnaffiliatedShippingGeo (here → magic): city / state / ZIP of an order placed by such
 *     a reader → Unaffiliated BigQuery + Customer.io; returns the metro magic derived.
 *
 * Both directions are HMAC-signed with the Retention forward secret:
 *   functions/.env.grapejuice-pilot: GJ_RETENTION_FORWARD_SECRET
 *   Vercel (subscription-functions): GRAPEJUICE_RETENTION_FORWARD_SECRET
 */

export const UNAFFILIATED_USER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_SHIPPING_GEO_URL = 'https://magic.unaffiliated.co/api/grapejuice-shipping-geo';
const SHIPPING_GEO_TIMEOUT_MS = 3000;

function str(v: unknown, max = 200): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
}

export function unaffiliatedUserIdFrom(attribution: unknown): string | null {
  if (!attribution || typeof attribution !== 'object') return null;
  const id = (attribution as Record<string, unknown>).unaffiliatedUserID;
  return typeof id === 'string' && UNAFFILIATED_USER_ID_RE.test(id) ? id.toLowerCase() : null;
}

type VisitPayload = {
  email?: unknown;
  userID?: unknown;
  site?: unknown;
  geo?: unknown;
  utm?: unknown;
  at?: unknown;
};

/** Untraditional Customer.io attributes for a forwarded visit (geo keys match the Unaffiliated workspace). */
export function visitAttributes(payload: VisitPayload): Record<string, string | boolean | undefined> {
  const geo = payload.geo && typeof payload.geo === 'object' ? (payload.geo as Record<string, unknown>) : null;
  const utm = payload.utm && typeof payload.utm === 'object' ? (payload.utm as Record<string, unknown>) : null;
  const attrs: Record<string, string | boolean | undefined> = {
    unaffiliated_reader: true,
    unaffiliated_user_id: str(payload.userID, 64),
    grapejuice_email_visit_at: str(payload.at, 40) ?? new Date().toISOString(),
    grapejuice_email_visit_source: str(utm?.source),
    grapejuice_email_visit_campaign: str(utm?.campaign),
  };
  if (geo && str(geo.country, 2)) {
    attrs.country = str(geo.country, 2);
    attrs.region = str(geo.region, 3) ?? '';
    attrs.city = str(geo.city, 80) ?? '';
    attrs.postal_code = str(geo.postalCode, 10) ?? '';
    attrs.metro = str(geo.metro, 80) ?? '';
  }
  return attrs;
}

export const unaffiliatedVisit = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const secret = process.env.GJ_RETENTION_FORWARD_SECRET?.trim() ?? '';
  if (!secret) {
    logger.error('unaffiliatedVisit: GJ_RETENTION_FORWARD_SECRET not set');
    res.status(503).json({ error: 'Not configured' });
    return;
  }
  const rawBody = req.rawBody?.toString('utf8') ?? '';
  const header = (name: string): string | undefined => {
    const v = req.headers[name];
    return Array.isArray(v) ? v[0] : v;
  };
  if (!verifyForwardSignature({ secret, timestamp: header(TIMESTAMP_HEADER), signature: header(SIGNATURE_HEADER), rawBody })) {
    logger.warn('unaffiliatedVisit: bad signature');
    res.status(401).json({ error: 'Bad signature' });
    return;
  }
  let payload: VisitPayload;
  try {
    payload = JSON.parse(rawBody) as VisitPayload;
  } catch {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }
  const email = str(payload.email, 254)?.toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    res.status(200).json({ status: 'ignored', reason: 'invalid_email' });
    return;
  }
  try {
    const sent = await untraditionalIdentify(email, visitAttributes(payload));
    res.status(200).json({ status: sent ? 'processed' : 'not_configured' });
  } catch (err) {
    logger.error('unaffiliatedVisit: Customer.io failed', { err: String(err).slice(0, 500) });
    res.status(500).json({ error: 'Customer.io failed' });
  }
});

type ShippingAddressLike = {
  city?: unknown;
  stateProvince?: unknown;
  postalCode?: unknown;
  country?: unknown;
};

/**
 * Order placed by an Unaffiliated reader: send city / state / ZIP (never street lines) to magic,
 * and put the same shipping location on the buyer's Untraditional Customer.io profile.
 * Never throws — attribution must not break checkout.
 */
export async function reportUnaffiliatedShippingGeo(input: {
  attribution: unknown;
  shippingAddress: ShippingAddressLike | null | undefined;
  email: string | null | undefined;
}): Promise<void> {
  const userID = unaffiliatedUserIdFrom(input.attribution);
  const address = input.shippingAddress;
  if (!userID || !address) return;
  const secret = process.env.GJ_RETENTION_FORWARD_SECRET?.trim() ?? '';
  const country = str(address.country, 8);
  const location = {
    country: country === 'US' || country === 'CA' ? country : undefined,
    region: str(address.stateProvince, 60),
    city: str(address.city, 80),
    postalCode: str(address.postalCode, 12),
  };

  let metro: string | undefined;
  if (secret && location.country) {
    try {
      const payload = JSON.stringify({ userID, address: location });
      const timestamp = String(Date.now());
      const res = await fetch(process.env.UNAFFILIATED_SHIPPING_GEO_URL?.trim() || DEFAULT_SHIPPING_GEO_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [TIMESTAMP_HEADER]: timestamp,
          [SIGNATURE_HEADER]: signForward(secret, timestamp, payload),
        },
        body: JSON.stringify({ payload }),
        signal: AbortSignal.timeout(SHIPPING_GEO_TIMEOUT_MS),
      });
      const data = (await res.json().catch(() => ({}))) as { status?: string; metro?: unknown };
      metro = str(data.metro, 80);
      logger.info('reportUnaffiliatedShippingGeo', { status: res.status, result: data.status ?? null });
    } catch (err) {
      logger.warn('reportUnaffiliatedShippingGeo: magic failed (non-fatal)', { err: String(err).slice(0, 300) });
    }
  }

  if (input.email) {
    try {
      await untraditionalIdentify(input.email, {
        unaffiliated_reader: true,
        unaffiliated_user_id: userID,
        shipping_country: location.country ?? str(address.country, 8),
        shipping_region: location.region,
        shipping_city: location.city,
        shipping_postal_code: location.postalCode,
        shipping_metro: metro,
      });
    } catch (err) {
      logger.warn('reportUnaffiliatedShippingGeo: Customer.io failed (non-fatal)', { err: String(err).slice(0, 300) });
    }
  }
}
