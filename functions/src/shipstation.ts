import * as logger from 'firebase-functions/logger';
import type { Firestore } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { sendEmail } from './email';

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

/** Manual "Mark as Shipped" writes a fulfillment, not a shipment. */
type ShipStationFulfillment = {
  fulfillmentId?: number;
  orderId?: number;
  orderNumber?: string;
  trackingNumber?: string;
  carrierCode?: string;
  voided?: boolean;
  shipDate?: string;
};

const SHIP_NOTIFY_TYPES = new Set(['SHIP_NOTIFY', 'ITEM_SHIP_NOTIFY', 'FULFILLMENT_SHIPPED']);

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

/** Catalog weight is free text ("1.2 lb", "8 oz", "1 lb 4 oz"). Returns ounces, or null if it can't be parsed. */
export function parseCatalogWeightOunces(raw: unknown): number | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const text = raw.toLowerCase().replace(/,/g, ' ');
  let ounces = 0;
  let matched = false;
  const lb = text.match(/(\d+(?:\.\d+)?)\s*(lb|lbs|pound|pounds)\b/);
  const oz = text.match(/(\d+(?:\.\d+)?)\s*(oz|ounce|ounces)\b/);
  if (lb) {
    ounces += parseFloat(lb[1]) * 16;
    matched = true;
  }
  if (oz) {
    ounces += parseFloat(oz[1]);
    matched = true;
  }
  if (!matched || !Number.isFinite(ounces) || ounces <= 0) return null;
  return Math.round(ounces * 100) / 100;
}

type FulfillmentItemMeta = { sku?: string; weightOz?: number };

async function resolveFulfillmentMeta(
  lineItems: Array<{ itemId?: string }>
): Promise<Map<string, FulfillmentItemMeta>> {
  const db = getFirestore();
  const ids = [
    ...new Set(
      lineItems
        .map((li) => (typeof li.itemId === 'string' ? li.itemId.trim() : ''))
        .filter(Boolean)
    ),
  ];
  const out = new Map<string, FulfillmentItemMeta>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const snap = await db.doc(`catalog/hanukkah/items/${id}`).get();
        const data = snap.data() ?? {};
        const sku = typeof data.sku === 'string' && data.sku.trim() ? data.sku.trim() : undefined;
        const weightOz = parseCatalogWeightOunces(data.weight);
        if (sku || weightOz) out.set(id, { sku, ...(weightOz ? { weightOz } : {}) });
      } catch (err) {
        logger.warn('ShipStation catalog lookup failed', { itemId: id, err });
      }
    })
  );
  return out;
}

/** ShipStation order export — no-op when keys missing. */
export async function exportOrderToShipStation(order: {
  orderId: string;
  householdId: string;
  shippingAddress: Record<string, unknown>;
  lineItems: Array<{ label?: string; itemId?: string; quantity?: number; unitCents?: number }>;
  totalCents: number;
  expeditedShipping?: boolean;
  /** Receipt address when the shipping address has no email (guest à la carte). */
  customerEmail?: string;
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

  const metaByItemId = await resolveFulfillmentMeta(order.lineItems);
  let weightOz = 0;
  let weightedLines = 0;
  const items = order.lineItems.map((li, i) => {
    const itemId = li.itemId?.trim() || '';
    const meta = itemId ? metaByItemId.get(itemId) : undefined;
    const sku = meta?.sku || itemId || `pilot-${i}`;
    const quantity = li.quantity ?? 1;
    const lineWeight = meta?.weightOz ? Math.round(meta.weightOz * quantity * 100) / 100 : undefined;
    if (lineWeight) {
      weightOz += lineWeight;
      weightedLines += 1;
    }
    return {
      lineItemKey: itemId || `line-${i}`,
      sku,
      name: li.label ?? itemId ?? 'Hanukkah box item',
      quantity,
      unitPrice: ((li.unitCents ?? 0) / 100).toFixed(2),
      // Estimate only. ShipStation still lets ops overwrite weight when they buy the label.
      ...(lineWeight ? { weight: { value: lineWeight, units: 'ounces' } } : {}),
    };
  });

  const orderNumber = `GJ-${order.householdId.slice(0, 6)}-${order.orderId.slice(0, 8)}`;
  const payload = {
    orderNumber,
    // Firestore order id — webhook uses this (+ shipStationOrders index / SS customerUsername).
    orderKey: order.orderId,
    orderDate: new Date().toISOString(),
    orderStatus: 'awaiting_shipment',
    customerUsername: order.householdId,
    customerEmail:
      order.customerEmail?.trim() || String(order.shippingAddress.email ?? ''),
    billTo: shipTo,
    shipTo,
    items: items.length
      ? items
      : [{ sku: 'hanukkah-pilot-box', name: 'Hanukkah pilot box', quantity: 1, unitPrice: '50.00' }],
    amountPaid: (order.totalCents / 100).toFixed(2),
    shippingAmount: 0,
    ...(items.length > 0 && weightedLines === items.length && weightOz > 0
      ? { weight: { value: Math.round(weightOz * 100) / 100, units: 'ounces' } }
      : {}),
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

function trackingUrlFor(carrier: string, trackingNumber: string): string {
  const encoded = encodeURIComponent(trackingNumber);
  const c = carrier.toLowerCase();
  if (c.includes('ups')) return `https://www.ups.com/track?tracknum=${encoded}`;
  if (c.includes('fedex')) return `https://www.fedex.com/fedextrack/?trknbr=${encoded}`;
  if (c.includes('dhl')) return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encoded}`;
  if (c.includes('usps') || c.includes('postal')) {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encoded}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(`${trackingNumber} tracking`)}`;
}

function shippedEmailTemplate(order: Record<string, unknown>): 'box-shipped' | 'order-shipped' {
  if (order.orderType === 'marketplace' || order.orderType === 'received_gift') return 'order-shipped';
  return 'box-shipped';
}

/** One email per order. Safe to call again after a webhook retry. */
async function sendShippedEmail(
  db: Firestore,
  householdId: string,
  orderId: string
): Promise<void> {
  const ref = db.doc(`households/${householdId}/orders/${orderId}`);
  const snap = await ref.get();
  const order = snap.data();
  if (!order || order.shippedEmailSentAt) return;

  const trackingNumber = String(order.trackingNumber ?? '').trim();
  if (!trackingNumber) return;

  const userId = typeof order.userId === 'string' ? order.userId : '';
  let to = '';
  if (userId) {
    const userSnap = await db.doc(`users/${userId}`).get();
    to = String(userSnap.data()?.email ?? '').trim();
  }
  if (!to) {
    const address = order.shippingAddress as { email?: string } | undefined;
    to = String(address?.email ?? '').trim();
  }
  if (!to.includes('@')) {
    logger.warn('Shipped email skipped (no recipient)', { orderId, householdId });
    return;
  }

  const carrier = String(order.carrier ?? 'USPS');
  const template = shippedEmailTemplate(order);
  try {
    await sendEmail({
      to,
      template,
      data: {
        orderId,
        carrier,
        trackingNumber,
        trackingUrl: trackingUrlFor(carrier, trackingNumber),
      },
    });
    await ref.update({ shippedEmailSentAt: new Date().toISOString() });
    logger.info('Shipped email sent', { orderId, householdId, template });
  } catch (err) {
    logger.error('Shipped email failed', { orderId, householdId, template, err });
  }
}

/** Write tracking from ShipStation webhook or manual ops update, then email once. */
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
  const unchanged =
    existing.trackingNumber === tracking.trackingNumber && existing.status === 'shipped';
  if (!unchanged) {
    await ref.update({
      trackingNumber: tracking.trackingNumber,
      carrier: tracking.carrier ?? 'USPS',
      status: 'shipped',
      shippedAt: tracking.shippedAt ?? new Date().toISOString(),
    });
  }
  await sendShippedEmail(db, householdId, orderId);
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

/** Mark as Shipped has no orderKey. orderKey and householdId live on the ShipStation order. */
async function resolveHouseholdForFulfillment(
  db: Firestore,
  fulfillment: ShipStationFulfillment
): Promise<{ householdId: string; orderId: string } | null> {
  if (fulfillment.orderId == null) return null;
  const ssOrder = await fetchShipStationOrder(fulfillment.orderId);
  const orderId = String(ssOrder?.orderKey ?? '').trim();
  const householdId = String(ssOrder?.customerUsername ?? '').trim();
  if (!orderId || !householdId) return null;
  try {
    await writeShipStationIndex({
      householdId,
      orderId,
      orderNumber: String(fulfillment.orderNumber ?? ''),
      shipStationOrderId: String(fulfillment.orderId),
    });
  } catch {
    /* non-fatal */
  }
  return { householdId, orderId };
}

/**
 * Process ShipStation SHIP_NOTIFY / ITEM_SHIP_NOTIFY / FULFILLMENT_SHIPPED.
 * Payload is only `{ resource_url, resource_type }` — we GET that URL next.
 * A label is a shipment. Manual Mark as Shipped is a fulfillment (FULFILLMENT_SHIPPED).
 *
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
  if (!SHIP_NOTIFY_TYPES.has(resourceType)) {
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

  const data = (await res.json()) as {
    shipments?: ShipStationShipment[];
    fulfillments?: ShipStationFulfillment[];
  };
  const shipments = Array.isArray(data.shipments) ? data.shipments : [];
  const fulfillments = Array.isArray(data.fulfillments) ? data.fulfillments : [];
  let processed = 0;
  let skipped = 0;

  for (const shipment of shipments) {
    const outcome = await applyTrackingEvent(db, shipment, 'shipment');
    if (outcome === 'processed') processed += 1;
    else skipped += 1;
  }
  for (const fulfillment of fulfillments) {
    const outcome = await applyTrackingEvent(db, fulfillment, 'fulfillment');
    if (outcome === 'processed') processed += 1;
    else skipped += 1;
  }

  if (shipments.length === 0 && fulfillments.length === 0) {
    logger.info('ShipStation webhook had no shipments or fulfillments', {
      resourceType,
      resourceUrl: resourceUrl.toString(),
    });
  }

  return { processed, skipped };
}

async function applyTrackingEvent(
  db: Firestore,
  event: ShipStationShipment | ShipStationFulfillment,
  kind: 'shipment' | 'fulfillment'
): Promise<'processed' | 'skipped'> {
  if (event.voided) return 'skipped';
  const trackingNumber = String(event.trackingNumber ?? '').trim();
  if (!trackingNumber) return 'skipped';

  const resolved =
    kind === 'shipment' && 'orderKey' in event && String((event as ShipStationShipment).orderKey ?? '').trim()
      ? await resolveHouseholdForShipment(db, event as ShipStationShipment)
      : await resolveHouseholdForFulfillment(db, event);

  if (!resolved) {
    logger.warn('ShipStation tracking: could not resolve Grapejuice order', {
      kind,
      orderKey: 'orderKey' in event ? (event as ShipStationShipment).orderKey : undefined,
      orderNumber: event.orderNumber,
      shipStationOrderId: event.orderId,
    });
    return 'skipped';
  }

  try {
    await applyShipStationTracking(db, resolved.householdId, resolved.orderId, {
      trackingNumber,
      carrier: carrierLabelFromShipStation(event.carrierCode),
      shippedAt: event.shipDate ? new Date(event.shipDate).toISOString() : new Date().toISOString(),
    });
    logger.info('ShipStation tracking applied', {
      kind,
      orderId: resolved.orderId,
      householdId: resolved.householdId,
      trackingNumber,
    });
    return 'processed';
  } catch (err) {
    logger.error('ShipStation tracking apply failed', {
      kind,
      orderId: resolved.orderId,
      householdId: resolved.householdId,
      err,
    });
    return 'skipped';
  }
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
