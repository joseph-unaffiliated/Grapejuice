import { sanitizeTouch } from './metaCapi';

/**
 * The browser session that saved a card or a box's shipping address: its user agent and where the
 * tab's visit started (UTMs / fbclid / referrer). Stored raw and classified when the Ops dashboard
 * reads it.
 */
export type CheckoutSessionDoc = {
  at: string;
  ua: string | null;
  entry: Record<string, unknown> | null;
  /** Rebuilt from an older SetupIntent's metadata, which carried no entry. */
  backfilled?: boolean;
};

export type SessionChannel = 'instagram' | 'facebook' | 'meta' | 'email' | 'organic' | 'other';

export type CheckoutSessionView = {
  channel: SessionChannel;
  device: 'mobile' | 'desktop' | null;
  /** "Instagram app", "lifecycle / lock_reminder", "Referral: google.com", "Direct". */
  detail: string;
  at: string;
  /** Entry wasn't recorded for this session; channel comes from a campaign click shortly before. */
  inferred: boolean;
};

type RawRequestLike = { headers?: Record<string, string | string[] | undefined> };

const str = (v: unknown, max = 500): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

function userAgentOf(rawRequest: unknown): string | null {
  const ua = (rawRequest as RawRequestLike | undefined)?.headers?.['user-agent'];
  return str(Array.isArray(ua) ? ua[0] : ua, 450);
}

/** `data.session` (the tab's entry touch, see entryContextStore.readSessionEntry) + the caller's UA. */
export function checkoutSessionFromCallable(request: { data?: unknown; rawRequest?: unknown }): CheckoutSessionDoc {
  const data = (request.data ?? {}) as Record<string, unknown>;
  return { at: new Date().toISOString(), ua: userAgentOf(request.rawRequest), entry: sanitizeTouch(data.session) };
}

/** Stripe metadata values cap at 500 chars. */
export function checkoutSessionToStripeMetadata(s: CheckoutSessionDoc): Record<string, string> {
  const md: Record<string, string> = {};
  if (s.ua) md.session_ua = s.ua;
  if (s.entry) {
    const json = JSON.stringify(s.entry);
    md.session_entry = json.length <= 500 ? json : JSON.stringify({ ...s.entry, referrer: undefined, landingPath: undefined });
  }
  return md;
}

/** Older intents only carry Meta's copy of the UA (`meta_ua`), and none for suppressed sessions. */
export function checkoutSessionFromStripeMetadata(
  md: Record<string, string> | undefined | null,
  at: string,
): CheckoutSessionDoc | null {
  if (!md) return null;
  let entry: Record<string, unknown> | null = null;
  if (md.session_entry) {
    try {
      entry = sanitizeTouch(JSON.parse(md.session_entry));
    } catch {
      entry = null;
    }
  }
  const ua = str(md.session_ua, 450) ?? str(md.meta_ua, 450);
  const fresh = 'session_ua' in md || 'session_entry' in md;
  if (!ua && !entry) return null;
  return { at, ua, entry, ...(fresh ? {} : { backfilled: true }) };
}

export function deviceOfUa(ua: string | null): 'mobile' | 'desktop' | null {
  if (!ua) return null;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ? 'mobile' : 'desktop';
}

function hostOf(url: unknown): string | null {
  if (typeof url !== 'string' || !url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/** Channel for a touch (`{ utm, fbclid, referrer }`, utm keys bare or utm_-prefixed). Null = nothing to go on. */
function channelOfTouch(touch: unknown): { channel: SessionChannel; detail: string } | null {
  if (!touch || typeof touch !== 'object') return null;
  const t = touch as Record<string, unknown>;
  const u = (t.utm && typeof t.utm === 'object' ? t.utm : {}) as Record<string, unknown>;
  const source = (str(u.source) ?? str(u.utm_source) ?? '').toLowerCase();
  const medium = (str(u.medium) ?? str(u.utm_medium) ?? '').toLowerCase();
  const campaign = str(u.campaign) ?? str(u.utm_campaign);
  const tag = [source, campaign].filter(Boolean).join(' / ');
  const host = hostOf(t.referrer);
  if (medium === 'email' || /e-?mail|newsletter|lifecycle|transactional|retention|customer\.?io|unaffiliated/.test(source)) {
    return { channel: 'email', detail: tag || 'email link' };
  }
  if (host && /(^|\.)mail\.|outlook\.|mail\.google\.com$/.test(host)) return { channel: 'email', detail: host };
  if (/^(ig|instagram)/.test(source) || (!source && host && /(^|\.)instagram\.com$/.test(host))) {
    return { channel: 'instagram', detail: tag || host || 'instagram' };
  }
  if (/^(fb|facebook)/.test(source) || (!source && host && /(^|\.)facebook\.com$/.test(host))) {
    return { channel: 'facebook', detail: tag || host || 'facebook' };
  }
  if (source === 'meta' || str(t.fbclid)) return { channel: 'meta', detail: tag || 'Meta ad click' };
  if (source) return { channel: 'other', detail: tag };
  return { channel: 'organic', detail: host ? `Referral: ${host}` : 'Direct' };
}

const RECENT_CLICK_MS = 12 * 60 * 60 * 1000;

/**
 * IG / FB in-app browsers win (the UA can't lie about that); then the session's own entry; for
 * sessions recorded without one, a campaign click in the 12 hours before.
 */
export function classifyCheckoutSession(
  s: CheckoutSessionDoc,
  recentTouches: unknown[] = [],
): CheckoutSessionView {
  const device = deviceOfUa(s.ua);
  const base = { device, at: s.at };
  if (s.ua && /Instagram/i.test(s.ua)) return { ...base, channel: 'instagram', detail: 'Instagram app', inferred: false };
  if (s.ua && /FBAN|FBAV|FB_IAB|FBIOS|FB4A|Messenger/.test(s.ua)) {
    return { ...base, channel: 'facebook', detail: 'Facebook app', inferred: false };
  }
  const own = channelOfTouch(s.entry);
  if (own) return { ...base, ...own, inferred: false };
  const atMs = Date.parse(s.at);
  for (const t of recentTouches) {
    const tAt = t && typeof t === 'object' ? Date.parse(String((t as Record<string, unknown>).at ?? '')) : NaN;
    if (!Number.isFinite(atMs) || !Number.isFinite(tAt) || tAt > atMs + 60_000 || atMs - tAt > RECENT_CLICK_MS) continue;
    const c = channelOfTouch(t);
    if (c && c.channel !== 'organic') return { ...base, ...c, inferred: true };
  }
  return { ...base, channel: 'organic', detail: 'No campaign click that day', inferred: true };
}
