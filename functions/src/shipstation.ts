import * as logger from 'firebase-functions/logger';
import type { Firestore } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';

type ShipStationAddress = {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

type ShipStationShipment = {
  orderId?: number;
  orderKey?: string;
  orderNumber?: string;
  trackingNumber?: string;
  carrierCode?: string;
  serviceCode?: string;
  voided?: boolean;
  shipDate?: string;
};

function shipStationAuthHeader(): string | null {
  const apiKey = process.env.SHIPSTATION_API_KEY ?? '';
  const apiSecret = process.env.SHIPSTATION_API_SECRET ?? '';
  if (!apiKey || !apiSecret) return null;
  return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;
}

function toShipStationAddress(raw: Record<string, unknown>): ShipStationAddress {
  const country = String(raw.country ?? 'US');
  return {
    name: String(raw.name ?? 'Grapejuice customer'),
    street1: String(raw.line1 ?? ''),
    street2: raw.line2 ? String(raw.line2) : undefined,
    city: String(raw.city ?? ''),
    state: String(raw.stateProvince ?? raw.state ?? ''),
    postalCode: String(raw.postalCode ?? ''),
    country: country === 'CA' ? 'CA' : 'US',
  };
}

/** Map ShipStation carrierCode → label used in Orders UI. */
export function carrierLabelFromShipStation(code?: string | null): string {
  const c = (code ?? '').toLowerCase();
  if (!c) return 'USPS';
  if (c.includes('ups')) return 'UPS';
  if (c.includes('fedex')) return 'FedEx';
  if (c.includes('dhl')) return 'DHL';
  if (c.includes('usps') || c.includes('stamps') || c.includes('endicia') || c.includes('postal')) {
    return 'USPS';
  }
  return code!.toUpperCase();
}

function assertSafeShipStationResourceUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.hostname !== 'ssapi.shipstation.com') {
    throw new Error(`Refusing ShipStation resource_url host: ${url.hostname}`);
  }
  return url;
}

async function writeShipStationIndex(params: {
  householdId: string;
  orderId: string;
  orderNumber: string;
  shipStationOrderId?: string;
}): Promise<void> {
  const db = getFirestore();
  await db.doc(`shipStationOrders/${params.orderId}`).set(
    {
      householdId: params.householdId,
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      shipStationOrderId: params.shipStationOrderId ?? null,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

/** ShipStation order export — no-op when keys missing. */
export async function exportOrderToShipStation(order: {
  orderId: string;
  householdId: string;
  shippingAddress: Record<string, unknown>;
  lineItems: Array<{ label?: string; itemId?: string; quantity?: number; unitCents?: number }>;
  totalCents: number;
  expeditedShipping?: boolean;
}): Promise<{ exported: boolean; externalId?: string }> {
  const auth = shipStationAuthHeader();
  if (!auth) {
    logger.info('ShipStation export skipped (keys not configured)', { orderId: order.orderId });
    return { exported: false };
  }

  const shipTo = toShipStationAddress(order.shippingAddress);
  if (!shipTo.street1 || !shipTo.city) {
    logger.warn('ShipStation export skipped (incomplete address)', { orderId: order.orderId });
    return { exported: false };
  }

  const items = order.lineItems.map((li, i) => ({
    lineItemKey: li.itemId ?? `line-${i}`,
    sku: li.itemId ?? `pilot-${i}`,
    name: li.label ?? li.itemId ?? 'Hanukkah box item',
    quantity: li.quantity ?? 1,
    unitPrice: ((li.unitCents ?? 0) / 100).toFixed(2),
  }));

  const orderNumber = `GJ-${order.householdId.slice(0, 6)}-${order.orderId.slice(0, 8)}`;
  const payload = {
    orderNumber,
    // Firestore order id — webhook uses this (+ shipStationOrders index / SS customerUsername).
    orderKey: order.orderId,
    orderDate: new Date().toISOString(),
    orderStatus: 'awaiting_shipment',
    customerUsername: order.householdId,
    customerEmail: String(order.shippingAddress.email ?? ''),
    billTo: shipTo,
    shipTo,
    items: items.length
      ? items
      : [{ sku: 'hanukkah-pilot-box', name: 'Hanukkah pilot box', quantity: 1, unitPrice: '50.00' }],
    amountPaid: (order.totalCents / 100).toFixed(2),
    shippingAmount: 0,
    advancedOptions: order.expeditedShipping ? { customField1: 'expedited' } : undefined,
  };

  const res = await fetch('https://ssapi.shipstation.com/orders/createorder', {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ShipStation ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { orderId?: number };
  const externalId = data.orderId != null ? String(data.orderId) : undefined;
  try {
    await writeShipStationIndex({
      householdId: order.householdId,
      orderId: order.orderId,
      orderNumber,
      shipStationOrderId: externalId,
    });
  } catch (indexErr) {
    logger.warn('ShipStation index write failed (export still ok)', {
      orderId: order.orderId,
      indexErr,
    });
  }

  logger.info('ShipStation order created', {
    orderId: order.orderId,
    shipStationOrderId: data.orderId,
  });
  return { exported: true, externalId: externalId ?? order.orderId };
}

/** Write tracking from ShipStation webhook or manual ops update. */
export async function applyShipStationTracking(
  db: Firestore,
  householdId: string,
  orderId: string,
  tracking: { trackingNumber: string; carrier?: string; shippedAt?: string }
): Promise<void> {
  const ref = db.doc(`households/${householdId}/orders/${orderId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error(`Order not found: ${householdId}/${orderId}`);
  }
  const existing = snap.data() ?? {};
  if (
    existing.trackingNumber === tracking.trackingNumber &&
    existing.status === 'shipped'
  ) {
    return;
  }
  await ref.update({
    trackingNumber: tracking.trackingNumber,
    carrier: tracking.carrier ?? 'USPS',
    status: 'shipped',
    shippedAt: tracking.shippedAt ?? new Date().toISOString(),
  });
}

async function fetchShipStationOrder(
  shipStationOrderId: number
): Promise<{ customerUsername?: string; orderKey?: string } | null> {
  const auth = shipStationAuthHeader();
  if (!auth) return null;
  const res = await fetch(`https://ssapi.shipstation.com/orders/${shipStationOrderId}`, {
    headers: { Authorization: auth },
  });
  if (!res.ok) {
    logger.warn('ShipStation order fetch failed', {
      shipStationOrderId,
      status: res.status,
    });
    return null;
  }
  return (await res.json()) as { customerUsername?: string; orderKey?: string };
}

async function resolveHouseholdForShipment(
  db: Firestore,
  shipment: ShipStationShipment
): Promise<{ householdId: string; orderId: string } | null> {
  const orderId = String(shipment.orderKey ?? '').trim();
  if (!orderId) return null;

  const indexSnap = await db.doc(`shipStationOrders/${orderId}`).get();
  if (indexSnap.exists) {
    const householdId = String(indexSnap.data()?.householdId ?? '').trim();
    if (householdId) return { householdId, orderId };
  }

  // Orders exported before the index existed: SS still has customerUsername = householdId.
  if (shipment.orderId != null) {
    const ssOrder = await fetchShipStationOrder(shipment.orderId);
    const householdId = String(ssOrder?.customerUsername ?? '').trim();
    if (householdId) {
      try {
        await writeShipStationIndex({
          householdId,
          orderId,
          orderNumber: String(shipment.orderNumber ?? ''),
          shipStationOrderId: String(shipment.orderId),
        });
      } catch {
        /* non-fatal */
      }
      return { householdId, orderId };
    }
  }

  return null;
}

/**
 * Process ShipStation SHIP_NOTIFY / ITEM_SHIP_NOTIFY webhook body.
 * Payload is only `{ resource_url, resource_type }` — we GET shipments next.
 *
 * Dev/ops bypass (requires webhook secret on the URL):
 * `{ "simulate": true, "orderKey": "<firestoreOrderId>", "trackingNumber": "...", "carrierCode": "ups", "householdId": "..." }`
 * `householdId` optional when `shipStationOrders/{orderKey}` index exists (or SS order lookup works).
 */
export async function processShipStationShipNotify(
  db: Firestore,
  body: {
    resource_url?: string;
    resource_type?: string;
    simulate?: boolean;
    orderKey?: string;
    orderId?: string;
    householdId?: string;
    trackingNumber?: string;
    carrierCode?: string;
  }
): Promise<{ processed: number; skipped: number; simulated?: boolean }> {
  if (body.simulate === true) {
    const orderId = String(body.orderKey ?? body.orderId ?? '').trim();
    const trackingNumber = String(body.trackingNumber ?? '').trim();
    if (!orderId || !trackingNumber) {
      throw new Error('simulate requires orderKey (Firestore order id) and trackingNumber');
    }
    let householdId = String(body.householdId ?? '').trim();
    if (!householdId) {
      const resolved = await resolveHouseholdForShipment(db, { orderKey: orderId });
      householdId = resolved?.householdId ?? '';
    }
    if (!householdId) {
      throw new Error(
        'simulate: householdId required (or export index shipStationOrders/{orderKey} must exist)'
      );
    }
    await applyShipStationTracking(db, householdId, orderId, {
      trackingNumber,
      carrier: carrierLabelFromShipStation(body.carrierCode ?? 'usps'),
    });
    logger.info('ShipStation tracking simulated', { orderId, householdId, trackingNumber });
    return { processed: 1, skipped: 0, simulated: true };
  }

  const resourceType = String(body.resource_type ?? '');
  if (resourceType !== 'SHIP_NOTIFY' && resourceType !== 'ITEM_SHIP_NOTIFY') {
    logger.info('ShipStation webhook ignored (unsupported type)', { resourceType });
    return { processed: 0, skipped: 0 };
  }

  const rawUrl = String(body.resource_url ?? '').trim();
  if (!rawUrl) {
    throw new Error('Missing resource_url');
  }
  const resourceUrl = assertSafeShipStationResourceUrl(rawUrl);
  const auth = shipStationAuthHeader();
  if (!auth) {
    throw new Error('ShipStation API keys not configured');
  }

  const res = await fetch(resourceUrl.toString(), {
    headers: { Authorization: auth },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ShipStation shipments fetch ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { shipments?: ShipStationShipment[] };
  const shipments = Array.isArray(data.shipments) ? data.shipments : [];
  let processed = 0;
  let skipped = 0;

  for (const shipment of shipments) {
    if (shipment.voided) {
      skipped += 1;
      continue;
    }
    const trackingNumber = String(shipment.trackingNumber ?? '').trim();
    if (!trackingNumber) {
      skipped += 1;
      continue;
    }

    const resolved = await resolveHouseholdForShipment(db, shipment);
    if (!resolved) {
      logger.warn('ShipStation tracking: could not resolve Grapejuice order', {
        orderKey: shipment.orderKey,
        orderNumber: shipment.orderNumber,
        shipStationOrderId: shipment.orderId,
      });
      skipped += 1;
      continue;
    }

    try {
      await applyShipStationTracking(db, resolved.householdId, resolved.orderId, {
        trackingNumber,
        carrier: carrierLabelFromShipStation(shipment.carrierCode),
        shippedAt: shipment.shipDate
          ? new Date(shipment.shipDate).toISOString()
          : new Date().toISOString(),
      });
      processed += 1;
      logger.info('ShipStation tracking applied', {
        orderId: resolved.orderId,
        householdId: resolved.householdId,
        trackingNumber,
      });
    } catch (err) {
      logger.error('ShipStation tracking apply failed', {
        orderId: resolved.orderId,
        householdId: resolved.householdId,
        err,
      });
      skipped += 1;
    }
  }

  return { processed, skipped };
}

/** True when request carries the shared webhook secret (if configured). */
export function verifyShipStationWebhookSecret(req: {
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
}): boolean {
  const expected = (process.env.SHIPSTATION_WEBHOOK_SECRET ?? '').trim();
  if (!expected) {
    logger.warn('SHIPSTATION_WEBHOOK_SECRET unset — accepting webhook without shared secret');
    return true;
  }
  const q = req.query ?? {};
  const h = req.headers ?? {};
  const provided = String(
    q.key ?? q.secret ?? h['x-gj-shipstation-secret'] ?? h['x-shipstation-secret'] ?? ''
  ).trim();
  return provided.length > 0 && provided === expected;
}
