#!/usr/bin/env node
/**
 * One-off. Splits one held delayed-items follow-up (toddler menorah + dreidel) into two on-hold
 * ShipStation orders: the menorah stays on the existing `-D` order, and the dreidel gets its own
 * `-D2` order. Both stay on hold, with the same address and service.
 *
 * Dry run by default. Writes only with --apply.
 *
 *   node scripts/split-held-dreidel-followup.mjs GJ-HIB6zc-hHrYT5XM-D
 *   node scripts/split-held-dreidel-followup.mjs GJ-HIB6zc-hHrYT5XM-D --apply
 */
import fs from "node:fs";
import path from "node:path";
import { isDelayedItemId } from "./lib/delayedItems.mjs";

const orderNumber = process.argv[2];
const apply = process.argv.includes("--apply");
if (!orderNumber || orderNumber.startsWith("--")) {
  console.error("Usage: split-held-dreidel-followup.mjs <followUpOrderNumber> [--apply]");
  process.exit(1);
}

const SS = "https://ssapi.shipstation.com";
const env = fs.readFileSync(path.resolve(import.meta.dirname, "../functions/.env"), "utf8");
const read = (name) => {
  const m = env.match(new RegExp(`^${name}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
};
const AUTH = `Basic ${Buffer.from(`${read("SHIPSTATION_API_KEY")}:${read("SHIPSTATION_API_SECRET")}`).toString("base64")}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastCallAt = 0;

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
    if (res.status === 429) { await sleep(Math.max(1, Number(res.headers.get("x-rate-limit-reset") ?? 30)) * 1000); continue; }
    if (!res.ok) throw new Error(`ShipStation ${method} ${route} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.status === 204 ? null : res.json();
  }
  throw new Error(`ShipStation ${method} ${route}: still rate limited`);
}

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
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined && obj[k] !== null).map((k) => [k, obj[k]]));
function createBody(order, { items, fields = {} } = {}) {
  const body = pick(order, ORDER_FIELDS);
  body.items = (items ?? order.items ?? []).map((item) => pick(item, ITEM_FIELDS));
  Object.assign(body, fields);
  for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
  return body;
}
const withField2 = (advancedOptions, text) => ({ ...(advancedOptions ?? {}), customField2: text.slice(0, 300) });

const found = await ss("GET", `/orders?orderNumber=${encodeURIComponent(orderNumber)}`);
const matches = (found.orders ?? []).filter((o) => o.orderNumber === orderNumber);
if (matches.length !== 1) throw new Error(`expected 1 order named ${orderNumber}, found ${matches.length}`);
const order = matches[0];
if (order.orderStatus !== "on_hold") throw new Error(`${orderNumber} is ${order.orderStatus}, expected on_hold`);
if (!String(order.orderKey).endsWith("__delayed")) throw new Error(`${orderNumber} is not a follow-up key`);

const parentNumber = order.orderNumber.replace(/-D$/, "");
const parentKey = order.orderKey.replace(/__delayed$/, "");
const menorahItems = order.items.filter((i) => i.sku === "MNR-WOOD-001" || i.lineItemKey === "toddler-play-menorah");
const dreidelItems = order.items.filter((i) => isDelayedItemId(i.lineItemKey) && !menorahItems.includes(i));
if (!menorahItems.length || !dreidelItems.length) throw new Error("expected both a toddler menorah and a dreidel on this order");
const other = order.items.filter((i) => !menorahItems.includes(i) && !dreidelItems.includes(i));
if (other.length) throw new Error(`unexpected extra lines: ${other.map((i) => i.name).join(", ")}`);

const dreidelName = dreidelItems.map((i) => i.name).join(", ");
const menorahName = menorahItems.map((i) => i.name).join(", ");
const dreidelOrder = createBody(order, {
  items: dreidelItems,
  fields: {
    orderNumber: `${parentNumber}-D2`,
    orderKey: `${parentKey}__delayed2`,
    orderStatus: "on_hold",
    amountPaid: 0,
    shippingAmount: 0,
    taxAmount: 0,
    weight: undefined,
    advancedOptions: withField2(order.advancedOptions, `Follow-up for ${parentNumber}: ${dreidelName}`),
  },
});
const menorahOrder = createBody(order, {
  items: menorahItems,
  fields: {
    advancedOptions: withField2(order.advancedOptions, `Follow-up for ${parentNumber}: ${menorahName}`),
  },
});

console.log(apply ? "APPLYING" : "DRY RUN", `- ${order.orderNumber} (${order.shipTo?.name})`);
console.log("menorah order  :", menorahOrder.orderNumber, menorahOrder.orderKey, "items:", menorahOrder.items.map((i) => `${i.name} x${i.quantity}`).join(", "), "| status", menorahOrder.orderStatus);
console.log("dreidel order  :", dreidelOrder.orderNumber, dreidelOrder.orderKey, "items:", dreidelOrder.items.map((i) => `${i.name} x${i.quantity}`).join(", "), "| status", dreidelOrder.orderStatus);
console.log("customField2   :", menorahOrder.advancedOptions.customField2, "|", dreidelOrder.advancedOptions.customField2);
if (!apply) { console.log("Dry run. Re-run with --apply to write."); process.exit(0); }

const created = await ss("POST", "/orders/createorder", dreidelOrder);
console.log("created dreidel order", created.orderNumber, created.orderStatus, created.orderId);
const updated = await ss("POST", "/orders/createorder", menorahOrder);
console.log("updated menorah order", updated.orderNumber, updated.orderStatus, updated.orderId);

const back = await ss("GET", `/orders?orderNumber=${encodeURIComponent(order.orderNumber)}`);
const menorahBack = back.orders.find((o) => o.orderNumber === order.orderNumber);
const dreidelBack = (await ss("GET", `/orders?orderNumber=${encodeURIComponent(dreidelOrder.orderNumber)}`)).orders.find((o) => o.orderNumber === dreidelOrder.orderNumber);
console.log("verify", order.orderNumber, menorahBack?.orderStatus, menorahBack?.items.map((i) => `${i.name} x${i.quantity}`).join(", "));
console.log("verify", dreidelOrder.orderNumber, dreidelBack?.orderStatus, dreidelBack?.items.map((i) => `${i.name} x${i.quantity}`).join(", "));
