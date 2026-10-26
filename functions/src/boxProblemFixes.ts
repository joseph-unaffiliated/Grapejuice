/**
 * Concrete fixes for one included-items problem. The admin review offers these as
 * buttons; applying one changes the box (or records an approve / donation).
 */
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from './sentry';
import { isAdminToken } from './guestSessions';
import {
  FOOD_SLOTS_INCLUDED,
  GELT_LITTLE_EQUIVALENT,
  auditIncluded,
  auditKidKey,
  auditProblemKey,
  auditSlotBase,
  geltBagOf,
  healIncludedInCustomerFavor,
  isFoodSlotLine,
  nextVacantFoodSlotId,
  type AuditCatalogRow,
  type AuditProblem,
  type BoxLineItem,
} from './boxAudit';
import { writeBoxAuditDecision, type DecideBoxAuditProblemRequest } from './boxAuditDecisions';
import { BOX_AUDIT_HOLIDAY_ID } from './boxAuditLoad';

export type FixCatalogRow = AuditCatalogRow & {
  memberPriceCents?: number;
  dollarCostCents?: number;
};

export type BoxFix = {
  id: 'charge' | 'remove' | 'rehome' | 'make-free' | 'approve' | 'donation';
  label: string;
  detail: string;
  recommended: boolean;
};

export type FixProblem = {
  code: string;
  section: string;
  detail?: string;
  itemId?: string | null;
  childKey?: string | null;
  slotId?: string | null;
  grandfathered?: boolean;
};

type FixLine = BoxLineItem & { label?: string };
type Target = { index: number; keepQty: number; moveToAddon: boolean };

const PRIMARY_FOOD = new Set(['latke-mix', 'sufganiyot-mix', 'food']);
const DREIDEL_SLOTS = new Set(['wood-dreidel', 'blank-dreidel', 'airdry-dreidel', 'keepsake-dreidel']);
const WRAP_SLOTS = new Set(['wrapping-paper', 'wrapping', 'pre-wrap']);
const FALLBACK_CENTS = 500;

const isFree = (li: BoxLineItem) => (li.unitCents ?? 0) === 0 && (li.quantity ?? 0) > 0;

function money(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString('en-US', { maximumFractionDigits: dollars % 1 ? 2 : 0 })}`;
}

export function chargeCents(row: FixCatalogRow | undefined): number {
  if (typeof row?.memberPriceCents === 'number' && row.memberPriceCents > 0) return Math.round(row.memberPriceCents);
  if (typeof row?.dollarCostCents === 'number' && row.dollarCostCents > 0) return Math.round(row.dollarCostCents);
  return FALLBACK_CENTS;
}

function catalogOf(catalog: FixCatalogRow[], itemId: string): FixCatalogRow | undefined {
  return catalog.find((row) => row.id === itemId);
}

function itemName(li: FixLine, catalog: FixCatalogRow[]): string {
  return catalogOf(catalog, li.itemId)?.name || li.label || li.itemId;
}

function names(lines: FixLine[], targets: Target[], catalog: FixCatalogRow[]): string {
  return targets.map((target) => itemName(lines[target.index], catalog)).join(' and ');
}

function priceOf(lines: FixLine[], targets: Target[], catalog: FixCatalogRow[]): number {
  return targets.reduce((sum, target) => {
    const li = lines[target.index];
    const extra = Math.max(1, li.quantity - target.keepQty);
    return sum + chargeCents(catalogOf(catalog, li.itemId)) * extra;
  }, 0);
}

function recommend(options: Array<Omit<BoxFix, 'recommended'>>): BoxFix[] {
  return options.map((option, index) => ({ ...option, recommended: index === 0 }));
}

function foodTargets(lines: FixLine[]): Target[] {
  const free = lines.flatMap((li, index) => (isFoodSlotLine(li) && isFree(li) ? [{ li, index }] : []));
  if (free.length <= FOOD_SLOTS_INCLUDED) return [];
  const ranked = [...free].sort((a, b) => {
    const rank = (li: FixLine) => (PRIMARY_FOOD.has(auditSlotBase(li.slotId)) ? 0 : 1);
    return rank(a.li) - rank(b.li) || a.index - b.index;
  });
  const keep = new Set(ranked.slice(0, FOOD_SLOTS_INCLUDED).map((row) => row.index));
  return free
    .filter((row) => !keep.has(row.index))
    .map((row) => ({ index: row.index, keepQty: 0, moveToAddon: PRIMARY_FOOD.has(auditSlotBase(row.li.slotId)) }));
}

function quantityTargets(lines: FixLine[], matches: (li: FixLine) => boolean, allowed: number): Target[] {
  const rows = lines.flatMap((li, index) => (matches(li) && isFree(li) ? [{ li, index }] : []));
  let total = rows.reduce((sum, row) => sum + row.li.quantity, 0);
  if (total <= allowed) return [];
  const targets: Target[] = [];
  for (const row of [...rows].reverse()) {
    if (total <= allowed) break;
    const drop = Math.min(row.li.quantity, total - allowed);
    targets.push({ index: row.index, keepQty: row.li.quantity - drop, moveToAddon: false });
    total -= drop;
  }
  return targets;
}

function geltTargets(lines: FixLine[], catalog: FixCatalogRow[], people: number): { targets: Target[]; indivisible: boolean } {
  const rows = lines.flatMap((li, index) => {
    const bag = geltBagOf(li.itemId, catalogOf(catalog, li.itemId)?.name ?? li.label ?? '');
    if (!bag || !isFree(li) || isFoodSlotLine(li)) return [];
    return [{ index, units: GELT_LITTLE_EQUIVALENT[bag] * li.quantity }];
  });
  let total = rows.reduce((sum, row) => sum + row.units, 0);
  if (total <= people) return { targets: [], indivisible: false };
  const targets: Target[] = [];
  for (const row of [...rows].reverse()) {
    if (total <= people) break;
    if (row.units > total - people) return { targets, indivisible: true };
    targets.push({ index: row.index, keepQty: 0, moveToAddon: false });
    total -= row.units;
  }
  return { targets, indivisible: false };
}

function targetsFor(problem: FixProblem, lines: FixLine[], people: number, kids: number): Target[] | null {
  if (problem.code !== 'over-allowance') return null;
  if (problem.section === 'food') return foodTargets(lines);
  if (problem.section === 'candles') return quantityTargets(lines, (li) => auditSlotBase(li.slotId) === 'candles', 1);
  if (problem.section === 'dreidel') {
    return quantityTargets(
      lines,
      (li) => DREIDEL_SLOTS.has(auditSlotBase(li.slotId)) && !geltBagOf(li.itemId, li.label ?? ''),
      people
    );
  }
  if (problem.section === 'wrap') {
    return quantityTargets(lines, (li) => WRAP_SLOTS.has(auditSlotBase(li.slotId)), problem.detail?.includes('pre-wrap') ? 0 : 1);
  }
  if (problem.section === 'story' || problem.section === 'presents') {
    const base = problem.section === 'story' ? 'story' : 'gift';
    return quantityTargets(
      lines,
      (li) => auditSlotBase(li.slotId) === base && (!problem.childKey || auditKidKey(li) === problem.childKey),
      problem.childKey ? 1 : Math.max(kids, 0)
    );
  }
  return [];
}

function problemLine(problem: FixProblem, lines: FixLine[]): number {
  return lines.findIndex((li) => {
    if (problem.itemId && li.itemId !== problem.itemId) return false;
    if (problem.slotId && li.slotId !== problem.slotId) return false;
    if (problem.childKey && auditKidKey(li) !== problem.childKey) return false;
    return isFree(li);
  });
}

function withoutUndefined<T extends Record<string, unknown>>(row: T): T {
  const out = { ...row };
  for (const key of Object.keys(out)) if (out[key] === undefined) delete out[key];
  return out;
}

function applyTargets(lines: FixLine[], targets: Target[], catalog: FixCatalogRow[], mode: 'charge' | 'remove'): FixLine[] {
  const byIndex = new Map(targets.map((target) => [target.index, target]));
  const next: FixLine[] = [];
  lines.forEach((li, index) => {
    const target = byIndex.get(index);
    if (!target) {
      next.push(li);
      return;
    }
    if (mode === 'remove') {
      if (target.keepQty > 0) next.push({ ...li, quantity: target.keepQty, includedQty: Math.max(li.includedQty ?? 0, target.keepQty) });
      return;
    }
    const extra = li.quantity - target.keepQty;
    if (target.keepQty > 0) {
      next.push({ ...li, quantity: target.keepQty, includedQty: Math.max(li.includedQty ?? 0, target.keepQty) });
    }
    const paid: FixLine = {
      ...li,
      slotId: target.moveToAddon ? `addon-${li.itemId}` : target.keepQty > 0 ? `${li.slotId}::x` : li.slotId,
      quantity: extra,
      includedQty: 0,
      unitCents: chargeCents(catalogOf(catalog, li.itemId)),
    };
    next.push(withoutUndefined(paid));
  });
  return next;
}

export function fixesForProblem(
  problem: FixProblem,
  lines: FixLine[],
  catalog: FixCatalogRow[],
  people: number,
  kids = 0
): BoxFix[] {
  if (problem.grandfathered) return [];

  if (problem.code === 'paid-in-included-slot' || problem.code === 'wrap-charged') {
    const li = lines.find((row) => row.itemId === problem.itemId && (row.unitCents ?? 0) > 0);
    const name = li ? itemName(li, catalog) : 'this item';
    return recommend([
      { id: 'make-free', label: `Make the ${name} free`, detail: 'It is an included item, so the customer should not be paying for it.' },
      { id: 'approve', label: 'Leave the charge', detail: 'The charge stays as it is.' },
    ]);
  }

  if (problem.code === 'gelt-short' || problem.code === 'food-slot-missing') {
    return recommend([
      { id: 'donation', label: 'Mark it as a donation', detail: 'A short section is usually something the customer gave up on purpose.' },
      { id: 'approve', label: 'Leave it listed', detail: 'It stays visible, without being treated as a donation.' },
    ]);
  }

  if (problem.code === 'not-included-item' || problem.code === 'free-add-on') {
    const index = problemLine(problem, lines);
    const li = index >= 0 ? lines[index] : undefined;
    if (!li) return recommend([{ id: 'approve', label: 'Leave it as it is', detail: 'The line this refers to is no longer in the box.' }]);
    const name = itemName(li, catalog);
    const cents = chargeCents(catalogOf(catalog, li.itemId));
    const vacant = nextVacantFoodSlotId(lines);
    const options: Array<Omit<BoxFix, 'recommended'>> = [];
    if (problem.code === 'free-add-on' && vacant) {
      options.push({
        id: 'rehome',
        label: `Move the ${name} into the open food slot`,
        detail: 'It already qualifies as a food choice, and one included food slot is empty.',
      });
    }
    options.push(
      {
        id: 'charge',
        label: `Charge the ${name}, ${money(cents)}`,
        detail: 'It stays in the box as a paid add-on, so it no longer counts as included.',
      },
      { id: 'remove', label: `Remove the ${name}`, detail: 'It comes out of the box.' },
      { id: 'approve', label: 'Leave it free', detail: 'It stays in the box at no charge.' }
    );
    return recommend(options);
  }

  if (problem.code === 'over-allowance' && problem.section === 'gelt') {
    const gelt = geltTargets(lines, catalog, people);
    if (gelt.indivisible || gelt.targets.length === 0) {
      return recommend([
        { id: 'approve', label: 'Leave the extra gelt', detail: 'The bag does not split into the household allowance, so the clean choice is to leave it.' },
        { id: 'donation', label: 'Mark it as a donation', detail: 'Use this if the extra chocolate was intentional and should stop being listed.' },
      ]);
    }
  }

  const targets = targetsFor(problem, lines, people, kids) ?? [];
  if (targets.length === 0) {
    return recommend([{ id: 'approve', label: 'Leave it as it is', detail: 'There is no extra line left to change.' }]);
  }
  const what = names(lines, targets, catalog);
  const cents = priceOf(lines, targets, catalog);
  return recommend([
    {
      id: 'charge',
      label: `Charge the ${what}, ${money(cents)}`,
      detail: 'They keep it, and the price shows in the box before checkout.',
    },
    { id: 'remove', label: `Remove the ${what}`, detail: 'The extra comes out and the box goes back to what is included.' },
    { id: 'approve', label: 'Leave it free', detail: 'The extra stays in the box at no charge.' },
  ]);
}

export function applyLineFix(
  fixId: BoxFix['id'],
  problem: FixProblem,
  lines: FixLine[],
  catalog: FixCatalogRow[],
  people: number,
  wrapSelectedItemIds: string[] = [],
  kids = 0
): FixLine[] | null {
  if (fixId === 'approve' || fixId === 'donation') return null;
  if (fixId === 'make-free') {
    const healed = healIncludedInCustomerFavor(lines, catalog, auditHousehold(lines, people), { wrapSelectedItemIds });
    return healed.healed.length ? healed.lineItems : lines;
  }
  if (fixId === 'rehome') {
    const index = problemLine(problem, lines);
    const vacant = nextVacantFoodSlotId(lines);
    if (index < 0 || !vacant) return lines;
    return lines.map((li, i) => (i === index ? { ...li, slotId: vacant } : li));
  }
  if (fixId !== 'charge' && fixId !== 'remove') return lines;
  if (problem.code === 'not-included-item' || problem.code === 'free-add-on') {
    const index = problemLine(problem, lines);
    if (index < 0) return lines;
    const base = auditSlotBase(lines[index].slotId);
    const move =
      problem.code === 'not-included-item' ||
      PRIMARY_FOOD.has(base) ||
      base === 'latke-kit' ||
      base === 'sufganiyot-kit';
    return applyTargets(lines, [{ index, keepQty: 0, moveToAddon: fixId === 'charge' && move }], catalog, fixId);
  }
  const targets = problem.section === 'gelt' ? geltTargets(lines, catalog, people).targets : targetsFor(problem, lines, people, kids) ?? [];
  return applyTargets(lines, targets, catalog, fixId);
}

function auditHousehold(lines: FixLine[], people: number): { kidKeys: string[]; adults: number } {
  const kidKeys: string[] = [];
  for (const li of lines) {
    const key = auditKidKey(li);
    if (!key || !/^(?:story|gift)-/.test(li.slotId.replace(/::x$/i, ''))) continue;
    if (!kidKeys.includes(key)) kidKeys.push(key);
  }
  return { kidKeys, adults: Math.max(0, people - kidKeys.length) };
}

function stillOpen(problem: FixProblem, before: AuditProblem[], after: AuditProblem[]): boolean {
  const same = (p: AuditProblem) => p.code === problem.code && p.section === problem.section && (p.itemId ?? '') === (problem.itemId ?? '') && (p.childKey ?? '') === (problem.childKey ?? '');
  if (!before.some(same)) return false;
  return after.some(same);
}

/** Apply a fix and refuse it when the same problem would remain or a new over-allowance appears. */
export function applyCheckedLineFix(
  fixId: BoxFix['id'],
  problem: FixProblem,
  lines: FixLine[],
  catalog: FixCatalogRow[],
  people: number,
  wrapSelectedItemIds: string[] = [],
  kids = 0
): FixLine[] | null {
  const next = applyLineFix(fixId, problem, lines, catalog, people, wrapSelectedItemIds, kids);
  if (!next) return null;
  const household = auditHousehold(lines, people);
  const opts = { wrapSelectedItemIds };
  const before = auditIncluded(lines, catalog, household, opts);
  const after = auditIncluded(next, catalog, household, opts);
  if (stillOpen(problem, before.problems, after.problems)) {
    throw new HttpsError('failed-precondition', 'That fix would leave the same problem in place.');
  }
  const overBefore = new Set(before.problems.filter((p) => p.direction === 'over' && !p.grandfathered).map(auditProblemKey));
  const introduced = after.problems.some((p) => p.direction === 'over' && !p.grandfathered && !overBefore.has(auditProblemKey(p)));
  if (introduced) throw new HttpsError('failed-precondition', 'That fix would create a new included-items problem.');
  return next;
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function readFixLines(v: unknown): FixLine[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((row) => {
    if (!isRecord(row) || typeof row.slotId !== 'string' || typeof row.itemId !== 'string') return [];
    return [{ ...row, slotId: row.slotId, itemId: row.itemId, quantity: Number(row.quantity ?? 0), unitCents: Number(row.unitCents ?? 0) } as FixLine];
  });
}

function householdId(path: string): string | null {
  return path.match(/^households\/([^/]+)\//)?.[1] ?? null;
}

export async function loadFixCatalog(db: Firestore): Promise<FixCatalogRow[]> {
  const snap = await db.collection(`catalog/hanukkah/items`).get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: typeof data.name === 'string' ? data.name : undefined,
      category: typeof data.category === 'string' ? data.category : undefined,
      memberPriceCents: typeof data.memberPriceCents === 'number' ? data.memberPriceCents : undefined,
      dollarCostCents: typeof data.dollarCostCents === 'number' ? data.dollarCostCents : undefined,
    };
  });
}

export async function loadFixBox(db: Firestore, path: string): Promise<{ lines: FixLine[]; wrapSelectedItemIds: string[] } | null> {
  if (path.startsWith('guestSessions/')) {
    const [docPath, which] = path.split('#');
    const snap = await db.doc(docPath).get();
    if (!snap.exists) return null;
    const data = snap.data() ?? {};
    const snapshot = isRecord(data.snapshot) ? data.snapshot : {};
    const source: Record<string, unknown> =
      which === 'gift'
        ? isRecord(snapshot.gift) && isRecord(snapshot.gift.draft)
          ? snapshot.gift.draft
          : {}
        : isRecord(snapshot.guest)
          ? snapshot.guest
          : {};
    const wrap = Array.isArray(source.wrapSelectedItemIds)
      ? source.wrapSelectedItemIds.filter((id): id is string => typeof id === 'string')
      : [];
    return { lines: readFixLines(source.lineItems), wrapSelectedItemIds: wrap };
  }
  const snap = await db.doc(path).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  const wrap = Array.isArray(data.wrapSelectedItemIds) ? data.wrapSelectedItemIds.filter((id): id is string => typeof id === 'string') : [];
  return { lines: readFixLines(data.lineItems), wrapSelectedItemIds: wrap };
}

async function writeLines(db: Firestore, path: string, lines: FixLine[], uid: string): Promise<void> {
  const cleaned = lines.map((li) => withoutUndefined(li));
  const now = new Date().toISOString();
  if (path.startsWith('guestSessions/')) {
    const [docPath, which] = path.split('#');
    const field = which === 'gift' ? 'snapshot.gift.draft.lineItems' : 'snapshot.guest.lineItems';
    await db.doc(docPath).update({ [field]: cleaned, updatedAt: now, lastChangeSource: 'admin-fix' });
    return;
  }
  await db.doc(path).update({ lineItems: cleaned, updatedAt: now, updatedBy: uid, lastChangeSource: 'admin-fix' });
}

async function siblingPaths(db: Firestore, path: string): Promise<string[]> {
  const hh = householdId(path);
  if (!hh) return [];
  if (path.includes('/boxDrafts/')) {
    const orders = await db.collection(`households/${hh}/orders`).where('holidayId', '==', BOX_AUDIT_HOLIDAY_ID).get();
    return orders.docs.map((doc) => doc.ref.path);
  }
  if (path.includes('/orders/')) return [`households/${hh}/boxDrafts/${BOX_AUDIT_HOLIDAY_ID}`];
  return [];
}

const FOOD_SLOT_IDS = new Set(['latke-mix', 'sufganiyot-mix', 'latke-kit', 'sufganiyot-kit', 'food', 'applesauce']);
const SOURCE_LABEL: Record<string, string> = {
  customer: 'the customer',
  rav: 'Rav',
  'default-build': 'the box builder',
  'guest-signup': 'signup',
  'auto-repair': 'an automatic repair',
  'inventory-swap': 'a sold-out swap',
  'admin-fix': 'an admin fix',
};

type HistoryChange = { type?: string; itemId?: string; toItemId?: string; slotId?: string; unitCents?: number; toUnitCents?: number };
type HistoryEntry = { at?: string; source?: string; changes?: HistoryChange[] };

function changeItem(change: HistoryChange): string | null {
  if (change.type === 'swap') return change.toItemId ?? null;
  return change.itemId ?? null;
}

function changeIsFree(change: HistoryChange): boolean {
  const cents = change.type === 'swap' || change.type === 'quantity' ? change.toUnitCents : change.unitCents;
  return cents == null || cents === 0;
}

/** The earliest box-history save that introduced this problem's free line. */
export function historyClue(entries: HistoryEntry[], focus: { itemIds: string[]; section: string }): string | null {
  const wanted = new Set(focus.itemIds.filter(Boolean));
  const sorted = entries.filter((entry) => entry.at).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  for (const entry of sorted) {
    for (const change of entry.changes ?? []) {
      if (change.type === 'remove') continue;
      const itemId = changeItem(change);
      const slot = change.slotId ?? '';
      const slotHit = focus.section === 'food' && FOOD_SLOT_IDS.has(auditSlotBase(slot));
      if (!changeIsFree(change) || (!itemId || (!wanted.has(itemId) && !slotHit))) continue;
      if (wanted.size > 0 && itemId && !wanted.has(itemId)) continue;
      const when = new Date(entry.at as string).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/New_York',
      });
      const who = SOURCE_LABEL[entry.source ?? ''] ?? 'an unsourced save';
      return `${itemId} showed up ${when} ET from ${who}.`;
    }
  }
  return null;
}

function touchedItemIds(before: FixLine[], after: FixLine[]): string[] {
  const afterKey = new Set(after.map((li) => `${li.slotId}|${li.itemId}`));
  const ids = new Set<string>();
  for (const li of before) {
    const next = after.find((row) => row.slotId === li.slotId && row.itemId === li.itemId);
    if (!next || next.unitCents !== li.unitCents || next.quantity !== li.quantity) ids.add(li.itemId);
    if (!afterKey.has(`${li.slotId}|${li.itemId}`)) ids.add(li.itemId);
  }
  for (const li of after) {
    const prev = before.find((row) => row.slotId === li.slotId && row.itemId === li.itemId);
    if (!prev || prev.unitCents !== li.unitCents || prev.quantity !== li.quantity || prev.slotId !== li.slotId) ids.add(li.itemId);
  }
  return [...ids];
}

export type BoxFixLogEntry = {
  id: string;
  at: string;
  email: string | null;
  path: string;
  section: string;
  code: string;
  detail: string;
  fixId: string;
  fixLabel: string;
  historyNote: string | null;
  status: 'open';
  cause: string | null;
  proposal: string | null;
  by: string;
};

export const BOX_FIX_LOG = 'boxFixLog';

function historyCollection(path: string): string | null {
  if (path.startsWith('guestSessions/')) return `${path.split('#')[0]}/history`;
  const hh = householdId(path);
  return hh ? `households/${hh}/boxDrafts/${BOX_AUDIT_HOLIDAY_ID}/history` : null;
}

async function recordFixLog(
  db: Firestore,
  input: {
    path: string;
    email: string | null;
    problem: FixProblem;
    fixId: string;
    fixLabel: string;
    itemIds: string[];
    by: string;
  }
): Promise<void> {
  let historyNote: string | null = null;
  const collection = historyCollection(input.path);
  if (collection) {
    const snap = await db.collection(collection).get();
    const entries: HistoryEntry[] = snap.docs
      .filter((doc) => doc.id !== 'default')
      .map((doc) => doc.data() as HistoryEntry);
    historyNote = historyClue(entries, { itemIds: input.itemIds, section: input.problem.section });
  }
  const ref = db.collection(BOX_FIX_LOG).doc();
  const entry: BoxFixLogEntry = {
    id: ref.id,
    at: new Date().toISOString(),
    email: input.email,
    path: input.path,
    section: input.problem.section,
    code: input.problem.code,
    detail: input.problem.detail ?? '',
    fixId: input.fixId,
    fixLabel: input.fixLabel,
    historyNote,
    status: 'open',
    cause: null,
    proposal: null,
    by: input.by,
  };
  await ref.set(entry);
}

export async function loadBoxFixLog(db: Firestore): Promise<BoxFixLogEntry[]> {
  const snap = await db.collection(BOX_FIX_LOG).orderBy('at', 'desc').limit(30).get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      at: String(data.at ?? ''),
      email: typeof data.email === 'string' ? data.email : null,
      path: String(data.path ?? ''),
      section: String(data.section ?? ''),
      code: String(data.code ?? ''),
      detail: String(data.detail ?? ''),
      fixId: String(data.fixId ?? ''),
      fixLabel: String(data.fixLabel ?? ''),
      historyNote: typeof data.historyNote === 'string' ? data.historyNote : null,
      status: 'open',
      cause: typeof data.cause === 'string' ? data.cause : null,
      proposal: typeof data.proposal === 'string' ? data.proposal : null,
      by: typeof data.by === 'string' ? data.by : '',
    };
  });
}

export const applyBoxProblemFix = onCall(async (request): Promise<{ ok: true }> => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (!isAdminToken(request.auth.token)) throw new HttpsError('permission-denied', 'Admin only.');
  const body = (request.data ?? {}) as DecideBoxAuditProblemRequest & { fixId?: string; people?: number; kids?: number; slotId?: string };
  const fixId = body.fixId;
  if (fixId !== 'charge' && fixId !== 'remove' && fixId !== 'rehome' && fixId !== 'make-free' && fixId !== 'approve' && fixId !== 'donation') {
    throw new HttpsError('invalid-argument', 'Unknown fix.');
  }
  const path = typeof body.path === 'string' ? body.path.trim() : '';
  const db = getFirestore();
  const people = typeof body.people === 'number' && body.people > 0 ? body.people : 2;
  const kids = typeof body.kids === 'number' && body.kids >= 0 ? body.kids : 0;
  const problem: FixProblem = {
    code: typeof body.code === 'string' ? body.code : '',
    section: typeof body.section === 'string' ? body.section : '',
    detail: typeof body.detail === 'string' ? body.detail : '',
    itemId: typeof body.itemId === 'string' ? body.itemId : null,
    childKey: typeof body.childKey === 'string' ? body.childKey : null,
    slotId: typeof body.slotId === 'string' ? body.slotId : null,
  };
  const fixLabel = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : fixId;
  const log = async (itemIds: string[]) => {
    await recordFixLog(db, {
      path,
      email: typeof body.email === 'string' ? body.email : null,
      problem,
      fixId,
      fixLabel,
      itemIds: itemIds.length ? itemIds : problem.itemId ? [problem.itemId] : [],
      by: request.auth?.uid ?? '',
    }).catch(() => undefined);
  };
  if (fixId === 'approve' || fixId === 'donation') {
    await writeBoxAuditDecision(db, request.auth.uid, { ...body, path, decision: fixId, note: fixLabel });
    await log([]);
    return { ok: true };
  }
  const catalog = await loadFixCatalog(db);
  const paths = [path, ...(await siblingPaths(db, path))];
  let changed = false;
  let itemIds: string[] = [];
  for (const target of paths) {
    const box = await loadFixBox(db, target);
    if (!box) continue;
    const next = applyCheckedLineFix(fixId, problem, box.lines, catalog, people, box.wrapSelectedItemIds, kids);
    if (!next || JSON.stringify(next) === JSON.stringify(box.lines)) continue;
    if (target === path) itemIds = touchedItemIds(box.lines, next);
    await writeLines(db, target, next, request.auth.uid);
    changed = true;
  }
  if (!changed) throw new HttpsError('failed-precondition', 'Nothing in the box changed.');
  await writeBoxAuditDecision(db, request.auth.uid, { ...body, path, decision: null });
  await log(itemIds);
  return { ok: true };
});
