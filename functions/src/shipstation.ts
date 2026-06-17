import * as logger from 'firebase-functions/logger';

type ShipStationAddress = {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

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

/** ShipStation order export — no-op when keys missing. */
export async function exportOrderToShipStation(order: {
  orderId: string;
  householdId: string;
  shippingAddress: Record<string, unknown>;
  lineItems: Array<{ label?: string; itemId?: string; quantity?: number; unitCents?: number }>;
  totalCents: number;
  expeditedShipping?: boolean;
}): Promise<{ exported: boolean; externalId?: string }> {
  const apiKey = process.env.SHIPSTATION_API_KEY ?? '';
  const apiSecret = process.env.SHIPSTATION_API_SECRET ?? '';
  if (!apiKey || !apiSecret) {
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

  const payload = {
    orderNumber: `GJ-${order.householdId.slice(0, 6)}-${order.orderId.slice(0, 8)}`,
    orderKey: order.orderId,
    orderDate: new Date().toISOString(),
    orderStatus: 'awaiting_shipment',
    customerUsername: order.householdId,
    customerEmail: String(order.shippingAddress.email ?? ''),
    billTo: shipTo,
    shipTo,
    items: items.length ? items : [{ sku: 'hanukkah-pilot-box', name: 'Hanukkah pilot box', quantity: 1, unitPrice: '50.00' }],
    amountPaid: (order.totalCents / 100).toFixed(2),
    shippingAmount: 0,
    advancedOptions: order.expeditedShipping ? { customField1: 'expedited' } : undefined,
  };

  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const res = await fetch('https://ssapi.shipstation.com/orders/createorder', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ShipStation ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { orderId?: number };
  logger.info('ShipStation order created', { orderId: order.orderId, shipStationOrderId: data.orderId });
  return { exported: true, externalId: data.orderId != null ? String(data.orderId) : order.orderId };
}

/** Write tracking from ShipStation webhook or manual ops update. */
export async function applyShipStationTracking(
  db: FirebaseFirestore.Firestore,
  householdId: string,
  orderId: string,
  tracking: { trackingNumber: string; carrier?: string }
): Promise<void> {
  const ref = db.doc(`households/${householdId}/orders/${orderId}`);
  await ref.update({
    trackingNumber: tracking.trackingNumber,
    carrier: tracking.carrier ?? 'USPS',
    status: 'shipped',
    shippedAt: new Date().toISOString(),
  });
}
