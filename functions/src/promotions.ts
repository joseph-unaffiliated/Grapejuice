/**
 * Discount codes, direct credit grants and influencer links. Every collection here is server-only
 * (firestore.rules denies clients); admins work through adminPromotions.
 *
 * - discountCodes/{CODE}
 * - influencers/{slug}, influencerVisits/{slug}_{visitorId}, influencerPayouts/{id}
 * - creditGrants/{id}
 * - promoRedemptions/{sourcePath with / → _}: one per order or gift that carried a code or an
 *   influencer link. Usage and commission are read live from the source doc, so a cancelled or
 *   refunded order drops out on its own.
 */
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import * as logger from './logger';
import { onCall, HttpsError } from './sentry';
import { appOrigin, emailHash, isAdminToken, VISITOR_ID_RE } from './guestSessions';
import { enforceRateLimits, normalizeEmail } from './loginLinks';
import {
  checkDiscountCode,
  codeStatus,
  commissionCents,
  giftNetCents,
  hasDiscount,
  isCountedGift,
  isCountedOrder,
  normalizeCode,
  normalizeSlug,
  orderNetCents,
  orderPromoSnapshot,
  parseCommissionPercent,
  parseIsoInput,
  parseTermsInput,
  pickDiscount,
  randomCode,
  referralStillValid,
  termsLabel,
  type DiscountCodeRecord,
  type InfluencerRecord,
  type OrderPromo,
  type PromoTerms,
} from './promoPricing';

const HOLIDAY_ID = 'hanukkah-2026';
/** An unpaid checkout holds a limited code's slot this long (stale ones are cancelled anyway). */
const PENDING_HOLD_MS = 2 * 60 * 60 * 1000;
const MAX_GRANT_CENTS = 200_000;
/** Matches src/services/box/pricing.ts DEBRIEF_PLATFORM_CREDIT_CENTS. */
const DEBRIEF_PLATFORM_CREDIT_CENTS = 8000;

/** What checkout callables accept from the browser. Never trusted beyond the code text and slug. */
export type PromoRequest = { code?: unknown; ref?: unknown; refAt?: unknown };

export type ResolvedPromo = {
  code: { code: string; terms: PromoTerms } | null;
  influencer: { slug: string; terms: PromoTerms; commissionPercent: number } | null;
  selfReferral: boolean;
  buyerKey: string | null;
};

const NO_PROMO: ResolvedPromo = { code: null, influencer: null, selfReferral: false, buyerKey: null };

function termsOf(d: DocumentData | undefined): PromoTerms {
  return {
    percentOff: typeof d?.percentOff === 'number' ? d.percentOff : null,
    amountOffCents: typeof d?.amountOffCents === 'number' ? d.amountOffCents : null,
  };
}

function codeRecordOf(d: DocumentData): DiscountCodeRecord {
  return {
    ...termsOf(d),
    code: String(d.code ?? ''),
    startsAt: typeof d.startsAt === 'string' ? d.startsAt : null,
    endsAt: typeof d.endsAt === 'string' ? d.endsAt : null,
    maxRedemptions: typeof d.maxRedemptions === 'number' ? d.maxRedemptions : null,
    onePerAccount: d.onePerAccount === true,
    active: d.active !== false,
    note: typeof d.note === 'string' ? d.note : null,
  };
}

function influencerRecordOf(slug: string, d: DocumentData): InfluencerRecord {
  return {
    ...termsOf(d),
    slug,
    name: String(d.name ?? ''),
    email: String(d.email ?? ''),
    commissionPercent: typeof d.commissionPercent === 'number' ? d.commissionPercent : 0,
    active: d.active !== false,
  };
}

function influencerLink(slug: string): string {
  return `${appOrigin()}/r/${slug}`;
}

// ---------------------------------------------------------------------------
// Find or create an account by email (credit grants, influencers)
// ---------------------------------------------------------------------------

/**
 * Existing Firebase Auth user or a new passwordless one (unverified, like gift givers). Makes sure
 * the users doc and a household exist so credit has somewhere to live. Never mints a sign-in token:
 * the person signs in with "email me a link".
 */
export async function findOrCreateAccountByEmail(
  db: Firestore,
  email: string,
  displayName: string | null
): Promise<{ uid: string; householdId: string; accountCreated: boolean }> {
  const auth = getAuth();
  let uid: string | null = null;
  let accountCreated = false;
  try {
    uid = (await auth.getUserByEmail(email)).uid;
  } catch (err) {
    if ((err as { code?: string })?.code !== 'auth/user-not-found') throw err;
  }
  if (!uid) {
    try {
      const created = await auth.createUser({
        email,
        // Must stay false: admin access by staff email requires a verified address.
        emailVerified: false,
        ...(displayName ? { displayName } : {}),
      });
      uid = created.uid;
      accountCreated = true;
    } catch (err) {
      if ((err as { code?: string })?.code !== 'auth/email-already-exists') throw err;
      uid = (await auth.getUserByEmail(email)).uid;
    }
  }

  const now = new Date().toISOString();
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  let householdId = typeof userSnap.data()?.householdId === 'string' ? (userSnap.data()!.householdId as string) : '';
  if (householdId && !(await db.doc(`households/${householdId}`).get()).exists) householdId = '';
  if (!householdId) {
    const owned = await db.collection('households').where('ownerId', '==', uid).limit(1).get();
    householdId = owned.docs[0]?.id ?? '';
  }
  if (!householdId) {
    const hhRef = db.collection('households').doc();
    await hhRef.set({
      name: 'Our household',
      ownerId: uid,
      memberIds: [uid],
      childUserIds: [],
      createdAt: now,
      updatedAt: now,
    });
    householdId = hhRef.id;
  }
  await userRef.set(
    {
      householdId,
      updatedAt: now,
      ...(userSnap.exists
        ? {}
        : {
            uid,
            email,
            displayName: displayName ?? null,
            role: 'parent',
            // Same landing as gift givers: the app, not the box-builder onboarding.
            onboardingComplete: true,
            boxRevealComplete: true,
            createdAt: now,
          }),
    },
    { merge: true }
  );
  return { uid, householdId, accountCreated };
}

// ---------------------------------------------------------------------------
// Redemptions: usage and stats read live from the order / gift they point at
// ---------------------------------------------------------------------------

type RedemptionRow = {
  id: string;
  data: DocumentData;
  source: DocumentData | null;
};

async function withSources(db: Firestore, docs: FirebaseFirestore.QueryDocumentSnapshot[]): Promise<RedemptionRow[]> {
  const rows: RedemptionRow[] = docs.map((d) => ({ id: d.id, data: d.data(), source: null }));
  for (let i = 0; i < rows.length; i += 300) {
    const chunk = rows.slice(i, i + 300);
    const snaps = await db.getAll(...chunk.map((r) => db.doc(String(r.data.sourcePath))));
    snaps.forEach((s, j) => {
      chunk[j].source = s.exists ? s.data() ?? null : null;
    });
  }
  return rows;
}

function rowCounted(row: RedemptionRow): boolean {
  if (!row.source) return false;
  return row.data.kind === 'gift' ? isCountedGift(row.source) : isCountedOrder(row.source);
}

function rowPendingHold(row: RedemptionRow, nowMs: number): boolean {
  if (!row.source) return false;
  const pending = row.data.kind === 'gift' ? row.source.paymentStatus === 'pending' : row.source.status === 'pending';
  const at = typeof row.data.createdAtMs === 'number' ? row.data.createdAtMs : 0;
  return pending && nowMs - at < PENDING_HOLD_MS;
}

function rowNetCents(row: RedemptionRow): number {
  if (!row.source) return 0;
  return row.data.kind === 'gift' ? giftNetCents(row.source) : orderNetCents(row.source);
}

async function codeUsage(db: Firestore, code: string, buyerKey: string | null, nowMs: number) {
  const snap = await db.collection('promoRedemptions').where('code', '==', code).get();
  const rows = await withSources(db, snap.docs);
  let used = 0;
  let usedByBuyer = 0;
  for (const row of rows) {
    const counted = rowCounted(row);
    if (counted || rowPendingHold(row, nowMs)) used += 1;
    if (counted && buyerKey && row.data.buyerKey === buyerKey) usedByBuyer += 1;
  }
  return { used, usedByBuyer };
}

/** Validate an entered code for this buyer. Throws invalid-argument with a shopper-facing message. */
async function resolveCode(
  db: Firestore,
  rawCode: string,
  buyerKey: string | null,
  nowMs: number
): Promise<{ code: string; terms: PromoTerms }> {
  const code = normalizeCode(rawCode);
  const snap = code ? await db.doc(`discountCodes/${code}`).get() : null;
  if (!code || !snap?.exists) {
    throw new HttpsError('invalid-argument', 'We don’t recognize that code.');
  }
  const record = codeRecordOf(snap.data()!);
  const usage = await codeUsage(db, code, buyerKey, nowMs);
  const check = checkDiscountCode(record, nowMs, usage);
  if (!check.ok) throw new HttpsError('invalid-argument', check.message);
  return { code, terms: termsOf(record) };
}

async function resolveInfluencer(
  db: Firestore,
  rawRef: unknown,
  refAt: unknown,
  nowMs: number
): Promise<{ slug: string; record: InfluencerRecord } | null> {
  const slug = normalizeSlug(rawRef);
  if (!slug || !referralStillValid(refAt, nowMs)) return null;
  const snap = await db.doc(`influencers/${slug}`).get();
  if (!snap.exists) return null;
  const record = influencerRecordOf(slug, snap.data()!);
  return record.active ? { slug, record } : null;
}

/**
 * Checkout entry point. A bad code throws (the shopper typed it); a stale or unknown influencer
 * link is ignored. `buyerEmail` drives one-per-account and self-referral.
 */
export async function resolveCheckoutPromo(
  db: Firestore,
  raw: unknown,
  buyerEmail: string | null
): Promise<ResolvedPromo> {
  if (!raw || typeof raw !== 'object') return NO_PROMO;
  const req = raw as PromoRequest;
  const nowMs = Date.now();
  const buyerKey = buyerEmail ? emailHash(buyerEmail) : null;
  const rawCode = typeof req.code === 'string' ? req.code.trim() : '';
  const [code, influencer] = await Promise.all([
    rawCode ? resolveCode(db, rawCode, buyerKey, nowMs) : Promise.resolve(null),
    resolveInfluencer(db, req.ref, req.refAt, nowMs),
  ]);
  const selfReferral = Boolean(influencer && buyerEmail && influencer.record.email === buyerEmail.toLowerCase());
  return {
    code,
    influencer: influencer
      ? {
          slug: influencer.slug,
          terms: termsOf(influencer.record),
          commissionPercent: influencer.record.commissionPercent,
        }
      : null,
    selfReferral,
    buyerKey,
  };
}

/** Discount for `eligibleCents` (merchandise subtotal) and the snapshot to store on the order. */
export function applyResolvedPromo(
  resolved: ResolvedPromo,
  eligibleCents: number
): { discountCents: number; promo: OrderPromo | null } {
  const pick = pickDiscount(eligibleCents, resolved.code, resolved.influencer);
  const promo = orderPromoSnapshot({
    pick,
    code: resolved.code?.code ?? null,
    influencerSlug: resolved.influencer?.slug ?? null,
    selfReferral: resolved.selfReferral,
  });
  return { discountCents: pick.discountCents, promo };
}

/** Count the order / gift toward its code and influencer. Best-effort: never fails a checkout. */
export async function recordPromoRedemption(
  db: Firestore,
  input: {
    sourcePath: string;
    kind: 'order' | 'gift';
    resolved: ResolvedPromo;
    promo: OrderPromo | null;
    householdId: string | null;
  }
): Promise<void> {
  const { promo, resolved } = input;
  if (!promo) return;
  const code = promo.source === 'code' ? promo.code : null;
  const influencerSlug = promo.influencerSlug && !promo.selfReferral ? promo.influencerSlug : null;
  if (!code && !influencerSlug) return;
  try {
    await db.doc(`promoRedemptions/${input.sourcePath.replace(/\//g, '_')}`).set({
      sourcePath: input.sourcePath,
      kind: input.kind,
      code,
      influencerSlug,
      commissionPercent: influencerSlug ? resolved.influencer?.commissionPercent ?? 0 : null,
      buyerKey: resolved.buyerKey,
      householdId: input.householdId,
      createdAt: new Date().toISOString(),
      createdAtMs: Date.now(),
    });
  } catch (err) {
    logger.error('recordPromoRedemption failed', err instanceof Error ? err : String(err));
  }
}

// ---------------------------------------------------------------------------
// Influencer stats (admin and the influencer's own Account page)
// ---------------------------------------------------------------------------

export type InfluencerStats = {
  purchases: number;
  salesCents: number;
  earningsCents: number;
  paidOutCents: number;
  owedCents: number;
  recent: Array<{ date: string; kind: string; netCents: number; commissionCents: number }>;
};

function purchaseKind(row: RedemptionRow): string {
  if (row.data.kind === 'gift') return 'Gift';
  const t = String(row.source?.orderType ?? '');
  if (t === 'hanukkah_box') return 'Box';
  if (t === 'marketplace') return 'Shop order';
  if (t === 'received_gift') return 'Gift box upgrade';
  return 'Order';
}

function statsFromRows(rows: RedemptionRow[], fallbackPercent: number, paidOutCents: number): InfluencerStats {
  let purchases = 0;
  let salesCents = 0;
  let earningsCents = 0;
  const recent: InfluencerStats['recent'] = [];
  for (const row of rows) {
    if (!rowCounted(row)) continue;
    const net = rowNetCents(row);
    const pct = typeof row.data.commissionPercent === 'number' ? row.data.commissionPercent : fallbackPercent;
    const commission = commissionCents(pct, net);
    purchases += 1;
    salesCents += net;
    earningsCents += commission;
    recent.push({
      date: String(row.data.createdAt ?? '').slice(0, 10),
      kind: purchaseKind(row),
      netCents: net,
      commissionCents: commission,
    });
  }
  recent.sort((a, b) => (a.date < b.date ? 1 : -1));
  return {
    purchases,
    salesCents,
    earningsCents,
    paidOutCents,
    owedCents: Math.max(0, earningsCents - paidOutCents),
    recent: recent.slice(0, 50),
  };
}

async function influencerStats(db: Firestore, slug: string, fallbackPercent: number): Promise<InfluencerStats> {
  const [redemptions, payouts] = await Promise.all([
    db.collection('promoRedemptions').where('influencerSlug', '==', slug).get(),
    db.collection('influencerPayouts').where('slug', '==', slug).get(),
  ]);
  const rows = await withSources(db, redemptions.docs);
  const paid = payouts.docs.reduce((s, d) => s + (Number(d.data().amountCents) || 0), 0);
  return statsFromRows(rows, fallbackPercent, paid);
}

/** Signed-in influencers (verified email matches an influencer record) see only their own totals. */
export const getMyInfluencerStats = onCall(async (request) => {
  const token = request.auth?.token;
  if (!request.auth?.uid || !token) throw new HttpsError('unauthenticated', 'Sign in required.');
  const email = typeof token.email === 'string' ? token.email.trim().toLowerCase() : '';
  if (!email || token.email_verified !== true) return { influencers: [] };
  const db = getFirestore();
  const snap = await db.collection('influencers').where('email', '==', email).get();
  const influencers = await Promise.all(
    snap.docs.map(async (d) => {
      const rec = influencerRecordOf(d.id, d.data());
      const stats = await influencerStats(db, d.id, rec.commissionPercent);
      return {
        slug: d.id,
        name: rec.name,
        link: influencerLink(d.id),
        active: rec.active,
        discountLabel: termsLabel(rec),
        commissionPercent: rec.commissionPercent,
        ...stats,
      };
    })
  );
  return { influencers };
});

// ---------------------------------------------------------------------------
// checkPromo: the shopper-facing preview (and influencer link visits)
// ---------------------------------------------------------------------------

export const checkPromo = onCall(async (request) => {
  const data = (request.data ?? {}) as PromoRequest & { visitorId?: unknown; recordVisit?: unknown };
  const db = getFirestore();
  const nowMs = Date.now();
  const out: {
    code: null | { ok: true; code: string; percentOff: number | null; amountOffCents: number | null; label: string } | { ok: false; message: string };
    influencer: null | { slug: string; name: string; percentOff: number | null; amountOffCents: number | null; label: string };
  } = { code: null, influencer: null };

  const rawCode = typeof data.code === 'string' ? data.code.trim() : '';
  if (rawCode) {
    await enforceRateLimits(db, null, request.rawRequest, 'promo:');
    const email = typeof request.auth?.token.email === 'string' ? request.auth.token.email.toLowerCase() : null;
    try {
      const code = await resolveCode(db, rawCode, email ? emailHash(email) : null, nowMs);
      out.code = { ok: true, code: code.code, ...code.terms, label: termsLabel(code.terms) };
    } catch (err) {
      if (!(err instanceof HttpsError)) throw err;
      out.code = { ok: false, message: err.message };
    }
  }

  const influencer = await resolveInfluencer(db, data.ref, data.refAt, nowMs);
  if (influencer) {
    const terms = termsOf(influencer.record);
    out.influencer = {
      slug: influencer.slug,
      name: influencer.record.name,
      ...terms,
      label: hasDiscount(terms) ? termsLabel(terms) : '',
    };
    if (data.recordVisit === true) {
      await recordInfluencerVisit(db, influencer.slug, data.visitorId).catch((err) =>
        logger.warn('recordInfluencerVisit failed', { err: String(err) })
      );
    }
  }
  return out;
});

async function recordInfluencerVisit(db: Firestore, slug: string, rawVisitorId: unknown): Promise<void> {
  const visitorId = typeof rawVisitorId === 'string' && VISITOR_ID_RE.test(rawVisitorId) ? rawVisitorId : null;
  let unique = false;
  if (visitorId) {
    try {
      await db.doc(`influencerVisits/${slug}_${visitorId}`).create({ slug, at: new Date().toISOString() });
      unique = true;
    } catch (err) {
      if ((err as { code?: number })?.code !== 6) throw err; // ALREADY_EXISTS
    }
  }
  await db.doc(`influencers/${slug}`).update({
    visitCount: FieldValue.increment(1),
    ...(unique ? { uniqueVisitorCount: FieldValue.increment(1) } : {}),
  });
}

// ---------------------------------------------------------------------------
// awardDebriefCredit: the post-Hanukkah reflection credit, server-side so clients can't write credit
// ---------------------------------------------------------------------------

export const awardDebriefCredit = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const db = getFirestore();
  const userSnap = await db.doc(`users/${uid}`).get();
  const householdId = typeof userSnap.data()?.householdId === 'string' ? (userSnap.data()!.householdId as string) : '';
  if (!householdId) throw new HttpsError('failed-precondition', 'No household.');
  const reflection = await db.doc(`users/${uid}/reflection/${HOLIDAY_ID}`).get();
  if (!reflection.exists) throw new HttpsError('failed-precondition', 'Finish the debrief first.');

  const markerRef = db.doc(`creditAwards/debrief_${HOLIDAY_ID}_${uid}`);
  const hhRef = db.doc(`households/${householdId}`);
  const awarded = await db.runTransaction(async (tx) => {
    const [marker, hh] = await Promise.all([tx.get(markerRef), tx.get(hhRef)]);
    if (marker.exists) return 0;
    const members = (hh.data()?.memberIds as unknown[]) ?? [];
    if (!hh.exists || !members.includes(uid)) throw new HttpsError('permission-denied', 'Not a household member.');
    tx.set(markerRef, { uid, householdId, amountCents: DEBRIEF_PLATFORM_CREDIT_CENTS, createdAt: new Date().toISOString() });
    tx.update(hhRef, {
      platformCreditCents: FieldValue.increment(DEBRIEF_PLATFORM_CREDIT_CENTS),
      updatedAt: new Date().toISOString(),
    });
    return DEBRIEF_PLATFORM_CREDIT_CENTS;
  });
  return { awardedCents: awarded };
});

// ---------------------------------------------------------------------------
// adminPromotions: one admin-only callable for the three dashboard tabs
// ---------------------------------------------------------------------------

type AdminActor = { uid: string; email: string };

function fail(message: string): never {
  throw new HttpsError('invalid-argument', message);
}

function unwrap<T>(v: T | { error: string }): T {
  if (v && typeof v === 'object' && 'error' in (v as object)) fail((v as { error: string }).error);
  return v as T;
}

async function listCodes(db: Firestore) {
  const nowMs = Date.now();
  const [codes, redemptions] = await Promise.all([
    db.collection('discountCodes').get(),
    db.collection('promoRedemptions').where('code', '!=', null).get(),
  ]);
  const rows = await withSources(db, redemptions.docs);
  const byCode = new Map<string, { used: number; pending: number; discountCents: number; salesCents: number }>();
  for (const row of rows) {
    const code = String(row.data.code ?? '');
    const agg = byCode.get(code) ?? { used: 0, pending: 0, discountCents: 0, salesCents: 0 };
    if (rowCounted(row)) {
      agg.used += 1;
      agg.discountCents += Number(row.source?.discountCents) || 0;
      agg.salesCents += rowNetCents(row);
    } else if (rowPendingHold(row, nowMs)) {
      agg.pending += 1;
    }
    byCode.set(code, agg);
  }
  return codes.docs
    .map((d) => {
      const data = d.data();
      const rec = codeRecordOf(data);
      const agg = byCode.get(d.id) ?? { used: 0, pending: 0, discountCents: 0, salesCents: 0 };
      return {
        ...rec,
        code: d.id,
        label: termsLabel(rec),
        status: codeStatus(rec, nowMs, agg.used),
        used: agg.used,
        pending: agg.pending,
        remaining: rec.maxRedemptions == null ? null : Math.max(0, rec.maxRedemptions - agg.used),
        discountGivenCents: agg.discountCents,
        salesCents: agg.salesCents,
        createdAt: String(data.createdAt ?? ''),
        createdByEmail: String(data.createdByEmail ?? ''),
      };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

async function saveCode(db: Firestore, actor: AdminActor, input: Record<string, unknown>) {
  const isNew = input.isNew === true;
  let code: string | null;
  if (isNew && input.generate === true) {
    code = null;
    for (let i = 0; i < 5 && !code; i += 1) {
      const candidate = randomCode(8);
      if (!(await db.doc(`discountCodes/${candidate}`).get()).exists) code = candidate;
    }
    if (!code) fail('Could not generate a unique code. Try again.');
  } else {
    code = normalizeCode(input.code);
    if (!code) fail('Codes are 3–32 letters, numbers, - or _.');
  }
  const terms = unwrap(parseTermsInput(input as { percentOff?: unknown; amountOffCents?: unknown }, false));
  const startsAt = unwrap(parseIsoInput(input.startsAt));
  const endsAt = unwrap(parseIsoInput(input.endsAt));
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) fail('The end date must be after the start date.');
  const maxRaw = input.maxRedemptions;
  const maxRedemptions = maxRaw == null || maxRaw === '' ? null : Math.floor(Number(maxRaw));
  if (maxRedemptions != null && (!Number.isFinite(maxRedemptions) || maxRedemptions < 1)) {
    fail('Max redemptions must be at least 1 (or blank for unlimited).');
  }
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) : '';
  const now = new Date().toISOString();
  const ref = db.doc(`discountCodes/${code}`);
  const fields = {
    code,
    ...terms,
    startsAt,
    endsAt,
    maxRedemptions,
    onePerAccount: input.onePerAccount === true,
    active: input.active !== false,
    note: note || null,
    updatedAt: now,
    updatedByEmail: actor.email,
  };
  if (isNew) {
    try {
      await ref.create({ ...fields, createdAt: now, createdByEmail: actor.email });
    } catch (err) {
      if ((err as { code?: number })?.code === 6) fail('That code already exists.');
      throw err;
    }
  } else {
    if (!(await ref.get()).exists) fail('Code not found.');
    await ref.update(fields);
  }
  return { code };
}

async function listCredits(db: Firestore) {
  const snap = await db.collection('creditGrants').orderBy('createdAt', 'desc').limit(500).get();
  const grants = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<DocumentData & { id: string }>;
  const householdIds = [...new Set(grants.map((g) => String(g.householdId ?? '')).filter(Boolean))];
  const balances = new Map<string, number>();
  for (let i = 0; i < householdIds.length; i += 300) {
    const chunk = householdIds.slice(i, i + 300);
    const snaps = await db.getAll(...chunk.map((id) => db.doc(`households/${id}`)));
    snaps.forEach((s) => balances.set(s.id, Number(s.data()?.giftCreditCents) || 0));
  }
  // Credit is fungible: assume the oldest grants are spent first, so newer ones hold the balance.
  const remainingByHousehold = new Map(balances);
  return grants.map((g) => {
    const amount = Number(g.amountCents) || 0;
    let unusedCents = 0;
    if (g.status !== 'revoked') {
      const left = remainingByHousehold.get(String(g.householdId)) ?? 0;
      unusedCents = Math.min(amount, left);
      remainingByHousehold.set(String(g.householdId), left - unusedCents);
    }
    return {
      id: g.id,
      email: String(g.email ?? ''),
      amountCents: amount,
      note: typeof g.note === 'string' ? g.note : null,
      createdAt: String(g.createdAt ?? ''),
      grantedByEmail: String(g.grantedByEmail ?? ''),
      accountCreated: g.accountCreated === true,
      status: g.status === 'revoked' ? 'revoked' : unusedCents >= amount ? 'unused' : unusedCents > 0 ? 'partly used' : 'used',
      usedCents: g.status === 'revoked' ? 0 : amount - unusedCents,
      revokedAt: typeof g.revokedAt === 'string' ? g.revokedAt : null,
    };
  });
}

async function grantCredit(db: Firestore, actor: AdminActor, input: Record<string, unknown>) {
  const email = normalizeEmail(input.email);
  const amountCents = Math.round(Number(input.amountCents));
  if (!Number.isFinite(amountCents) || amountCents < 100 || amountCents > MAX_GRANT_CENTS) {
    fail(`Credit must be between $1 and $${MAX_GRANT_CENTS / 100}.`);
  }
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) : '';
  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 80) : null;
  const account = await findOrCreateAccountByEmail(db, email, name);
  const grantRef = db.collection('creditGrants').doc();
  const hhRef = db.doc(`households/${account.householdId}`);
  const now = new Date().toISOString();
  await db.runTransaction(async (tx) => {
    const hh = await tx.get(hhRef);
    if (!hh.exists) throw new HttpsError('failed-precondition', 'Household missing.');
    tx.update(hhRef, { giftCreditCents: FieldValue.increment(amountCents), updatedAt: now });
    tx.set(grantRef, {
      email,
      amountCents,
      note: note || null,
      uid: account.uid,
      householdId: account.householdId,
      accountCreated: account.accountCreated,
      status: 'active',
      grantedByUid: actor.uid,
      grantedByEmail: actor.email,
      createdAt: now,
    });
  });
  logger.info('grantCredit', { grantId: grantRef.id, amountCents, accountCreated: account.accountCreated });
  return { id: grantRef.id, accountCreated: account.accountCreated };
}

async function revokeCredit(db: Firestore, actor: AdminActor, input: Record<string, unknown>) {
  const grantId = typeof input.grantId === 'string' ? input.grantId : '';
  if (!grantId) fail('grantId required.');
  const grantRef = db.doc(`creditGrants/${grantId}`);
  await db.runTransaction(async (tx) => {
    const grant = await tx.get(grantRef);
    if (!grant.exists) fail('Grant not found.');
    const g = grant.data()!;
    if (g.status === 'revoked') fail('Already revoked.');
    const hhRef = db.doc(`households/${g.householdId}`);
    const hh = await tx.get(hhRef);
    const balance = Number(hh.data()?.giftCreditCents) || 0;
    const amount = Number(g.amountCents) || 0;
    if (balance < amount) {
      fail('Some of this credit has already been spent, so it can’t be revoked.');
    }
    const now = new Date().toISOString();
    tx.update(hhRef, { giftCreditCents: balance - amount, updatedAt: now });
    tx.update(grantRef, { status: 'revoked', revokedAt: now, revokedByEmail: actor.email });
  });
  return { ok: true };
}

async function listInfluencers(db: Firestore) {
  const [influencers, redemptions, payouts] = await Promise.all([
    db.collection('influencers').get(),
    db.collection('promoRedemptions').where('influencerSlug', '!=', null).get(),
    db.collection('influencerPayouts').get(),
  ]);
  const rows = await withSources(db, redemptions.docs);
  const rowsBySlug = new Map<string, RedemptionRow[]>();
  for (const row of rows) {
    const slug = String(row.data.influencerSlug);
    rowsBySlug.set(slug, [...(rowsBySlug.get(slug) ?? []), row]);
  }
  const payoutsBySlug = new Map<string, Array<{ id: string; amountCents: number; note: string | null; paidAt: string; recordedByEmail: string }>>();
  for (const d of payouts.docs) {
    const p = d.data();
    const slug = String(p.slug ?? '');
    payoutsBySlug.set(slug, [
      ...(payoutsBySlug.get(slug) ?? []),
      {
        id: d.id,
        amountCents: Number(p.amountCents) || 0,
        note: typeof p.note === 'string' ? p.note : null,
        paidAt: String(p.paidAt ?? p.createdAt ?? ''),
        recordedByEmail: String(p.recordedByEmail ?? ''),
      },
    ]);
  }
  return influencers.docs
    .map((d) => {
      const data = d.data();
      const rec = influencerRecordOf(d.id, data);
      const list = (payoutsBySlug.get(d.id) ?? []).sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));
      const paid = list.reduce((s, p) => s + p.amountCents, 0);
      const stats = statsFromRows(rowsBySlug.get(d.id) ?? [], rec.commissionPercent, paid);
      return {
        ...rec,
        link: influencerLink(d.id),
        discountLabel: termsLabel(rec),
        note: typeof data.note === 'string' ? data.note : null,
        accountCreated: data.accountCreated === true,
        visitCount: Number(data.visitCount) || 0,
        uniqueVisitorCount: Number(data.uniqueVisitorCount) || 0,
        createdAt: String(data.createdAt ?? ''),
        payouts: list,
        ...stats,
      };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

async function saveInfluencer(db: Firestore, actor: AdminActor, input: Record<string, unknown>) {
  const isNew = input.isNew === true;
  const slug = normalizeSlug(input.slug);
  if (!slug) fail('Link names are 2–40 lowercase letters, numbers or dashes.');
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 120) : '';
  if (!name) fail('Name required.');
  const email = normalizeEmail(input.email);
  const terms = unwrap(parseTermsInput(input as { percentOff?: unknown; amountOffCents?: unknown }, true));
  const commissionPercent = unwrap(parseCommissionPercent(input.commissionPercent));
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) : '';
  const ref = db.doc(`influencers/${slug}`);
  const existing = await ref.get();
  if (isNew && existing.exists) fail('That link name is taken.');
  if (!isNew && !existing.exists) fail('Influencer not found.');

  const emailChanged = isNew || existing.data()?.email !== email;
  const account = emailChanged ? await findOrCreateAccountByEmail(db, email, name.split(/\s+/)[0] || null) : null;
  const now = new Date().toISOString();
  const fields = {
    slug,
    name,
    email,
    ...terms,
    commissionPercent,
    active: input.active !== false,
    note: note || null,
    updatedAt: now,
    updatedByEmail: actor.email,
    ...(account ? { uid: account.uid, accountCreated: account.accountCreated } : {}),
  };
  if (isNew) {
    await ref.create({ ...fields, visitCount: 0, uniqueVisitorCount: 0, createdAt: now, createdByEmail: actor.email });
  } else {
    await ref.update(fields);
  }
  return { slug, link: influencerLink(slug), accountCreated: account?.accountCreated ?? false };
}

async function recordPayout(db: Firestore, actor: AdminActor, input: Record<string, unknown>) {
  const slug = normalizeSlug(input.slug);
  if (!slug || !(await db.doc(`influencers/${slug}`).get()).exists) fail('Influencer not found.');
  const amountCents = Math.round(Number(input.amountCents));
  if (!Number.isFinite(amountCents) || amountCents < 1 || amountCents > 10_000_000) fail('Enter the amount paid.');
  const paidAt = unwrap(parseIsoInput(input.paidAt)) ?? new Date().toISOString();
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) : '';
  const ref = await db.collection('influencerPayouts').add({
    slug,
    amountCents,
    paidAt,
    note: note || null,
    recordedByUid: actor.uid,
    recordedByEmail: actor.email,
    createdAt: new Date().toISOString(),
  });
  return { id: ref.id };
}

async function deletePayout(db: Firestore, input: Record<string, unknown>) {
  const id = typeof input.payoutId === 'string' ? input.payoutId : '';
  if (!id) fail('payoutId required.');
  await db.doc(`influencerPayouts/${id}`).delete();
  return { ok: true };
}

export const adminPromotions = onCall(async (request) => {
  if (!request.auth?.uid || !isAdminToken(request.auth.token)) {
    throw new HttpsError('permission-denied', 'Admin only.');
  }
  const actor: AdminActor = {
    uid: request.auth.uid,
    email: typeof request.auth.token.email === 'string' ? request.auth.token.email : '',
  };
  const input = (request.data ?? {}) as Record<string, unknown>;
  const db = getFirestore();
  switch (input.action) {
    case 'listCodes':
      return { codes: await listCodes(db) };
    case 'saveCode':
      return saveCode(db, actor, input);
    case 'listCredits':
      return { grants: await listCredits(db) };
    case 'grantCredit':
      return grantCredit(db, actor, input);
    case 'revokeCredit':
      return revokeCredit(db, actor, input);
    case 'listInfluencers':
      return { influencers: await listInfluencers(db) };
    case 'saveInfluencer':
      return saveInfluencer(db, actor, input);
    case 'recordPayout':
      return recordPayout(db, actor, input);
    case 'deletePayout':
      return deletePayout(db, input);
    default:
      throw new HttpsError('invalid-argument', 'Unknown action.');
  }
});
