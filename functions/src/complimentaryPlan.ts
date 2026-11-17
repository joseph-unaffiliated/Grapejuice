/**
 * Plan complimentary shipments before the addresses are in. Each person holds stock as soon as an
 * item is assigned (sold direct, so Available drops). The ShipStation label is created only once
 * their address is saved. Admin only, from the Comps tab.
 */
import {
  FieldValue,
  getFirestore,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { HttpsError, onCall } from "./sentry";
import { isAdminToken } from "./guestSessions";
import { exportOrderToShipStation } from "./shipstation";
import {
  CATALOG_HOLIDAY,
  inventoryDocRef,
  parseCounters,
} from "./catalogInventory";
import {
  COMPLIMENTARY_HOUSEHOLD,
  complimentaryRemaining,
} from "./complimentaryOrders";

export type CompLine = { itemId: string; label: string; quantity: number };

export type CompAddress = {
  name: string;
  line1: string;
  line2: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
  email: string;
};

const PEOPLE = "complimentaryPeople";

/** Replace one item's quantity. Zero drops the line. Same item is never listed twice. */
export function nextPersonLines(
  lines: CompLine[],
  itemId: string,
  label: string,
  quantity: number,
): CompLine[] {
  const rest = lines.filter((l) => l.itemId !== itemId);
  if (quantity <= 0) return rest;
  return [...rest, { itemId, label, quantity }];
}

function linesOf(data: FirebaseFirestore.DocumentData | undefined): CompLine[] {
  const raw = data?.lineItems;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const li = (r ?? {}) as Record<string, unknown>;
      return {
        itemId: String(li.itemId ?? ""),
        label: String(li.label ?? li.itemId ?? ""),
        quantity: Math.floor(Number(li.quantity) || 0),
      };
    })
    .filter((l) => l.itemId && l.quantity > 0);
}

function addressOf(
  data: FirebaseFirestore.DocumentData | undefined,
): CompAddress | null {
  const a = data?.shippingAddress as Record<string, unknown> | undefined;
  if (!a || typeof a.line1 !== "string") return null;
  return {
    name: String(a.name ?? data?.name ?? ""),
    line1: String(a.line1 ?? ""),
    line2: String(a.line2 ?? ""),
    city: String(a.city ?? ""),
    stateProvince: String(a.stateProvince ?? ""),
    postalCode: String(a.postalCode ?? ""),
    country: String(a.country ?? "US"),
    email: String(a.email ?? data?.email ?? ""),
  };
}

function viewOf(
  id: string,
  data: FirebaseFirestore.DocumentData,
): Record<string, unknown> {
  const address = addressOf(data);
  const shipped = typeof data.shipStationExportedAt === "string";
  const failed =
    typeof data.shipStationError === "string" &&
    data.shipStationError &&
    !shipped;
  return {
    id,
    name: String(data.name ?? ""),
    lines: linesOf(data),
    address,
    orderId: typeof data.orderId === "string" ? data.orderId : null,
    label: shipped
      ? "labeled"
      : failed
        ? "label-failed"
        : address
          ? "ready"
          : "needs-address",
    labelDetail: shipped ? null : failed ? String(data.shipStationError) : null,
    itemsSet: data.itemsSet === true,
    handDeliver: data.handDeliver === true,
    canada: data.canada === true,
  };
}

/** Hand delivery and Canada never get a ShipStation label. A Canadian address does not either. */
export function compSkipsShipStation(input: {
  handDeliver?: unknown;
  canada?: unknown;
  country?: unknown;
}): boolean {
  return (
    input.handDeliver === true ||
    input.canada === true ||
    input.country === "CA"
  );
}

/** Live copies left for every item someone already holds, straight from the stock counters. */
async function stockForLines(
  db: Firestore,
  people: FirebaseFirestore.QueryDocumentSnapshot[],
) {
  const ids = new Set<string>();
  for (const doc of people)
    for (const line of linesOf(doc.data())) ids.add(line.itemId);
  const stock: Record<string, number | null> = {};
  await Promise.all(
    [...ids].map(async (itemId) => {
      const [itemSnap, invSnap] = await Promise.all([
        db.doc(`catalog/${CATALOG_HOLIDAY}/items/${itemId}`).get(),
        inventoryDocRef(db, itemId).get(),
      ]);
      if (!itemSnap.exists) return;
      const item = itemSnap.data() ?? {};
      stock[itemId] = complimentaryRemaining(
        typeof item.inventory === "number" ? item.inventory : null,
        typeof item.setAside === "number" ? item.setAside : null,
        parseCounters(invSnap.data()),
      );
    }),
  );
  return stock;
}

async function listPeople(db: Firestore) {
  const snap = await db.collection(PEOPLE).orderBy("createdAt", "asc").get();
  return {
    people: snap.docs.map((d) => viewOf(d.id, d.data())),
    stock: await stockForLines(db, snap.docs),
  };
}

function requirePerson(
  data: FirebaseFirestore.DocumentData | undefined,
): FirebaseFirestore.DocumentData {
  if (!data)
    throw new HttpsError("not-found", "That person is no longer on the list.");
  if (data.shipStationExportedAt)
    throw new HttpsError(
      "failed-precondition",
      "Their label is already in ShipStation, so this list is fixed.",
    );
  return data;
}

/** A complete address, or an error naming the first missing part. */
export function parseCompAddress(
  raw: unknown,
  fallbackName: string,
): CompAddress {
  const a = (raw ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof a[k] === "string" ? a[k].trim() : "");
  const address: CompAddress = {
    name: str("name") || fallbackName,
    line1: str("line1"),
    line2: str("line2"),
    city: str("city"),
    stateProvince: str("stateProvince"),
    postalCode: str("postalCode"),
    country: (str("country") || "US").toUpperCase(),
    email: str("email"),
  };
  if (!address.line1)
    throw new HttpsError("invalid-argument", "Street address is required.");
  if (!address.city)
    throw new HttpsError("invalid-argument", "City is required.");
  if (!address.stateProvince)
    throw new HttpsError("invalid-argument", "State is required.");
  if (!address.postalCode)
    throw new HttpsError("invalid-argument", "Postal code is required.");
  if (address.country !== "US" && address.country !== "CA") {
    throw new HttpsError("invalid-argument", "Country must be US or CA.");
  }
  if (address.email && !address.email.includes("@"))
    throw new HttpsError("invalid-argument", "That email does not look right.");
  return address;
}

async function setItem(
  db: Firestore,
  personId: string,
  itemId: string,
  quantity: number,
) {
  if (!Number.isInteger(quantity) || quantity < 0)
    throw new HttpsError(
      "invalid-argument",
      "Quantity has to be a whole number.",
    );
  const personRef = db.doc(`${PEOPLE}/${personId}`);
  let remaining: number | null = null;
  await db.runTransaction(async (tx: Transaction) => {
    const personSnap = await tx.get(personRef);
    const person = requirePerson(personSnap.data());
    const itemSnap = await tx.get(
      db.doc(`catalog/${CATALOG_HOLIDAY}/items/${itemId}`),
    );
    const invSnap = await tx.get(inventoryDocRef(db, itemId));
    if (!itemSnap.exists)
      throw new HttpsError("invalid-argument", `Unknown product: ${itemId}`);
    const item = itemSnap.data() ?? {};
    const label = String(item.name ?? itemId);
    const lines = linesOf(person);
    const old = lines.find((l) => l.itemId === itemId)?.quantity ?? 0;
    const delta = quantity - old;
    const left = complimentaryRemaining(
      typeof item.inventory === "number" ? item.inventory : null,
      typeof item.setAside === "number" ? item.setAside : null,
      parseCounters(invSnap.data()),
    );
    if (delta > 0 && left != null && delta > left) {
      throw new HttpsError(
        "failed-precondition",
        left <= 0
          ? `${label} is out of stock.`
          : `Only ${left} of ${label} left.`,
      );
    }
    remaining = left == null ? null : left - delta;
    const now = new Date().toISOString();
    tx.update(personRef, {
      lineItems: nextPersonLines(lines, itemId, label, quantity),
      updatedAt: now,
    });
    if (delta !== 0) {
      tx.set(
        inventoryDocRef(db, itemId),
        { directSoldQty: FieldValue.increment(delta), updatedAt: now },
        { merge: true },
      );
    }
  });
  const fresh = (await personRef.get()).data()!;
  return { person: viewOf(personId, fresh), remaining };
}

async function shipPerson(
  db: Firestore,
  personId: string,
  data: FirebaseFirestore.DocumentData,
) {
  const lines = linesOf(data);
  const address = addressOf(data);
  if (!lines.length || !address) return viewOf(personId, data);
  const ref = db.doc(`${PEOPLE}/${personId}`);
  let orderId = typeof data.orderId === "string" ? data.orderId : "";
  if (!orderId) {
    const orderRef = db
      .collection(`households/${COMPLIMENTARY_HOUSEHOLD}/orders`)
      .doc();
    orderId = orderRef.id;
    const now = new Date().toISOString();
    await db
      .doc(`households/${COMPLIMENTARY_HOUSEHOLD}`)
      .set(
        { name: "Complimentary orders", complimentary: true, updatedAt: now },
        { merge: true },
      );
    await orderRef.set({
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
      taxCents: 0,
      totalCents: 0,
      shippingAddress: address,
      recipient: {
        name: String(data.name ?? address.name),
        ...(address.email ? { email: address.email } : {}),
      },
      reason: `Complimentary: ${String(data.name ?? "")}`,
      personId,
      confirmedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ref.update({ orderId, updatedAt: now });
  }
  const orderRef = db.doc(
    `households/${COMPLIMENTARY_HOUSEHOLD}/orders/${orderId}`,
  );
  if (
    compSkipsShipStation({
      handDeliver: data.handDeliver,
      canada: data.canada,
      country: address.country,
    })
  ) {
    const now = new Date().toISOString();
    await ref.update({
      shipStationSkipped: data.handDeliver === true ? "hand-deliver" : "canada",
      shipStationError: FieldValue.delete(),
      updatedAt: now,
    });
    return viewOf(personId, (await ref.get()).data()!);
  }
  try {
    const exported = await exportOrderToShipStation({
      orderId,
      householdId: COMPLIMENTARY_HOUSEHOLD,
      shippingAddress: address,
      lineItems: lines,
      totalCents: 0,
      customerEmail: address.email || undefined,
    });
    const now = new Date().toISOString();
    if (!exported.exported)
      throw new Error(
        "ShipStation did not create the order (keys or address).",
      );
    await orderRef.update({
      shipStationExportedAt: now,
      ...(exported.externalId
        ? { shipStationOrderId: exported.externalId }
        : {}),
    });
    await ref.update({
      shipStationExportedAt: now,
      shipStationError: FieldValue.delete(),
      updatedAt: now,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ref.update({
      shipStationError: message,
      updatedAt: new Date().toISOString(),
    });
  }
  return viewOf(personId, (await ref.get()).data()!);
}

export const adminComplimentaryPlan = onCall(
  { memory: "256MiB", timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Sign in required.");
    if (!isAdminToken(request.auth.token))
      throw new HttpsError("permission-denied", "Admin only.");
    const db = getFirestore();
    const body = (request.data ?? {}) as Record<string, unknown>;
    const action = String(body.action ?? "list");

    if (action === "list") return await listPeople(db);

    if (action === "add") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name)
        throw new HttpsError("invalid-argument", "A name is required.");
      const now = new Date().toISOString();
      const ref = db.collection(PEOPLE).doc();
      await ref.set({ name, lineItems: [], createdAt: now, updatedAt: now });
      return { person: viewOf(ref.id, (await ref.get()).data()!) };
    }

    const personId =
      typeof body.personId === "string" ? body.personId.trim() : "";
    if (!personId)
      throw new HttpsError("invalid-argument", "personId is required.");
    const personRef = db.doc(`${PEOPLE}/${personId}`);

    if (action === "setItem") {
      const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
      if (!itemId)
        throw new HttpsError("invalid-argument", "itemId is required.");
      return setItem(db, personId, itemId, Math.floor(Number(body.quantity)));
    }

    if (action === "remove") {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(personRef);
        const person = requirePerson(snap.data());
        const orderId =
          typeof person.orderId === "string" ? person.orderId : "";
        const orderRef = orderId
          ? db.doc(`households/${COMPLIMENTARY_HOUSEHOLD}/orders/${orderId}`)
          : null;
        const orderSnap = orderRef ? await tx.get(orderRef) : null;
        if (orderSnap?.data()?.shipStationExportedAt) {
          throw new HttpsError(
            "failed-precondition",
            "Their label is already in ShipStation, so this list is fixed.",
          );
        }
        const now = new Date().toISOString();
        for (const l of linesOf(person)) {
          tx.set(
            inventoryDocRef(db, l.itemId),
            {
              directSoldQty: FieldValue.increment(-l.quantity),
              updatedAt: now,
            },
            { merge: true },
          );
        }
        if (orderRef) tx.delete(orderRef);
        tx.delete(personRef);
      });
      return { removed: personId };
    }

    if (action === "setFulfillment") {
      const snap = await personRef.get();
      if (!snap.exists)
        throw new HttpsError(
          "not-found",
          "That person is no longer on the list.",
        );
      const update: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
      };
      if (typeof body.handDeliver === "boolean")
        update.handDeliver = body.handDeliver;
      if (typeof body.canada === "boolean") update.canada = body.canada;
      const current = snap.data() ?? {};
      const saved = current.shippingAddress;
      if (
        body.canada === true &&
        saved &&
        typeof saved === "object" &&
        !Array.isArray(saved)
      ) {
        update.shippingAddress = { ...saved, country: "CA" };
      }
      await personRef.update(update);
      return { person: viewOf(personId, (await personRef.get()).data()!) };
    }

    if (action === "setDone") {
      const snap = await personRef.get();
      if (!snap.exists)
        throw new HttpsError(
          "not-found",
          "That person is no longer on the list.",
        );
      await personRef.update({
        itemsSet: body.done === true,
        updatedAt: new Date().toISOString(),
      });
      return { person: viewOf(personId, (await personRef.get()).data()!) };
    }

    if (action === "address") {
      const snap = await personRef.get();
      const person = requirePerson(snap.data());
      const address = parseCompAddress(body.address, String(person.name ?? ""));
      const canada =
        typeof body.canada === "boolean" ? body.canada : person.canada === true;
      const handDeliver =
        typeof body.handDeliver === "boolean"
          ? body.handDeliver
          : person.handDeliver === true;
      if (canada) address.country = "CA";
      await personRef.update({
        shippingAddress: address,
        handDeliver,
        canada,
        email: address.email || FieldValue.delete(),
        updatedAt: new Date().toISOString(),
      });
      const personView = await shipPerson(
        db,
        personId,
        (await personRef.get()).data()!,
      );
      return { person: personView };
    }

    throw new HttpsError("invalid-argument", `Unknown action: ${action}`);
  },
);
