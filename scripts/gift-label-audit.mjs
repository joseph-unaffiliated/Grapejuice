#!/usr/bin/env node
/**
 * Read-only. One bucket per paid gift invite, and whether its order is in ShipStation.
 *
 *   node scripts/gift-label-audit.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { firestoreFromFirebaseCliLogin } from "./lib/firebaseCliCredential.mjs";
import { isDelayedItemId } from "./lib/delayedItems.mjs";

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

const chargeable = (lines) =>
  (lines ?? []).reduce((sum, li) => sum + (li.unitCents ?? 0) * (li.quantity ?? 1), 0);

const invites = (await db.collection("giftInvites").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const paid = invites.filter((g) => g.paymentStatus === "paid");

const orders = (await db.collectionGroup("orders").select("orderType", "giftInviteId", "playthrough", "marketplaceFulfilledAt", "lockAt").get()).docs;
const byInvite = new Map();
for (const doc of orders) {
  if (doc.get("orderType") !== "received_gift") continue;
  const inviteId = doc.get("giftInviteId");
  if (inviteId) byInvite.set(inviteId, doc);
}
const index = new Set((await db.collection("shipStationOrders").select("orderId").get()).docs.map((d) => d.id));

const buckets = {};
const missing = [];
for (const g of paid) {
  const lines = g.lineItems ?? [];
  const isBox = g.kind === "box" || (g.kind == null && lines.length > 0);
  const order = byInvite.get(g.id);
  const inSs = order ? index.has(order.id) : false;
  const owed = Math.max(0, chargeable(lines) - Math.max(0, g.prepaidAddOnCents ?? 0));
  let bucket;
  if (!isBox) bucket = "credit";
  else if (g.status === "converted_to_credit") bucket = "converted to credit";
  else if (inSs) bucket = "in ShipStation";
  else if (order) bucket = "order exists, missing from ShipStation";
  else if (!g.shippingAddress?.line1) bucket = "no recipient address";
  else if (owed > 0 && !g.autoShipOrderId) bucket = "owes add-ons";
  else bucket = "paid box with no order";
  buckets[bucket] = (buckets[bucket] ?? 0) + 1;
  if (bucket === "order exists, missing from ShipStation" || bucket === "owes add-ons" || bucket === "paid box with no order") {
    const delayed = lines.filter((li) => isDelayedItemId(li.itemId)).map((li) => li.itemId);
    missing.push({
      inviteId: g.id,
      bucket,
      owedCents: owed,
      status: g.status ?? null,
      claimed: Boolean(g.claimedByHouseholdId || g.claimedByUid),
      orderId: order?.id ?? null,
      playthrough: order?.get("playthrough") === true,
      fulfilledAt: order?.get("marketplaceFulfilledAt") ?? null,
      lockAt: order?.get("lockAt") ?? null,
      delayed,
    });
  }
}

console.log(JSON.stringify({ paid: paid.length, buckets, needsAttention: missing }, null, 2));

const AUTH = auth();
for (const row of missing.filter((r) => r.orderId)) {
  const order = byInvite.get(row.inviteId);
  const hh = order.ref.parent.parent?.id ?? "";
  const number = `GJ-${hh.slice(0, 6)}-${row.orderId.slice(0, 8)}`;
  const res = await fetch(`https://ssapi.shipstation.com/orders?orderNumber=${encodeURIComponent(number)}`, {
    headers: { Authorization: AUTH },
  });
  const data = await res.json();
  const hit = (data.orders ?? []).find((o) => o.orderKey === row.orderId);
  console.log(JSON.stringify({ orderNumber: number, shipStationStatus: res.status, found: Boolean(hit) }));
}
