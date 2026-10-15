/**
 * Included-items audit of every Hanukkah box (src/services/box/includedAudit.ts). Read-only.
 *
 *   npx tsx scripts/box-audit.ts [--out /tmp/box-audit.json]
 *
 * Covers account drafts, signed-out boxes, gift drafts and secured orders. Approved exceptions
 * live in scripts/box-audit-exceptions.json (matched by email and problem section/item).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firestoreFromFirebaseCliLogin } from './lib/firebaseCliCredential.mjs';
import { auditIncluded, type AuditCatalogRow, type AuditProblem } from '../src/services/box/includedAudit';
import type { BoxLineItem } from '../src/types/pilot';

const HOLIDAY_ID = 'hanukkah-2026';
const CATALOG_HOLIDAY = 'hanukkah';
/** The gift flow builds for one grown-up unless the giver says otherwise (form.giftAdults). */
const GIFT_DEFAULT_ADULTS = 1;
const SECURED_STATUSES = ['pending', 'committed', 'confirmed', 'shipped', 'delivered'];
const here = path.dirname(fileURLToPath(import.meta.url));

type Rec = Record<string, unknown>;
type Exception = { email: string; section?: string; itemId?: string; code?: string; note: string };

export type BoxRef = {
  kind: 'account' | 'guest' | 'gift' | 'order';
  path: string;
  email: string | null;
  test: boolean;
  lines: BoxLineItem[];
  kidKeys: string[];
  adults?: number;
  wrapSelectedItemIds: string[];
};

const isRecord = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strs = (v: unknown): string[] => arr(v).filter((s): s is string => typeof s === 'string');

function toLines(v: unknown): BoxLineItem[] {
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
function slotKidKeys(lines: BoxLineItem[]): string[] {
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

export async function loadBoxes(db: FirebaseFirestore.Firestore): Promise<{ boxes: BoxRef[]; catalog: AuditCatalogRow[] }> {
  const [draftSnap, householdSnap, userSnap, childSnap, guestSnap, catalogSnap] = await Promise.all([
    db.collectionGroup('boxDrafts').get(),
    db.collection('households').get(),
    db.collection('users').get(),
    db.collectionGroup('children').get(),
    db.collection('guestSessions').get(),
    db.collection(`catalog/${CATALOG_HOLIDAY}/items`).get(),
  ]);
  const orderSnaps = await Promise.all(
    SECURED_STATUSES.map((status) =>
      db.collectionGroup('orders').where('holidayId', '==', HOLIDAY_ID).where('status', '==', status).get()
    )
  );

  const owners = new Map(householdSnap.docs.map((d) => [d.id, d.data().ownerId as string | undefined]));
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

  const boxes: BoxRef[] = [];
  const securedHouseholds = new Set<string>();

  for (const snap of orderSnaps) {
    for (const d of snap.docs) {
      const o = d.data();
      if (o.orderType === 'marketplace' || o.orderType === 'received_gift' || o.playthrough === true) continue;
      const hh = d.ref.parent.parent;
      if (hh?.parent.id !== 'households') continue;
      securedHouseholds.add(hh.id);
      const ownerId = owners.get(hh.id);
      const user = userOf(ownerId);
      const email = (typeof user?.email === 'string' ? user.email : null) ?? (typeof o.email === 'string' ? o.email : null);
      const lines = toLines(o.lineItems);
      boxes.push({
        kind: 'order',
        path: d.ref.path,
        email,
        test: isTestEmail(email),
        lines,
        kidKeys: accountKeys(ownerId, lines),
        adults: adultsFromDrafts(isRecord(user?.lastBoxAnswers) ? user.lastBoxAnswers.childDrafts : undefined),
        wrapSelectedItemIds: strs(o.wrapSelectedItemIds),
      });
    }
  }

  for (const d of draftSnap.docs) {
    const hh = d.ref.parent.parent;
    if (d.id !== HOLIDAY_ID || hh?.parent.id !== 'households' || securedHouseholds.has(hh.id)) continue;
    const data = d.data();
    const lines = toLines(data.lineItems);
    if (!lines.length) continue;
    const ownerId = owners.get(hh.id);
    const user = userOf(ownerId);
    const email = typeof user?.email === 'string' ? user.email : null;
    boxes.push({
      kind: 'account',
      path: d.ref.path,
      email,
      test: isTestEmail(email),
      lines,
      kidKeys: accountKeys(ownerId, lines),
      adults: adultsFromDrafts(isRecord(user?.lastBoxAnswers) ? user.lastBoxAnswers.childDrafts : undefined),
      wrapSelectedItemIds: strs(data.wrapSelectedItemIds),
    });
  }

  for (const d of guestSnap.docs) {
    const data = d.data();
    if (typeof data.convertedUid === 'string' && data.convertedUid) continue;
    const snapshot = isRecord(data.snapshot) ? data.snapshot : {};
    const guest = isRecord(snapshot.guest) ? snapshot.guest : null;
    const email = typeof data.email === 'string' ? data.email : null;
    const agentTest = d.id.startsWith('agenttest') || JSON.stringify(snapshot).includes('"test-item"');
    if (guest && (guest.onboardingComplete === true || guest.boxRevealComplete === true)) {
      const lines = toLines(guest.lineItems);
      if (lines.length) {
        boxes.push({
          kind: 'guest',
          path: d.ref.path,
          email,
          test: isTestEmail(email) || data.test === true || agentTest,
          lines,
          kidKeys: padKeys(slotKidKeys(lines), kidsFromDrafts(guest.childDrafts), 'guest-'),
          adults: adultsFromDrafts(guest.childDrafts),
          wrapSelectedItemIds: strs(guest.wrapSelectedItemIds),
        });
      }
    }
    const gift = isRecord(snapshot.gift) ? snapshot.gift : null;
    const draft = gift?.status === 'incomplete' && isRecord(gift.draft) ? gift.draft : null;
    if (draft) {
      const lines = toLines(draft.lineItems);
      if (lines.length) {
        boxes.push({
          kind: 'gift',
          path: `${d.ref.path}#gift`,
          email,
          test: isTestEmail(email) || data.test === true || agentTest,
          lines,
          kidKeys: padKeys(slotKidKeys(lines), kidsFromDrafts(draft.childDrafts), 'gift-child-'),
          adults: giftAdults(draft),
          wrapSelectedItemIds: strs(draft.wrapSelectedItemIds),
        });
      }
    }
  }

  const catalog = catalogSnap.docs.map((d) => ({
    id: d.id,
    name: typeof d.data().name === 'string' ? d.data().name : undefined,
    category: typeof d.data().category === 'string' ? d.data().category : undefined,
  }));
  return { boxes, catalog };
}

function loadExceptions(): Exception[] {
  const file = path.join(here, 'box-audit-exceptions.json');
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Exception[]) : [];
}

export function matchException(exceptions: Exception[], email: string | null, p: AuditProblem): Exception | undefined {
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

async function main() {
  const outIdx = process.argv.indexOf('--out');
  const out = outIdx > 0 ? process.argv[outIdx + 1] : '/tmp/box-audit.json';
  const db = firestoreFromFirebaseCliLogin('grapejuice-pilot');
  if (!db) throw new Error('No Firebase CLI login; run `firebase login`.');
  const { boxes, catalog } = await loadBoxes(db);
  const exceptions = loadExceptions();

  const report = boxes.map((b) => {
    const audit = auditIncluded(b.lines, catalog, { kidKeys: b.kidKeys, adults: b.adults }, {
      wrapSelectedItemIds: b.wrapSelectedItemIds,
    });
    const problems = audit.problems.map((p) => {
      const ex = matchException(exceptions, b.email, p);
      return ex ? { ...p, approved: ex.note } : p;
    });
    return { kind: b.kind, path: b.path, email: b.email, test: b.test, kids: audit.kids, people: audit.people, sections: audit.sections, problems };
  });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));

  const real = report.filter((r) => !r.test);
  const tally = new Map<string, number>();
  for (const r of real) {
    for (const p of r.problems) {
      const status = 'approved' in p ? 'approved' : p.grandfathered ? 'grandfathered' : p.direction;
      const key = `${r.kind === 'order' ? 'order' : 'draft'} | ${status} | ${p.section}:${p.code}`;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
  }
  const byKind = (k: string) => real.filter((r) => r.kind === k).length;
  console.log(
    `Boxes: ${real.length} real (account ${byKind('account')}, signed-out ${byKind('guest')}, gift ${byKind('gift')}, orders ${byKind('order')}), ${report.length - real.length} test`
  );
  console.log(`Clean: ${real.filter((r) => r.problems.length === 0).length}`);
  for (const [k, n] of [...tally].sort()) console.log(`${String(n).padStart(4)}  ${k}`);
  console.log(`Report: ${out}`);
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
