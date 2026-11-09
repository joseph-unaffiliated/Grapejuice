"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processBoxAdjustment = void 0;
exports.adjustmentBlocker = adjustmentBlocker;
exports.boxAdjustmentTotals = boxAdjustmentTotals;
exports.quoteBoxAdjustment = quoteBoxAdjustment;
/**
 * One-off changes to a Hanukkah box that has already been charged: new lines, new totals, and a
 * second charge on the saved card for the difference.
 *
 * Ops request one by writing `boxAdjustments/{id}` (server-only; see scripts/box-adjustment.mjs):
 *   { householdId, orderId, lineItems, reason, mode: 'quote' | 'charge', expectedDifferenceCents?, oversellItemIds? }
 * `quote` only prices and checks stock. `charge` re-quotes and refuses unless the difference still
 * equals `expectedDifferenceCents`, so a customer is never billed for anything but the quote they
 * agreed to. Items in `oversellItemIds` may go past stock (ops has promised them anyway); the quote
 * lists them under `oversold` instead of blocking. On success the order, the draft, ShipStation and stock holds all move to the new lines.
 */
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const logger = require("./logger");
const sentry_1 = require("./sentry");
const stripe_1 = require("./stripe");
const shipstation_1 = require("./shipstation");
const catalogInventory_1 = require("./catalogInventory");
const chargePilotBox_1 = require("./chargePilotBox");
const cents = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
/** Why an order can't take an adjustment, or null. Only paid boxes that haven't shipped qualify. */
function adjustmentBlocker(order) {
    var _a;
    if (!order)
        return 'Order not found';
    if (!(0, chargePilotBox_1.isHanukkahBoxOrder)(order))
        return 'Not a Hanukkah box order';
    if (order.status !== 'confirmed')
        return `Order is ${(_a = order.status) !== null && _a !== void 0 ? _a : 'unknown'}, not confirmed`;
    if (order.shippedAt || order.trackingNumber)
        return 'Order has already shipped';
    if (typeof order.boxPriceCents !== 'number')
        return 'Order has no box price';
    return null;
}
/**
 * Totals for the new lines at the order's own box price, credit and promo, so the only change is
 * what the lines add. `differenceCents` is what's left to charge (negative means a refund is owed).
 */
function boxAdjustmentTotals(order, lineItems) {
    var _a;
    const totals = (0, chargePilotBox_1.computeCommittedBoxTotals)(lineItems, cents(order.boxPriceCents), order.expeditedShipping === true, cents(order.giftCreditAppliedCents), cents(order.platformCreditAppliedCents), (_a = order.promo) !== null && _a !== void 0 ? _a : null);
    const previousTotalCents = cents(order.totalCents);
    return {
        lineItems,
        previousTotalCents,
        subtotalCents: totals.subtotalCents,
        shippingCents: totals.shippingCents,
        discountCents: totals.discountCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        differenceCents: totals.totalCents - previousTotalCents,
    };
}
function normalizeLines(raw) {
    if (!Array.isArray(raw) || !raw.length)
        throw new Error('lineItems must be a non-empty array');
    return raw.map((r, i) => {
        var _a, _b, _c, _d;
        const li = (r !== null && r !== void 0 ? r : {});
        const slotId = String((_a = li.slotId) !== null && _a !== void 0 ? _a : '').trim();
        const itemId = String((_b = li.itemId) !== null && _b !== void 0 ? _b : '').trim();
        const quantity = Math.floor(Number((_c = li.quantity) !== null && _c !== void 0 ? _c : 1));
        const unitCents = Math.round(Number((_d = li.unitCents) !== null && _d !== void 0 ? _d : 0));
        if (!slotId || !itemId)
            throw new Error(`Line ${i + 1} needs slotId and itemId`);
        if (!(quantity > 0) || !(unitCents >= 0))
            throw new Error(`Line ${i + 1} has a bad quantity or price`);
        return Object.assign(Object.assign(Object.assign({ slotId,
            itemId,
            quantity,
            unitCents }, (typeof li.label === 'string' && li.label ? { label: li.label } : {})), (typeof li.childId === 'string' && li.childId ? { childId: li.childId } : {})), (typeof li.includedQty === 'number' ? { includedQty: li.includedQty } : {}));
    });
}
/** Labels from the catalog, plus a stock problem for each item the new lines can't have. */
async function checkLines(db, lines, orderLines, oversellIds) {
    var _a, _b;
    const problems = [];
    const oversold = [];
    const ids = [...new Set(lines.map((l) => l.itemId))];
    const names = new Map();
    for (const id of ids) {
        const snap = await db.doc(`catalog/hanukkah/items/${id}`).get();
        if (!snap.exists) {
            problems.push(`Unknown product: ${id}`);
            continue;
        }
        names.set(id, String((_b = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : id));
        try {
            await (0, catalogInventory_1.assertBoxLinesWithinInventory)(db, lines.filter((l) => l.itemId === id), { creditLines: orderLines.filter((l) => l.itemId === id) });
        }
        catch (err) {
            const message = err instanceof https_1.HttpsError ? err.message : String(err);
            (oversellIds.has(id) ? oversold : problems).push(message);
        }
    }
    return {
        lines: lines.map((l) => { var _a, _b; return (Object.assign(Object.assign({}, l), { label: (_b = (_a = l.label) !== null && _a !== void 0 ? _a : names.get(l.itemId)) !== null && _b !== void 0 ? _b : l.itemId })); }),
        problems,
        oversold,
    };
}
async function quoteBoxAdjustment(db, householdId, orderId, rawLines, oversellItemIds = []) {
    var _a;
    const order = (await db.doc(`households/${householdId}/orders/${orderId}`).get()).data();
    const blocker = adjustmentBlocker(order);
    if (blocker)
        throw new Error(blocker);
    const orderLines = (_a = order.lineItems) !== null && _a !== void 0 ? _a : [];
    const oversellIds = new Set(Array.isArray(oversellItemIds) ? oversellItemIds.map(String) : []);
    const { lines, problems, oversold } = await checkLines(db, normalizeLines(rawLines), orderLines, oversellIds);
    const totals = boxAdjustmentTotals(order, lines);
    if (totals.differenceCents < 0)
        problems.push('The new box costs less than what was charged; refunds are not handled here');
    return Object.assign(Object.assign({}, totals), { problems, oversold });
}
async function chargeBoxAdjustment(db, adjustmentId, req) {
    var _a, _b, _c, _d;
    const householdId = String(req.householdId);
    const orderId = String(req.orderId);
    const quote = await quoteBoxAdjustment(db, householdId, orderId, req.lineItems, req.oversellItemIds);
    if (quote.problems.length)
        return { status: 'rejected', reason: 'Quote has problems', quote };
    if (quote.differenceCents <= 0)
        return { status: 'rejected', reason: 'Nothing to charge', quote };
    if (quote.differenceCents !== Math.round(Number(req.expectedDifferenceCents))) {
        return { status: 'rejected', reason: 'Difference no longer matches the agreed quote', quote };
    }
    if (!stripe_1.stripe)
        return { status: 'failed', reason: 'Stripe is not configured', quote };
    const hh = (_a = (await db.doc(`households/${householdId}`).get()).data()) !== null && _a !== void 0 ? _a : {};
    const customer = typeof hh.stripeCustomerId === 'string' ? hh.stripeCustomerId : '';
    const paymentMethod = typeof hh.stripeDefaultPaymentMethodId === 'string' ? hh.stripeDefaultPaymentMethodId : '';
    if (!customer || !paymentMethod)
        return { status: 'failed', reason: 'No saved payment method on file', quote };
    let paymentIntentId = '';
    try {
        const pi = await stripe_1.stripe.paymentIntents.create({
            amount: quote.differenceCents,
            currency: 'usd',
            customer,
            payment_method: paymentMethod,
            confirm: true,
            off_session: true,
            description: 'Hanukkah box: items added after lock',
            // No `orderId` key: the webhook's box handling must not treat this as the box charge.
            metadata: { type: 'hanukkah_box_adjustment', householdId, adjustedOrderId: orderId, adjustmentId },
        }, { idempotencyKey: `box-adjustment-${adjustmentId}` });
        paymentIntentId = pi.id;
        if (pi.status !== 'succeeded') {
            return { status: 'failed', reason: `PaymentIntent status: ${pi.status}`, paymentIntentId, quote };
        }
    }
    catch (err) {
        return { status: 'failed', reason: err instanceof Error ? err.message : 'Charge failed', quote };
    }
    const now = new Date().toISOString();
    const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
    await orderRef.update({
        lineItems: quote.lineItems,
        subtotalCents: quote.subtotalCents,
        shippingCents: quote.shippingCents,
        discountCents: quote.discountCents,
        taxCents: quote.taxCents,
        totalCents: quote.totalCents,
        updatedAt: now,
        adjustments: firestore_2.FieldValue.arrayUnion({
            id: adjustmentId,
            at: now,
            reason: String((_b = req.reason) !== null && _b !== void 0 ? _b : ''),
            paymentIntentId,
            amountCents: quote.differenceCents,
            previousTotalCents: quote.previousTotalCents,
            newTotalCents: quote.totalCents,
        }),
    });
    await db.doc(`households/${householdId}/boxDrafts/${catalogInventory_1.HOLIDAY_ID}`).set({ lineItems: quote.lineItems, updatedAt: now, lastChangeSource: 'admin-adjustment' }, { merge: true });
    const after = { status: 'charged', paymentIntentId, quote, chargedAt: now };
    try {
        const order = (_c = (await orderRef.get()).data()) !== null && _c !== void 0 ? _c : {};
        const exported = await (0, shipstation_1.exportOrderToShipStation)({
            orderId,
            householdId,
            shippingAddress: (_d = order.shippingAddress) !== null && _d !== void 0 ? _d : {},
            lineItems: quote.lineItems,
            totalCents: quote.totalCents,
            expeditedShipping: order.expeditedShipping === true,
        });
        await orderRef.update(Object.assign({ shipStationExportedAt: new Date().toISOString() }, (exported.externalId ? { shipStationOrderId: exported.externalId } : {})));
        after.shipStation = exported.exported ? 'updated' : 'skipped';
    }
    catch (err) {
        logger.error('boxAdjustment: ShipStation update failed', { adjustmentId, orderId, err });
        after.shipStation = `failed: ${err instanceof Error ? err.message : String(err)}`;
    }
    try {
        await (0, catalogInventory_1.recomputeBoxAllocations)(db);
    }
    catch (err) {
        logger.error('boxAdjustment: recomputeBoxAllocations failed', { adjustmentId, err });
    }
    return after;
}
exports.processBoxAdjustment = (0, firestore_1.onDocumentCreated)({ document: 'boxAdjustments/{adjustmentId}', memory: '256MiB', timeoutSeconds: 120 }, (0, sentry_1.withSentry)(async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const db = (0, firestore_2.getFirestore)();
    const ref = snap.ref;
    const claimed = await db.runTransaction(async (tx) => {
        var _a;
        const fresh = await tx.get(ref);
        if (((_a = fresh.data()) === null || _a === void 0 ? void 0 : _a.status) !== 'requested')
            return null;
        tx.update(ref, { status: 'processing', startedAt: new Date().toISOString() });
        return fresh.data();
    });
    if (!claimed)
        return;
    let outcome;
    try {
        if (claimed.mode === 'quote') {
            outcome = {
                status: 'quoted',
                quote: await quoteBoxAdjustment(db, String(claimed.householdId), String(claimed.orderId), claimed.lineItems, claimed.oversellItemIds),
            };
        }
        else if (claimed.mode === 'charge') {
            outcome = await chargeBoxAdjustment(db, event.params.adjustmentId, claimed);
        }
        else {
            outcome = { status: 'rejected', reason: `Unknown mode: ${String(claimed.mode)}` };
        }
    }
    catch (err) {
        outcome = { status: 'failed', reason: err instanceof Error ? err.message : String(err) };
    }
    logger.info('processBoxAdjustment', { adjustmentId: event.params.adjustmentId, status: outcome.status });
    await ref.update(Object.assign(Object.assign({}, outcome), { processedAt: new Date().toISOString() }));
}));
//# sourceMappingURL=boxAdjustment.js.map