#!/usr/bin/env node
/**
 * Moves delayed items (toddler menorah, brass dreidel, slipcast dreidel) off unshipped
 * ShipStation orders and onto one follow-up order per box.
 *
 * For each awaiting_shipment order that holds a delayed item (Hanukkah box, gift, or comp):
 *   - The original order keeps every other item. The delayed lines and their weight are removed,
 *     and customField2 says which items ship separately.
 *   - A follow-up order `{orderKey}__delayed` / `{orderNumber}-D` is created on hold with only the
 *     delayed lines, the same address and shipping service, and amountPaid 0.
 *
 * The follow-up is created first, so a failure in between leaves a duplicate on hold, never a
 * missing item. Both writes upsert by orderKey, so a re-run is safe.
 *
 * Skipped: shop orders, test orders, follow-ups. Any shipped order that still holds a delayed
 * item stops the run before anything is written.
 *
 * Dry run by default. Writes only with --apply.
 * --release-followups moves on-hold follow-ups to awaiting_shipment (dry run unless --apply).
 *
 *   node scripts/delayed-items-split.mjs
 *   node scripts/delayed-items-split.mjs --apply
 *   node scripts/delayed-items-split.mjs --release-followups
 *   node scripts/delayed-items-split.mjs --release-followups --apply
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { firestoreFromFirebaseCliLogin } from "./lib/firebaseCliCredential.mjs";
import { DELAYED_ITEM_IDS } from "./lib/delayedItems.mjs";

const require = createRequire(import.meta.url);
const { isTest } = require("../functions/lib/testAccounts.js");

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const releaseMode = args.has("--release-followups");
const projectId = process.env.FIREBASE_PROJECT_ID || "grapejuice-pilot";

const SS = "https://ssapi.shipstation.com";
const FOLLOW_SUFFIX = "__delayed";
const HOLD_PREFIX = "Held for delayed items: ";
const COMPLIMENTARY = "complimentary";
const HOLIDAY = "hanukkah-2026";
const BACKUP_DIR = path.resolve(import.meta.dirname, "../../backups/delayed-items-split");

// Fields ShipStation accepts on createorder. Read-only fields from GET are dropped.
const ORDER_FIELDS = [
  "orderNumber", "orderKey", "orderDate", "paymentDate", "shipByDate", "orderStatus",
  "customerUsername", "customerEmail", "billTo", "shipTo", "amountPaid", "taxAmount",
  "shippingAmount", "customerNotes", "internalNotes", "gift", "giftMessage", "paymentMethod",
  "requestedShippingService", "carrierCode", "serviceCode", "packageCode", "confirmation",
  "dimensions", "insuranceOptions", "internationalOptions", "advancedOptions", "tagIds", "weight",
];
const ITEM_FIELDS = [
  "lineItemKey", "sku", "name", "imageUrl", "weight", "quantity", "unitPrice", "taxAmount",
  "shippingAmount", "warehouseLocation", "options", "productId", "fulfillmentSku", "adjustment", "upc",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined && obj[k] !== null).map((k) => [k, obj[k]]));
const isDelayed = (item) => DELAYED_ITEM_IDS.has(item.lineItemKey) || DELAYED_ITEM_IDS.has(item.sku);

function shipStationAuth() {
  // Read from functions/.env. Values are never printed.
  const env = fs.readFileSync(path.resolve(import.meta.dirname, "../functions/.env"), "utf8");
  const read = (name) => {
    const m = env.match(new RegExp(`^${name}=(.*)$`, "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
  };
  const key = read("SHIPSTATION_API_KEY");
  const secret = read("SHIPSTATION_API_SECRET");
  if (!key || !secret) throw new Error("SHIPSTATION_API_KEY / SHIPSTATION_API_SECRET missing from functions/.env");
  return `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;
}

const AUTH = shipStationAuth();
let lastCallAt = 0;

/** ShipStation allows 40 requests a minute. Spacing keeps this under the limit. */
async function ss(method, route, body) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const wait = lastCallAt + 1700 - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    const res = await fetch(`${SS}${route}`, {
      method,
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 429) {
      await sleep(Math.max(1, Number(res.headers.get("x-rate-limit-reset") ?? 30)) * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`ShipStation ${method} ${route} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.status === 204 ? null : res.json();
  }
  throw new Error(`ShipStation ${method} ${route}: still rate limited after retries`);
}

async function listByStatus(status) {
  const orders = [];
  for (let page = 1, pages = 1; page <= pages; page++) {
    const data = await ss("GET", `/orders?orderStatus=${status}&pageSize=500&page=${page}`);
    orders.push(...(data.orders ?? []));
    pages = data.pages ?? 1;
  }
  return orders;
}

function createBody(order, { items, fields = {} } = {}) {
  const body = pick(order, ORDER_FIELDS);
  body.items = (items ?? order.items ?? []).map((item) => pick(item, ITEM_FIELDS));
  Object.assign(body, fields);
  for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
  return body;
}

const withField2 = (advancedOptions, text) => ({
  ...(advancedOptions ?? {}),
  customField2: text.slice(0, 300),
});

const delayedNames = (items) => items.map((i) => i.name).join(", ");

const db = firestoreFromFirebaseCliLogin(projectId);
if (!db) {
  console.error("No usable `firebase login` session. Run `firebase login --reauth` first.");
  process.exit(1);
}

/** Who the order belongs to. Only boxes, gifts, and comps are split. */
async function classify(order) {
  const key = String(order.orderKey ?? "");
  const hid = String(order.customerUsername ?? "");
  if (!key) return { skip: "no orderKey" };
  if (key.includes("__")) return { skip: "follow-up order" };
  if (isTest(order.customerEmail)) return { skip: "test order" };
  if (hid === COMPLIMENTARY) return { skip: "comp (not split; ships complete)" };

  const snap = await db.doc(`households/${hid}/orders/${key}`).get();
  const data = snap.exists ? snap.data() : null;
  if (data?.playthrough === true) return { skip: "playthrough order" };
  if (data?.orderType === "marketplace") return { skip: "shop order (not split)" };
  if (data?.orderType === "received_gift") return { type: "gift", data };
  if (data?.orderType === "hanukkah_box" || (!data?.orderType && data?.holidayId === HOLIDAY)) {
    return { type: "box", data };
  }
  return { skip: data ? `unrecognized order type "${data.orderType ?? "none"}"` : "no Firestore order doc" };
}

function planFor(order, info) {
  const items = order.items ?? [];
  const delayed = items.filter(isDelayed);
  if (!delayed.length) return null;
  const remaining = items.filter((i) => !isDelayed(i));
  const key = order.orderKey;
  const names = delayedNames(delayed);
  const existingField2 = String(order.advancedOptions?.customField2 ?? "").trim();
  if (existingField2) return { ...base(order, info, delayed, remaining), skip: `customField2 already set ("${existingField2}")` };
  // Every line is delayed, so there is nothing to split off. Hold the whole order until they arrive.
  if (!remaining.length) {
    return {
      ...base(order, info, delayed, remaining),
      holdBody: createBody(order, {
        fields: {
          orderStatus: "on_hold",
          advancedOptions: withField2(order.advancedOptions, `${HOLD_PREFIX}${names}`),
        },
      }),
    };
  }
  // Weights are not recalculated. ShipStation's order weight is a placeholder (item weights are
  // mostly empty), so the parent keeps its weight and the follow-up has none. Ops weighs both at label time.
  return {
    ...base(order, info, delayed, remaining),
    parentBody: createBody(order, {
      items: remaining,
      fields: {
        advancedOptions: withField2(order.advancedOptions, `Items delayed, ship separately: ${names}`),
      },
    }),
    followBody: createBody(order, {
      items: delayed,
      fields: {
        orderNumber: `${order.orderNumber}-D`,
        orderKey: `${key}${FOLLOW_SUFFIX}`,
        orderDate: new Date().toISOString(),
        orderStatus: "on_hold",
        amountPaid: 0,
        shippingAmount: 0,
        taxAmount: 0,
        weight: undefined,
        advancedOptions: withField2(order.advancedOptions, `Follow-up for ${order.orderNumber}: ${names}`),
      },
    }),
  };
}

function base(order, info, delayed, remaining) {
  return {
    key: order.orderKey,
    ssOrderId: order.orderId,
    type: info.type,
    orderNumber: order.orderNumber,
    followNumber: `${order.orderNumber}-D`,
    householdId: order.customerUsername,
    delayed: delayed.map((i) => ({ id: i.lineItemKey, name: i.name, qty: i.quantity })),
    keeps: remaining.length,
    service: order.requestedShippingService || order.serviceCode || "none set (ops picks at label)",
  };
}

// --- Release mode -----------------------------------------------------------

async function releaseFollowUps() {
  const onHold = await listByStatus("on_hold");
  const followUps = onHold.filter((o) => String(o.orderKey ?? "").endsWith(FOLLOW_SUFFIX));
  const holds = onHold.filter((o) => String(o.advancedOptions?.customField2 ?? "").startsWith(HOLD_PREFIX));
  console.log(`On-hold follow-ups: ${followUps.length}   held whole orders: ${holds.length}`);
  for (const o of [...followUps, ...holds]) {
    console.log(`  ${o.orderNumber}  ${o.items.map((i) => `${i.name} x${i.quantity}`).join(", ")}`);
  }
  if (!apply) {
    console.log("Dry run. Re-run with --release-followups --apply to move these to awaiting_shipment.");
    return;
  }
  for (const o of followUps) {
    await ss("POST", "/orders/createorder", createBody(o, { fields: { orderStatus: "awaiting_shipment" } }));
    console.log(`released ${o.orderNumber}`);
  }
  for (const o of holds) {
    await ss("POST", "/orders/createorder", createBody(o, {
      fields: {
        orderStatus: "awaiting_shipment",
        advancedOptions: { ...(o.advancedOptions ?? {}), customField2: null },
      },
    }));
    console.log(`released held order ${o.orderNumber}`);
  }
}

// --- Split mode -------------------------------------------------------------

async function splitMode() {
  const awaiting = await listByStatus("awaiting_shipment");
  const shipped = await listByStatus("shipped");

  const shippedWithDelayed = shipped.filter(
    (o) => !String(o.orderKey ?? "").includes("__") && (o.items ?? []).some(isDelayed),
  );
  if (shippedWithDelayed.length) {
    console.error(`STOP: ${shippedWithDelayed.length} shipped order(s) still hold a delayed item:`);
    for (const o of shippedWithDelayed) console.error(`  ${o.orderNumber} ${o.orderKey}`);
    process.exit(2);
  }

  const plans = [];
  const skipped = [];
  for (const order of awaiting) {
    if (!(order.items ?? []).some(isDelayed)) continue;
    const info = await classify(order);
    if (info.skip) {
      skipped.push({ orderNumber: order.orderNumber, reason: info.skip, key: order.orderKey });
      continue;
    }
    const plan = planFor(order, info);
    if (plan.skip) skipped.push({ orderNumber: order.orderNumber, reason: plan.skip, key: order.orderKey });
    else plans.push({ ...plan, original: order });
  }

  const byType = {};
  for (const p of plans) byType[p.type] = (byType[p.type] ?? 0) + 1;
  const summary = {
    mode: apply ? "APPLY" : "DRY RUN",
    awaitingShipmentChecked: awaiting.length,
    shippedChecked: shipped.length,
    toSplit: plans.filter((p) => p.followBody).length,
    toHoldWhole: plans.filter((p) => p.holdBody).length,
    byType,
    followUpsToCreate: plans.filter((p) => p.followBody).length,
    skipped,
  };
  console.log(JSON.stringify(summary, null, 2));
  console.log("\nPlanned:");
  for (const p of plans) {
    if (p.holdBody) {
      console.log(
        `  ${p.orderNumber} (${p.type}, ${p.householdId}) HOLD WHOLE ORDER until ` +
          `${p.delayed.map((d) => `${d.name} x${d.qty}`).join(", ")} arrive  service: ${p.service}`,
      );
      continue;
    }
    console.log(
      `  ${p.orderNumber} (${p.type}, ${p.householdId}) -> ${p.followNumber}  ` +
        `ships separately: ${p.delayed.map((d) => `${d.name} x${d.qty}`).join(", ")}  ` +
        `keeps ${p.keeps} other line(s)  service: ${p.service}`,
    );
  }

  if (args.has("--show") && plans[0]) {
    console.log(`\nRequest bodies for ${plans[0].orderNumber} (not sent):`);
    console.log(JSON.stringify({ parent: plans[0].parentBody, followUp: plans[0].followBody }, null, 2));
  }

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to write to ShipStation and Firestore.");
    return;
  }

  const failures = [];
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : plans.length;
  for (const p of plans.slice(0, limit)) {
    try {
      fs.writeFileSync(path.join(BACKUP_DIR, `${p.key}.json`), JSON.stringify(p.original, null, 2));

      if (p.holdBody) {
        await ss("POST", "/orders/createorder", p.holdBody);
      } else {
        // Follow-up first. If the parent update then fails, the next run re-sends both (same keys).
        await ss("POST", "/orders/createorder", p.followBody);

        const parent = await ss("POST", "/orders/createorder", p.parentBody);
        if (String(parent?.orderId ?? "") !== String(p.ssOrderId)) {
          throw new Error(`parent upsert returned orderId ${parent?.orderId}, expected ${p.ssOrderId}`);
        }
      }

      if (p.householdId) {
        const ref = db.doc(`households/${p.householdId}/orders/${p.key}`);
        const snap = await ref.get();
        if (snap.exists) {
          await ref.update({
            delayedShipsSeparately: p.delayed.map((d) => d.id),
            delayedQty: Object.fromEntries(p.delayed.map((d) => [d.id, d.qty])),
            delayedFollowUpOrderNumber: p.holdBody ? null : p.followNumber,
            delayedHeldWhole: Boolean(p.holdBody),
            delayedUpdatedAt: new Date().toISOString(),
          });
        } else {
          console.warn(`  no Firestore doc for ${p.key}; ShipStation updated, Firestore not recorded`);
        }
      }
      console.log(p.holdBody ? `held ${p.orderNumber} whole` : `split ${p.orderNumber} -> ${p.followNumber}`);
    } catch (err) {
      failures.push({ orderNumber: p.orderNumber, error: String(err?.message ?? err) });
      console.error(`FAILED ${p.orderNumber}: ${err?.message ?? err}`);
    }
  }
  console.log(JSON.stringify({ attempted: Math.min(limit, plans.length), failures }, null, 2));
  if (failures.length) process.exit(1);
}

if (releaseMode) await releaseFollowUps();
else await splitMode();
