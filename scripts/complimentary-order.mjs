#!/usr/bin/env node
/**
 * Send a free (complimentary) shipment to a partner, friend or supporter. It takes stock like a
 * sale (so Available drops in Inventory) and creates a ShipStation order for the label. Nothing is
 * charged and no receipt is emailed.
 *
 *   node scripts/complimentary-order.mjs <request.json> --preview --firebase-cli-login   # check stock only
 *   node scripts/complimentary-order.mjs <request.json> --firebase-cli-login             # place the order
 *
 * request.json:
 *   {
 *     "recipient": { "name": "Dana Partner", "email": "dana@example.org" },   // email optional
 *     "shippingAddress": { "line1": "1 Main St", "line2": "", "city": "Austin", "stateProvince": "TX", "postalCode": "78701", "country": "US" },
 *     "lineItems": [{ "itemId": "book-a-dragon-for-hanukkah", "quantity": 1 }],
 *     "reason": "Partner thank-you, Nov 2026"
 *   }
 *
 * Requires: GOOGLE_APPLICATION_CREDENTIALS, `gcloud auth application-default login`, or
 * `--firebase-cli-login` to reuse the local `firebase login` session.
 */
import { readFileSync } from "node:fs";
import admin from "firebase-admin";
import { firestoreFromFirebaseCliLogin } from "./lib/firebaseCliCredential.mjs";

const file = process.argv[2];
const preview = process.argv.includes("--preview");
if (!file || file.startsWith("--")) {
  console.error(
    "Usage: complimentary-order.mjs <request.json> [--preview] [--firebase-cli-login]",
  );
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID || "grapejuice-pilot";
let db;
if (process.argv.includes("--firebase-cli-login")) {
  db = firestoreFromFirebaseCliLogin(projectId);
  if (!db) {
    console.error("No usable `firebase login` session found.");
    process.exit(1);
  }
} else {
  admin.initializeApp({ projectId });
  db = admin.firestore();
}

const request = JSON.parse(readFileSync(file, "utf8"));
const ref = db.collection("complimentaryOrders").doc();
await ref.set({
  recipient: request.recipient,
  shippingAddress: request.shippingAddress,
  lineItems: request.lineItems,
  reason: request.reason ?? "",
  dryRun: preview,
  status: "requested",
  requestedAt: new Date().toISOString(),
});
console.log(
  `complimentaryOrders/${ref.id} requested (${preview ? "preview" : "place order"})`,
);

for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const doc = (await ref.get()).data() ?? {};
  if (doc.status === "requested" || doc.status === "processing") continue;
  console.log(
    `status: ${doc.status}${doc.reason && doc.status === "failed" ? ` (${doc.reason})` : ""}`,
  );
  for (const l of doc.lines ?? []) {
    const left =
      l.remaining == null
        ? "untracked"
        : `${l.remaining} left before this order`;
    console.log(`  ${l.quantity} x ${l.label}  [${l.itemId}]  ${left}`);
  }
  for (const p of doc.problems ?? []) console.log(`  PROBLEM: ${p}`);
  if (doc.orderId)
    console.log(`  order: households/complimentary/orders/${doc.orderId}`);
  if (doc.shipStation) console.log(`  ShipStation: ${doc.shipStation}`);
  process.exit(["previewed", "placed"].includes(doc.status) ? 0 : 1);
}
console.error("Timed out waiting for processComplimentaryOrder.");
process.exit(1);
