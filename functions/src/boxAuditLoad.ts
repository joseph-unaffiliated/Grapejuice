/**
 * Loads Hanukkah boxes for the included-items audit (./boxAudit) and turns each into an audit
 * record. Shared by the box write triggers, the daily sweep (./boxAuditJob) and
 * scripts/box-audit.ts. Covers account drafts, signed-out boxes, gift drafts and secured orders.
 */
import type { Firestore } from 'firebase-admin/firestore';
import {
  auditIncluded,
  type AuditCatalogRow,
  type AuditProblem,
  type BoxLineItem,
  type SectionCount,
} from './boxAudit';
import { BOX_AUDIT_EXCEPTIONS, type BoxAuditException } from './boxAuditExceptions';

export const BOX_AUDIT_HOLIDAY_ID = 'hanukkah-2026';
const CATALOG_HOLIDAY = 'hanukkah';
/** The gift flow builds for one grown-up unless the giver says otherwise (form.giftAdults). */
const GIFT_DEFAULT_ADULTS = 1;
export const SECURED_STATUSES = ['pending', 'committed', 'confirmed', 'shipped', 'delivered'];

type Rec = Record<string, unknown>;

export type BoxRef = {
  kind: 'account' | 'guest' | 'gift' | 'order';
  path: string;
  email: string | null;
  test: boolean;
  lines: BoxLineItem[];
  kidKeys: string[];
  adults?: number;
  wrapSelectedItemIds: string[];
  /** An account draft whose household already has a secured box order. */
  committed?: boolean;
};

const isRecord = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strs = (v: unknown): string[] => arr(v).filter((s): s is string => typeof s === 'string');
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export function toLines(v: unknown): BoxLineItem[] {
  return arr(v)
    .filter(isRecord)
    .filter((l) => typeof l.slotId === 'string' && typeof l.itemId === 'string')
    .map((l) => ({ ...(l as unknown as BoxLineItem), quantity: Number(l.quantity ?? 0), unitCents: Number(l.unitCents ?? 0) }));
}

export function isTestEmail(email: string | null): boolean {
  if (!email) return false;
  const s = email.toLowerCase();
  return /@unaffiliated?(\.co)?$/.test(s) || /@(a\.com|test\.com|example\.com)$/.test(s) || /joseph|jweissgold|brendan/.test(s);
}

/** Grown-ups from onboarding drafts; undefined (→ 2) when none were entered, like the builder. */
function adultsFromDrafts(drafts: unknown): number | undefined {
  const n = arr(drafts).filter((d) => isRecord(d) && d.role === 'adult').length;
  return n > 0 ? n : undefined;
}

function giftAdults(draft: Rec): number {
  const form = isRecord(draft.form) ? draft.form : {};
  return typeof form.giftAdults === 'number' && form.giftAdults >= 0 ? form.giftAdults : GIFT_DEFAULT_ADULTS;
}

function kidsFromDrafts(drafts: unknown): number {
  return arr(drafts).filter((d) => isRecord(d) && d.role !== 'adult').length;
}

/** Per-kid slot keys on the lines, in order of first appearance. */
export function slotKidKeys(lines: BoxLineItem[]): string[] {
  const keys: string[] = [];
  for (const l of lines) {
    const m = l.slotId.replace(/::x$/i, '').match(/^(?:story|gift)-(.+)$/);
    if (m && !keys.includes(m[1])) keys.push(m[1]);
  }
  return keys;
}

function padKeys(keys: string[], count: number, prefix: string): string[] {
  const out = [...keys];
  for (let i = 0; out.length < count; i++) if (!out.includes(`${prefix}${i}`)) out.push(`${prefix}${i}`);
  return out;
}

function isBoxOrder(o: Rec): boolean {
  return o.orderType !== 'marketplace' && o.orderType !== 'received_gift' && o.playthrough !== true;
}

/** Signed-out box and gift draft from a guestSessions doc (null when there is none to audit). */
export function guestBoxRefs(path: string, data: Rec | undefined): { guest: BoxRef | null; gift: BoxRef | null } {
  if (!data || str(data.convertedUid)) return { guest: null, gift: null };
  const snapshot = isRecord(data.snapshot) ? data.snapshot : {};
  const email = str(data.email);
  const test = isTestEmail(email) || data.test === true || path.includes('/agenttest') || JSON.stringify(snapshot).includes('"test-item"');

  const guestData = isRecord(snapshot.guest) ? snapshot.guest : null;
  let guest: BoxRef | null = null;
  if (guestData && (guestData.onboardingComplete === true || guestData.boxRevealComplete === true)) {
    const lines = toLines(guestData.lineItems);
    if (lines.length) {
      guest = {
        kind: 'guest',
        path,
        email,
        test,
        lines,
        kidKeys: padKeys(slotKidKeys(lines), kidsFromDrafts(guestData.childDrafts), 'guest-'),
        adults: adultsFromDrafts(guestData.childDrafts),
        wrapSelectedItemIds: strs(guestData.wrapSelectedItemIds),
      };
    }
  }

  const giftData = isRecord(snapshot.gift) ? snapshot.gift : null;
  const draft = giftData?.status === 'incomplete' && isRecord(giftData.draft) ? giftData.draft : null;
  let gift: BoxRef | null = null;
  if (draft) {
    const lines = toLines(draft.lineItems);
    if (lines.length) {
      gift = {
        kind: 'gift',
        path: `${path}#gift`,
        email,
        test,
        lines,
        kidKeys: padKeys(slotKidKeys(lines), kidsFromDrafts(draft.childDrafts), 'gift-child-'),
        adults: giftAdults(draft),
        wrapSelectedItemIds: strs(draft.wrapSelectedItemIds),
      };
    }
  }
  return { guest, gift };
}

/** One account draft, with its household's kids, adults and whether a box order is secured. */
export async function accountBoxRef(
  db: Firestore,
  householdId: string,
  path: string,
  data: Rec | undefined
): Promise<BoxRef | null> {
  const lines = toLines(data?.lineItems);
  if (!lines.length) return null;
  const ownerId = str((await db.doc(`households/${householdId}`).get()).data()?.ownerId);
  const [userSnap, childSnap, orderSnap] = await Promise.all([
    ownerId ? db.doc(`users/${ownerId}`).get() : Promise.resolve(null),
    ownerId ? db.collection(`users/${ownerId}/children`).get() : Promise.resolve(null),
    db.collection(`households/${householdId}/orders`).where('holidayId', '==', BOX_AUDIT_HOLIDAY_ID).get(),
  ]);
  const user = userSnap?.data();
  const email = str(user?.email);
  const kids = childSnap?.docs.map((d) => d.id) ?? [];
  return {
    kind: 'account',
    path,
    email,
    test: isTestEmail(email),
    lines,
    kidKeys: kids.length ? kids : slotKidKeys(lines),
    adults: adultsFromDrafts(isRecord(user?.lastBoxAnswers) ? user.lastBoxAnswers.childDrafts : undefined),
    wrapSelectedItemIds: strs(data?.wrapSelectedItemIds),
    committed: orderSnap.docs.some((d) => isBoxOrder(d.data()) && SECURED_STATUSES.includes(String(d.data().status))),
  };
}

export async function loadAuditCatalog(db: Firestore): Promise<AuditCatalogRow[]> {
  const snap = await db.collection(`catalog/${CATALOG_HOLIDAY}/items`).get();
  return snap.docs.map((d) => ({ id: d.id, name: str(d.data().name) ?? undefined, category: str(d.data().category) ?? undefined }));
}

/**
 * Every box. Account drafts of households with a secured order are skipped (the order is
 * audited) unless `includeSecuredDrafts`, which keeps them flagged `committed`.
 */
export async function loadBoxes(
  db: Firestore,
  opts: { includeSecuredDrafts?: boolean } = {}
): Promise<{ boxes: BoxRef[]; catalog: AuditCatalogRow[] }> {
  const [draftSnap, householdSnap, userSnap, childSnap, guestSnap, catalog] = await Promise.all([
    db.collectionGroup('boxDrafts').get(),
    db.collection('households').get(),
    db.collection('users').get(),
    db.collectionGroup('children').get(),
    db.collection('guestSessions').get(),
    loadAuditCatalog(db),
  ]);
  const orderSnaps = await Promise.all(
    SECURED_STATUSES.map((status) =>
      db.collectionGroup('orders').where('holidayId', '==', BOX_AUDIT_HOLIDAY_ID).where('status', '==', status).get()
    )
  );

  const owners = new Map(householdSnap.docs.map((d) => [d.id, str(d.data().ownerId) ?? undefined]));
  const users = new Map(userSnap.docs.map((d) => [d.id, d.data()]));
  const kidsByUser = new Map<string, string[]>();
  for (const c of childSnap.docs) {
    const uid = c.ref.parent.parent;
    if (uid?.parent.id !== 'users') continue;
    kidsByUser.set(uid.id, [...(kidsByUser.get(uid.id) ?? []), c.id]);
  }
  const accountKeys = (ownerId: string | undefined, lines: BoxLineItem[]) => {
    const kids = ownerId ? kidsByUser.get(ownerId) : undefined;
    return kids?.length ? kids : slotKidKeys(lines);
  };
  const userOf = (ownerId: string | undefined) => (ownerId ? users.get(ownerId) : undefined);
  const adultsOf = (user: Rec | undefined) =>
    adultsFromDrafts(isRecord(user?.lastBoxAnswers) ? user!.lastBoxAnswers.childDrafts : undefined);

  const boxes: BoxRef[] = [];
  const securedHouseholds = new Set<string>();

  for (const snap of orderSnaps) {
    for (const d of snap.docs) {
      const o = d.data();
      if (!isBoxOrder(o)) continue;
      const hh = d.ref.parent.parent;
      if (hh?.parent.id !== 'households') continue;
      securedHouseholds.add(hh.id);
      const ownerId = owners.get(hh.id);
      const user = userOf(ownerId);
      const email = str(user?.email) ?? str(o.email);
      const lines = toLines(o.lineItems);
      boxes.push({
        kind: 'order',
        path: d.ref.path,
        email,
        test: isTestEmail(email),
        lines,
        kidKeys: accountKeys(ownerId, lines),
        adults: adultsOf(user),
        wrapSelectedItemIds: strs(o.wrapSelectedItemIds),
      });
    }
  }

  for (const d of draftSnap.docs) {
    const hh = d.ref.parent.parent;
    if (d.id !== BOX_AUDIT_HOLIDAY_ID || hh?.parent.id !== 'households') continue;
    const committed = securedHouseholds.has(hh.id);
    if (committed && !opts.includeSecuredDrafts) continue;
    const data = d.data();
    const lines = toLines(data.lineItems);
    if (!lines.length) continue;
    const ownerId = owners.get(hh.id);
    const user = userOf(ownerId);
    const email = str(user?.email);
    boxes.push({
      kind: 'account',
      path: d.ref.path,
      email,
      test: isTestEmail(email),
      lines,
      kidKeys: accountKeys(ownerId, lines),
      adults: adultsOf(user),
      wrapSelectedItemIds: strs(data.wrapSelectedItemIds),
      ...(committed ? { committed: true } : {}),
    });
  }

  for (const d of guestSnap.docs) {
    const { guest, gift } = guestBoxRefs(d.ref.path, d.data());
    if (guest) boxes.push(guest);
    if (gift) boxes.push(gift);
  }

  return { boxes, catalog };
}

export function matchException(
  exceptions: BoxAuditException[],
  email: string | null,
  p: AuditProblem
): BoxAuditException | undefined {
  const local = email?.toLowerCase().split('@')[0];
  if (!local) return undefined;
  return exceptions.find(
    (e) =>
      e.email.toLowerCase().split('@')[0] === local &&
      (!e.section || e.section === p.section) &&
      (!e.code || e.code === p.code) &&
      (!e.itemId || e.itemId === p.itemId)
  );
}

export type BoxAuditProblem = AuditProblem & { approved?: string };

/** What boxAudits/{id} holds for one box. */
export type BoxAuditRecord = {
  kind: BoxRef['kind'];
  path: string;
  email: string | null;
  test: boolean;
  committed: boolean;
  kids: number;
  people: number;
  sections: Record<string, SectionCount>;
  problems: BoxAuditProblem[];
  /** Problems needing a look: not approved, not grandfathered, and not a gelt shortfall. */
  open: number;
  ok: boolean;
};

/** A problem that counts against the box (gelt shortfalls are often donations). */
export function isOpenProblem(p: BoxAuditProblem): boolean {
  return !p.approved && !p.grandfathered && p.code !== 'gelt-short';
}

export function auditBoxRef(
  box: BoxRef,
  catalog: AuditCatalogRow[],
  exceptions: BoxAuditException[] = BOX_AUDIT_EXCEPTIONS
): BoxAuditRecord {
  const audit = auditIncluded(box.lines, catalog, { kidKeys: box.kidKeys, adults: box.adults }, {
    wrapSelectedItemIds: box.wrapSelectedItemIds,
  });
  const problems: BoxAuditProblem[] = audit.problems.map((p) => {
    const ex = matchException(exceptions, box.email, p);
    return ex ? { ...p, approved: ex.note } : p;
  });
  const open = problems.filter(isOpenProblem).length;
  return {
    kind: box.kind,
    path: box.path,
    email: box.email,
    test: box.test,
    committed: box.kind === 'order' || box.committed === true,
    kids: audit.kids,
    people: audit.people,
    sections: audit.sections,
    problems,
    open,
    ok: open === 0,
  };
}

/** boxAudits doc id for a box path (Firestore ids can't hold "/"). */
export function boxAuditId(path: string): string {
  return path.replace(/[/#]/g, '__');
}
