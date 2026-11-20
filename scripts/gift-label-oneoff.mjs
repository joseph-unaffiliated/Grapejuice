#!/usr/bin/env node
/**
 * One-off gift labels.
 *
 * 1. The confirmed gift order with no ShipStation order (oD1RnyJihg0hvGtw8To7) is left
 *    alone when it is a playthrough. Those are skipped on purpose.
 * 2. Invite 1zu9DUtEaKY8ewR2MySl ships now. Its $8 of add-ons are waived on the order
 *    (those lines go out at $0). The invite keeps the original prices, plus a waiver note.
 *
 * Dry run by default. Writes only with --apply.
 *
 *   node scripts/gift-label-oneoff.mjs
 *   node scripts/gift-label-oneoff.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { firestoreFromFirebaseCliLogin } from "./lib/firebaseCliCredential.mjs";

const STUCK_ORDER_ID = "oD1RnyJihg0hvGtw8To7";
const WAIVE_INVITE_ID = "1zu9DUtEaKY8ewR2MySl";
const apply = process.argv.includes("--apply");

const db = firestoreFromFirebaseCliLogin(process.env.FIREBASE_PROJECT_ID || "grapejuice-pilot");
if (!db) {
  console.error("No usable `firebase login` session.");
  process.exit(1);
}

function auth() {
  const env = fs.readFileSync(path.resolve(import.meta.dirname, "../functions/.env"), "utf8");
  const read = (name) => {
    const m = env.match(new RegExp(`^${name}=(.*)$`, "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
  };
  const key = read("SHIPSTATION_API_KEY");
  const secret = read("SHIPSTATION_API_SECRET");
  if (!key || !secret) throw new Error("ShipStation keys missing from functions/.env");
  return `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;
}
const AUTH = auth();

function weightOz(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const text = raw.toLowerCase();
  let ounces = 0;
  let matched = false;
  const lb = text.match(/(\d+(?:\.\d+)?)\s*(lb|lbs|pound|pounds)\b/);
  const oz = text.match(/(\d+(?:\.\d+)?)\s*(oz|ounce|ounces)\b/);
  if (lb) { ounces += parseFloat(lb[1]) * 16; matched = true; }
  if (oz) { ounces += parseFloat(oz[1]); matched = true; }
  return matched && ounces > 0 ? Math.round(ounces * 100) / 100 : null;
}

async function catalogMeta(itemIds) {
  const out = new Map();
  await Promise.all([...new Set(itemIds)].map(async (id) => {
    const snap = await db.doc(`catalog/hanukkah/items/${id}`).get();
    const data = snap.data() ?? {};
    out.set(id, {
      sku: typeof data.sku === "string" && data.sku.trim() ? data.sku.trim() : id,
      name: typeof data.name === "string" ? data.name : id,
      weight: weightOz(data.weight),
    });
  }));
  return out;
}

function address(raw) {
  const country = String(raw?.country ?? "US");
  return {
    name: String(raw?.name ?? "Grapejuice customer"),
    street1: String(raw?.line1 ?? ""),
    ...(raw?.line2 ? { street2: String(raw.line2) } : {}),
    city: String(raw?.city ?? ""),
    state: String(raw?.stateProvince ?? raw?.state ?? ""),
    postalCode: String(raw?.postalCode ?? ""),
    country: country === "CA" ? "CA" : "US",
  };
}

async function exportOrder(householdId, orderId, order) {
  const indexRef = db.doc(`shipStationOrders/${orderId}`);
  if ((await indexRef.get()).exists) return { skipped: "already indexed" };
  const shipTo = address(order.shippingAddress);
  if (!shipTo.street1 || !shipTo.city) return { skipped: "incomplete address" };
  const lines = Array.isArray(order.lineItems) ? order.lineItems : [];
  const meta = await catalogMeta(lines.map((li) => li.itemId).filter(Boolean));
  let weight = 0;
  let weighted = 0;
  const items = lines.map((li, i) => {
    const itemId = String(li.itemId ?? "").trim();
    const m = meta.get(itemId);
    const quantity = li.quantity ?? 1;
    const lineWeight = m?.weight ? Math.round(m.weight * quantity * 100) / 100 : undefined;
    if (lineWeight) { weight += lineWeight; weighted += 1; }
    return {
      lineItemKey: itemId || `line-${i}`,
      sku: m?.sku || itemId || `pilot-${i}`,
      name: li.label || m?.name || itemId || "Hanukkah gift",
      quantity,
      unitPrice: ((li.unitCents ?? 0) / 100).toFixed(2),
      ...(lineWeight ? { weight: { value: lineWeight, units: "ounces" } } : {}),
    };
  });
  const orderNumber = `GJ-${householdId.slice(0, 6)}-${orderId.slice(0, 8)}`;
  const payload = {
    orderNumber,
    orderKey: orderId,
    orderDate: new Date().toISOString(),
    orderStatus: "awaiting_shipment",
    customerUsername: householdId,
    customerEmail: String(order.shippingAddress?.email ?? ""),
    billTo: shipTo,
    shipTo,
    items,
    amountPaid: ((order.totalCents ?? 0) / 100).toFixed(2),
    shippingAmount: 0,
    ...(items.length > 0 && weighted === items.length && weight > 0
      ? { weight: { value: Math.round(weight * 100) / 100, units: "ounces" } }
      : {}),
  };
  if (!apply) return { dryRun: true, orderNumber, items: items.length };
  const res = await fetch("https://ssapi.shipstation.com/orders/createorder", {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`ShipStation ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const now = new Date().toISOString();
  await indexRef.set({
    householdId,
    orderId,
    orderNumber,
    shipStationOrderId: data.orderId != null ? String(data.orderId) : null,
    updatedAt: now,
  });
  await db.doc(`households/${householdId}/orders/${orderId}`).update({ marketplaceFulfilledAt: now });
  return { exported: true, orderNumber, shipStationOrderId: data.orderId ?? null };
}

const stuck = (await db.collectionGroup("orders").select("orderType", "giftInviteId").get()).docs.find((d) => d.id === STUCK_ORDER_ID);
if (!stuck) {
  console.error(`Order ${STUCK_ORDER_ID} not found.`);
  process.exit(1);
}
const stuckFull = (await stuck.ref.get()).data();
if (stuckFull.playthrough === true) {
  console.log("stuck order: playthrough, ShipStation skip is intentional. Not exported.");
} else {
  const stuckHh = stuck.ref.parent.parent.id;
  console.log("stuck order:", JSON.stringify(await exportOrder(stuckHh, STUCK_ORDER_ID, stuckFull)));
}

const inviteRef = db.doc(`giftInvites/${WAIVE_INVITE_ID}`);
const inviteSnap = await inviteRef.get();
if (!inviteSnap.exists) {
  console.error(`Invite ${WAIVE_INVITE_ID} not found.`);
  process.exit(1);
}
const invite = inviteSnap.data();
const giver = (await db.doc(`users/${invite.giverUid}`).get()).data() ?? {};
const householdId = giver.householdId;
if (!householdId) {
  console.error("Giver has no household. Not shipped.");
  process.exit(1);
}
const orderId = `autoship-${WAIVE_INVITE_ID}`;
const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
const lines = (invite.lineItems ?? []).map((li) => ({ ...li, unitCents: 0 }));
const waivedCents = (invite.lineItems ?? []).reduce((sum, li) => sum + (li.unitCents ?? 0) * (li.quantity ?? 1), 0);
const existing = await orderRef.get();
if (!existing.exists) {
  const config = (await db.doc("config/hanukkah-2026").get()).data() ?? {};
  const payload = {
    status: "confirmed",
    orderType: "received_gift",
    giftInviteId: WAIVE_INVITE_ID,
    lineItems: lines,
    subtotalCents: 0,
    shippingCents: 0,
    taxCents: 0,
    totalCents: 0,
    creditAppliedCents: 0,
    giftCreditAppliedCents: 0,
    platformCreditAppliedCents: 0,
    addOnsWaivedCents: waivedCents,
    shippingAddress: invite.shippingAddress,
    holidayId: "hanukkah-2026",
    userId: invite.giverUid,
    estimatedDelivery: config.estimatedDeliveryBy ?? "2026-11-30",
    lockAt: config.lockAt ?? null,
    giftSurprise: true,
    autoShipped: true,
    autoShipForGiver: true,
    createdAt: new Date().toISOString(),
    confirmedAt: new Date().toISOString(),
  };
  console.log("create order:", JSON.stringify({ orderId, householdId, lines: lines.length, waivedCents, apply }));
  if (apply) {
    await orderRef.create(payload);
    await inviteRef.update({
      autoShipOrderId: orderId,
      autoShipHouseholdId: householdId,
      addOnsWaivedCents: waivedCents,
      addOnsWaivedAt: new Date().toISOString(),
    });
  }
} else {
  console.log("order already exists:", orderId);
}
const giftOrder = existing.exists ? existing.data() : {
  lineItems: lines,
  totalCents: 0,
  shippingAddress: invite.shippingAddress,
};
console.log("waived gift:", JSON.stringify(await exportOrder(householdId, orderId, giftOrder)));
if (!apply) console.log("Dry run. Re-run with --apply to write.");
