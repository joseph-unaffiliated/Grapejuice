/**
 * Free shipments to partners, friends and supporters. Each is a `complimentary` order under one
 * household, so its stock counts as sold direct (the same counter the shop uses) and it gets a
 * ShipStation order for the label. Nothing is charged and no customer email goes out.
 *
 * Ops request one by writing `complimentaryOrders/{id}` (server-only; see scripts/complimentary-order.mjs):
 *   { recipient: { name, email? }, shippingAddress: { name, line1, line2?, city, stateProvince, postalCode, country? },
 *     lineItems: [{ itemId, quantity }], reason, dryRun? }
 * `dryRun` only checks stock and returns what would be placed. Otherwise the order is written and
 * stock is taken in the same transaction, so two requests can't both take the last copy.
 */
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import {
  FieldValue,
  getFirestore,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "./logger";
import { withSentry } from "./sentry";
import { exportOrderToShipStation } from "./shipstation";
import {
  inventoryDocRef,
  parseCounters,
  recomputeBoxAllocations,
  CATALOG_HOLIDAY,
} from "./catalogInventory";

export const COMPLIMENTARY_HOUSEHOLD = "complimentary";

export type ComplimentaryRequest = {
  recipient: { name: string; email?: string };
  shippingAddress: Record<string, string>;
  lineItems: Array<{ itemId: string; quantity: number }>;
  reason: string;
  dryRun: boolean;
};

export type CounterSet = {
  boxAllocatedQty?: number;
  directReservedQty?: number;
  directSoldQty?: number;
};

/** Copies a comp can still take: on hand minus set aside, boxes, shop holds and sales. null = untracked. */
export function complimentaryRemaining(
  inventory: number | null | undefined,
  setAside: number | null | undefined,
  counters: CounterSet,
): number | null {
  if (typeof inventory !== "number" || !Number.isFinite(inventory)) return null;
  const n = (v: number | null | undefined) =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.max(0, Math.floor(v))
      : 0;
  return Math.max(
    0,
    Math.floor(inventory) -
      n(setAside) -
      n(counters.boxAllocatedQty) -
      n(counters.directReservedQty) -
      n(counters.directSoldQty),
  );
}

const REQUIRED_ADDRESS = [
  "line1",
  "city",
  "stateProvince",
  "postalCode",
] as const;

/** Throws on anything that would make a shipment fail or ship to the wrong place. */
export function validateComplimentaryRequest(
  raw: unknown,
): ComplimentaryRequest {
  const r = (raw ?? {}) as Record<string, unknown>;
  const recipientRaw = (r.recipient ?? {}) as Record<string, unknown>;
  const name = String(recipientRaw.name ?? "").trim();
  if (!name) throw new Error("recipient.name is required");
  const email = String(recipientRaw.email ?? "").trim();
  if (email && !email.includes("@"))
    throw new Error("recipient.email does not look like an email");

  const addr = (r.shippingAddress ?? {}) as Record<string, unknown>;
  const shippingAddress: Record<string, string> = {};
  for (const [k, v] of Object.entries(addr))
    if (typeof v === "string" && v.trim()) shippingAddress[k] = v.trim();
  shippingAddress.name = shippingAddress.name || name;
  shippingAddress.country = (shippingAddress.country || "US").toUpperCase();
  if (shippingAddress.country !== "US" && shippingAddress.country !== "CA") {
    throw new Error("shippingAddress.country must be US or CA");
  }
  for (const key of REQUIRED_ADDRESS) {
    if (!shippingAddress[key])
      throw new Error(`shippingAddress.${key} is required`);
  }
  if (email) shippingAddress.email = email;

  if (!Array.isArray(r.lineItems) || !r.lineItems.length)
    throw new Error("lineItems must be a non-empty array");
  const byItem = new Map<string, number>();
  for (const li of r.lineItems as Array<Record<string, unknown>>) {
    const itemId = String(li?.itemId ?? "").trim();
    const quantity = Number(li?.quantity ?? 1);
    if (!itemId) throw new Error("every line needs an itemId");
    if (!Number.isInteger(quantity) || quantity < 1)
      throw new Error(`${itemId} needs a whole quantity of 1 or more`);
    byItem.set(itemId, (byItem.get(itemId) ?? 0) + quantity);
  }

  const reason = String(r.reason ?? "").trim();
  if (!reason) throw new Error("reason is required (who this is for and why)");

  return {
    recipient: { name, ...(email ? { email } : {}) },
    shippingAddress,
    lineItems: [...byItem.entries()].map(([itemId, quantity]) => ({
      itemId,
      quantity,
    })),
    reason,
    dryRun: r.dryRun === true,
  };
}

type LinePlan = {
  itemId: string;
  label: string;
  quantity: number;
  remaining: number | null;
};

/**
 * Reads stock and, unless `dryRun`, writes the order and takes the stock in one transaction.
 * Returns the lines with what was left before the order.
 */
export async function placeComplimentaryOrder(
  db: Firestore,
  request: ComplimentaryRequest,
  requestId: string,
): Promise<{ orderId: string | null; lines: LinePlan[]; problems: string[] }> {
  const orderRef = db
    .collection(`households/${COMPLIMENTARY_HOUSEHOLD}/orders`)
    .doc();
  const problems: string[] = [];
  const lines: LinePlan[] = [];

  await db.runTransaction(async (tx) => {
    // Firestore transactions reject reads after writes, so read everything before writing.
    const reads = await Promise.all(
      request.lineItems.map(async ({ itemId }) => ({
        item: await tx.get(
          db.doc(`catalog/${CATALOG_HOLIDAY}/items/${itemId}`),
        ),
        inv: await tx.get(inventoryDocRef(db, itemId)),
      })),
    );
    lines.length = 0;
    problems.length = 0;
    request.lineItems.forEach(({ itemId, quantity }, i) => {
      const { item, inv } = reads[i];
      if (!item.exists) {
        problems.push(`Unknown product: ${itemId}`);
        return;
      }
      const data = item.data() ?? {};
      const name = String(data.name ?? itemId);
      const remaining = complimentaryRemaining(
        typeof data.inventory === "number" ? data.inventory : null,
        typeof data.setAside === "number" ? data.setAside : null,
        parseCounters(inv.data()),
      );
      lines.push({ itemId, label: name, quantity, remaining });
      if (remaining != null && quantity > remaining) {
        problems.push(
          remaining <= 0
            ? `${name} is out of stock`
            : `Only ${remaining} of ${name} left (asked for ${quantity})`,
        );
      }
    });
    if (problems.length || request.dryRun) return;

    const now = new Date().toISOString();
    tx.set(
      db.doc(`households/${COMPLIMENTARY_HOUSEHOLD}`),
      { name: "Complimentary orders", complimentary: true, updatedAt: now },
      { merge: true },
    );
    tx.set(orderRef, {
      status: "confirmed",
      orderType: "complimentary",
      lineItems: lines.map((l, i) => ({
        slotId: `comp-${i + 1}`,
        itemId: l.itemId,
        label: l.label,
        quantity: l.quantity,
        unitCents: 0,
        includedQty: 0,
      })),
      subtotalCents: 0,
      shippingCents: 0,
      discountCents: 0,
      taxCents: 0,
      totalCents: 0,
      shippingAddress: request.shippingAddress,
      recipient: request.recipient,
      reason: request.reason,
      requestId,
      inventoryCommittedAt: now,
      confirmedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    for (const l of lines) {
      tx.set(
        inventoryDocRef(db, l.itemId),
        { directSoldQty: FieldValue.increment(l.quantity), updatedAt: now },
        { merge: true },
      );
    }
  });

  if (request.dryRun || problems.length)
    return { orderId: null, lines, problems };
  return { orderId: orderRef.id, lines, problems };
}

export const processComplimentaryOrder = onDocumentCreated(
  {
    document: "complimentaryOrders/{requestId}",
    memory: "256MiB",
    timeoutSeconds: 120,
  },
  withSentry(async (event) => {
    const snap = event.data;
    if (!snap) return;
    const db = getFirestore();
    const ref = snap.ref;
    const claimed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (fresh.data()?.status !== "requested") return null;
      tx.update(ref, {
        status: "processing",
        startedAt: new Date().toISOString(),
      });
      return fresh.data()!;
    });
    if (!claimed) return;

    let outcome: Record<string, unknown>;
    try {
      const request = validateComplimentaryRequest(claimed);
      const placed = await placeComplimentaryOrder(
        db,
        request,
        event.params.requestId,
      );
      if (placed.problems.length) {
        outcome = {
          status: "rejected",
          problems: placed.problems,
          lines: placed.lines,
        };
      } else if (request.dryRun) {
        outcome = { status: "previewed", lines: placed.lines };
      } else {
        const orderRef = db.doc(
          `households/${COMPLIMENTARY_HOUSEHOLD}/orders/${placed.orderId}`,
        );
        const order = (await orderRef.get()).data() ?? {};
        let shipStation: string;
        try {
          const exported = await exportOrderToShipStation({
            orderId: placed.orderId!,
            householdId: COMPLIMENTARY_HOUSEHOLD,
            shippingAddress: request.shippingAddress,
            lineItems:
              (order.lineItems as Array<{
                label?: string;
                itemId?: string;
                quantity?: number;
                unitCents?: number;
              }>) ?? [],
            totalCents: 0,
            customerEmail: request.recipient.email,
          });
          if (exported.exported) {
            await orderRef.update({
              shipStationExportedAt: new Date().toISOString(),
              ...(exported.externalId
                ? { shipStationOrderId: exported.externalId }
                : {}),
            });
            shipStation = "created";
          } else {
            shipStation = "not created (ShipStation keys or address missing)";
          }
        } catch (err) {
          logger.error("complimentary: ShipStation export failed", {
            orderId: placed.orderId,
            err,
          });
          shipStation = `failed: ${err instanceof Error ? err.message : String(err)}`;
        }
        try {
          await recomputeBoxAllocations(db);
        } catch (err) {
          logger.error("complimentary: recomputeBoxAllocations failed", {
            orderId: placed.orderId,
            err,
          });
        }
        outcome = {
          status: "placed",
          orderId: placed.orderId,
          lines: placed.lines,
          shipStation,
        };
      }
    } catch (err) {
      outcome = {
        status: "failed",
        reason: err instanceof Error ? err.message : String(err),
      };
    }
    logger.info("processComplimentaryOrder", {
      requestId: event.params.requestId,
      status: outcome.status,
    });
    await ref.update({ ...outcome, processedAt: new Date().toISOString() });
  }),
);
