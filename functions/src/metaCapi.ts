import { createHash } from 'crypto';
import * as logger from './logger';

/**
 * Meta Conversions API (server copy of browser pixel events).
 *
 * Env (functions/.env.grapejuice-pilot — missing token = no-op):
 *  META_CAPI_TOKEN        Events Manager → dataset → Settings → Conversions API → Generate access token
 *  META_TEST_EVENT_CODE   optional; routes events to Events Manager "Test events" and
 *                         lets test-mode Stripe / localhost traffic through for QA
 */

/** "Unaffiliated" dataset. Keep in sync with src/services/analytics/metaPixel.ts. */
export const META_PIXEL_ID = '809409995127436';
const GRAPH_URL = `https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events`;
const CONTENT_CATEGORY = 'grapejuice';
const SEND_TIMEOUT_MS = 3500;

export type MetaServerEventName =
  | 'Purchase'
  | 'AddPaymentInfo'
  | 'CompleteRegistration'
  | 'PreRegister'
  | 'BoxBuilt'
  | 'GiftSent';

/** Browser + request context captured at the callable (or copied from Stripe metadata). */
export type MetaClientContext = {
  skip?: boolean;
  eventId?: string;
  fbp?: string;
  fbc?: string;
  url?: string;
  ip?: string;
  ua?: string;
};

export type MetaUserInput = {
  email?: string | null;
  phone?: string | null;
  externalId?: string | null;
  name?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
};

export type MetaCustomData = {
  value?: number;
  currency?: string;
  order_id?: string;
  content_name?: string;
  content_ids?: string[];
  content_type?: string;
  num_items?: number;
};

function str(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizedPhone(raw: string, country?: string | null): string | undefined {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return undefined;
  if (digits.length === 10 && (!country || country === 'US' || country === 'CA')) return `1${digits}`;
  return digits;
}

function hashedUserData(user: MetaUserInput): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const put = (key: string, value: string | undefined) => {
    if (value) out[key] = [sha256(value)];
  };
  put('em', user.email?.trim().toLowerCase() || undefined);
  if (user.phone) put('ph', normalizedPhone(user.phone, user.country));
  put('external_id', user.externalId?.trim() || undefined);
  const nameParts = (user.name ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (nameParts.length) {
    put('fn', nameParts[0]);
    if (nameParts.length > 1) put('ln', nameParts[nameParts.length - 1]);
  }
  put('ct', user.city?.toLowerCase().replace(/[^a-z]/g, '') || undefined);
  const state = user.state?.trim().toLowerCase();
  put('st', state && state.length === 2 ? state : undefined);
  const zip = user.zip?.trim().toLowerCase();
  const country = user.country?.trim().toLowerCase();
  put('zp', zip ? (country === 'us' || !country ? zip.slice(0, 5) : zip.replace(/\s/g, '')) : undefined);
  put('country', country && country.length === 2 ? country : undefined);
  return out;
}

/** `data.meta` from a callable — untrusted client input. */
export function sanitizeMetaContext(raw: unknown): MetaClientContext {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  if (o.skip === true) return { skip: true };
  const ctx: MetaClientContext = {};
  const eventId = str(o.eventId, 120);
  const fbp = str(o.fbp, 200);
  const fbc = str(o.fbc, 500);
  const url = str(o.url, 500);
  if (eventId) ctx.eventId = eventId;
  if (fbp?.startsWith('fb.')) ctx.fbp = fbp;
  if (fbc?.startsWith('fb.')) ctx.fbc = fbc;
  if (url && /^https?:\/\//.test(url)) ctx.url = url;
  return ctx;
}

type RawRequestLike = {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
};

/** Client meta + caller IP / user agent from the callable's raw request. */
export function metaContextFromCallable(request: { data?: unknown; rawRequest?: unknown }): MetaClientContext {
  const data = (request.data ?? {}) as Record<string, unknown>;
  const ctx = sanitizeMetaContext(data.meta);
  if (ctx.skip) return ctx;
  const raw = (request.rawRequest ?? {}) as RawRequestLike;
  const forwarded = raw.headers?.['x-forwarded-for'];
  const forwardedFirst = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  const ip = forwardedFirst || raw.ip;
  const uaHeader = raw.headers?.['user-agent'];
  const ua = Array.isArray(uaHeader) ? uaHeader[0] : uaHeader;
  if (ip) ctx.ip = ip.slice(0, 64);
  if (ua) ctx.ua = ua.slice(0, 450);
  return ctx;
}

/** Stripe metadata values cap at 500 chars; webhook events rebuild context from these. */
export function metaContextToStripeMetadata(ctx: MetaClientContext): Record<string, string> {
  if (ctx.skip) return { meta_skip: '1' };
  const md: Record<string, string> = {};
  if (ctx.fbp) md.meta_fbp = ctx.fbp;
  if (ctx.fbc) md.meta_fbc = ctx.fbc;
  if (ctx.url) md.meta_url = ctx.url;
  if (ctx.ip) md.meta_ip = ctx.ip;
  if (ctx.ua) md.meta_ua = ctx.ua;
  return md;
}

export function metaContextFromStripeMetadata(md: Record<string, string> | undefined | null): MetaClientContext {
  if (!md) return {};
  if (md.meta_skip === '1') return { skip: true };
  const ctx: MetaClientContext = {};
  if (md.meta_fbp) ctx.fbp = md.meta_fbp;
  if (md.meta_fbc) ctx.fbc = md.meta_fbc;
  if (md.meta_url) ctx.url = md.meta_url;
  if (md.meta_ip) ctx.ip = md.meta_ip;
  if (md.meta_ua) ctx.ua = md.meta_ua;
  return ctx;
}

/** Firestore-safe context (no undefined) for storing on orders / gift invites. */
export function metaContextForDoc(ctx: MetaClientContext): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const [key, value] of Object.entries(ctx)) {
    if (key === 'eventId') continue;
    if (value !== undefined && value !== '') out[key] = value as string | boolean;
  }
  return out;
}

function sanitizeTouch(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const touch: Record<string, unknown> = {};
  const utmRaw = o.utm && typeof o.utm === 'object' ? (o.utm as Record<string, unknown>) : null;
  if (utmRaw) {
    const utm: Record<string, string> = {};
    for (const key of ['source', 'medium', 'campaign', 'content', 'term']) {
      const v = str(utmRaw[key], 200);
      if (v) utm[key] = v;
    }
    if (Object.keys(utm).length) touch.utm = utm;
  }
  const fbclid = str(o.fbclid, 400);
  const landingPath = str(o.landingPath, 200);
  const referrer = str(o.referrer, 300);
  const at = str(o.at, 40);
  if (fbclid) touch.fbclid = fbclid;
  if (landingPath) touch.landingPath = landingPath;
  if (referrer) touch.referrer = referrer;
  if (at) touch.at = at;
  return Object.keys(touch).length ? touch : null;
}

/** `data.attribution` (first / last touch UTMs + Meta ids) → Firestore-safe map, or null. */
export function sanitizeAttribution(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const firstTouch = sanitizeTouch(o.firstTouch);
  const lastTouch = sanitizeTouch(o.lastTouch);
  const fbc = str(o.fbc, 500);
  const fbp = str(o.fbp, 200);
  if (firstTouch) out.firstTouch = firstTouch;
  if (lastTouch) out.lastTouch = lastTouch;
  if (fbc) out.fbc = fbc;
  if (fbp) out.fbp = fbp;
  return Object.keys(out).length ? out : null;
}

function stripeKeyIsTest(): boolean {
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  return key.startsWith('sk_test') || key.startsWith('rk_test');
}

function isLocalUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
}

/**
 * Send one server event. Never throws — tracking must not block checkout.
 * `stripeBacked` events are dropped in Stripe test mode unless META_TEST_EVENT_CODE is set.
 */
export async function sendMetaEvent(input: {
  eventName: MetaServerEventName;
  eventId: string;
  context?: MetaClientContext;
  user?: MetaUserInput;
  customData?: MetaCustomData;
  stripeBacked?: boolean;
  playthrough?: boolean;
}): Promise<void> {
  try {
    const token = process.env.META_CAPI_TOKEN?.trim();
    if (!token) return;
    const ctx = input.context ?? {};
    if (ctx.skip || input.playthrough) return;
    const testCode = process.env.META_TEST_EVENT_CODE?.trim();
    if (!testCode && input.stripeBacked && stripeKeyIsTest()) return;
    if (!testCode && isLocalUrl(ctx.url)) return;

    const userData: Record<string, unknown> = hashedUserData(input.user ?? {});
    if (ctx.fbp) userData.fbp = ctx.fbp;
    if (ctx.fbc) userData.fbc = ctx.fbc;
    if (ctx.ip) userData.client_ip_address = ctx.ip;
    if (ctx.ua) userData.client_user_agent = ctx.ua;

    const appBase = process.env.PILOT_APP_BASE_URL ?? 'https://app.grapejuice.co';
    const event = {
      event_name: input.eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: input.eventId,
      action_source: 'website',
      event_source_url: ctx.url ?? appBase,
      user_data: userData,
      custom_data: { ...input.customData, content_category: CONTENT_CATEGORY },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
    try {
      const res = await fetch(`${GRAPH_URL}?access_token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [event], ...(testCode ? { test_event_code: testCode } : {}) }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        logger.warn('Meta CAPI rejected event', {
          eventName: input.eventName,
          eventId: input.eventId,
          status: res.status,
          body: body.slice(0, 500),
        });
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    logger.warn('Meta CAPI send failed', {
      eventName: input.eventName,
      eventId: input.eventId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
