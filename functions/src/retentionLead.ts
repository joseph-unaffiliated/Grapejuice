import * as logger from './logger';
import { onRequest } from './sentry';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  appOrigin,
  emailHash,
  mintResumeToken,
  sha256Hex,
  VISITOR_ID_RE,
} from './guestSessions';
import { untraditionalEvent, untraditionalIdentify } from './untraditionalCio';
import { boxEmailItems, pickEmailItems, type EmailItem } from './emailItems';

/**
 * Receives grapejuice.co leads forwarded by subscription-functions' /api/retention-webhook
 * (lib/grapejuice-lead.js), links them to a saved guest box, and hands them to the
 * Untraditional Customer.io workspace, which owns the recovery emails.
 *
 * Shared secret (same value on both sides):
 *   functions/.env.grapejuice-pilot:        GJ_RETENTION_FORWARD_SECRET
 *   Vercel (subscription-functions):        GRAPEJUICE_RETENTION_FORWARD_SECRET
 */

export const SIGNATURE_HEADER = 'x-gj-signature';
export const TIMESTAMP_HEADER = 'x-gj-timestamp';
const SIGNATURE_MAX_SKEW_MS = 5 * 60 * 1000;
/** Fallback matching: a session created this close to the lead's click, with matching entry context. */
const FALLBACK_WINDOW_MS = 10 * 60 * 1000;

export const LEAD_EVENT_NAME = 'grapejuice_retention_lead';

export type RetentionLeadPayload = {
  email?: unknown;
  email_domain?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  clicked_at?: unknown;
  landing_page_url?: unknown;
  landing_page_domain?: unknown;
  referrer?: unknown;
  page_title?: unknown;
  replayed?: unknown;
};

export function signForward(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

export function verifyForwardSignature(input: {
  secret: string;
  timestamp: string | undefined;
  signature: string | undefined;
  rawBody: string;
  nowMs?: number;
}): boolean {
  const { secret, timestamp, signature, rawBody } = input;
  if (!secret || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = input.nowMs ?? Date.now();
  if (Math.abs(now - ts) > SIGNATURE_MAX_SKEW_MS) return false;
  const expected = Buffer.from(signForward(secret, timestamp, rawBody), 'hex');
  let given: Buffer;
  try {
    given = Buffer.from(signature.trim(), 'hex');
  } catch {
    return false;
  }
  if (given.length !== expected.length || given.length === 0) return false;
  return timingSafeEqual(given, expected);
}

/** `?gjv=` from the landing URL. Tolerates URLs that fail to parse. */
export function visitorIdFromLandingUrl(url: unknown): string | null {
  if (typeof url !== 'string' || !url) return null;
  let value: string | null = null;
  try {
    value = new URL(url).searchParams.get('gjv');
  } catch {
    const m = /[?&]gjv=([A-Za-z0-9_-]{16,64})(?:[&#]|$)/.exec(url);
    value = m ? m[1] : null;
  }
  return value && VISITOR_ID_RE.test(value) ? value : null;
}

/** Retention sends e.g. "Mon, 28 Nov 2022 19:47:42 UTC +00:00" — not something Date.parse accepts as-is. */
export function parseClickedAt(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const candidates = [
    raw,
    raw.replace(/\s+UTC\s*([+-]\d{2}:?\d{2})$/, ' GMT$1'),
    raw.replace(/\s+UTC\s*[+-]\d{2}:?\d{2}$/, ' GMT'),
  ];
  for (const c of candidates) {
    const ms = Date.parse(c);
    if (Number.isFinite(ms)) return new Date(ms);
  }
  return null;
}

function hostOf(url: unknown): string | null {
  if (typeof url !== 'string' || !url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function utmCampaignOf(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  try {
    return new URL(url).searchParams.get('utm_campaign');
  } catch {
    return null;
  }
}

type SessionDoc = FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>;

/**
 * No `gjv` in the URL: accept the single unconverted session created within ±10 minutes of the
 * click whose entry context (external referrer host or utm_campaign) matches the lead's.
 * Ambiguity (0 or 2+ matches) means no link.
 */
export async function fallbackSessionForLead(
  db: FirebaseFirestore.Firestore,
  lead: { clickedAt: Date | null; referrer: unknown; landingPageUrl: unknown }
): Promise<SessionDoc | null> {
  if (!lead.clickedAt) return null;
  const leadReferrerHost = hostOf(lead.referrer);
  const leadCampaign = utmCampaignOf(lead.landingPageUrl);
  if (!leadReferrerHost && !leadCampaign) return null;
  const from = Timestamp.fromMillis(lead.clickedAt.getTime() - FALLBACK_WINDOW_MS);
  const to = Timestamp.fromMillis(lead.clickedAt.getTime() + FALLBACK_WINDOW_MS);
  const snap = await db
    .collection('guestSessions')
    .where('createdAt', '>=', from)
    .where('createdAt', '<=', to)
    .limit(200)
    .get();
  const matches = snap.docs.filter((d) => {
    const data = d.data();
    if (data.convertedUid) return false;
    const entry = (data.entry ?? {}) as { referrer?: unknown; utm?: { campaign?: unknown } };
    const entryHost = hostOf(entry.referrer);
    if (leadReferrerHost && entryHost && entryHost === leadReferrerHost) return true;
    const entryCampaign = typeof entry.utm?.campaign === 'string' ? entry.utm.campaign : null;
    return !!leadCampaign && !!entryCampaign && entryCampaign === leadCampaign;
  });
  return matches.length === 1 ? matches[0] : null;
}

export type ProcessLeadResult = {
  status: 'processed' | 'duplicate' | 'ignored';
  reason?: string;
  linked?: 'gjv' | 'clicked_at' | null;
  hasBox?: boolean;
  eventSent?: boolean;
};

function str(v: unknown, max = 500): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
}

export async function processRetentionLead(
  db: FirebaseFirestore.Firestore,
  payload: RetentionLeadPayload,
  now: Date = new Date()
): Promise<ProcessLeadResult> {
  const email = str(payload.email, 254)?.toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { status: 'ignored', reason: 'invalid_email' };
  }
  const clickedAtRaw = str(payload.clicked_at, 100) ?? '';
  const clickedAt = parseClickedAt(clickedAtRaw);
  const landingPageUrl = str(payload.landing_page_url, 2000);
  const hash = emailHash(email);

  // Dedupe on email + clicked_at: webhook retries and the replay cron must never double-send.
  const eventRef = db.doc(`retentionLeadEvents/${sha256Hex(`${email}|${clickedAtRaw}`)}`);
  const created = await db.runTransaction(async (tx) => {
    const existing = await tx.get(eventRef);
    if (existing.exists) return false;
    tx.set(eventRef, {
      emailHash: hash,
      clickedAt: clickedAt ? Timestamp.fromDate(clickedAt) : null,
      clickedAtRaw,
      receivedAt: Timestamp.fromDate(now),
      landingPageUrl: landingPageUrl ?? null,
      landingPageDomain: str(payload.landing_page_domain, 200) ?? null,
      referrer: str(payload.referrer, 500) ?? null,
      replayed: payload.replayed === true,
      status: 'processing',
    });
    return true;
  });
  if (!created) return { status: 'duplicate' };

  // Link to a saved guest box.
  let linked: 'gjv' | 'clicked_at' | null = null;
  let session: SessionDoc | null = null;
  const visitorId = visitorIdFromLandingUrl(landingPageUrl);
  if (visitorId) {
    const snap = await db.doc(`guestSessions/${visitorId}`).get();
    if (snap.exists) {
      session = snap;
      linked = 'gjv';
    }
  }
  if (!session) {
    session = await fallbackSessionForLead(db, { clickedAt, referrer: payload.referrer, landingPageUrl });
    if (session) linked = 'clicked_at';
  }

  const sessionData = session?.data() ?? null;
  const converted = typeof sessionData?.convertedUid === 'string' && sessionData.convertedUid.length > 0;
  const hasBox = !!sessionData && !converted && (sessionData.hasBox === true || sessionData.hasGiftDraft === true);
  const kidCount = typeof sessionData?.kidCount === 'number' ? sessionData.kidCount : 0;
  const boxItemCount = typeof sessionData?.boxItemCount === 'number' ? sessionData.boxItemCount : 0;

  let resumeUrl: string;
  if (session && hasBox) {
    const minted = await mintResumeToken(db, session.id, email, now);
    resumeUrl = minted.url;
  } else {
    resumeUrl = `${appOrigin()}/box?utm_source=retention&utm_medium=email&utm_campaign=guest_box_recovery`;
  }
  let items: EmailItem[] = [];
  let itemsMore = 0;
  try {
    if (session && hasBox) {
      ({ items, more: itemsMore } = await boxEmailItems(db, sessionData?.snapshot, resumeUrl));
    } else {
      items = await pickEmailItems(db, 'utm_source=retention&utm_medium=email&utm_campaign=guest_box_recovery');
    }
  } catch (err) {
    logger.warn('retentionLead: email items failed (sending without them)', { err: String(err) });
  }

  if (session) {
    await session.ref.set(
      { lastLeadEmailHash: hash, lastLeadAt: Timestamp.fromDate(now) },
      { merge: true }
    );
  }

  // Untraditional Customer.io: person + campaign trigger. No child names leave Firestore.
  let eventSent = false;
  let cioError: string | null = null;
  try {
    await untraditionalIdentify(email, {
      first_name: str(payload.first_name, 100),
      last_name: str(payload.last_name, 100),
      grapejuice_lead: true,
      lead_source: 'retention',
      grapejuice_has_box: hasBox,
      grapejuice_resume_url: resumeUrl,
      grapejuice_kid_count: kidCount,
      grapejuice_box_item_count: boxItemCount,
      grapejuice_lead_at: now.toISOString(),
      grapejuice_lead_landing_url: landingPageUrl,
    });
    // A session that already became an account must not trigger recovery campaigns.
    if (!converted) {
      eventSent = await untraditionalEvent(email, LEAD_EVENT_NAME, {
        has_box: hasBox,
        resume_url: resumeUrl,
        kid_count: kidCount,
        box_item_count: boxItemCount,
        linked: linked ?? 'none',
        landing_page_url: landingPageUrl,
        items,
        items_more: itemsMore,
      });
    }
  } catch (err) {
    cioError = String(err).slice(0, 500);
    logger.error('retentionLead: Customer.io failed', { err: cioError });
  }

  await eventRef.set(
    {
      status: cioError ? 'cio_failed' : 'done',
      visitorId: session?.id ?? null,
      linked,
      hasBox,
      converted,
      eventSent,
      cioError,
      processedAt: Timestamp.fromDate(now),
    },
    { merge: true }
  );

  return { status: 'processed', linked, hasBox, eventSent };
}

export const retentionLead = onRequest({ cors: false }, async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const secret = process.env.GJ_RETENTION_FORWARD_SECRET?.trim() ?? '';
    if (!secret) {
      logger.error('retentionLead: GJ_RETENTION_FORWARD_SECRET not set');
      res.status(503).json({ error: 'Not configured' });
      return;
    }
    const rawBody = req.rawBody?.toString('utf8') ?? '';
    const header = (name: string): string | undefined => {
      const v = req.headers[name];
      return Array.isArray(v) ? v[0] : v;
    };
    if (
      !verifyForwardSignature({
        secret,
        timestamp: header(TIMESTAMP_HEADER),
        signature: header(SIGNATURE_HEADER),
        rawBody,
      })
    ) {
      logger.warn('retentionLead: bad signature');
      res.status(401).json({ error: 'Bad signature' });
      return;
    }
    let payload: RetentionLeadPayload;
    try {
      payload = JSON.parse(rawBody) as RetentionLeadPayload;
    } catch {
      res.status(400).json({ error: 'Invalid JSON' });
      return;
    }
    try {
      const result = await processRetentionLead(getFirestore(), payload);
      logger.info('retentionLead', result);
      res.status(200).json(result);
    } catch (err) {
      logger.error('retentionLead failed', err);
      res.status(500).json({ error: 'Processing failed' });
    }
});
