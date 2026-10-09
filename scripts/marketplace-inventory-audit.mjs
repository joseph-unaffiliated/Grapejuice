#!/usr/bin/env node
/**
 * Read-only check that storefront (marketplace) orders are reflected in
 * catalog/hanukkah/inventory/{itemId}: paid orders counted in directSoldQty, live holds in
 * directReservedQty. Prints per-item counter drift and the change that would fix it.
 * Nothing is written. Counts only; no names or emails are printed.
 *
 *   node scripts/marketplace-inventory-audit.mjs [--firebase-cli-login] [--since 2026-10-09] [--orders]
 *
 * --orders adds a per-order table (order id prefix, test flag, status, inventory timestamps, lines).
 */
import { createRequire } from 'node:module';
import admin from 'firebase-admin';
import { firestoreFromFirebaseCliLogin } from './lib/firebaseCliCredential.mjs';

const require = createRequire(import.meta.url);
require('sucrase/register/ts');
const { isTest } = require('../functions/src/testAccounts.ts');
const { resolveAvailability, availabilityRemaining } = require('../functions/src/catalogAvailability.ts');

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const sinceMs = argValue('--since') ? Date.parse(`${argValue('--since')}T00:00:00-04:00`) : null;
const projectId = process.env.FIREBASE_PROJECT_ID || 'grapejuice-pilot';

let db;
if (args.includes('--firebase-cli-login')) {
  db = firestoreFromFirebaseCliLogin(projectId);
  if (!db) {
    console.error('No usable `firebase login` session found.');
    process.exit(1);
  }
} else {
  admin.initializeApp({ projectId });
  db = admin.firestore();
}

const PAID = new Set(['confirmed', 'shipped', 'delivered']);
const isStuffie = (item) =>
  /stuff|plush/i.test([item?.name, item?.category, ...(item?.categories ?? [])].filter(Boolean).join(' '));
const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);

function createdMs(o) {
  const ts = o.createdAt;
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts === 'string') return Date.parse(ts) || null;
  return null;
}

function linesOf(o) {
  const raw = Array.isArray(o.inventoryReservedLines) && o.inventoryReservedLines.length
    ? o.inventoryReservedLines
    : Array.isArray(o.lineItems) ? o.lineItems : [];
  const out = new Map();
  for (const li of raw) {
    const id = String(li?.itemId ?? '').trim();
    if (!id) continue;
    out.set(id, (out.get(id) ?? 0) + Math.max(1, Math.floor(Number(li.quantity) || 1)));
  }
  return out;
}

const add = (map, id, q) => map.set(id, (map.get(id) ?? 0) + q);

// orders has no single-field collection-group index on orderType; (status, holidayId) is indexed.
const ORDER_STATUSES = ['pending', 'committed', 'confirmed', 'shipped', 'delivered', 'cancelled', 'refunded'];
async function marketplaceOrders() {
  const snaps = await Promise.all(
    ORDER_STATUSES.map((s) =>
      db.collectionGroup('orders').where('status', '==', s).where('holidayId', '==', 'hanukkah-2026').get()
    )
  );
  const docs = snaps.flatMap((s) => s.docs).filter((d) => d.data().orderType === 'marketplace');
  return { docs, size: docs.length };
}

const [ordersSnap, invSnap, itemsSnap, configSnap] = await Promise.all([
  marketplaceOrders(),
  db.collection('catalog/hanukkah/inventory').get(),
  db.collection('catalog/hanukkah/items').get(),
  db.doc('config/hanukkah-2026').get(),
]);
const lockAt = configSnap.data()?.lockAt ?? null;
const items = new Map(itemsSnap.docs.map((d) => [d.id, d.data()]));
const counters = new Map(invSnap.docs.map((d) => [d.id, d.data()]));

const userIds = [...new Set(ordersSnap.docs.map((d) => d.data().userId).filter((u) => typeof u === 'string'))];
const userEmail = new Map();
for (let i = 0; i < userIds.length; i += 200) {
  const refs = userIds.slice(i, i + 200).map((u) => db.doc(`users/${u}`));
  for (const s of await db.getAll(...refs)) userEmail.set(s.id, s.data()?.email ?? null);
}

// What the counters should hold, given how the code moves them.
const expectSold = new Map();
const expectReserved = new Map();
const paidNotCommitted = [];
const stats = { real: 0, test: 0, playthrough: 0, byStatus: {}, testByStatus: {} };
const window = { real: 0, test: 0, paid: 0, units: 0, stuffieUnits: 0, stuffieOrders: 0, revenueCents: 0 };
const nowMs = Date.now();
const TTL = 2 * 60 * 60 * 1000;
let staleHolds = 0;
let cancelledAfterCommit = 0;
const orderRows = [];

for (const doc of ordersSnap.docs) {
  const o = doc.data();
  const email = o.guestEmail || userEmail.get(o.userId) || o.shippingAddress?.email || null;
  const test = isTest(email);
  const status = String(o.status ?? 'unknown');
  const lines = linesOf(o);
  const ms = createdMs(o);
  const inWindow = sinceMs == null || (ms != null && ms >= sinceMs);

  if (o.playthrough === true) stats.playthrough += 1;
  if (test) {
    stats.test += 1;
    stats.testByStatus[status] = (stats.testByStatus[status] ?? 0) + 1;
  } else {
    stats.real += 1;
    stats.byStatus[status] = (stats.byStatus[status] ?? 0) + 1;
  }

  // Cancelled after commit (e.g. hand-cancelled test orders): the units are back in stock.
  const voided = status === 'cancelled' || status === 'refunded';
  const committed = Boolean(o.inventoryCommittedAt);
  const holding = o.inventoryReserved === true && !o.reservationReleasedAt && !committed;
  if (committed && voided) cancelledAfterCommit += 1;
  for (const [id, q] of lines) {
    if (committed && !voided) add(expectSold, id, q);
    else if (holding && !voided) add(expectReserved, id, q);
  }
  // A paid order must be counted as sold whatever happened to its reservation.
  if (PAID.has(status) && !committed && (o.inventoryReservedLines || o.inventoryReservedAt)) {
    paidNotCommitted.push({ test, lines, released: Boolean(o.reservationReleasedAt) });
    for (const [id, q] of lines) add(expectSold, id, q);
  }
  if (holding && status === 'pending' && ms != null && nowMs - ms > TTL) staleHolds += 1;
  orderRows.push({
    order: doc.id.slice(0, 8),
    test: test ? 'test' : '',
    status,
    timing: o.chargeTiming ?? '',
    created: ms ? new Date(ms).toISOString().slice(0, 16) : '',
    reservedAt: String(o.inventoryReservedAt ?? '').slice(0, 16),
    committedAt: String(o.inventoryCommittedAt ?? '').slice(0, 16),
    released: o.reservationReleasedAt ? 'yes' : '',
    lines: [...lines].map(([id, q]) => `${id.slice(0, 18)}x${q}`).join(' '),
  });

  if (inWindow) {
    if (test) window.test += 1;
    else {
      window.real += 1;
      if (PAID.has(status) || status === 'committed') {
        window.paid += 1;
        window.revenueCents += n(o.totalCents);
        let hasStuffie = false;
        for (const [id, q] of lines) {
          window.units += q;
          if (isStuffie(items.get(id))) {
            window.stuffieUnits += q;
            hasStuffie = true;
          }
        }
        if (hasStuffie) window.stuffieOrders += 1;
      }
    }
  }
}

console.log(`Marketplace orders: ${ordersSnap.size} total, ${stats.real} real, ${stats.test} test, ${stats.playthrough} playthrough`);
console.log('Real by status:', stats.byStatus);
console.log('Test by status:', stats.testByStatus);
if (sinceMs != null) {
  console.log(
    `Since ${argValue('--since')}: ${window.real} real orders (${window.paid} paid/committed, ` +
      `${window.units} units, ${window.stuffieUnits} stuffie units in ${window.stuffieOrders} orders, ` +
      `$${(window.revenueCents / 100).toFixed(2)}), ${window.test} test orders`
  );
}
console.log(`Paid orders never counted as sold: ${paidNotCommitted.length} (${paidNotCommitted.filter((p) => p.released).length} had their hold released)`);
console.log(`Pending holds older than the 2h TTL (sweep will release): ${staleHolds}`);
console.log(`Cancelled/refunded after being counted as sold (expected out of directSoldQty): ${cancelledAfterCommit}`);
if (args.includes('--orders')) {
  orderRows.sort((a, b) => b.created.localeCompare(a.created));
  console.table(orderRows);
}

const ids = [...new Set([...expectSold.keys(), ...expectReserved.keys(), ...counters.keys()])].sort();
const rows = [];
const changes = [];
for (const id of ids) {
  const item = items.get(id) ?? {};
  const c = counters.get(id) ?? {};
  const actual = { sold: n(c.directSoldQty), reserved: n(c.directReservedQty), box: n(c.boxAllocatedQty) };
  const want = { sold: expectSold.get(id) ?? 0, reserved: expectReserved.get(id) ?? 0 };
  const stuffie = isStuffie(item);
  const avail = resolveAvailability({ id, ...item }, c, lockAt);
  if (stuffie || actual.sold || actual.reserved || want.sold || want.reserved) {
    rows.push({
      item: id.slice(0, 28),
      stuffie: stuffie ? 'yes' : '',
      onHand: typeof item.inventory === 'number' ? item.inventory : '-',
      cap: typeof item.directSaleCapBeforeLock === 'number' ? item.directSaleCapBeforeLock : '-',
      box: actual.box,
      sold: actual.sold,
      wantSold: want.sold,
      reserved: actual.reserved,
      wantReserved: want.reserved,
      storefront: `${avail.status}${availabilityRemaining(avail) != null ? ` ${availabilityRemaining(avail)}` : ''}`,
    });
  }
  if (actual.sold !== want.sold || actual.reserved !== want.reserved) {
    changes.push({
      itemId: id,
      directSoldQty: `${actual.sold} -> ${want.sold}`,
      directReservedQty: `${actual.reserved} -> ${want.reserved}`,
    });
  }
}
console.table(rows);
if (changes.length) {
  console.log('Proposed counter corrections (DRY RUN, nothing written):');
  console.table(changes);
} else {
  console.log('No counter corrections needed.');
}
process.exit(0);
