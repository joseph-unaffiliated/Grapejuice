"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelPilotBoxOrder = exports.updatePilotBoxOrder = exports.commitPilotBox = exports.createPilotSetupIntent = exports.claimMarketplaceCheckoutSignIn = exports.payMarketplaceOrderWithSavedCard = exports.getSavedCardSummary = exports.createMarketplaceCheckout = exports.createPilotCheckout = exports.getAdminBoxesDashboard = exports.sendPilotJoinedEmail = exports.healPilotDraftLines = exports.getPilotInvite = exports.enrollPilot = exports.adminPilotParticipants = exports.scheduledInventoryEmails = exports.decideBoxAuditProblem = exports.scheduledBoxAudit = exports.recordGuestBoxHistory = exports.recordBoxDraftHistory = exports.scheduledInventoryWatch = exports.scheduledFollowUpListAudience = exports.getMyInfluencerStats = exports.checkPromo = exports.awardDebriefCredit = exports.adminPromotions = exports.unaffiliatedVisit = exports.retentionLead = exports.validateShippingAddress = exports.redeemLoginCode = exports.requestLoginCode = exports.redeemLoginLink = exports.requestLoginLink = exports.signInGiftGiver = exports.revealBoxWithEmail = exports.resumePilotGiftPayment = exports.cancelPilotGift = exports.restorePilotBoxOrder = exports.recordGiftStep = exports.scheduledPurgeGuestSessions = exports.deleteGuestDataByEmail = exports.resumeGuestSession = exports.noteVisitorRegion = exports.markGuestSessionConverted = exports.saveGuestSessionBeacon = exports.saveGuestSession = exports.sendWelcomeOnSignup = exports.scanBeamAgeTriggers = exports.curatePilotBox = exports.askPilotRav = void 0;
exports.requestBoxDiscountCode = exports.scheduledAirtableCatalogSync = exports.backfillCatalogThumbsHttp = exports.syncAirtableCatalog = exports.recomputeCatalogBoxAllocations = exports.scheduledReleaseStaleMarketplaceReservations = exports.scheduledChargePilotBoxes = exports.scheduledPilotAutoInvites = exports.scheduledSetupNudges = exports.scheduledGiftConfirmReminders = exports.scheduledLockReminders = exports.scheduledDebriefReminders = exports.sendDebriefReminders = exports.reopenReceivedGiftBox = exports.acceptReceivedGiftBox = exports.convertReceivedGiftToCredit = exports.createReceivedGiftCheckout = exports.updateReceivedGiftLineItems = exports.markReceivedGiftViewed = exports.listMyReceivedGifts = exports.claimGiftInvite = exports.peekGiftInvite = exports.listMyGiftInvites = exports.trackMetaEvent = exports.finalizePilotGiftPayment = exports.purchasePilotGift = exports.shipStationWebhook = exports.writeOrderTracking = exports.acceptPartnerInvite = exports.listPartnerInvites = exports.createPartnerInvite = exports.stripeWebhook = exports.chargePilotBoxOrder = void 0;
const logger = require("./logger");
const testAccounts_1 = require("./testAccounts");
const metaPracticeCutoff_1 = require("./metaPracticeCutoff");
const sentry_1 = require("./sentry");
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const stripe_1 = require("./stripe");
const email_1 = require("./email");
const rav_1 = require("./rav");
Object.defineProperty(exports, "askPilotRav", { enumerable: true, get: function () { return rav_1.askPilotRav; } });
Object.defineProperty(exports, "curatePilotBox", { enumerable: true, get: function () { return rav_1.curatePilotBox; } });
const beamAgeTrigger_1 = require("./beamAgeTrigger");
Object.defineProperty(exports, "scanBeamAgeTriggers", { enumerable: true, get: function () { return beamAgeTrigger_1.scanBeamAgeTriggers; } });
const shipstation_1 = require("./shipstation");
const giftPayment_1 = require("./giftPayment");
const debriefReminders_1 = require("./debriefReminders");
const lockReminders_1 = require("./lockReminders");
const setupNudge_1 = require("./setupNudge");
const untraditionalCio_1 = require("./untraditionalCio");
const unaffiliated_1 = require("./unaffiliated");
const airtableCatalogSync_1 = require("./airtableCatalogSync");
const catalogThumbs_1 = require("./catalogThumbs");
const chargePilotBox_1 = require("./chargePilotBox");
const catalogInventory_1 = require("./catalogInventory");
const metaCapi_1 = require("./metaCapi");
const crypto_1 = require("crypto");
const adminDashboard_1 = require("./adminDashboard");
const checkoutSession_1 = require("./checkoutSession");
const usAddress_1 = require("./usAddress");
const promotions_1 = require("./promotions");
const pilotParticipants_1 = require("./pilotParticipants");
const promoPricing_1 = require("./promoPricing");
var welcome_1 = require("./welcome");
Object.defineProperty(exports, "sendWelcomeOnSignup", { enumerable: true, get: function () { return welcome_1.sendWelcomeOnSignup; } });
var guestSessions_1 = require("./guestSessions");
Object.defineProperty(exports, "saveGuestSession", { enumerable: true, get: function () { return guestSessions_1.saveGuestSession; } });
Object.defineProperty(exports, "saveGuestSessionBeacon", { enumerable: true, get: function () { return guestSessions_1.saveGuestSessionBeacon; } });
Object.defineProperty(exports, "markGuestSessionConverted", { enumerable: true, get: function () { return guestSessions_1.markGuestSessionConverted; } });
Object.defineProperty(exports, "noteVisitorRegion", { enumerable: true, get: function () { return guestSessions_1.noteVisitorRegion; } });
Object.defineProperty(exports, "resumeGuestSession", { enumerable: true, get: function () { return guestSessions_1.resumeGuestSession; } });
Object.defineProperty(exports, "deleteGuestDataByEmail", { enumerable: true, get: function () { return guestSessions_1.deleteGuestDataByEmail; } });
Object.defineProperty(exports, "scheduledPurgeGuestSessions", { enumerable: true, get: function () { return guestSessions_1.scheduledPurgeGuestSessions; } });
var giftFunnel_1 = require("./giftFunnel");
Object.defineProperty(exports, "recordGiftStep", { enumerable: true, get: function () { return giftFunnel_1.recordGiftStep; } });
var orderRestore_1 = require("./orderRestore");
Object.defineProperty(exports, "restorePilotBoxOrder", { enumerable: true, get: function () { return orderRestore_1.restorePilotBoxOrder; } });
var pendingGift_1 = require("./pendingGift");
Object.defineProperty(exports, "cancelPilotGift", { enumerable: true, get: function () { return pendingGift_1.cancelPilotGift; } });
Object.defineProperty(exports, "resumePilotGiftPayment", { enumerable: true, get: function () { return pendingGift_1.resumePilotGiftPayment; } });
var loginLinks_1 = require("./loginLinks");
Object.defineProperty(exports, "revealBoxWithEmail", { enumerable: true, get: function () { return loginLinks_1.revealBoxWithEmail; } });
Object.defineProperty(exports, "signInGiftGiver", { enumerable: true, get: function () { return loginLinks_1.signInGiftGiver; } });
Object.defineProperty(exports, "requestLoginLink", { enumerable: true, get: function () { return loginLinks_1.requestLoginLink; } });
Object.defineProperty(exports, "redeemLoginLink", { enumerable: true, get: function () { return loginLinks_1.redeemLoginLink; } });
Object.defineProperty(exports, "requestLoginCode", { enumerable: true, get: function () { return loginLinks_1.requestLoginCode; } });
Object.defineProperty(exports, "redeemLoginCode", { enumerable: true, get: function () { return loginLinks_1.redeemLoginCode; } });
const loginLinks_2 = require("./loginLinks");
const guestSessions_2 = require("./guestSessions");
const checkoutAccount_1 = require("./checkoutAccount");
const orderEmails_1 = require("./orderEmails");
var addressValidation_1 = require("./addressValidation");
Object.defineProperty(exports, "validateShippingAddress", { enumerable: true, get: function () { return addressValidation_1.validateShippingAddress; } });
var retentionLead_1 = require("./retentionLead");
Object.defineProperty(exports, "retentionLead", { enumerable: true, get: function () { return retentionLead_1.retentionLead; } });
var unaffiliated_2 = require("./unaffiliated");
Object.defineProperty(exports, "unaffiliatedVisit", { enumerable: true, get: function () { return unaffiliated_2.unaffiliatedVisit; } });
var promotions_2 = require("./promotions");
Object.defineProperty(exports, "adminPromotions", { enumerable: true, get: function () { return promotions_2.adminPromotions; } });
Object.defineProperty(exports, "awardDebriefCredit", { enumerable: true, get: function () { return promotions_2.awardDebriefCredit; } });
Object.defineProperty(exports, "checkPromo", { enumerable: true, get: function () { return promotions_2.checkPromo; } });
Object.defineProperty(exports, "getMyInfluencerStats", { enumerable: true, get: function () { return promotions_2.getMyInfluencerStats; } });
var followUpListAudience_1 = require("./followUpListAudience");
Object.defineProperty(exports, "scheduledFollowUpListAudience", { enumerable: true, get: function () { return followUpListAudience_1.scheduledFollowUpListAudience; } });
var inventoryWatch_1 = require("./inventoryWatch");
Object.defineProperty(exports, "scheduledInventoryWatch", { enumerable: true, get: function () { return inventoryWatch_1.scheduledInventoryWatch; } });
var boxHistory_1 = require("./boxHistory");
Object.defineProperty(exports, "recordBoxDraftHistory", { enumerable: true, get: function () { return boxHistory_1.recordBoxDraftHistory; } });
Object.defineProperty(exports, "recordGuestBoxHistory", { enumerable: true, get: function () { return boxHistory_1.recordGuestBoxHistory; } });
var boxAuditJob_1 = require("./boxAuditJob");
Object.defineProperty(exports, "scheduledBoxAudit", { enumerable: true, get: function () { return boxAuditJob_1.scheduledBoxAudit; } });
var boxAuditDecisions_1 = require("./boxAuditDecisions");
Object.defineProperty(exports, "decideBoxAuditProblem", { enumerable: true, get: function () { return boxAuditDecisions_1.decideBoxAuditProblem; } });
var inventoryEmails_1 = require("./inventoryEmails");
Object.defineProperty(exports, "scheduledInventoryEmails", { enumerable: true, get: function () { return inventoryEmails_1.scheduledInventoryEmails; } });
var pilotParticipants_2 = require("./pilotParticipants");
Object.defineProperty(exports, "adminPilotParticipants", { enumerable: true, get: function () { return pilotParticipants_2.adminPilotParticipants; } });
Object.defineProperty(exports, "enrollPilot", { enumerable: true, get: function () { return pilotParticipants_2.enrollPilot; } });
Object.defineProperty(exports, "getPilotInvite", { enumerable: true, get: function () { return pilotParticipants_2.getPilotInvite; } });
Object.defineProperty(exports, "healPilotDraftLines", { enumerable: true, get: function () { return pilotParticipants_2.healPilotDraftLines; } });
Object.defineProperty(exports, "sendPilotJoinedEmail", { enumerable: true, get: function () { return pilotParticipants_2.sendPilotJoinedEmail; } });
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
exports.getAdminBoxesDashboard = (0, adminDashboard_1.createAdminBoxesDashboard)(db);
const HOLIDAY_ID = 'hanukkah-2026';
const DEFAULT_BOX_PRICE_CENTS = 8000;
const SHIPPING_FLAT_CENTS = 0;
const EXPEDITED_SHIPPING_CENTS = 1500;
const CHECKOUT_TAX_RATE = 0.075;
const DEFAULT_GIFT_CREDIT_CENTS = 8000;
function isValidEmail(raw) {
    const email = raw.trim();
    if (!email || email.length > 254)
        return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}
function chargeableLineTotal(lineItems) {
    return lineItems.reduce((s, li) => { var _a, _b; return s + ((_a = li.unitCents) !== null && _a !== void 0 ? _a : 0) * ((_b = li.quantity) !== null && _b !== void 0 ? _b : 1); }, 0);
}
/** Recipient owes only add-on value above what the giver already prepaid. */
function recipientGiftUpgradeCents(lineItems, prepaidAddOnCents) {
    return Math.max(0, chargeableLineTotal(lineItems) - Math.max(0, prepaidAddOnCents));
}
function orderTotalCents(lineItems, boxPriceCents = DEFAULT_BOX_PRICE_CENTS) {
    const hasIncluded = lineItems.some((li) => li.unitCents === 0 || li.slotId);
    const base = hasIncluded ? boxPriceCents : 0;
    const subtotal = base + chargeableLineTotal(lineItems);
    return subtotal + SHIPPING_FLAT_CENTS;
}
async function assertHouseholdMember(uid, householdId) {
    var _a, _b;
    const snap = await db.doc(`households/${householdId}`).get();
    if (!snap.exists)
        throw new sentry_1.HttpsError('not-found', 'Household not found.');
    const memberIds = (_b = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.memberIds) !== null && _b !== void 0 ? _b : [];
    if (!memberIds.includes(uid)) {
        throw new sentry_1.HttpsError('permission-denied', 'Not a member of this household.');
    }
    return snap;
}
async function getOrCreateStripeCustomer(householdId, uid, email) {
    var _a;
    const hhRef = db.doc(`households/${householdId}`);
    const hhSnap = await hhRef.get();
    const existing = (_a = hhSnap.data()) === null || _a === void 0 ? void 0 : _a.stripeCustomerId;
    if (existing)
        return existing;
    if (!stripe_1.stripe)
        throw new sentry_1.HttpsError('failed-precondition', 'Stripe is not configured.');
    const customer = await stripe_1.stripe.customers.create({
        email: email || undefined,
        metadata: { householdId, userId: uid },
    });
    await hhRef.update({
        stripeCustomerId: customer.id,
        updatedAt: new Date().toISOString(),
    });
    return customer.id;
}
async function getLockAt(expedited) {
    var _a, _b, _c;
    const snap = await db.doc('config/hanukkah-2026').get();
    const data = (_a = snap.data()) !== null && _a !== void 0 ? _a : {};
    if (expedited && data.expeditedLockAt) {
        return (_b = data.expeditedLockAt) !== null && _b !== void 0 ? _b : null;
    }
    return (_c = data.lockAt) !== null && _c !== void 0 ? _c : null;
}
function isLocked(lockAt) {
    if (!lockAt)
        return false;
    return Date.now() >= new Date(lockAt).getTime();
}
function metaUserWithAddress(base, address) {
    var _a, _b, _c, _d;
    if (!address)
        return base;
    return Object.assign(Object.assign({}, base), { name: (_a = address.name) !== null && _a !== void 0 ? _a : null, city: (_b = address.city) !== null && _b !== void 0 ? _b : null, state: (_c = address.stateProvince) !== null && _c !== void 0 ? _c : null, zip: (_d = address.postalCode) !== null && _d !== void 0 ? _d : null, country: address.country === 'US' || address.country === 'CA' ? address.country : null });
}
/** Purchase for a newly committed order (box or marketplace). `purchase_<orderId>` matches the browser. */
async function sendOrderPurchaseToMeta(input) {
    var _a, _b, _c, _d, _e;
    const { orderId, order } = input;
    const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];
    const contentIds = lineItems
        .map((li) => (typeof li.itemId === 'string' ? li.itemId : null))
        .filter((id) => !!id)
        .slice(0, 50);
    await (0, metaCapi_1.sendMetaEvent)({
        eventName: 'Purchase',
        eventId: `purchase_${orderId}`,
        context: input.context,
        user: metaUserWithAddress({
            email: (_b = (_a = input.email) !== null && _a !== void 0 ? _a : order.guestEmail) !== null && _b !== void 0 ? _b : null,
            phone: (_c = input.phone) !== null && _c !== void 0 ? _c : null,
            externalId: (_d = order.userId) !== null && _d !== void 0 ? _d : null,
        }, order.shippingAddress),
        customData: Object.assign(Object.assign({ value: Math.max(0, Number((_e = order.totalCents) !== null && _e !== void 0 ? _e : 0)) / 100, currency: 'USD', order_id: orderId, content_name: order.orderType === 'marketplace' ? 'Marketplace order' : 'Hanukkah box', content_type: 'product' }, (contentIds.length ? { content_ids: contentIds } : {})), { num_items: lineItems.length }),
        stripeBacked: true,
        playthrough: order.playthrough === true,
    });
}
async function emailForMeta(uid, fallback) {
    var _a, _b;
    if (fallback)
        return fallback;
    if (!uid)
        return null;
    const snap = await db.doc(`users/${uid}`).get();
    return (_b = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.email) !== null && _b !== void 0 ? _b : null;
}
const BOX_HELD_STATUSES = new Set(['committed', 'confirmed', 'shipped', 'delivered']);
/** À la carte orders from a household with a box charge at lock; everyone else pays at checkout. */
async function householdHasHanukkahBox(householdId) {
    const snap = await db.collection(`households/${householdId}/orders`).get();
    return snap.docs.some((d) => {
        var _a;
        const order = d.data();
        return (0, chargePilotBox_1.isHanukkahBoxOrder)(order) && BOX_HELD_STATUSES.has(String((_a = order.status) !== null && _a !== void 0 ? _a : ''));
    });
}
function lockHasPassed(lockAt) {
    if (!lockAt)
        return false;
    return Date.now() >= new Date(lockAt).getTime();
}
/** Firestore rejects undefined field values — strip them before writes. */
/**
 * Trim + U.S.-only enforcement. A complete address outside the 50 states / DC (or with a
 * non-U.S. postal code) is rejected; callers still report missing fields themselves.
 */
function sanitizeShippingAddress(raw) {
    var _a, _b, _c, _d, _e, _f, _g;
    const src = (raw !== null && raw !== void 0 ? raw : {});
    const cleaned = {
        name: String((_a = src.name) !== null && _a !== void 0 ? _a : '').trim(),
        line1: String((_b = src.line1) !== null && _b !== void 0 ? _b : '').trim(),
        city: String((_c = src.city) !== null && _c !== void 0 ? _c : '').trim(),
        stateProvince: String((_d = src.stateProvince) !== null && _d !== void 0 ? _d : '').trim(),
        postalCode: String((_e = src.postalCode) !== null && _e !== void 0 ? _e : '').trim(),
        country: 'US',
    };
    const line2 = String((_f = src.line2) !== null && _f !== void 0 ? _f : '').trim();
    if (line2)
        cleaned.line2 = line2;
    if (cleaned.line1 && cleaned.city && cleaned.stateProvince && cleaned.postalCode) {
        const format = (0, usAddress_1.checkUsAddressFormat)(Object.assign(Object.assign({}, cleaned), { country: (_g = src.country) !== null && _g !== void 0 ? _g : 'US' }));
        if (!format.ok)
            throw new sentry_1.HttpsError('invalid-argument', format.message);
        cleaned.stateProvince = format.stateCode;
        cleaned.postalCode = format.zip;
    }
    return cleaned;
}
function catalogCents(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return Math.max(0, Math.round(value));
    if (typeof value === 'string' && value.trim()) {
        const n = Number(value);
        if (Number.isFinite(n))
            return Math.max(0, Math.round(n));
    }
    return 0;
}
async function resolveMarketplaceLineItems(raw) {
    var _a, _b, _c, _d;
    if (!raw.length) {
        throw new sentry_1.HttpsError('invalid-argument', 'Cart is empty.');
    }
    const normalized = [];
    for (const li of raw) {
        const itemId = String((_a = li.itemId) !== null && _a !== void 0 ? _a : '').trim();
        if (!itemId) {
            throw new sentry_1.HttpsError('invalid-argument', 'Each line item needs an itemId.');
        }
        const snap = await db.doc(`catalog/hanukkah/items/${itemId}`).get();
        if (!snap.exists) {
            throw new sentry_1.HttpsError('invalid-argument', `Unknown product: ${itemId}`);
        }
        const cat = (_b = snap.data()) !== null && _b !== void 0 ? _b : {};
        const unitCents = catalogCents(cat.nonMemberPriceCents) ||
            catalogCents(cat.dollarCostCents) ||
            catalogCents(cat.memberPriceCents);
        if (unitCents <= 0) {
            throw new sentry_1.HttpsError('invalid-argument', `Product is not available à la carte: ${itemId}`);
        }
        normalized.push({
            slotId: String((_c = cat.slotId) !== null && _c !== void 0 ? _c : 'addon'),
            itemId,
            quantity: Math.max(1, Math.floor(Number(li.quantity) || 1)),
            unitCents,
            label: String((_d = cat.name) !== null && _d !== void 0 ? _d : itemId),
        });
    }
    return normalized;
}
/** Stock totals are a best-effort refresh; never fail the caller's write over them. */
async function recomputeBoxAllocationsLogged(context, extra = {}) {
    try {
        const alloc = await (0, catalogInventory_1.recomputeBoxAllocations)(db);
        logger.info(`${context} box allocations`, Object.assign(Object.assign({}, extra), alloc));
    }
    catch (allocErr) {
        logger.error(`${context} recomputeBoxAllocations failed`, Object.assign(Object.assign({}, extra), { allocErr }));
    }
}
async function fulfillMarketplaceOrder(householdId, orderId, order, skipShipStation) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
    const freshSnap = await orderRef.get();
    const fresh = (_a = freshSnap.data()) !== null && _a !== void 0 ? _a : order;
    if (fresh.marketplaceFulfilledAt)
        return;
    const userId = typeof fresh.userId === 'string' ? fresh.userId : '';
    let email = typeof fresh.guestEmail === 'string' ? fresh.guestEmail : '';
    if (userId) {
        const userSnap = await db.doc(`users/${userId}`).get();
        email = ((_b = userSnap.data()) === null || _b === void 0 ? void 0 : _b.email) || email;
    }
    if (email.includes('@') && !fresh.marketplaceEmailSentAt && (await (0, orderEmails_1.claimOrderEmail)(orderRef, 'marketplaceEmail'))) {
        const lines = fresh.giftSurprise
            ? [{ name: 'A surprise Hanukkah gift box', quantity: 1 }]
            : (0, orderEmails_1.orderEmailLines)((_c = fresh.lineItems) !== null && _c !== void 0 ? _c : order.lineItems);
        try {
            await (0, email_1.sendEmail)({
                to: email,
                template: (0, orderEmails_1.orderConfirmationTemplate)(fresh),
                data: {
                    orderId,
                    orderType: (_d = fresh.orderType) !== null && _d !== void 0 ? _d : 'marketplace',
                    totalCents: (_e = fresh.totalCents) !== null && _e !== void 0 ? _e : order.totalCents,
                    estimatedDelivery: (_f = fresh.estimatedDelivery) !== null && _f !== void 0 ? _f : order.estimatedDelivery,
                    items: lines,
                    itemSummary: (0, orderEmails_1.orderItemSummary)(lines),
                    itemCount: lines.reduce((sum, li) => sum + li.quantity, 0),
                    order_url: await (0, loginLinks_2.orderViewUrl)(db, { uid: userId, email, householdId, orderId }),
                },
            });
            await orderRef.update({ marketplaceEmailSentAt: new Date().toISOString() });
        }
        catch (emailErr) {
            await orderRef.update({ marketplaceEmailClaimedAt: firestore_1.FieldValue.delete() }).catch(() => undefined);
            logger.error('Marketplace order confirmation email failed', emailErr);
        }
    }
    if (skipShipStation === true || fresh.playthrough === true) {
        logger.info('ShipStation export skipped (visitor playthrough)', { orderId });
        await orderRef.update({ marketplaceFulfilledAt: new Date().toISOString() });
        return;
    }
    // Gift boxes and à la carte orders ship with the Hanukkah boxes: runExportHeldOrders sends them once lock passes.
    if (fresh.orderType === 'received_gift' || fresh.orderType === 'marketplace') {
        const lockAt = (_g = fresh.lockAt) !== null && _g !== void 0 ? _g : (await getLockAt());
        if (!lockHasPassed(lockAt))
            return;
    }
    if (fresh.shipStationExportedAt) {
        await orderRef.update({ marketplaceFulfilledAt: new Date().toISOString() });
        return;
    }
    try {
        await (0, shipstation_1.exportOrderToShipStation)({
            orderId,
            householdId,
            shippingAddress: (_h = fresh.shippingAddress) !== null && _h !== void 0 ? _h : {},
            lineItems: (_j = fresh.lineItems) !== null && _j !== void 0 ? _j : [],
            totalCents: (_k = fresh.totalCents) !== null && _k !== void 0 ? _k : 0,
            customerEmail: email.includes('@') ? email : undefined,
        });
        await orderRef.update({ marketplaceFulfilledAt: new Date().toISOString() });
    }
    catch (shipErr) {
        logger.error('Marketplace ShipStation export failed', shipErr);
    }
}
/** Charge one committed à la carte order once lock has passed. Card was saved at checkout. */
async function chargeSingleMarketplaceOrder(householdId, orderId, order) {
    var _a, _b;
    const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
    if (!lockHasPassed(order.lockAt))
        return;
    if (order.status !== 'committed')
        return;
    const totalCents = typeof order.totalCents === 'number' ? order.totalCents : 0;
    if (totalCents === 0) {
        await confirmMarketplaceCharge(householdId, orderId, orderRef, order, null);
        return;
    }
    const hhSnap = await db.doc(`households/${householdId}`).get();
    const hh = (_a = hhSnap.data()) !== null && _a !== void 0 ? _a : {};
    const customerId = typeof hh.stripeCustomerId === 'string' ? hh.stripeCustomerId : '';
    const paymentMethodId = typeof hh.stripeDefaultPaymentMethodId === 'string' ? hh.stripeDefaultPaymentMethodId : '';
    const priorAttempts = typeof order.chargeAttemptCount === 'number' ? Math.max(0, Math.floor(order.chargeAttemptCount)) : 0;
    const chargeAttempt = priorAttempts + 1;
    await orderRef.update({
        chargeAttemptedAt: new Date().toISOString(),
        chargeAttemptCount: chargeAttempt,
    });
    if (!stripe_1.stripe || !customerId || !paymentMethodId) {
        await orderRef.update({
            chargeFailedAt: new Date().toISOString(),
            chargeFailureMessage: !stripe_1.stripe ? 'Stripe is not configured' : 'No saved payment method on file',
        });
        return;
    }
    try {
        const paymentIntent = await stripe_1.stripe.paymentIntents.create({
            amount: totalCents,
            currency: 'usd',
            customer: customerId,
            payment_method: paymentMethodId,
            confirm: true,
            off_session: true,
            metadata: {
                householdId,
                orderId,
                userId: String((_b = order.userId) !== null && _b !== void 0 ? _b : ''),
                type: 'marketplace',
                chargeAttempt: String(chargeAttempt),
            },
        }, { idempotencyKey: `charge-marketplace-${orderId}-attempt-${chargeAttempt}` });
        if (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing') {
            await confirmMarketplaceCharge(householdId, orderId, orderRef, order, paymentIntent.id);
            return;
        }
        await orderRef.update({
            stripePaymentIntentId: paymentIntent.id,
            chargeFailedAt: new Date().toISOString(),
            chargeFailureMessage: `PaymentIntent status: ${paymentIntent.status}`,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Charge failed';
        logger.error('Marketplace lock charge failed', { householdId, orderId, err });
        await orderRef.update({
            chargeFailedAt: new Date().toISOString(),
            chargeFailureMessage: message,
        });
    }
}
async function confirmMarketplaceCharge(householdId, orderId, orderRef, order, paymentIntentId) {
    var _a;
    const claimed = await db.runTransaction(async (tx) => {
        var _a, _b;
        const snap = await tx.get(orderRef);
        const data = (_a = snap.data()) !== null && _a !== void 0 ? _a : {};
        if (data.status === 'confirmed' || data.status === 'shipped' || data.status === 'delivered') {
            return null;
        }
        const action = (0, catalogInventory_1.paidMarketplaceInventoryAction)(data);
        const credit = await (0, catalogInventory_1.reapplyLateCreditInTx)(tx, db.doc(`households/${householdId}`), data);
        tx.update(orderRef, Object.assign(Object.assign(Object.assign(Object.assign({ status: 'confirmed', confirmedAt: firestore_1.FieldValue.serverTimestamp() }, (paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {})), { chargeFailedAt: firestore_1.FieldValue.delete(), chargeFailureMessage: firestore_1.FieldValue.delete() }), (action ? { inventoryReserved: false, inventoryCommittedAt: new Date().toISOString() } : {})), ((_b = credit === null || credit === void 0 ? void 0 : credit.orderFields) !== null && _b !== void 0 ? _b : {})));
        return {
            inventory: action ? { action, lines: (0, catalogInventory_1.reservedLinesFromOrder)(Object.assign(Object.assign({}, order), data)) } : null,
            credit: credit === null || credit === void 0 ? void 0 : credit.reapply,
        };
    });
    warnCreditShortfall(orderId, claimed === null || claimed === void 0 ? void 0 : claimed.credit);
    if (claimed === null || claimed === void 0 ? void 0 : claimed.inventory) {
        try {
            await (0, catalogInventory_1.applyPaidMarketplaceInventory)(db, claimed.inventory.action, claimed.inventory.lines);
        }
        catch (invErr) {
            logger.error('Marketplace inventory commit failed', { orderId, invErr });
        }
    }
    const fresh = (_a = (await orderRef.get()).data()) !== null && _a !== void 0 ? _a : order;
    if (fresh.status === 'confirmed' || fresh.status === 'shipped') {
        await fulfillMarketplaceOrder(householdId, orderId, fresh, fresh.playthrough === true);
    }
}
function warnCreditShortfall(orderId, reapply) {
    if (!(reapply === null || reapply === void 0 ? void 0 : reapply.shortfallCents))
        return;
    const message = `Late-paid storefront order ${orderId}: ${reapply.shortfallCents} cents of credit could not be re-applied (household balance too low); recorded as creditShortfallCents`;
    logger.warn(message);
    (0, sentry_1.reportWarning)(message);
}
async function runChargeEligibleMarketplaceOrders() {
    var _a;
    const snap = await db
        .collectionGroup('orders')
        .where('status', '==', 'committed')
        .where('holidayId', '==', HOLIDAY_ID)
        .get();
    for (const doc of snap.docs) {
        const order = doc.data();
        if (order.orderType !== 'marketplace')
            continue;
        const householdId = (_a = doc.ref.parent.parent) === null || _a === void 0 ? void 0 : _a.id;
        if (!householdId)
            continue;
        try {
            await chargeSingleMarketplaceOrder(householdId, doc.id, order);
        }
        catch (err) {
            logger.error('Marketplace lock charge skipped', { orderId: doc.id, err });
        }
    }
}
function isCompleteShippingAddress(address) {
    const a = address;
    return Boolean((a === null || a === void 0 ? void 0 : a.name) && a.line1 && a.city && a.stateProvince && a.postalCode);
}
/**
 * Sealed $0 order for a gift box nobody confirmed by lock, shipped to the giver's address.
 * The order id is derived from the invite so a retried run can't create a second one.
 */
async function createAutoShipGiftOrder(params) {
    var _a, _b;
    const orderRef = db.doc(`households/${params.householdId}/orders/autoship-${params.giftInviteId}`);
    const configData = (_a = (await db.doc('config/hanukkah-2026').get()).data()) !== null && _a !== void 0 ? _a : {};
    const payload = Object.assign(Object.assign({ status: 'confirmed', orderType: 'received_gift', giftInviteId: params.giftInviteId, lineItems: normalizeGiftLineItems(params.lineItems), subtotalCents: 0, shippingCents: 0, taxCents: 0, totalCents: 0, creditAppliedCents: 0, giftCreditAppliedCents: 0, platformCreditAppliedCents: 0, shippingAddress: params.shippingAddress, holidayId: HOLIDAY_ID, userId: params.userId, estimatedDelivery: (_b = configData.estimatedDeliveryBy) !== null && _b !== void 0 ? _b : '2026-11-24', lockAt: params.lockAt, giftSurprise: true, autoShipped: true }, (params.autoShipForGiver ? { autoShipForGiver: true } : {})), { createdAt: firestore_1.FieldValue.serverTimestamp(), confirmedAt: firestore_1.FieldValue.serverTimestamp() });
    try {
        await orderRef.create(payload);
    }
    catch (err) {
        if (err.code === 6)
            return orderRef.id;
        throw err;
    }
    return orderRef.id;
}
/**
 * At lock: claimed gift boxes nobody confirmed ship to the giver's address if they gave one,
 * otherwise become gift credit. Unclaimed boxes with a giver address ship too; unclaimed ones
 * without an address become credit when claimed (see claimGiftInvite).
 */
async function runSettleUnconfirmedGiftBoxes() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const lockAt = await getLockAt();
    if (!isLocked(lockAt))
        return;
    const now = new Date().toISOString();
    // Filtered in memory: a collection-group equality query would need a collection-group index.
    const received = await db.collectionGroup('receivedGifts').get();
    for (const doc of received.docs) {
        const gift = doc.data();
        if (gift.kind !== 'box')
            continue;
        const unconfirmed = gift.status === 'available' || (gift.status === 'accepted' && !gift.checkoutOrderId);
        if (!unconfirmed)
            continue;
        const householdId = (_a = doc.ref.parent.parent) === null || _a === void 0 ? void 0 : _a.id;
        if (!householdId)
            continue;
        const giftInviteId = String((_b = gift.giftInviteId) !== null && _b !== void 0 ? _b : doc.id);
        try {
            if (isCompleteShippingAddress(gift.giverShippingAddress)) {
                const inviteSnap = await db.doc(`giftInvites/${giftInviteId}`).get();
                const hhSnap = await db.doc(`households/${householdId}`).get();
                const userId = (_f = (_d = (_c = inviteSnap.data()) === null || _c === void 0 ? void 0 : _c.claimedByUid) !== null && _d !== void 0 ? _d : (_e = hhSnap.data()) === null || _e === void 0 ? void 0 : _e.ownerId) !== null && _f !== void 0 ? _f : '';
                const orderId = await createAutoShipGiftOrder({
                    householdId,
                    giftInviteId,
                    userId,
                    lineItems: (_g = gift.lineItems) !== null && _g !== void 0 ? _g : [],
                    shippingAddress: gift.giverShippingAddress,
                    lockAt,
                });
                await doc.ref.update({
                    status: 'accepted',
                    acceptedAt: (_h = gift.acceptedAt) !== null && _h !== void 0 ? _h : now,
                    checkoutOrderId: orderId,
                    surprise: true,
                    autoShippedAt: now,
                    updatedAt: now,
                });
            }
            else {
                const creditCents = typeof gift.creditCents === 'number' ? gift.creditCents : DEFAULT_GIFT_CREDIT_CENTS;
                const hhRef = db.doc(`households/${householdId}`);
                await db.runTransaction(async (tx) => {
                    var _a, _b;
                    const fresh = await tx.get(doc.ref);
                    const f = (_a = fresh.data()) !== null && _a !== void 0 ? _a : {};
                    const stillOpen = f.status === 'available' || (f.status === 'accepted' && !f.checkoutOrderId);
                    if (!stillOpen)
                        return;
                    const hh = await tx.get(hhRef);
                    const current = typeof ((_b = hh.data()) === null || _b === void 0 ? void 0 : _b.giftCreditCents) === 'number' ? hh.data().giftCreditCents : 0;
                    tx.update(doc.ref, {
                        status: 'converted_to_credit',
                        convertedAt: now,
                        autoConvertedAt: now,
                        updatedAt: now,
                    });
                    tx.update(hhRef, { giftCreditCents: current + creditCents, updatedAt: now });
                });
            }
        }
        catch (err) {
            logger.error('Settling unconfirmed gift box failed', { giftInviteId, err });
        }
    }
    const invites = await db.collection('giftInvites').get();
    for (const doc of invites.docs) {
        const invite = doc.data();
        if ((0, giftPayment_1.resolveGiftInviteKind)(invite) !== 'box')
            continue;
        const paid = invite.paymentStatus === 'paid' || Boolean(invite.claimEmailSentAt);
        if (!paid || invite.status === 'claimed' || invite.autoShipOrderId)
            continue;
        if (!isCompleteShippingAddress(invite.shippingAddress))
            continue;
        try {
            const giverHouseholdId = (_j = (await db.doc(`users/${invite.giverUid}`).get()).data()) === null || _j === void 0 ? void 0 : _j.householdId;
            if (!giverHouseholdId) {
                logger.warn('Unclaimed gift box has no giver household; ship it manually', { giftInviteId: doc.id });
                continue;
            }
            const orderId = await createAutoShipGiftOrder({
                householdId: giverHouseholdId,
                giftInviteId: doc.id,
                userId: invite.giverUid,
                lineItems: (_k = invite.lineItems) !== null && _k !== void 0 ? _k : [],
                shippingAddress: invite.shippingAddress,
                lockAt,
                autoShipForGiver: true,
            });
            await doc.ref.update({ autoShipOrderId: orderId, autoShipHouseholdId: giverHouseholdId });
        }
        catch (err) {
            logger.error('Auto-shipping unclaimed gift box failed', { giftInviteId: doc.id, err });
        }
    }
}
const GIFT_REMINDER_UTM = 'utm_source=lifecycle&utm_medium=email&utm_campaign=gift_confirm_reminder';
/** 7 = the week-out reminder, 1 = deadline day. Null outside both windows. */
function giftReminderStage(lockAt) {
    const daysLeft = Math.ceil((new Date(lockAt).getTime() - Date.now()) / 86400000);
    if (daysLeft < 1)
        return null;
    if (daysLeft <= 1)
        return 1;
    if (daysLeft <= 7)
        return 7;
    return null;
}
function alreadyReminded(sentStage, stage) {
    return typeof sentStage === 'number' && sentStage <= stage;
}
function within24h(iso) {
    return typeof iso === 'string' && Date.now() - new Date(iso).getTime() < 86400000;
}
/**
 * Before lock: remind recipients whose gift box has no confirmed address — claimed boxes go to
 * the claimer (My Gifts), unclaimed paid boxes go to the invite's recipient (claim link).
 * Each doc records the last stage sent so a retried or repeated run doesn't double-send.
 */
async function runGiftConfirmReminders() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const lockAt = await getLockAt();
    if (!lockAt || isLocked(lockAt))
        return { sent: 0, skipped: 0 };
    const stage = giftReminderStage(lockAt);
    if (!stage)
        return { sent: 0, skipped: 0 };
    const configData = (_a = (await db.doc('config/hanukkah-2026').get()).data()) !== null && _a !== void 0 ? _a : {};
    const arrivesByLabel = (0, setupNudge_1.deliveryDateLabel)((_b = configData.estimatedDeliveryBy) !== null && _b !== void 0 ? _b : '2026-11-21');
    const shared = { finalNotice: stage === 1, deadlineLabel: (0, setupNudge_1.lockDateLabel)(lockAt), arrivesByLabel };
    const appBase = (_c = process.env.PILOT_APP_BASE_URL) !== null && _c !== void 0 ? _c : 'https://app.grapejuice.co';
    const now = new Date().toISOString();
    let sent = 0;
    let skipped = 0;
    const received = await db.collectionGroup('receivedGifts').get();
    for (const doc of received.docs) {
        const gift = doc.data();
        if (gift.kind !== 'box')
            continue;
        const unconfirmed = gift.status === 'available' || (gift.status === 'accepted' && !gift.checkoutOrderId);
        if (!unconfirmed || alreadyReminded(gift.confirmReminderStage, stage) || within24h(gift.claimedAt)) {
            skipped += 1;
            continue;
        }
        try {
            const giftInviteId = String((_d = gift.giftInviteId) !== null && _d !== void 0 ? _d : doc.id);
            const householdId = (_e = doc.ref.parent.parent) === null || _e === void 0 ? void 0 : _e.id;
            const uid = (_g = (_f = (await db.doc(`giftInvites/${giftInviteId}`).get()).data()) === null || _f === void 0 ? void 0 : _f.claimedByUid) !== null && _g !== void 0 ? _g : (householdId
                ? (_h = (await db.doc(`households/${householdId}`).get()).data()) === null || _h === void 0 ? void 0 : _h.ownerId
                : undefined);
            const email = uid ? (_j = (await db.doc(`users/${uid}`).get()).data()) === null || _j === void 0 ? void 0 : _j.email : undefined;
            if (!(email === null || email === void 0 ? void 0 : email.includes('@'))) {
                skipped += 1;
                continue;
            }
            const delivered = await (0, email_1.sendGiftConfirmReminderEmail)(Object.assign({ to: email.trim(), giverName: String((_k = gift.giverName) !== null && _k !== void 0 ? _k : 'Someone'), ctaUrl: `${appBase}/my-gifts?${GIFT_REMINDER_UTM}`, claimed: true, hasGiverAddress: isCompleteShippingAddress(gift.giverShippingAddress) }, shared));
            if (!delivered) {
                skipped += 1;
                continue;
            }
            await doc.ref.update({ confirmReminderStage: stage, confirmReminderSentAt: now });
            sent += 1;
        }
        catch (err) {
            logger.error('Gift confirm reminder failed', { receivedGiftId: doc.id, err });
            skipped += 1;
        }
    }
    const invites = await db.collection('giftInvites').get();
    for (const doc of invites.docs) {
        const invite = doc.data();
        if ((0, giftPayment_1.resolveGiftInviteKind)(invite) !== 'box')
            continue;
        const paid = invite.paymentStatus === 'paid' || Boolean(invite.claimEmailSentAt);
        if (!paid || invite.status === 'claimed' || invite.autoShipOrderId)
            continue;
        if (alreadyReminded(invite.confirmReminderStage, stage) || within24h(invite.claimEmailSentAt)) {
            skipped += 1;
            continue;
        }
        if (!((_l = invite.recipientEmail) === null || _l === void 0 ? void 0 : _l.includes('@')) || !invite.claimToken) {
            skipped += 1;
            continue;
        }
        try {
            const delivered = await (0, email_1.sendGiftConfirmReminderEmail)(Object.assign({ to: invite.recipientEmail.trim(), giverName: invite.giverName || 'Someone', ctaUrl: `${appBase}/gift/claim?token=${invite.claimToken}&${GIFT_REMINDER_UTM}`, claimed: false, hasGiverAddress: isCompleteShippingAddress(invite.shippingAddress) }, shared));
            if (!delivered) {
                skipped += 1;
                continue;
            }
            await doc.ref.update({ confirmReminderStage: stage, confirmReminderSentAt: now });
            sent += 1;
        }
        catch (err) {
            logger.error('Gift confirm reminder failed', { giftInviteId: doc.id, err });
            skipped += 1;
        }
    }
    logger.info('Gift confirm reminder batch complete', { sent, skipped, stage });
    return { sent, skipped };
}
async function runExportHeldOrders() {
    var _a;
    if (!isLocked(await getLockAt()))
        return;
    const snap = await db
        .collectionGroup('orders')
        .where('status', '==', 'confirmed')
        .where('holidayId', '==', HOLIDAY_ID)
        .get();
    for (const doc of snap.docs) {
        const order = doc.data();
        if (order.orderType !== 'received_gift' && order.orderType !== 'marketplace')
            continue;
        if (order.marketplaceFulfilledAt)
            continue;
        const householdId = (_a = doc.ref.parent.parent) === null || _a === void 0 ? void 0 : _a.id;
        if (!householdId)
            continue;
        try {
            await fulfillMarketplaceOrder(householdId, doc.id, order, order.playthrough === true);
        }
        catch (err) {
            logger.error('Held order export failed', { orderId: doc.id, err });
        }
    }
}
async function retryFailedMarketplaceCharges(householdId) {
    const open = await db.collection(`households/${householdId}/orders`).where('status', '==', 'committed').get();
    for (const doc of open.docs) {
        const data = doc.data();
        if (data.orderType !== 'marketplace' || !data.chargeFailureMessage)
            continue;
        if (!lockHasPassed(data.lockAt))
            continue;
        await chargeSingleMarketplaceOrder(householdId, doc.id, data);
    }
}
exports.createPilotCheckout = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
        throw new sentry_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    if (!stripe_1.stripe) {
        throw new sentry_1.HttpsError('failed-precondition', 'Stripe is not configured. Set STRIPE_SECRET_KEY on Functions.');
    }
    const data = ((_b = request.data) !== null && _b !== void 0 ? _b : {});
    const householdId = data.householdId;
    if (!householdId || !((_c = data.shippingAddress) === null || _c === void 0 ? void 0 : _c.line1) || !((_d = data.shippingAddress) === null || _d === void 0 ? void 0 : _d.city)) {
        throw new sentry_1.HttpsError('invalid-argument', 'householdId and shippingAddress are required.');
    }
    const shippingAddress = sanitizeShippingAddress(data.shippingAddress);
    if (!shippingAddress.stateProvince || !shippingAddress.postalCode) {
        throw new sentry_1.HttpsError('invalid-argument', 'Please enter a state and ZIP code.');
    }
    await assertHouseholdMember(request.auth.uid, householdId);
    const lockAt = await getLockAt();
    if (isLocked(lockAt)) {
        throw new sentry_1.HttpsError('failed-precondition', 'The box lock date has passed. Contact support to change your order.');
    }
    const draftSnap = await db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`).get();
    if (!draftSnap.exists) {
        throw new sentry_1.HttpsError('failed-precondition', 'No box draft found. Complete onboarding first.');
    }
    const draft = draftSnap.data();
    const pilotMerge = await (0, pilotParticipants_1.withPilotLines)(db, householdId, (_e = draft.lineItems) !== null && _e !== void 0 ? _e : []);
    const lineItems = pilotMerge.lines;
    if (pilotMerge.changed) {
        await draftSnap.ref.update({ lineItems, lastChangeSource: 'pilot', updatedAt: new Date().toISOString() });
    }
    const configSnap = await db.doc('config/hanukkah-2026').get();
    const configData = (_f = configSnap.data()) !== null && _f !== void 0 ? _f : {};
    const { boxPriceCents, kidCount } = await (0, chargePilotBox_1.boxPriceForUser)(db, request.auth.uid, configData);
    const subtotalCents = orderTotalCents(lineItems, boxPriceCents);
    const shippingCents = SHIPPING_FLAT_CENTS;
    const taxCents = Math.round((subtotalCents + shippingCents) * CHECKOUT_TAX_RATE);
    const totalCents = subtotalCents + shippingCents + taxCents;
    if (totalCents < 50) {
        throw new sentry_1.HttpsError('invalid-argument', 'Order total is too small.');
    }
    const estimatedDelivery = (_g = configData.estimatedDeliveryBy) !== null && _g !== void 0 ? _g : '2026-11-24';
    const orderRef = db.collection(`households/${householdId}/orders`).doc();
    await orderRef.set({
        status: 'pending',
        lineItems,
        boxPriceCents,
        kidCount,
        subtotalCents,
        shippingCents,
        taxCents,
        totalCents,
        shippingAddress,
        holidayId: HOLIDAY_ID,
        userId: request.auth.uid,
        lockAt,
        estimatedDelivery,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    const paymentIntent = await stripe_1.stripe.paymentIntents.create({
        amount: totalCents,
        currency: 'usd',
        metadata: {
            householdId,
            orderId: orderRef.id,
            userId: request.auth.uid,
            type: 'hanukkah_box',
        },
        automatic_payment_methods: { enabled: true },
    });
    await orderRef.update({ stripePaymentIntentId: paymentIntent.id });
    return {
        clientSecret: paymentIntent.client_secret,
        orderId: orderRef.id,
        totalCents,
    };
});
/**
 * À la carte checkout. Charged now, unless the household has a box: then the card is saved
 * and charged when boxes lock. Guests need an email.
 */
exports.createMarketplaceCheckout = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t;
    try {
        const data = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
        const shippingAddress = sanitizeShippingAddress(data.shippingAddress);
        if (!((_b = data.shippingAddress) === null || _b === void 0 ? void 0 : _b.line1) || !((_c = data.shippingAddress) === null || _c === void 0 ? void 0 : _c.city)) {
            throw new sentry_1.HttpsError('invalid-argument', 'shippingAddress is required.');
        }
        if (!shippingAddress.name || !shippingAddress.stateProvince || !shippingAddress.postalCode) {
            throw new sentry_1.HttpsError('invalid-argument', 'Please enter name, street, city, state/province, and postal code.');
        }
        const authedUid = (_d = request.auth) === null || _d === void 0 ? void 0 : _d.uid;
        let householdId = '';
        let guestEmail = '';
        // Signed out, the household (and its credit and saved card) is never touched: knowing an
        // email is not proof of owning its account.
        let hhData = {};
        if (authedUid) {
            householdId = String((_e = data.householdId) !== null && _e !== void 0 ? _e : '').trim();
            if (!householdId) {
                throw new sentry_1.HttpsError('invalid-argument', 'householdId is required.');
            }
            const hhSnap = await assertHouseholdMember(authedUid, householdId);
            hhData = (_f = hhSnap.data()) !== null && _f !== void 0 ? _f : {};
        }
        else {
            try {
                guestEmail = (0, loginLinks_2.normalizeEmail)(data.email);
            }
            catch (_u) {
                throw new sentry_1.HttpsError('invalid-argument', 'Enter an email so we can send your receipt.');
            }
            await (0, loginLinks_2.enforceRateLimits)(db, guestEmail, request.rawRequest, 'checkout:');
        }
        const giftCreditCents = typeof hhData.giftCreditCents === 'number' ? hhData.giftCreditCents : 0;
        const platformCreditCents = typeof hhData.platformCreditCents === 'number' ? hhData.platformCreditCents : 0;
        const lineItems = await resolveMarketplaceLineItems((_g = data.lineItems) !== null && _g !== void 0 ? _g : []);
        const subtotalCents = chargeableLineTotal(lineItems);
        if (subtotalCents < 1) {
            throw new sentry_1.HttpsError('invalid-argument', 'Cart total is too small.');
        }
        const shippingCents = SHIPPING_FLAT_CENTS;
        const buyerEmail = guestEmail ||
            String((_l = (_j = (authedUid ? (_h = (await db.doc(`users/${authedUid}`).get()).data()) === null || _h === void 0 ? void 0 : _h.email : null)) !== null && _j !== void 0 ? _j : (_k = request.auth) === null || _k === void 0 ? void 0 : _k.token.email) !== null && _l !== void 0 ? _l : '')
                .trim()
                .toLowerCase() ||
            null;
        const resolvedPromo = await (0, promotions_1.resolveCheckoutPromo)(db, data.promo, buyerEmail);
        const { discountCents, promo } = (0, promotions_1.applyResolvedPromo)(resolvedPromo, subtotalCents);
        const priced = (0, chargePilotBox_1.checkoutTotalsAfterCredit)(subtotalCents + shippingCents, giftCreditCents, platformCreditCents, discountCents);
        const { taxCents, totalCents, giftCreditApplied, platformCreditApplied, creditApplied } = priced;
        if (totalCents > 0 && totalCents < 50) {
            throw new sentry_1.HttpsError('invalid-argument', 'Order total is too small.');
        }
        let account = null;
        if (!authedUid) {
            account = await (0, checkoutAccount_1.accountForCheckoutEmail)(db, guestEmail, shippingAddress.name);
            householdId = account.householdId;
        }
        const orderUserId = (_m = authedUid !== null && authedUid !== void 0 ? authedUid : account === null || account === void 0 ? void 0 : account.uid) !== null && _m !== void 0 ? _m : null;
        // Only a brand-new account may be signed in from this browser, and only after it pays.
        const checkoutClaim = account && !account.accountExisted ? (0, checkoutAccount_1.mintCheckoutClaim)() : null;
        const signIn = account
            ? checkoutClaim
                ? { kind: 'token', claim: checkoutClaim.claim, householdId }
                : { kind: 'email' }
            : null;
        const configSnap = await db.doc('config/hanukkah-2026').get();
        const configData = (_o = configSnap.data()) !== null && _o !== void 0 ? _o : {};
        const estimatedDelivery = (_p = configData.estimatedDeliveryBy) !== null && _p !== void 0 ? _p : '2026-11-24';
        const lockAt = await getLockAt(false);
        const orderRef = db.collection(`households/${householdId}/orders`).doc();
        const skipShipStation = data.skipShipStation === true ||
            (0, testAccounts_1.isPlaythroughTestEmail)(guestEmail || (typeof ((_q = request.auth) === null || _q === void 0 ? void 0 : _q.token.email) === 'string' ? request.auth.token.email : ''));
        const metaCtx = (0, metaCapi_1.metaContextFromCallable)(request);
        const attribution = (0, metaCapi_1.sanitizeAttribution)(data.attribution);
        const reservedLines = await db.runTransaction(async (tx) => (0, catalogInventory_1.reserveMarketplaceInventoryInTx)(db, tx, lineItems.map((li) => ({ itemId: li.itemId, quantity: li.quantity })), lockAt));
        const chargeNow = !authedUid || !(await householdHasHanukkahBox(householdId));
        const savedPaymentMethodId = typeof hhData.stripeDefaultPaymentMethodId === 'string' ? hhData.stripeDefaultPaymentMethodId : '';
        const needsCard = totalCents > 0 && !savedPaymentMethodId;
        const reservedAt = new Date().toISOString();
        const orderPayload = Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({ status: (chargeNow ? totalCents > 0 : needsCard) ? 'pending' : 'committed', chargeTiming: chargeNow ? 'checkout' : 'lock', orderType: 'marketplace', lineItems,
            subtotalCents,
            shippingCents, discountCents: priced.discountApplied, taxCents,
            totalCents, creditAppliedCents: creditApplied, giftCreditAppliedCents: giftCreditApplied, platformCreditAppliedCents: platformCreditApplied, shippingAddress, holidayId: HOLIDAY_ID, lockAt }, (orderUserId ? { userId: orderUserId } : {})), (guestEmail ? { guestEmail, checkoutSignedOut: true } : {})), (checkoutClaim
            ? { checkoutClaimHash: checkoutClaim.hash, checkoutClaimExpiresAt: checkoutClaim.expiresAt }
            : {})), { estimatedDelivery, inventoryReserved: true, inventoryReservedAt: reservedAt, inventoryReservedLines: reservedLines, createdAt: firestore_1.FieldValue.serverTimestamp() }), (attribution ? { attribution } : {})), (promo ? { promo } : {}));
        if (skipShipStation)
            orderPayload.playthrough = true;
        let creditsDeducted = false;
        try {
            await orderRef.set(orderPayload);
            await (0, promotions_1.recordPromoRedemption)(db, {
                sourcePath: orderRef.path,
                kind: 'order',
                resolved: resolvedPromo,
                promo,
                householdId,
            });
            if (creditApplied > 0) {
                await db.doc(`households/${householdId}`).update(Object.assign(Object.assign(Object.assign({}, (giftCreditApplied > 0 ? { giftCreditCents: giftCreditCents - giftCreditApplied } : {})), (platformCreditApplied > 0
                    ? { platformCreditCents: platformCreditCents - platformCreditApplied }
                    : {})), { updatedAt: new Date().toISOString() }));
                creditsDeducted = true;
            }
            if (!skipShipStation) {
                const buyerEmail = guestEmail || (typeof ((_r = request.auth) === null || _r === void 0 ? void 0 : _r.token.email) === 'string' ? request.auth.token.email : '');
                await (0, unaffiliated_1.reportUnaffiliatedShippingGeo)({ attribution, shippingAddress, email: buyerEmail });
            }
            const purchaseToMeta = async () => {
                var _a;
                return sendOrderPurchaseToMeta({
                    orderId: orderRef.id,
                    order: orderPayload,
                    context: metaCtx,
                    email: guestEmail || (authedUid ? await emailForMeta(authedUid, (_a = request.auth) === null || _a === void 0 ? void 0 : _a.token.email) : null),
                });
            };
            // Once money has moved, a failure here must not fall into the release/cancel path below.
            const confirmedNow = async (paymentIntentId) => {
                try {
                    await confirmMarketplaceCharge(householdId, orderRef.id, orderRef, orderPayload, paymentIntentId);
                    await purchaseToMeta();
                }
                catch (postErr) {
                    logger.error('Marketplace order paid; follow-up steps failed', { orderId: orderRef.id, postErr });
                }
                return {
                    orderId: orderRef.id,
                    totalCents,
                    clientSecret: null,
                    intent: null,
                    status: 'confirmed',
                    savedCard: null,
                    signIn,
                };
            };
            if (chargeNow && totalCents === 0) {
                return await confirmedNow(null);
            }
            if (!chargeNow && !needsCard) {
                await purchaseToMeta();
                return {
                    orderId: orderRef.id,
                    totalCents,
                    clientSecret: null,
                    intent: null,
                    status: 'committed',
                    savedCard: null,
                    signIn,
                };
            }
            if (!stripe_1.stripe) {
                throw new sentry_1.HttpsError('failed-precondition', 'Stripe is not configured. Set STRIPE_SECRET_KEY on Functions.');
            }
            // Signed-out payments carry no Stripe customer, so no saved card can be offered or charged.
            let customerId = authedUid && typeof hhData.stripeCustomerId === 'string' ? hhData.stripeCustomerId : '';
            if (authedUid && !customerId) {
                const email = String((_t = (_s = (await db.doc(`users/${authedUid}`).get()).data()) === null || _s === void 0 ? void 0 : _s.email) !== null && _t !== void 0 ? _t : '');
                const customer = await stripe_1.stripe.customers.create(Object.assign(Object.assign({}, (email.includes('@') ? { email } : {})), { metadata: { householdId } }));
                customerId = customer.id;
                await db.doc(`households/${householdId}`).set({ stripeCustomerId: customerId, updatedAt: new Date().toISOString() }, { merge: true });
            }
            if (chargeNow) {
                const metadata = Object.assign(Object.assign({ householdId, orderId: orderRef.id, type: 'marketplace', chargeTiming: 'checkout' }, (orderUserId ? { userId: orderUserId } : {})), (0, metaCapi_1.metaContextToStripeMetadata)(metaCtx));
                const paymentIntent = await stripe_1.stripe.paymentIntents.create(Object.assign(Object.assign({ amount: totalCents, currency: 'usd' }, (customerId ? { customer: customerId } : {})), { automatic_payment_methods: { enabled: true }, metadata }), { idempotencyKey: `marketplace-checkout-${orderRef.id}` });
                if (!paymentIntent.client_secret) {
                    throw new sentry_1.HttpsError('internal', 'PaymentIntent missing client secret.');
                }
                await orderRef.update({ stripePaymentIntentId: paymentIntent.id });
                return {
                    clientSecret: paymentIntent.client_secret,
                    orderId: orderRef.id,
                    totalCents,
                    intent: 'payment',
                    status: 'pending',
                    savedCard: authedUid ? await savedCardSummary(hhData, customerId) : null,
                    signIn,
                };
            }
            const setupIntent = await (0, stripe_1.createCardSetupIntent)({
                customer: customerId,
                usage: 'off_session',
                metadata: Object.assign(Object.assign(Object.assign({ householdId, orderId: orderRef.id, type: 'marketplace' }, (authedUid ? { userId: authedUid } : {})), (0, metaCapi_1.metaContextToStripeMetadata)(metaCtx)), (0, checkoutSession_1.checkoutSessionToStripeMetadata)((0, checkoutSession_1.checkoutSessionFromCallable)(request))),
            });
            if (!setupIntent.client_secret) {
                throw new sentry_1.HttpsError('internal', 'SetupIntent missing client secret.');
            }
            return {
                clientSecret: setupIntent.client_secret,
                orderId: orderRef.id,
                totalCents,
                intent: 'setup',
                status: 'pending',
                savedCard: null,
                signIn,
            };
        }
        catch (innerErr) {
            // Release reservation if we fail after reserving (Stripe/config errors).
            try {
                await (0, catalogInventory_1.releaseMarketplaceReservations)(db, reservedLines);
                await orderRef.set({
                    status: 'cancelled',
                    cancelReason: 'checkout_failed_after_reserve',
                    inventoryReserved: false,
                    reservationReleasedAt: new Date().toISOString(),
                }, { merge: true });
            }
            catch (releaseErr) {
                logger.error('Failed to release marketplace reservation after checkout error', releaseErr);
            }
            if (creditsDeducted && (giftCreditApplied > 0 || platformCreditApplied > 0)) {
                try {
                    await db.doc(`households/${householdId}`).update(Object.assign(Object.assign(Object.assign({}, (giftCreditApplied > 0
                        ? { giftCreditCents: firestore_1.FieldValue.increment(giftCreditApplied) }
                        : {})), (platformCreditApplied > 0
                        ? { platformCreditCents: firestore_1.FieldValue.increment(platformCreditApplied) }
                        : {})), { updatedAt: new Date().toISOString() }));
                }
                catch (creditErr) {
                    logger.error('Failed to restore marketplace credit after checkout error', creditErr);
                }
            }
            throw innerErr;
        }
    }
    catch (err) {
        if (err instanceof sentry_1.HttpsError)
            throw err;
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('createMarketplaceCheckout failed', { err, message: msg });
        throw new sentry_1.HttpsError('internal', msg || 'Checkout failed. Please try again.');
    }
});
/** Brand and last four of the household's saved card, for the signed-in payment step. */
async function savedCardSummary(hhData, customerId) {
    var _a;
    const pmId = typeof hhData.stripeDefaultPaymentMethodId === 'string' ? hhData.stripeDefaultPaymentMethodId : '';
    if (!stripe_1.stripe || !pmId || !customerId)
        return null;
    try {
        const pm = await stripe_1.stripe.paymentMethods.retrieve(pmId);
        const pmCustomer = typeof pm.customer === 'string' ? pm.customer : (_a = pm.customer) === null || _a === void 0 ? void 0 : _a.id;
        if (pmCustomer !== customerId || !pm.card)
            return null;
        return { brand: pm.card.brand, last4: pm.card.last4 };
    }
    catch (err) {
        logger.warn('savedCardSummary: could not load saved card', { err: String(err) });
        return null;
    }
}
/** Box checkout: which card is on file, so the payment section can name it. */
exports.getSavedCardSummary = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const householdId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.householdId) !== null && _c !== void 0 ? _c : '').trim();
    if (!householdId)
        throw new sentry_1.HttpsError('invalid-argument', 'householdId is required.');
    const hhSnap = await assertHouseholdMember(request.auth.uid, householdId);
    const hhData = (_d = hhSnap.data()) !== null && _d !== void 0 ? _d : {};
    const customerId = typeof hhData.stripeCustomerId === 'string' ? hhData.stripeCustomerId : '';
    return { savedCard: await savedCardSummary(hhData, customerId) };
});
/**
 * Pay a pending storefront order with the household's saved card. The buyer chose it on the
 * payment step; only an authenticated household member whose card it is may charge it.
 */
exports.payMarketplaceOrderWithSavedCard = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid)
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in to use your saved card.');
    const data = ((_b = request.data) !== null && _b !== void 0 ? _b : {});
    const householdId = String((_c = data.householdId) !== null && _c !== void 0 ? _c : '').trim();
    const orderId = String((_d = data.orderId) !== null && _d !== void 0 ? _d : '').trim();
    if (!householdId || !orderId) {
        throw new sentry_1.HttpsError('invalid-argument', 'householdId and orderId are required.');
    }
    if (!stripe_1.stripe)
        throw new sentry_1.HttpsError('failed-precondition', 'Stripe is not configured.');
    const hh = (_e = (await assertHouseholdMember(uid, householdId)).data()) !== null && _e !== void 0 ? _e : {};
    const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
    const order = (await orderRef.get()).data();
    if (!order || order.orderType !== 'marketplace' || order.chargeTiming !== 'checkout') {
        throw new sentry_1.HttpsError('not-found', 'Order not found.');
    }
    if (order.status === 'confirmed' || order.status === 'shipped' || order.status === 'delivered') {
        return { status: 'confirmed' };
    }
    if (order.status !== 'pending') {
        throw new sentry_1.HttpsError('failed-precondition', 'This order can no longer be paid. Start checkout again.');
    }
    const piId = typeof order.stripePaymentIntentId === 'string' ? order.stripePaymentIntentId : '';
    if (!piId)
        throw new sentry_1.HttpsError('failed-precondition', 'This order has no payment to confirm.');
    const pmId = typeof hh.stripeDefaultPaymentMethodId === 'string' ? hh.stripeDefaultPaymentMethodId : '';
    const [pm, pi] = await Promise.all([
        pmId ? stripe_1.stripe.paymentMethods.retrieve(pmId) : Promise.resolve(null),
        stripe_1.stripe.paymentIntents.retrieve(piId),
    ]);
    const denial = (0, checkoutAccount_1.savedCardChargeDenial)({
        authedUid: uid,
        useSavedCard: data.useSavedCard,
        householdMemberIds: hh.memberIds,
        householdCustomerId: hh.stripeCustomerId,
        householdPaymentMethodId: pmId,
        paymentMethodCustomerId: pm ? (typeof pm.customer === 'string' ? pm.customer : (_g = (_f = pm.customer) === null || _f === void 0 ? void 0 : _f.id) !== null && _g !== void 0 ? _g : null) : null,
        paymentIntentCustomerId: typeof pi.customer === 'string' ? pi.customer : (_j = (_h = pi.customer) === null || _h === void 0 ? void 0 : _h.id) !== null && _j !== void 0 ? _j : null,
    });
    if (denial) {
        logger.warn('payMarketplaceOrderWithSavedCard refused', { orderId, denial });
        throw new sentry_1.HttpsError('permission-denied', 'Your saved card can’t be used for this order. Enter a card instead.');
    }
    const finish = async (paymentIntentId) => {
        var _a, _b;
        try {
            const fresh = (_a = (await orderRef.get()).data()) !== null && _a !== void 0 ? _a : order;
            await confirmMarketplaceCharge(householdId, orderId, orderRef, fresh, paymentIntentId);
            await sendOrderPurchaseToMeta({
                orderId,
                order: fresh,
                context: (0, metaCapi_1.metaContextFromStripeMetadata)(pi.metadata),
                email: await emailForMeta(uid, (_b = request.auth) === null || _b === void 0 ? void 0 : _b.token.email),
            });
        }
        catch (postErr) {
            logger.error('Marketplace order paid with saved card; follow-up steps failed', { orderId, postErr });
        }
        return { status: 'confirmed' };
    };
    if (pi.status === 'succeeded' || pi.status === 'processing')
        return finish(pi.id);
    try {
        const confirmed = await stripe_1.stripe.paymentIntents.confirm(pi.id, { payment_method: pmId, off_session: true }, { idempotencyKey: `marketplace-saved-card-${pi.id}` });
        if (confirmed.status === 'succeeded' || confirmed.status === 'processing')
            return finish(confirmed.id);
        return { status: 'declined', message: 'Your saved card needs another step. Enter a card instead.' };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Your saved card was declined.';
        logger.info('Saved card declined at checkout', { orderId, message });
        return { status: 'declined', message };
    }
});
/**
 * After a signed-out checkout that created a brand-new account: exchange the browser's
 * single-use claim for a sign-in token, once the order is paid. Existing accounts never get one.
 */
exports.claimMarketplaceCheckoutSignIn = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c;
    const data = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    const householdId = String((_b = data.householdId) !== null && _b !== void 0 ? _b : '').trim();
    const orderId = String((_c = data.orderId) !== null && _c !== void 0 ? _c : '').trim();
    if (!householdId || !orderId)
        return { status: 'invalid' };
    await (0, loginLinks_2.enforceRateLimits)(db, null, request.rawRequest, 'checkoutclaim:');
    const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
    const order = (await orderRef.get()).data();
    if (!order || typeof order.userId !== 'string')
        return { status: 'invalid' };
    const status = (0, checkoutAccount_1.checkoutClaimStatus)(order, data.claim);
    if (status !== 'ok')
        return { status };
    let paid = order.status === 'confirmed' || order.status === 'shipped' || order.status === 'delivered';
    if (!paid && stripe_1.stripe && typeof order.stripePaymentIntentId === 'string') {
        const pi = await stripe_1.stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
        paid = pi.status === 'succeeded' || pi.status === 'processing';
    }
    if (!paid)
        return { status: 'pending' };
    const used = await db.runTransaction(async (tx) => {
        var _a;
        const fresh = (_a = (await tx.get(orderRef)).data()) !== null && _a !== void 0 ? _a : {};
        if ((0, checkoutAccount_1.checkoutClaimStatus)(fresh, data.claim) !== 'ok')
            return false;
        tx.update(orderRef, { checkoutClaimUsedAt: new Date().toISOString() });
        return true;
    });
    if (!used)
        return { status: 'used' };
    const customToken = await (0, auth_1.getAuth)().createCustomToken(order.userId, { via: 'checkout' });
    return { status: 'ok', customToken };
});
exports.createPilotSetupIntent = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
        throw new sentry_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    if (!stripe_1.stripe) {
        throw new sentry_1.HttpsError('failed-precondition', 'Stripe is not configured. Set STRIPE_SECRET_KEY on Functions.');
    }
    const data = ((_b = request.data) !== null && _b !== void 0 ? _b : {});
    const householdId = data.householdId;
    if (!householdId) {
        throw new sentry_1.HttpsError('invalid-argument', 'householdId is required.');
    }
    await assertHouseholdMember(request.auth.uid, householdId);
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const email = (_d = (_c = userSnap.data()) === null || _c === void 0 ? void 0 : _c.email) !== null && _d !== void 0 ? _d : '';
    const customerId = await getOrCreateStripeCustomer(householdId, request.auth.uid, email);
    const setupIntent = await (0, stripe_1.createCardSetupIntent)({
        customer: customerId,
        metadata: Object.assign(Object.assign({ householdId, userId: request.auth.uid }, (0, metaCapi_1.metaContextToStripeMetadata)((0, metaCapi_1.metaContextFromCallable)(request))), (0, checkoutSession_1.checkoutSessionToStripeMetadata)((0, checkoutSession_1.checkoutSessionFromCallable)(request))),
    });
    if (!setupIntent.client_secret) {
        throw new sentry_1.HttpsError('internal', 'SetupIntent missing client secret.');
    }
    return { clientSecret: setupIntent.client_secret, customerId };
});
/**
 * Save card (SetupIntent, before this call) + commit address/shipping tier.
 * No PaymentIntent here — one off-session charge at lock/ship (see charge-once-at-ship).
 */
exports.commitPilotBox = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
        throw new sentry_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    const data = ((_b = request.data) !== null && _b !== void 0 ? _b : {});
    const householdId = data.householdId;
    if (!householdId || !((_c = data.shippingAddress) === null || _c === void 0 ? void 0 : _c.line1) || !((_d = data.shippingAddress) === null || _d === void 0 ? void 0 : _d.city)) {
        throw new sentry_1.HttpsError('invalid-argument', 'householdId and shippingAddress are required.');
    }
    const shippingAddress = sanitizeShippingAddress(data.shippingAddress);
    if (!shippingAddress.stateProvince || !shippingAddress.postalCode) {
        throw new sentry_1.HttpsError('invalid-argument', 'Please enter a state and ZIP code.');
    }
    const hhSnap = await assertHouseholdMember(request.auth.uid, householdId);
    const hhData = (_e = hhSnap.data()) !== null && _e !== void 0 ? _e : {};
    const cardOnFile = !!hhData.cardOnFileAt;
    const giftCreditCents = typeof hhData.giftCreditCents === 'number' ? hhData.giftCreditCents : 0;
    const platformCreditCents = typeof hhData.platformCreditCents === 'number' ? hhData.platformCreditCents : 0;
    const lockAt = await getLockAt(false);
    if (isLocked(lockAt)) {
        throw new sentry_1.HttpsError('failed-precondition', 'The box lock date has passed. Contact support to change your order.');
    }
    const draftSnap = await db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`).get();
    if (!draftSnap.exists) {
        throw new sentry_1.HttpsError('failed-precondition', 'No box draft found. Complete onboarding first.');
    }
    const draft = draftSnap.data();
    const pilotMerge = await (0, pilotParticipants_1.withPilotLines)(db, householdId, (_f = draft.lineItems) !== null && _f !== void 0 ? _f : []);
    const lineItems = pilotMerge.lines;
    if (pilotMerge.changed) {
        await draftSnap.ref.update({ lineItems, lastChangeSource: 'pilot', updatedAt: new Date().toISOString() });
    }
    const configSnap = await db.doc('config/hanukkah-2026').get();
    const configData = (_g = configSnap.data()) !== null && _g !== void 0 ? _g : {};
    const { boxPriceCents, kidCount } = await (0, chargePilotBox_1.boxPriceForUser)(db, request.auth.uid, configData);
    const subtotalCents = orderTotalCents(lineItems, boxPriceCents);
    const shippingCents = SHIPPING_FLAT_CENTS;
    const buyerEmail = String((_k = (_j = (_h = (await db.doc(`users/${request.auth.uid}`).get()).data()) === null || _h === void 0 ? void 0 : _h.email) !== null && _j !== void 0 ? _j : request.auth.token.email) !== null && _k !== void 0 ? _k : '')
        .trim()
        .toLowerCase() || null;
    const resolvedPromo = await (0, promotions_1.resolveCheckoutPromo)(db, data.promo, buyerEmail);
    const { discountCents, promo } = (0, promotions_1.applyResolvedPromo)(resolvedPromo, subtotalCents);
    const priced = (0, chargePilotBox_1.checkoutTotalsAfterCredit)(subtotalCents + shippingCents, giftCreditCents, platformCreditCents, discountCents);
    const totalCents = priced.totalCents;
    const totalAvailableCredit = giftCreditCents + platformCreditCents;
    if (!cardOnFile && totalAvailableCredit + priced.discountApplied < boxPriceCents) {
        throw new sentry_1.HttpsError('failed-precondition', 'Save a payment method before committing your box.');
    }
    if (totalCents > 0 && !cardOnFile) {
        throw new sentry_1.HttpsError('failed-precondition', 'Save a payment method for add-ons and shipping.');
    }
    if (totalCents < 0) {
        throw new sentry_1.HttpsError('invalid-argument', 'Order total is invalid.');
    }
    const isPlaythrough = data.skipShipStation === true || (0, testAccounts_1.isPlaythroughTestEmail)(buyerEmail);
    const ordersRef = db.collection(`households/${householdId}/orders`);
    const already = (0, chargePilotBox_1.openHanukkahBoxOrder)((await ordersRef.get()).docs.map((d) => ({ id: d.id, data: d.data() })));
    if (already) {
        const existing = already.data;
        logger.info('commitPilotBox already has an open box', { householdId, orderId: already.id });
        return {
            orderId: already.id,
            totalCents: typeof existing.totalCents === 'number' ? existing.totalCents : 0,
            discountCents: typeof existing.discountCents === 'number' ? existing.discountCents : 0,
            status: 'committed',
        };
    }
    if (!isPlaythrough) {
        await (0, catalogInventory_1.assertBoxLinesWithinInventory)(db, lineItems);
    }
    const estimatedDelivery = (_l = configData.estimatedDeliveryBy) !== null && _l !== void 0 ? _l : '2026-11-24';
    const attribution = (0, metaCapi_1.sanitizeAttribution)(data.attribution);
    const orderRef = ordersRef.doc();
    const hhRef = db.doc(`households/${householdId}`);
    // The household write is what makes two overlapping commits contend: the loser retries,
    // sees the order the winner just wrote, and returns it instead of creating another.
    const committed = await db.runTransaction(async (tx) => {
        var _a;
        const [hhFresh, ordersSnap] = await Promise.all([tx.get(hhRef), tx.get(ordersRef)]);
        const open = (0, chargePilotBox_1.openHanukkahBoxOrder)(ordersSnap.docs.map((d) => ({ id: d.id, data: d.data() })));
        if (open) {
            const existing = open.data;
            return {
                created: false,
                orderId: open.id,
                totalCents: typeof existing.totalCents === 'number' ? existing.totalCents : 0,
                discountCents: typeof existing.discountCents === 'number' ? existing.discountCents : 0,
                priced,
                orderPayload: null,
            };
        }
        const fresh = (_a = hhFresh.data()) !== null && _a !== void 0 ? _a : {};
        const freshPriced = (0, chargePilotBox_1.checkoutTotalsAfterCredit)(subtotalCents + shippingCents, typeof fresh.giftCreditCents === 'number' ? fresh.giftCreditCents : 0, typeof fresh.platformCreditCents === 'number' ? fresh.platformCreditCents : 0, discountCents);
        const orderPayload = Object.assign(Object.assign(Object.assign(Object.assign({ status: 'committed', orderType: 'hanukkah_box', lineItems,
            boxPriceCents,
            kidCount,
            subtotalCents,
            shippingCents, discountCents: freshPriced.discountApplied, taxCents: freshPriced.taxCents, totalCents: freshPriced.totalCents, creditAppliedCents: freshPriced.creditApplied, giftCreditAppliedCents: freshPriced.giftCreditApplied, platformCreditAppliedCents: freshPriced.platformCreditApplied, expeditedShipping: false, shippingAddress, holidayId: HOLIDAY_ID, userId: request.auth.uid, lockAt,
            estimatedDelivery, committedAt: firestore_1.FieldValue.serverTimestamp(), createdAt: firestore_1.FieldValue.serverTimestamp() }, (isPlaythrough ? { playthrough: true } : {})), (attribution ? { attribution } : {})), (promo ? { promo } : {})), { checkoutSession: (0, checkoutSession_1.checkoutSessionFromCallable)(request) });
        tx.set(orderRef, orderPayload);
        tx.update(hhRef, Object.assign(Object.assign({ updatedAt: new Date().toISOString() }, (freshPriced.giftCreditApplied > 0
            ? { giftCreditCents: (typeof fresh.giftCreditCents === 'number' ? fresh.giftCreditCents : 0) - freshPriced.giftCreditApplied }
            : {})), (freshPriced.platformCreditApplied > 0
            ? {
                platformCreditCents: (typeof fresh.platformCreditCents === 'number' ? fresh.platformCreditCents : 0) -
                    freshPriced.platformCreditApplied,
            }
            : {})));
        return {
            created: true,
            orderId: orderRef.id,
            totalCents: freshPriced.totalCents,
            discountCents: freshPriced.discountApplied,
            priced: freshPriced,
            orderPayload,
        };
    });
    if (!committed.created) {
        logger.info('commitPilotBox already has an open box', { householdId, orderId: committed.orderId });
        return {
            orderId: committed.orderId,
            totalCents: committed.totalCents,
            discountCents: committed.discountCents,
            status: 'committed',
        };
    }
    const orderPayload = committed.orderPayload;
    await (0, pilotParticipants_1.markPilotEnrollmentCommitted)(db, householdId, orderRef.id);
    await (0, promotions_1.recordPromoRedemption)(db, {
        sourcePath: orderRef.path,
        kind: 'order',
        resolved: resolvedPromo,
        promo,
        householdId,
    });
    await db.doc(`users/${request.auth.uid}`).set(Object.assign(Object.assign(Object.assign({ debriefReminderEligible: true, debriefReminderAttempts: 0, lockReminderEligible: false }, (((_m = data.contactPhone) === null || _m === void 0 ? void 0 : _m.trim()) ? { phone: data.contactPhone.trim() } : {})), (data.smsOptIn === true ? { smsOptIn: true } : {})), { updatedAt: new Date().toISOString() }), { merge: true });
    // Exit signal for the account setup nudge (Untraditional workspace).
    const commitEmail = typeof request.auth.token.email === 'string' ? request.auth.token.email : '';
    if (commitEmail) {
        await (0, untraditionalCio_1.untraditionalMarkSafe)(commitEmail, {
            grapejuice_setup_complete: true,
            grapejuice_setup_complete_at: new Date().toISOString(),
        });
    }
    if (!isPlaythrough) {
        try {
            const alloc = await (0, catalogInventory_1.recomputeBoxAllocations)(db);
            logger.info('commitPilotBox box allocations', Object.assign({ orderId: orderRef.id }, alloc));
        }
        catch (allocErr) {
            logger.error('commitPilotBox recomputeBoxAllocations failed', {
                orderId: orderRef.id,
                allocErr,
            });
        }
    }
    await sendOrderPurchaseToMeta({
        orderId: orderRef.id,
        order: orderPayload,
        context: (0, metaCapi_1.metaContextFromCallable)(request),
        email: await emailForMeta(request.auth.uid, request.auth.token.email),
        phone: ((_o = data.contactPhone) === null || _o === void 0 ? void 0 : _o.trim()) || null,
    });
    if (!isPlaythrough) {
        await (0, unaffiliated_1.reportUnaffiliatedShippingGeo)({ attribution, shippingAddress, email: commitEmail });
    }
    return {
        orderId: orderRef.id,
        totalCents: committed.totalCents,
        discountCents: committed.discountCents,
        status: 'committed',
    };
});
/**
 * Sync the household box draft onto a pre-ship committed order (swaps / add-ons
 * after commit). Recalculates merchandise + tax; keeps shipping address,
 * expedited flag, and already-applied credits from the order.
 */
exports.updatePilotBoxOrder = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
        throw new sentry_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    const householdId = (_b = request.data) === null || _b === void 0 ? void 0 : _b.householdId;
    const orderId = (_c = request.data) === null || _c === void 0 ? void 0 : _c.orderId;
    if (!householdId || !orderId) {
        throw new sentry_1.HttpsError('invalid-argument', 'householdId and orderId are required.');
    }
    await assertHouseholdMember(request.auth.uid, householdId);
    const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
        throw new sentry_1.HttpsError('not-found', 'Order not found.');
    }
    const order = (_d = orderSnap.data()) !== null && _d !== void 0 ? _d : {};
    const status = order.status;
    if (status !== 'committed' && status !== 'pending') {
        throw new sentry_1.HttpsError('failed-precondition', 'This order can no longer be updated. Contact support if you need changes.');
    }
    const lockAt = (_e = (typeof order.lockAt === 'string' ? order.lockAt : null)) !== null && _e !== void 0 ? _e : (await getLockAt(order.expeditedShipping === true));
    if (isLocked(lockAt)) {
        throw new sentry_1.HttpsError('failed-precondition', 'The box lock date has passed. Contact support to change your order.');
    }
    const draftSnap = await db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`).get();
    if (!draftSnap.exists) {
        throw new sentry_1.HttpsError('failed-precondition', 'No box draft found.');
    }
    const draftLines = (_g = (_f = draftSnap.data()) === null || _f === void 0 ? void 0 : _f.lineItems) !== null && _g !== void 0 ? _g : [];
    if (!draftLines.length) {
        throw new sentry_1.HttpsError('failed-precondition', 'Your box is empty. Add items before updating the order.');
    }
    const pilotMerge = await (0, pilotParticipants_1.withPilotLines)(db, householdId, draftLines);
    const lineItems = pilotMerge.lines;
    if (pilotMerge.changed) {
        await draftSnap.ref.update({ lineItems, lastChangeSource: 'pilot', updatedAt: new Date().toISOString() });
    }
    const configSnap = await db.doc('config/hanukkah-2026').get();
    const configData = (_h = configSnap.data()) !== null && _h !== void 0 ? _h : {};
    const { boxPriceCents, kidCount } = await (0, chargePilotBox_1.boxPriceForUser)(db, typeof order.userId === 'string' ? order.userId : request.auth.uid, configData);
    const expeditedShipping = order.expeditedShipping === true;
    const subtotalCents = orderTotalCents(lineItems, boxPriceCents);
    const shippingCents = typeof order.shippingCents === 'number'
        ? order.shippingCents
        : SHIPPING_FLAT_CENTS + (expeditedShipping ? EXPEDITED_SHIPPING_CENTS : 0);
    const giftCreditApplied = typeof order.giftCreditAppliedCents === 'number' ? order.giftCreditAppliedCents : 0;
    const platformCreditApplied = typeof order.platformCreditAppliedCents === 'number' ? order.platformCreditAppliedCents : 0;
    const priced = (0, chargePilotBox_1.checkoutTotalsAfterCredit)(subtotalCents + shippingCents, giftCreditApplied, platformCreditApplied, (0, promoPricing_1.discountCentsForTerms)((_j = order.promo) !== null && _j !== void 0 ? _j : null, subtotalCents));
    const { taxCents, totalCents, creditApplied } = priced;
    const previousTotal = typeof order.totalCents === 'number' ? order.totalCents : 0;
    const priorLines = (_k = order.lineItems) !== null && _k !== void 0 ? _k : [];
    if (order.playthrough !== true) {
        await (0, catalogInventory_1.assertBoxLinesWithinInventory)(db, lineItems, { creditLines: priorLines });
    }
    await orderRef.update({
        lineItems,
        boxPriceCents,
        kidCount,
        subtotalCents,
        shippingCents,
        discountCents: priced.discountApplied,
        taxCents,
        totalCents,
        creditAppliedCents: creditApplied,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    if (order.playthrough !== true) {
        try {
            const alloc = await (0, catalogInventory_1.recomputeBoxAllocations)(db);
            logger.info('updatePilotBoxOrder box allocations', Object.assign({ orderId }, alloc));
        }
        catch (allocErr) {
            logger.error('updatePilotBoxOrder recomputeBoxAllocations failed', { orderId, allocErr });
        }
    }
    return {
        orderId,
        totalCents,
        previousTotalCents: previousTotal,
        deltaCents: totalCents - previousTotal,
        status: status,
    };
});
/** Void a pre-ship committed/pending order; restore credits; keep card on file. */
exports.cancelPilotBoxOrder = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
        throw new sentry_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    const householdId = (_b = request.data) === null || _b === void 0 ? void 0 : _b.householdId;
    const orderId = (_c = request.data) === null || _c === void 0 ? void 0 : _c.orderId;
    if (!householdId || !orderId) {
        throw new sentry_1.HttpsError('invalid-argument', 'householdId and orderId are required.');
    }
    await assertHouseholdMember(request.auth.uid, householdId);
    const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
        throw new sentry_1.HttpsError('not-found', 'Order not found.');
    }
    const order = (_d = orderSnap.data()) !== null && _d !== void 0 ? _d : {};
    const status = order.status;
    if (status !== 'committed' && status !== 'pending') {
        if (status === 'cancelled') {
            throw new sentry_1.HttpsError('failed-precondition', 'This order is already cancelled.');
        }
        if (status === 'shipped' || status === 'delivered') {
            throw new sentry_1.HttpsError('failed-precondition', 'This box has already shipped. Contact support for help.');
        }
        throw new sentry_1.HttpsError('failed-precondition', 'This order can no longer be cancelled in the app. Contact support.');
    }
    const piId = typeof order.stripePaymentIntentId === 'string' ? order.stripePaymentIntentId : undefined;
    if (piId) {
        // Legacy orders: commit used to create a manual-capture PI before charge-at-ship refactor.
        if (!stripe_1.stripe) {
            throw new sentry_1.HttpsError('failed-precondition', 'Stripe is not configured.');
        }
        try {
            await stripe_1.stripe.paymentIntents.cancel(piId);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const alreadyCanceled = /already.*(cancel|cancell)/i.test(msg);
            if (!alreadyCanceled) {
                logger.error('Failed to cancel PaymentIntent', { piId, err });
                throw new sentry_1.HttpsError('internal', 'Could not release the payment hold. Try again or contact support.');
            }
        }
    }
    const giftRestore = typeof order.giftCreditAppliedCents === 'number' ? order.giftCreditAppliedCents : 0;
    const platformRestore = typeof order.platformCreditAppliedCents === 'number' ? order.platformCreditAppliedCents : 0;
    await db.runTransaction(async (tx) => {
        var _a;
        const fresh = await tx.get(orderRef);
        const freshStatus = (_a = fresh.data()) === null || _a === void 0 ? void 0 : _a.status;
        if (freshStatus !== 'committed' && freshStatus !== 'pending') {
            throw new sentry_1.HttpsError('failed-precondition', 'Order status changed. Refresh and try again.');
        }
        tx.update(orderRef, {
            status: 'cancelled',
            cancelledAt: firestore_1.FieldValue.serverTimestamp(),
            cancelledByUid: request.auth.uid,
        });
        if (giftRestore > 0 || platformRestore > 0) {
            tx.update(db.doc(`households/${householdId}`), Object.assign(Object.assign(Object.assign({}, (giftRestore > 0 ? { giftCreditCents: firestore_1.FieldValue.increment(giftRestore) } : {})), (platformRestore > 0 ? { platformCreditCents: firestore_1.FieldValue.increment(platformRestore) } : {})), { updatedAt: new Date().toISOString() }));
        }
    });
    await db.doc(`users/${request.auth.uid}`).set({
        lockReminderEligible: true,
        updatedAt: new Date().toISOString(),
    }, { merge: true });
    if (order.playthrough !== true) {
        try {
            const alloc = await (0, catalogInventory_1.recomputeBoxAllocations)(db);
            logger.info('cancelPilotBoxOrder box allocations', Object.assign({ orderId }, alloc));
        }
        catch (allocErr) {
            logger.error('cancelPilotBoxOrder recomputeBoxAllocations failed', { orderId, allocErr });
        }
    }
    return { orderId, status: 'cancelled' };
});
/**
 * QA / ops: charge one committed Hanukkah box order (normally runs on schedule after lock).
 * Pass force=true to charge before lockAt.
 */
exports.chargePilotBoxOrder = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
        throw new sentry_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    const householdId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.householdId) !== null && _c !== void 0 ? _c : '').trim();
    const orderId = String((_e = (_d = request.data) === null || _d === void 0 ? void 0 : _d.orderId) !== null && _e !== void 0 ? _e : '').trim();
    const force = ((_f = request.data) === null || _f === void 0 ? void 0 : _f.force) === true;
    if (!householdId || !orderId) {
        throw new sentry_1.HttpsError('invalid-argument', 'householdId and orderId are required.');
    }
    return (0, chargePilotBox_1.chargePilotBoxOrderForUser)(db, stripe_1.stripe, request.auth.uid, householdId, orderId, force);
});
/**
 * Refunds (issued in the Stripe dashboard) shrink or remove an order's / gift's discount-code use
 * and influencer commission. Needs `charge.refunded` on the webhook endpoint's event list.
 */
async function recordChargeRefund(charge) {
    var _a, _b, _c;
    let metadata = (_a = charge.metadata) !== null && _a !== void 0 ? _a : {};
    const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : (_b = charge.payment_intent) === null || _b === void 0 ? void 0 : _b.id;
    if (!metadata.orderId && !metadata.giftInviteId && piId && stripe_1.stripe) {
        metadata = (_c = (await stripe_1.stripe.paymentIntents.retrieve(piId)).metadata) !== null && _c !== void 0 ? _c : {};
    }
    const refundedCents = Math.max(0, Math.round(Number(charge.amount_refunded) || 0));
    const update = { refundedCents, refundedAt: new Date().toISOString() };
    if (metadata.type === 'pilot_gift' && metadata.giftInviteId) {
        await db.doc(`giftInvites/${metadata.giftInviteId}`).set(update, { merge: true });
    }
    else if (metadata.householdId && metadata.orderId) {
        const ref = db.doc(`households/${metadata.householdId}/orders/${metadata.orderId}`);
        if ((await ref.get()).exists)
            await ref.set(update, { merge: true });
    }
}
exports.stripeWebhook = (0, sentry_1.onRequest)({ cors: false }, async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9;
    if (req.method !== 'POST') {
        res.status(405).send('Method not allowed');
        return;
    }
    const sig = req.headers['stripe-signature'];
    const rawBody = (_a = req.rawBody) !== null && _a !== void 0 ? _a : Buffer.from(JSON.stringify((_b = req.body) !== null && _b !== void 0 ? _b : {}));
    if (!sig) {
        res.status(400).send('Missing stripe-signature');
        return;
    }
    let event;
    try {
        event = (0, stripe_1.verifyWebhook)(rawBody, sig);
    }
    catch (err) {
        logger.error('Webhook verify failed', err);
        res.status(400).send('Webhook Error');
        return;
    }
    try {
        const eventRef = db.doc(`stripeWebhookEvents/${event.id}`);
        const prior = await eventRef.get();
        if (prior.exists) {
            logger.info('Stripe webhook duplicate skipped', { eventId: event.id, type: event.type });
            res.json({ received: true, duplicate: true });
            return;
        }
        if (event.type === 'setup_intent.succeeded') {
            const si = event.data.object;
            const householdId = (_c = si.metadata) === null || _c === void 0 ? void 0 : _c.householdId;
            const paymentMethodId = typeof si.payment_method === 'string' ? si.payment_method : (_d = si.payment_method) === null || _d === void 0 ? void 0 : _d.id;
            const customerId = typeof si.customer === 'string' ? si.customer : (_e = si.customer) === null || _e === void 0 ? void 0 : _e.id;
            if (householdId && paymentMethodId) {
                const cardOnFileAt = new Date().toISOString();
                const cardOnFileSession = (0, checkoutSession_1.checkoutSessionFromStripeMetadata)(si.metadata, cardOnFileAt);
                await db.doc(`households/${householdId}`).update(Object.assign(Object.assign(Object.assign(Object.assign({ cardOnFileAt }, (cardOnFileSession ? { cardOnFileSession } : {})), { stripeDefaultPaymentMethodId: paymentMethodId }), (customerId ? { stripeCustomerId: customerId } : {})), { updatedAt: new Date().toISOString() }));
                if (stripe_1.stripe && customerId) {
                    await stripe_1.stripe.customers.update(customerId, {
                        invoice_settings: { default_payment_method: paymentMethodId },
                    });
                }
                const setupOrderId = (_f = si.metadata) === null || _f === void 0 ? void 0 : _f.orderId;
                const metaCtx = (0, metaCapi_1.metaContextFromStripeMetadata)(si.metadata);
                const setupUserId = (_h = (_g = si.metadata) === null || _g === void 0 ? void 0 : _g.userId) !== null && _h !== void 0 ? _h : null;
                let metaEmail = null;
                try {
                    metaEmail = await emailForMeta(setupUserId);
                }
                catch (emailErr) {
                    logger.warn('Meta: could not load email for setup intent', { setupIntentId: si.id, emailErr });
                }
                let committedMarketplaceOrder = null;
                if (((_j = si.metadata) === null || _j === void 0 ? void 0 : _j.type) === 'marketplace' && setupOrderId) {
                    const pendingRef = db.doc(`households/${householdId}/orders/${setupOrderId}`);
                    const pendingSnap = await pendingRef.get();
                    if (pendingSnap.exists && ((_k = pendingSnap.data()) === null || _k === void 0 ? void 0 : _k.status) === 'pending') {
                        await pendingRef.update({
                            status: 'committed',
                            updatedAt: new Date().toISOString(),
                        });
                        committedMarketplaceOrder = (_l = pendingSnap.data()) !== null && _l !== void 0 ? _l : null;
                    }
                }
                await (0, metaCapi_1.sendMetaEvent)({
                    eventName: 'AddPaymentInfo',
                    eventId: `payment_${si.id}`,
                    context: metaCtx,
                    user: { email: metaEmail, externalId: setupUserId },
                    stripeBacked: true,
                    playthrough: (committedMarketplaceOrder === null || committedMarketplaceOrder === void 0 ? void 0 : committedMarketplaceOrder.playthrough) === true,
                });
                if (committedMarketplaceOrder && setupOrderId) {
                    await sendOrderPurchaseToMeta({
                        orderId: setupOrderId,
                        order: committedMarketplaceOrder,
                        context: metaCtx,
                        email: metaEmail,
                    });
                }
                try {
                    await (0, chargePilotBox_1.retryFailedHanukkahBoxCharges)(db, stripe_1.stripe, householdId);
                }
                catch (retryErr) {
                    logger.warn('Could not retry Hanukkah box charge after card update', {
                        householdId,
                        retryErr,
                    });
                }
                try {
                    await retryFailedMarketplaceCharges(householdId);
                }
                catch (retryErr) {
                    logger.warn('Could not retry marketplace charge after card update', { householdId, retryErr });
                }
                if (((_m = si.metadata) === null || _m === void 0 ? void 0 : _m.type) === 'marketplace' && setupOrderId) {
                    const savedRef = db.doc(`households/${householdId}/orders/${setupOrderId}`);
                    const savedSnap = await savedRef.get();
                    const saved = savedSnap.data();
                    if ((saved === null || saved === void 0 ? void 0 : saved.status) === 'committed' && lockHasPassed(saved.lockAt)) {
                        try {
                            await chargeSingleMarketplaceOrder(householdId, setupOrderId, saved);
                        }
                        catch (chargeErr) {
                            logger.warn('Could not charge marketplace order after card save', {
                                householdId,
                                orderId: setupOrderId,
                                chargeErr,
                            });
                        }
                    }
                }
            }
        }
        if (event.type === 'payment_intent.succeeded') {
            const pi = event.data.object;
            const giftType = (_o = pi.metadata) === null || _o === void 0 ? void 0 : _o.type;
            if (giftType === 'pilot_gift') {
                const giftInviteId = (_p = pi.metadata) === null || _p === void 0 ? void 0 : _p.giftInviteId;
                if (giftInviteId) {
                    try {
                        await (0, giftPayment_1.finalizeGiftInvitePayment)(db, giftInviteId);
                    }
                    catch (giftErr) {
                        logger.error('Gift payment finalization failed', { giftInviteId, giftErr });
                    }
                }
            }
            else {
                const householdId = (_q = pi.metadata) === null || _q === void 0 ? void 0 : _q.householdId;
                const orderId = (_r = pi.metadata) === null || _r === void 0 ? void 0 : _r.orderId;
                if (!householdId || !orderId) {
                    logger.warn('payment_intent.succeeded missing metadata', pi.metadata);
                }
                else {
                    const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
                    const orderSnap = await orderRef.get();
                    if (orderSnap.exists && ((_s = orderSnap.data()) === null || _s === void 0 ? void 0 : _s.status) !== 'confirmed') {
                        const order = orderSnap.data();
                        const isMarketplaceOrder = order.orderType === 'marketplace' || ((_t = pi.metadata) === null || _t === void 0 ? void 0 : _t.type) === 'marketplace';
                        const isReceivedGift = order.orderType === 'received_gift' || ((_u = pi.metadata) === null || _u === void 0 ? void 0 : _u.type) === 'received_gift';
                        if (isMarketplaceOrder) {
                            try {
                                const claimed = await db.runTransaction(async (tx) => {
                                    var _a, _b;
                                    const snap = await tx.get(orderRef);
                                    const data = (_a = snap.data()) !== null && _a !== void 0 ? _a : {};
                                    const action = (0, catalogInventory_1.paidMarketplaceInventoryAction)(data);
                                    const credit = await (0, catalogInventory_1.reapplyLateCreditInTx)(tx, db.doc(`households/${householdId}`), data);
                                    if (!action && !credit)
                                        return null;
                                    tx.update(orderRef, Object.assign(Object.assign({}, (action ? { inventoryReserved: false, inventoryCommittedAt: new Date().toISOString() } : {})), ((_b = credit === null || credit === void 0 ? void 0 : credit.orderFields) !== null && _b !== void 0 ? _b : {})));
                                    return {
                                        inventory: action ? { action, lines: (0, catalogInventory_1.reservedLinesFromOrder)(data) } : null,
                                        credit: credit === null || credit === void 0 ? void 0 : credit.reapply,
                                    };
                                });
                                warnCreditShortfall(orderId, claimed === null || claimed === void 0 ? void 0 : claimed.credit);
                                if (claimed === null || claimed === void 0 ? void 0 : claimed.inventory) {
                                    await (0, catalogInventory_1.applyPaidMarketplaceInventory)(db, claimed.inventory.action, claimed.inventory.lines);
                                }
                            }
                            catch (invErr) {
                                logger.error('Marketplace inventory commit failed', { orderId, invErr });
                            }
                        }
                        await orderRef.update({
                            status: 'confirmed',
                            confirmedAt: firestore_1.FieldValue.serverTimestamp(),
                            stripePaymentIntentId: pi.id,
                            chargeFailedAt: firestore_1.FieldValue.delete(),
                            chargeFailureMessage: firestore_1.FieldValue.delete(),
                        });
                        const fresh = (_v = (await orderRef.get()).data()) !== null && _v !== void 0 ? _v : order;
                        if (isMarketplaceOrder && ((_w = pi.metadata) === null || _w === void 0 ? void 0 : _w.chargeTiming) === 'checkout') {
                            try {
                                await sendOrderPurchaseToMeta({
                                    orderId,
                                    order: fresh,
                                    context: (0, metaCapi_1.metaContextFromStripeMetadata)(pi.metadata),
                                    email: await emailForMeta(pi.metadata.userId, fresh.guestEmail),
                                });
                            }
                            catch (metaErr) {
                                logger.warn('Meta purchase for marketplace checkout failed', { orderId, metaErr });
                            }
                        }
                        if (isMarketplaceOrder || isReceivedGift) {
                            await fulfillMarketplaceOrder(householdId, orderId, Object.assign(Object.assign({}, fresh), { totalCents: fresh.totalCents }), fresh.playthrough === true);
                            const giftInviteId = (typeof fresh.giftInviteId === 'string' && fresh.giftInviteId) ||
                                ((_x = pi.metadata) === null || _x === void 0 ? void 0 : _x.giftInviteId);
                            if (giftInviteId &&
                                (fresh.orderType === 'received_gift' || ((_y = pi.metadata) === null || _y === void 0 ? void 0 : _y.type) === 'received_gift')) {
                                const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
                                const giftSnap = await giftRef.get();
                                if (giftSnap.exists && ((_z = giftSnap.data()) === null || _z === void 0 ? void 0 : _z.status) === 'available') {
                                    await giftRef.update({
                                        status: 'accepted',
                                        acceptedAt: new Date().toISOString(),
                                        updatedAt: new Date().toISOString(),
                                    });
                                }
                                if (fresh.playthrough !== true) {
                                    await recomputeBoxAllocationsLogged('received_gift payment', {
                                        orderId,
                                        giftInviteId,
                                    });
                                }
                            }
                        }
                        else if (giftType === 'hanukkah_box' ||
                            order.orderType === 'hanukkah_box' ||
                            order.holidayId === HOLIDAY_ID) {
                            await (0, chargePilotBox_1.fulfillHanukkahBoxOrder)(db, householdId, orderId, fresh);
                        }
                        else {
                            const userId = order.userId;
                            const userSnap = await db.doc(`users/${userId}`).get();
                            const email = (_1 = (_0 = userSnap.data()) === null || _0 === void 0 ? void 0 : _0.email) !== null && _1 !== void 0 ? _1 : '';
                            if (email) {
                                try {
                                    await (0, email_1.sendEmail)({
                                        to: email,
                                        template: 'order-confirmed',
                                        data: {
                                            orderId,
                                            totalCents: order.totalCents,
                                            estimatedDelivery: order.estimatedDelivery,
                                        },
                                    });
                                }
                                catch (emailErr) {
                                    logger.error('Order confirmation email failed', emailErr);
                                }
                            }
                        }
                    }
                }
            }
        }
        if (event.type === 'payment_intent.payment_failed') {
            const pi = event.data.object;
            if (((_2 = pi.metadata) === null || _2 === void 0 ? void 0 : _2.type) === 'hanukkah_box') {
                const householdId = pi.metadata.householdId;
                const orderId = pi.metadata.orderId;
                if (householdId && orderId) {
                    const message = (_4 = (_3 = pi.last_payment_error) === null || _3 === void 0 ? void 0 : _3.message) !== null && _4 !== void 0 ? _4 : 'Payment failed';
                    const attempt = Number(pi.metadata.chargeAttempt);
                    const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
                    const orderSnap = await orderRef.get();
                    const status = (_5 = orderSnap.data()) === null || _5 === void 0 ? void 0 : _5.status;
                    if (status === 'committed' || status === 'pending') {
                        await orderRef.update({
                            chargeFailedAt: new Date().toISOString(),
                            chargeFailureMessage: message,
                        });
                        await (0, chargePilotBox_1.notifyHanukkahBoxChargeFailed)(db, householdId, orderId, Number.isFinite(attempt) ? attempt : 1, message);
                    }
                    logger.warn('Hanukkah box charge failed', { householdId, orderId, message });
                }
            }
            if (((_6 = pi.metadata) === null || _6 === void 0 ? void 0 : _6.type) === 'marketplace') {
                const householdId = pi.metadata.householdId;
                const orderId = pi.metadata.orderId;
                if (householdId && orderId) {
                    const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
                    const orderSnap = await orderRef.get();
                    const order = orderSnap.data();
                    const message = (_8 = (_7 = pi.last_payment_error) === null || _7 === void 0 ? void 0 : _7.message) !== null && _8 !== void 0 ? _8 : 'Payment failed';
                    if ((order === null || order === void 0 ? void 0 : order.status) === 'committed') {
                        await orderRef.update({
                            chargeFailedAt: new Date().toISOString(),
                            chargeFailureMessage: message,
                        });
                    }
                    else if (pi.metadata.chargeTiming === 'checkout') {
                        // Shopper can retry on the same payment; the stale-reservation sweep frees abandoned holds.
                        logger.info('Marketplace checkout payment declined', { householdId, orderId, message });
                    }
                    else if ((order === null || order === void 0 ? void 0 : order.inventoryReserved) === true && !order.reservationReleasedAt) {
                        try {
                            await (0, catalogInventory_1.releaseMarketplaceReservations)(db, (0, catalogInventory_1.reservedLinesFromOrder)(order));
                            await orderRef.update({
                                inventoryReserved: false,
                                reservationReleasedAt: new Date().toISOString(),
                                chargeFailedAt: new Date().toISOString(),
                                chargeFailureMessage: message,
                            });
                        }
                        catch (relErr) {
                            logger.error('Marketplace reservation release on payment_failed failed', relErr);
                        }
                    }
                }
            }
        }
        if (event.type === 'payment_intent.canceled') {
            const pi = event.data.object;
            if (((_9 = pi.metadata) === null || _9 === void 0 ? void 0 : _9.type) === 'marketplace') {
                const householdId = pi.metadata.householdId;
                const orderId = pi.metadata.orderId;
                if (householdId && orderId) {
                    const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
                    const orderSnap = await orderRef.get();
                    const order = orderSnap.data();
                    if ((order === null || order === void 0 ? void 0 : order.inventoryReserved) === true && !order.reservationReleasedAt) {
                        try {
                            await (0, catalogInventory_1.releaseMarketplaceReservations)(db, (0, catalogInventory_1.reservedLinesFromOrder)(order));
                            await orderRef.update({
                                inventoryReserved: false,
                                reservationReleasedAt: new Date().toISOString(),
                                status: 'cancelled',
                                cancelReason: 'payment_intent_canceled',
                            });
                        }
                        catch (relErr) {
                            logger.error('Marketplace reservation release on canceled failed', relErr);
                        }
                    }
                }
            }
        }
        if (event.type === 'charge.refunded') {
            await recordChargeRefund(event.data.object);
        }
        await eventRef.set({
            type: event.type,
            processedAt: new Date().toISOString(),
        });
        res.json({ received: true });
    }
    catch (err) {
        logger.error('Webhook handler error', err);
        res.status(500).send('Webhook handler failed');
    }
});
exports.createPartnerInvite = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const householdId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.householdId) !== null && _c !== void 0 ? _c : '');
    const email = String((_e = (_d = request.data) === null || _d === void 0 ? void 0 : _d.email) !== null && _e !== void 0 ? _e : '').trim().toLowerCase();
    const invitedByName = String((_g = (_f = request.data) === null || _f === void 0 ? void 0 : _f.invitedByName) !== null && _g !== void 0 ? _g : 'Partner');
    if (!householdId || !email.includes('@')) {
        throw new sentry_1.HttpsError('invalid-argument', 'householdId and a valid email are required.');
    }
    await assertHouseholdMember(request.auth.uid, householdId);
    const hhSnap = await db.doc(`households/${householdId}`).get();
    if (!hhSnap.exists)
        throw new sentry_1.HttpsError('not-found', 'Household not found.');
    const householdName = String((_j = (_h = hhSnap.data()) === null || _h === void 0 ? void 0 : _h.name) !== null && _j !== void 0 ? _j : 'Our household');
    const inviteRef = db.collection(`households/${householdId}/partnerInvites`).doc();
    const payload = {
        householdId,
        householdName,
        invitedEmail: email,
        invitedByUid: request.auth.uid,
        invitedByName,
        status: 'pending',
        createdAt: new Date().toISOString(),
    };
    await inviteRef.set(payload);
    const inviterEmail = String((_k = request.auth.token.email) !== null && _k !== void 0 ? _k : '');
    const inviterLabel = invitedByName.trim() && invitedByName !== 'Partner' ? invitedByName.trim() : inviterEmail;
    try {
        const acceptUrl = await (0, loginLinks_2.mintInviteAcceptUrl)(db, { householdId, inviteId: inviteRef.id, email });
        await (0, email_1.sendEmail)({
            to: email,
            template: 'partner-invite',
            data: {
                householdName,
                invitedByName: inviterLabel,
                inviteId: inviteRef.id,
                accept_url: acceptUrl,
            },
        });
    }
    catch (err) {
        logger.error('Partner invite email failed', err);
    }
    return Object.assign({ id: inviteRef.id }, payload);
});
exports.listPartnerInvites = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const householdId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.householdId) !== null && _c !== void 0 ? _c : '');
    if (!householdId)
        throw new sentry_1.HttpsError('invalid-argument', 'householdId is required.');
    await assertHouseholdMember(request.auth.uid, householdId);
    const snap = await db.collection(`households/${householdId}/partnerInvites`).orderBy('createdAt', 'desc').get();
    return snap.docs.map((d) => (Object.assign({ id: d.id }, d.data())));
});
exports.acceptPartnerInvite = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const inviteId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.inviteId) !== null && _c !== void 0 ? _c : '');
    if (!inviteId)
        throw new sentry_1.HttpsError('invalid-argument', 'inviteId is required.');
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const userEmail = String((_e = (_d = userSnap.data()) === null || _d === void 0 ? void 0 : _d.email) !== null && _e !== void 0 ? _e : '').trim().toLowerCase();
    if (!userEmail)
        throw new sentry_1.HttpsError('failed-precondition', 'Account email is missing.');
    const groups = await db.collectionGroup('partnerInvites').where('invitedEmail', '==', userEmail).where('status', '==', 'pending').get();
    const inviteDoc = groups.docs.find((d) => d.id === inviteId);
    if (!inviteDoc)
        throw new sentry_1.HttpsError('not-found', 'Invite not found.');
    const invite = inviteDoc.data();
    await db.doc(`households/${invite.householdId}`).update({
        memberIds: firestore_1.FieldValue.arrayUnion(request.auth.uid),
        updatedAt: new Date().toISOString(),
    });
    await db.doc(`users/${request.auth.uid}`).set({ householdId: invite.householdId, updatedAt: new Date().toISOString() }, { merge: true });
    await inviteDoc.ref.update({
        status: 'accepted',
        acceptedByUid: request.auth.uid,
    });
    return { ok: true };
});
exports.writeOrderTracking = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const householdId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.householdId) !== null && _c !== void 0 ? _c : '');
    const orderId = String((_e = (_d = request.data) === null || _d === void 0 ? void 0 : _d.orderId) !== null && _e !== void 0 ? _e : '');
    const trackingNumber = String((_g = (_f = request.data) === null || _f === void 0 ? void 0 : _f.trackingNumber) !== null && _g !== void 0 ? _g : '').trim();
    const carrier = String((_j = (_h = request.data) === null || _h === void 0 ? void 0 : _h.carrier) !== null && _j !== void 0 ? _j : 'USPS').trim();
    if (!householdId || !orderId || !trackingNumber) {
        throw new sentry_1.HttpsError('invalid-argument', 'householdId, orderId, and trackingNumber are required.');
    }
    await assertHouseholdMember(request.auth.uid, householdId);
    await (0, shipstation_1.applyShipStationTracking)(db, householdId, orderId, { trackingNumber, carrier });
    return { ok: true };
});
/**
 * ShipStation → Grapejuice tracking writeback.
 * Configure in ShipStation: Settings → Integrations → Webhooks
 * SHIP_NOTIFY (label created) and FULFILLMENT_SHIPPED (Mark as Shipped).
 * URL: https://<region>-<project>.cloudfunctions.net/shipStationWebhook?key=<SHIPSTATION_WEBHOOK_SECRET>
 */
exports.shipStationWebhook = (0, sentry_1.onRequest)({ cors: false }, async (req, res) => {
    var _a;
    if (req.method !== 'POST') {
        res.status(405).send('Method not allowed');
        return;
    }
    if (!(0, shipstation_1.verifyShipStationWebhookSecret)(req)) {
        res.status(401).send('Unauthorized');
        return;
    }
    try {
        const body = typeof req.body === 'object' && req.body != null
            ? req.body
            : JSON.parse(String((_a = req.rawBody) !== null && _a !== void 0 ? _a : '{}'));
        const result = await (0, shipstation_1.processShipStationShipNotify)(db, body);
        res.status(200).json(Object.assign({ ok: true }, result));
    }
    catch (err) {
        logger.error('ShipStation webhook failed', err);
        res.status(500).send('Webhook Error');
    }
});
/** Signed-out givers pass `giverEmail`; the gift is filed under that email's account (see giverUidForEmail). */
exports.purchasePilotGift = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1;
    if (!stripe_1.stripe)
        throw new sentry_1.HttpsError('failed-precondition', 'Stripe is not configured.');
    const guestGiverEmail = ((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid) ? null : (0, loginLinks_2.normalizeEmail)((_b = request.data) === null || _b === void 0 ? void 0 : _b.giverEmail);
    const recipientEmail = String((_d = (_c = request.data) === null || _c === void 0 ? void 0 : _c.recipientEmail) !== null && _d !== void 0 ? _d : '').trim().toLowerCase();
    const giverName = String((_f = (_e = request.data) === null || _e === void 0 ? void 0 : _e.giverName) !== null && _f !== void 0 ? _f : 'Someone who loves you').trim();
    const message = String((_h = (_g = request.data) === null || _g === void 0 ? void 0 : _g.message) !== null && _h !== void 0 ? _h : '').trim();
    const creditCents = typeof ((_j = request.data) === null || _j === void 0 ? void 0 : _j.creditCents) === 'number' ? request.data.creditCents : DEFAULT_GIFT_CREDIT_CENTS;
    const customize = ((_k = request.data) === null || _k === void 0 ? void 0 : _k.customize) === true;
    const giftKind = customize ? 'box' : 'credit';
    const lineItems = Array.isArray((_l = request.data) === null || _l === void 0 ? void 0 : _l.lineItems) ? request.data.lineItems : undefined;
    const childInterests = Array.isArray((_m = request.data) === null || _m === void 0 ? void 0 : _m.childInterests) ? request.data.childInterests : undefined;
    const childAgeGroups = Array.isArray((_o = request.data) === null || _o === void 0 ? void 0 : _o.childAgeGroups) ? request.data.childAgeGroups : undefined;
    const familyName = (0, giftPayment_1.sanitizeGiftFamilyName)((_p = request.data) === null || _p === void 0 ? void 0 : _p.familyName);
    const giftChildren = customize ? (0, giftPayment_1.sanitizeGiftChildren)((_q = request.data) === null || _q === void 0 ? void 0 : _q.giftChildren) : undefined;
    if (!isValidEmail(recipientEmail)) {
        throw new sentry_1.HttpsError('invalid-argument', 'A valid recipient email is required.');
    }
    if (giftKind === 'box' && isLocked(await getLockAt())) {
        throw new sentry_1.HttpsError('failed-precondition', 'Gift boxes for this Hanukkah closed when boxes locked. You can still send gift credit.');
    }
    const priceConfig = (_r = (await db.doc('config/hanukkah-2026').get()).data()) !== null && _r !== void 0 ? _r : {};
    const listCents = typeof priceConfig.boxPriceCents === 'number' ? priceConfig.boxPriceCents : DEFAULT_BOX_PRICE_CENTS;
    const perExtraKidCents = (0, chargePilotBox_1.boxPriceCentsForKids)(2, listCents) - listCents;
    if (giftKind === 'box') {
        const addOnCents = (lineItems !== null && lineItems !== void 0 ? lineItems : []).reduce((sum, li) => {
            const unit = Math.max(0, Math.round(Number(li === null || li === void 0 ? void 0 : li.unitCents) || 0));
            return sum + unit * Math.max(1, Math.floor(Number(li === null || li === void 0 ? void 0 : li.quantity) || 1));
        }, 0);
        const minCents = (0, chargePilotBox_1.boxPriceCentsForKids)(Math.max(1, (_s = childAgeGroups === null || childAgeGroups === void 0 ? void 0 : childAgeGroups.length) !== null && _s !== void 0 ? _s : 0), listCents) + addOnCents;
        if (creditCents < minCents) {
            throw new sentry_1.HttpsError('invalid-argument', 'The gift total is out of date. Refresh the page and try again.');
        }
    }
    else {
        // Credit matches a box price: list price plus whole extra kids.
        const extraCents = creditCents - listCents;
        if (extraCents < 0 || extraCents % perExtraKidCents !== 0 || extraCents > 16 * perExtraKidCents) {
            throw new sentry_1.HttpsError('invalid-argument', 'That gift credit amount isn’t available.');
        }
    }
    if (giftKind === 'box' && (lineItems === null || lineItems === void 0 ? void 0 : lineItems.length)) {
        await (0, catalogInventory_1.assertBoxLinesWithinInventory)(db, lineItems);
    }
    const shippingAddressRaw = (_t = request.data) === null || _t === void 0 ? void 0 : _t.shippingAddress;
    const giverShippingAddress = giftKind === 'box' && (shippingAddressRaw === null || shippingAddressRaw === void 0 ? void 0 : shippingAddressRaw.line1) ? sanitizeShippingAddress(shippingAddressRaw) : null;
    if (giverShippingAddress &&
        (!giverShippingAddress.name ||
            !giverShippingAddress.city ||
            !giverShippingAddress.stateProvince ||
            !giverShippingAddress.postalCode)) {
        throw new sentry_1.HttpsError('invalid-argument', 'Please complete their shipping address, or leave it blank.');
    }
    let giverUid;
    let giverEmail;
    if (guestGiverEmail) {
        await (0, loginLinks_2.enforceRateLimits)(db, guestGiverEmail, request.rawRequest, 'gift:');
        giverEmail = guestGiverEmail;
        giverUid = await (0, loginLinks_2.giverUidForEmail)(guestGiverEmail, String((_v = (_u = request.data) === null || _u === void 0 ? void 0 : _u.giverName) !== null && _v !== void 0 ? _v : '').trim() || null);
    }
    else {
        giverUid = request.auth.uid;
        const userSnap = await db.doc(`users/${giverUid}`).get();
        giverEmail = String((_y = (_x = (_w = userSnap.data()) === null || _w === void 0 ? void 0 : _w.email) !== null && _x !== void 0 ? _x : request.auth.token.email) !== null && _y !== void 0 ? _y : '').trim().toLowerCase();
    }
    const resolvedPromo = await (0, promotions_1.resolveCheckoutPromo)(db, (_z = request.data) === null || _z === void 0 ? void 0 : _z.promo, giverEmail || null);
    const applied = (0, promotions_1.applyResolvedPromo)(resolvedPromo, creditCents);
    // Stripe's minimum charge; the recipient still receives the full gift.
    const discountCents = Math.min(applied.discountCents, Math.max(0, creditCents - 50));
    const amountDueCents = creditCents - discountCents;
    const claimToken = (0, crypto_1.randomBytes)(24).toString('hex');
    const inviteRef = db.collection('giftInvites').doc();
    const metaContext = (0, metaCapi_1.metaContextForDoc)((0, metaCapi_1.metaContextFromCallable)(request));
    const attribution = (0, metaCapi_1.sanitizeAttribution)((_0 = request.data) === null || _0 === void 0 ? void 0 : _0.attribution);
    const payload = Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({ giverUid,
        giverName,
        giverEmail,
        recipientEmail,
        creditCents }, (applied.promo ? { promo: applied.promo, discountCents, amountDueCents } : {})), { kind: giftKind, claimToken, status: 'pending', paymentStatus: 'pending' }), (message ? { message } : {})), (giftKind === 'box' && lineItems ? { lineItems } : {})), (giftKind === 'box' && childInterests ? { childInterests } : {})), (giftKind === 'box' && childAgeGroups ? { childAgeGroups } : {})), (familyName ? { familyName } : {})), (giftKind === 'box' && giftChildren ? { giftChildren } : {})), (giverShippingAddress ? { shippingAddress: giverShippingAddress } : {})), (Object.keys(metaContext).length ? { metaContext } : {})), (attribution ? { attribution } : {})), { createdAt: new Date().toISOString() });
    await inviteRef.set(payload);
    await (0, promotions_1.recordPromoRedemption)(db, {
        sourcePath: inviteRef.path,
        kind: 'gift',
        resolved: resolvedPromo,
        promo: applied.promo,
        householdId: null,
    });
    const paymentIntent = await stripe_1.stripe.paymentIntents.create(Object.assign(Object.assign({ amount: amountDueCents, currency: 'usd', metadata: {
            type: 'pilot_gift',
            giftInviteId: inviteRef.id,
            giverUid,
        } }, (giverEmail ? { receipt_email: giverEmail } : {})), { automatic_payment_methods: { enabled: true } }));
    await inviteRef.update({ stripePaymentIntentId: paymentIntent.id });
    const appBase = (_1 = process.env.PILOT_APP_BASE_URL) !== null && _1 !== void 0 ? _1 : 'https://app.grapejuice.co';
    const claimUrl = `${appBase}/gift/claim?token=${claimToken}`;
    return {
        giftInviteId: inviteRef.id,
        clientSecret: paymentIntent.client_secret,
        publishableKey: stripe_1.stripePublishableKey || null,
        claimToken,
        claimUrl,
        creditCents,
        discountCents,
        amountDueCents,
    };
});
/** Signed-out givers prove the gift is theirs with the claimToken purchasePilotGift returned. */
exports.finalizePilotGiftPayment = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e;
    const giftInviteId = String((_b = (_a = request.data) === null || _a === void 0 ? void 0 : _a.giftInviteId) !== null && _b !== void 0 ? _b : '').trim();
    if (!giftInviteId)
        throw new sentry_1.HttpsError('invalid-argument', 'giftInviteId is required.');
    const claimToken = typeof ((_c = request.data) === null || _c === void 0 ? void 0 : _c.claimToken) === 'string' ? request.data.claimToken : '';
    const inviteSnap = await db.collection('giftInvites').doc(giftInviteId).get();
    if (!inviteSnap.exists)
        throw new sentry_1.HttpsError('not-found', 'Gift invite not found.');
    const invite = inviteSnap.data();
    const isGiver = Boolean((_d = request.auth) === null || _d === void 0 ? void 0 : _d.uid) && invite.giverUid === ((_e = request.auth) === null || _e === void 0 ? void 0 : _e.uid);
    const hasToken = Boolean(claimToken) && claimToken === invite.claimToken;
    if (!isGiver && !hasToken) {
        throw new sentry_1.HttpsError('permission-denied', 'Only the giver can finalize this gift.');
    }
    try {
        const result = await (0, giftPayment_1.finalizeGiftInvitePayment)(db, giftInviteId, (0, metaCapi_1.metaContextFromCallable)(request));
        return { ok: true, claimUrl: result.claimUrl, alreadyFinalized: result.alreadyFinalized };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Payment not completed';
        throw new sentry_1.HttpsError('failed-precondition', message);
    }
});
/**
 * Conversions API copy of non-checkout browser events. CompleteRegistration sends once
 * per account (`reg_<uid>`); PreRegister and BoxBuilt reuse the browser's event id for dedupe.
 * BoxBuilt is withheld above the practice cutoff in metaPracticeCutoff.ts (practice score,
 * tie-broken by Hanukkah at exactly 50) so Broad keeps optimizing on lower-practice builders.
 * The server-only BoxFollowUp fires for every box build at every practice level (scored or
 * not) — the follow-up audience includes high-practice builders too.
 * The scores are never sent to Meta.
 */
exports.trackMetaEvent = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    const eventName = (_a = request.data) === null || _a === void 0 ? void 0 : _a.eventName;
    if (eventName !== 'CompleteRegistration' && eventName !== 'PreRegister' && eventName !== 'BoxBuilt') {
        throw new sentry_1.HttpsError('invalid-argument', 'Unsupported event.');
    }
    const context = (0, metaCapi_1.metaContextFromCallable)(request);
    if (context.skip)
        return { ok: true };
    const uid = (_c = (_b = request.auth) === null || _b === void 0 ? void 0 : _b.uid) !== null && _c !== void 0 ? _c : null;
    const email = uid ? await emailForMeta(uid, (_d = request.auth) === null || _d === void 0 ? void 0 : _d.token.email) : null;
    if (eventName === 'CompleteRegistration') {
        if (!uid)
            throw new sentry_1.HttpsError('unauthenticated', 'Must be signed in.');
        const userRef = db.doc(`users/${uid}`);
        const firstSend = await db.runTransaction(async (tx) => {
            var _a;
            const snap = await tx.get(userRef);
            // Never create the profile here — SessionContext treats an existing doc as onboarded state.
            if (!snap.exists || ((_a = snap.data()) === null || _a === void 0 ? void 0 : _a.metaRegistrationSentAt))
                return false;
            tx.update(userRef, { metaRegistrationSentAt: new Date().toISOString() });
            return true;
        });
        if (firstSend) {
            await (0, metaCapi_1.sendMetaEvent)({
                eventName,
                eventId: `reg_${uid}`,
                context,
                user: { email, externalId: uid },
            });
        }
        return { ok: true };
    }
    const contentName = typeof ((_e = request.data) === null || _e === void 0 ? void 0 : _e.contentName) === 'string' ? request.data.contentName.trim().slice(0, 100) : '';
    let suppressBoxBuilt = false;
    let storedPractice;
    let storedFamiliarity;
    if (eventName === 'BoxBuilt') {
        if (uid) {
            const snap = await db.doc(`users/${uid}`).get();
            storedPractice = (_g = (_f = snap.data()) === null || _f === void 0 ? void 0 : _f.lastBoxAnswers) === null || _g === void 0 ? void 0 : _g.practiceFrequencyScore;
            storedFamiliarity = (_j = (_h = snap.data()) === null || _h === void 0 ? void 0 : _h.lastBoxAnswers) === null || _j === void 0 ? void 0 : _j.familiarityScore;
        }
        suppressBoxBuilt =
            (0, metaPracticeCutoff_1.practiceAboveMetaCutoff)((_k = request.data) === null || _k === void 0 ? void 0 : _k.practiceFrequencyScore, (_l = request.data) === null || _l === void 0 ? void 0 : _l.familiarityScore) ||
                (0, metaPracticeCutoff_1.practiceAboveMetaCutoff)(storedPractice, storedFamiliarity);
    }
    if (!suppressBoxBuilt) {
        await (0, metaCapi_1.sendMetaEvent)(Object.assign({ eventName, eventId: (_m = context.eventId) !== null && _m !== void 0 ? _m : `${eventName === 'BoxBuilt' ? 'boxbuilt' : 'prereg'}_${(0, crypto_1.randomBytes)(8).toString('hex')}`, context, user: { email, externalId: uid } }, (contentName ? { customData: { content_name: contentName } } : {})));
    }
    if (eventName === 'BoxBuilt') {
        await (0, metaCapi_1.sendMetaEvent)({
            eventName: 'BoxFollowUp',
            eventId: `followup_${(0, crypto_1.randomBytes)(8).toString('hex')}`,
            context,
            user: { email, externalId: uid },
        });
    }
    return { ok: true };
});
/** Gifts the signed-in user has purchased (giver side). */
exports.listMyGiftInvites = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const uid = request.auth.uid;
    const userSnap = await db.doc(`users/${uid}`).get();
    const giverEmail = String((_d = (_c = (_b = userSnap.data()) === null || _b === void 0 ? void 0 : _b.email) !== null && _c !== void 0 ? _c : request.auth.token.email) !== null && _d !== void 0 ? _d : '')
        .trim()
        .toLowerCase();
    const byUidSnap = await db.collection('giftInvites').where('giverUid', '==', uid).get();
    const docMap = new Map();
    for (const doc of byUidSnap.docs) {
        docMap.set(doc.id, doc);
    }
    // Fallback: same email, different uid (account re-created) — rare but avoids “missing orders”.
    if (giverEmail.includes('@')) {
        const byEmailSnap = await db
            .collection('giftInvites')
            .where('giverEmail', '==', giverEmail)
            .get();
        for (const doc of byEmailSnap.docs) {
            docMap.set(doc.id, doc);
        }
    }
    const invites = [...docMap.values()]
        .map((doc) => {
        var _a;
        const data = doc.data();
        return {
            id: doc.id,
            giverUid: data.giverUid,
            giverName: data.giverName,
            giverEmail: data.giverEmail,
            recipientEmail: data.recipientEmail,
            message: data.message,
            creditCents: data.creditCents,
            claimToken: data.claimToken,
            status: data.status,
            paymentStatus: (_a = data.paymentStatus) !== null && _a !== void 0 ? _a : (data.claimEmailSentAt ? 'paid' : 'pending'),
            claimEmailSentAt: data.claimEmailSentAt,
            lineItems: data.lineItems,
            childInterests: data.childInterests,
            createdAt: data.createdAt,
            claimedAt: data.claimedAt,
            claimedByHouseholdId: data.claimedByHouseholdId,
        };
    })
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return { invites };
});
/**
 * Public peek — validate a claim link before signup.
 * Returns status only (no PII beyond giver display name).
 */
exports.peekGiftInvite = (0, sentry_1.onCall)(async (request) => {
    var _a, _b;
    const token = String((_b = (_a = request.data) === null || _a === void 0 ? void 0 : _a.token) !== null && _b !== void 0 ? _b : '').trim();
    if (!token)
        throw new sentry_1.HttpsError('invalid-argument', 'token is required.');
    const snap = await db.collection('giftInvites').where('claimToken', '==', token).limit(1).get();
    if (snap.empty) {
        return { status: 'not_found' };
    }
    const invite = snap.docs[0].data();
    if (invite.status === 'claimed') {
        return {
            status: 'claimed',
            giverName: invite.giverName || undefined,
            creditCents: invite.creditCents,
            giftKind: (0, giftPayment_1.resolveGiftInviteKind)(invite),
        };
    }
    if (invite.paymentStatus === 'pending') {
        return { status: 'unpaid', giverName: invite.giverName || undefined };
    }
    const purchasedKind = (0, giftPayment_1.resolveGiftInviteKind)(invite);
    const giftKind = purchasedKind === 'box' && !invite.autoShipOrderId && isLocked(await getLockAt())
        ? 'credit'
        : purchasedKind;
    return {
        status: 'claimable',
        giverName: invite.giverName || undefined,
        creditCents: invite.creditCents,
        hasGiverDraft: giftKind === 'box',
        giftKind,
    };
});
exports.claimGiftInvite = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const token = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.token) !== null && _c !== void 0 ? _c : '').trim();
    if (!token)
        throw new sentry_1.HttpsError('invalid-argument', 'token is required.');
    const snap = await db.collection('giftInvites').where('claimToken', '==', token).limit(1).get();
    if (snap.empty)
        throw new sentry_1.HttpsError('not-found', 'Gift invite not found.');
    const inviteDoc = snap.docs[0];
    const invite = inviteDoc.data();
    if (invite.status === 'claimed') {
        throw new sentry_1.HttpsError('failed-precondition', 'This gift has already been claimed.');
    }
    if (invite.paymentStatus === 'pending') {
        throw new sentry_1.HttpsError('failed-precondition', 'This gift has not been paid for yet.');
    }
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    let householdId = (_d = userSnap.data()) === null || _d === void 0 ? void 0 : _d.householdId;
    const now = new Date().toISOString();
    const purchasedKind = (0, giftPayment_1.resolveGiftInviteKind)(invite);
    // Past lock, a box that didn't already ship to the giver's address arrives as credit.
    const boxBecameCredit = purchasedKind === 'box' && !invite.autoShipOrderId && isLocked(await getLockAt());
    const giftKind = boxBecameCredit ? 'credit' : purchasedKind;
    const autoShipped = giftKind === 'box' && Boolean(invite.autoShipOrderId);
    if (!householdId) {
        const hhRef = db.collection('households').doc();
        await hhRef.set({
            name: 'Our household',
            ownerId: request.auth.uid,
            memberIds: [request.auth.uid],
            childUserIds: [],
            giftCreditCents: giftKind === 'credit' ? invite.creditCents : 0,
            createdAt: now,
            updatedAt: now,
        });
        householdId = hhRef.id;
        await db.doc(`users/${request.auth.uid}`).set({ householdId, updatedAt: now }, { merge: true });
    }
    else if (giftKind === 'credit') {
        const hhRef = db.doc(`households/${householdId}`);
        const hhSnap = await hhRef.get();
        const currentGift = typeof ((_e = hhSnap.data()) === null || _e === void 0 ? void 0 : _e.giftCreditCents) === 'number' ? hhSnap.data().giftCreditCents : 0;
        await hhRef.update({
            giftCreditCents: currentGift + invite.creditCents,
            updatedAt: now,
        });
    }
    // Store on household — never merge into the family's own box draft.
    const boxLines = giftKind === 'box' ? ((_f = invite.lineItems) !== null && _f !== void 0 ? _f : []) : [];
    const prepaidAddOnCents = giftKind === 'box' ? chargeableLineTotal(boxLines) : 0;
    await db.doc(`households/${householdId}/receivedGifts/${inviteDoc.id}`).set(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({ giftInviteId: inviteDoc.id, giverName: invite.giverName, message: (_g = invite.message) !== null && _g !== void 0 ? _g : null, kind: giftKind, creditCents: invite.creditCents, prepaidAddOnCents, lineItems: giftKind === 'box' ? (_h = invite.lineItems) !== null && _h !== void 0 ? _h : [] : [], childInterests: giftKind === 'box' ? (_j = invite.childInterests) !== null && _j !== void 0 ? _j : [] : [] }, (invite.familyName ? { familyName: invite.familyName } : {})), (giftKind === 'box' && invite.giftChildren ? { giftChildren: invite.giftChildren } : {})), { giverShippingAddress: giftKind === 'box' ? (_k = invite.shippingAddress) !== null && _k !== void 0 ? _k : null : null, status: autoShipped ? 'accepted' : 'available' }), (autoShipped
        ? { acceptedAt: now, checkoutOrderId: invite.autoShipOrderId, surprise: true, autoShippedAt: now }
        : {})), (boxBecameCredit ? { autoConvertedAt: now } : {})), { claimedAt: now, updatedAt: now }));
    await inviteDoc.ref.update(Object.assign(Object.assign({ status: 'claimed', kind: purchasedKind }, (boxBecameCredit ? { claimedAsCredit: true } : {})), { claimedAt: now, claimedByHouseholdId: householdId, claimedByUid: request.auth.uid }));
    // Claiming a gift is not starting a household Hanukkah box. Only force
    // BoxReveal when they already have their own draft in progress.
    const draftSnap = await db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`).get();
    const ownLineItems = Array.isArray((_l = draftSnap.data()) === null || _l === void 0 ? void 0 : _l.lineItems)
        ? draftSnap.data().lineItems
        : [];
    const hasOwnBoxDraft = ownLineItems.length > 0;
    const userUpdates = {
        onboardingComplete: true,
        updatedAt: now,
    };
    if (!hasOwnBoxDraft) {
        userUpdates.boxRevealComplete = true;
        userUpdates.lockReminderEligible = false;
    }
    await db.doc(`users/${request.auth.uid}`).set(userUpdates, { merge: true });
    return {
        householdId,
        giftInviteId: inviteDoc.id,
        giftKind,
        giftCreditCents: giftKind === 'credit' ? invite.creditCents : 0,
        giverName: invite.giverName,
        message: invite.message,
        hasGiverDraft: giftKind === 'box',
        alreadyShipping: autoShipped,
    };
});
function mapReceivedGiftDoc(docId, data) {
    var _a, _b, _c, _d, _e;
    return {
        id: docId,
        giftInviteId: String((_a = data.giftInviteId) !== null && _a !== void 0 ? _a : docId),
        giverName: String((_b = data.giverName) !== null && _b !== void 0 ? _b : ''),
        message: typeof data.message === 'string' ? data.message : undefined,
        kind: data.kind === 'box' ? 'box' : 'credit',
        creditCents: Number((_c = data.creditCents) !== null && _c !== void 0 ? _c : 0),
        prepaidAddOnCents: data.prepaidAddOnCents != null && Number.isFinite(Number(data.prepaidAddOnCents))
            ? Math.max(0, Math.round(Number(data.prepaidAddOnCents)))
            : undefined,
        lineItems: Array.isArray(data.lineItems) ? data.lineItems : [],
        giverShippingAddress: data.giverShippingAddress && typeof data.giverShippingAddress === 'object'
            ? data.giverShippingAddress
            : undefined,
        surprise: data.surprise === true ? true : undefined,
        status: String((_d = data.status) !== null && _d !== void 0 ? _d : 'available'),
        claimedAt: String((_e = data.claimedAt) !== null && _e !== void 0 ? _e : ''),
        viewedAt: data.viewedAt ? String(data.viewedAt) : undefined,
        convertedAt: data.convertedAt ? String(data.convertedAt) : undefined,
        acceptedAt: data.acceptedAt ? String(data.acceptedAt) : undefined,
        checkoutOrderId: data.checkoutOrderId ? String(data.checkoutOrderId) : undefined,
    };
}
async function backfillReceivedGiftFromInvite(householdId, inviteId, invite) {
    var _a, _b, _c, _d, _e, _f;
    const now = new Date().toISOString();
    const giftKind = (0, giftPayment_1.resolveGiftInviteKind)(invite);
    const boxLines = giftKind === 'box' ? ((_a = invite.lineItems) !== null && _a !== void 0 ? _a : []) : [];
    const record = Object.assign(Object.assign(Object.assign({ giftInviteId: inviteId, giverName: invite.giverName, message: (_b = invite.message) !== null && _b !== void 0 ? _b : null, kind: giftKind, creditCents: invite.creditCents, prepaidAddOnCents: giftKind === 'box' ? chargeableLineTotal(boxLines) : 0, lineItems: giftKind === 'box' ? (_c = invite.lineItems) !== null && _c !== void 0 ? _c : [] : [], childInterests: giftKind === 'box' ? (_d = invite.childInterests) !== null && _d !== void 0 ? _d : [] : [] }, (invite.familyName ? { familyName: invite.familyName } : {})), (giftKind === 'box' && invite.giftChildren ? { giftChildren: invite.giftChildren } : {})), { giverShippingAddress: giftKind === 'box' ? (_e = invite.shippingAddress) !== null && _e !== void 0 ? _e : null : null, status: 'available', claimedAt: (_f = invite.claimedAt) !== null && _f !== void 0 ? _f : now, updatedAt: now });
    await db.doc(`households/${householdId}/receivedGifts/${inviteId}`).set(record, { merge: true });
    return mapReceivedGiftDoc(inviteId, record);
}
async function loadReceivedGiftsForHousehold(householdId) {
    const snap = await db.collection(`households/${householdId}/receivedGifts`).get();
    const giftsMap = new Map();
    for (const doc of snap.docs) {
        giftsMap.set(doc.id, mapReceivedGiftDoc(doc.id, doc.data()));
    }
    const inviteSnap = await db
        .collection('giftInvites')
        .where('claimedByHouseholdId', '==', householdId)
        .get();
    for (const doc of inviteSnap.docs) {
        const invite = doc.data();
        if (invite.status !== 'claimed')
            continue;
        if (giftsMap.has(doc.id))
            continue;
        giftsMap.set(doc.id, await backfillReceivedGiftFromInvite(householdId, doc.id, invite));
    }
    return [...giftsMap.values()].sort((a, b) => Date.parse(b.claimedAt) - Date.parse(a.claimedAt));
}
async function ensureReceivedGiftDoc(householdId, giftInviteId) {
    const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
    const giftSnap = await giftRef.get();
    if (giftSnap.exists)
        return giftSnap;
    const inviteSnap = await db.doc(`giftInvites/${giftInviteId}`).get();
    if (!inviteSnap.exists)
        throw new sentry_1.HttpsError('not-found', 'Gift not found.');
    const invite = inviteSnap.data();
    if (invite.claimedByHouseholdId !== householdId || invite.status !== 'claimed') {
        throw new sentry_1.HttpsError('not-found', 'Gift not found.');
    }
    await backfillReceivedGiftFromInvite(householdId, giftInviteId, invite);
    return giftRef.get();
}
/** Gifts this household has claimed (recipient side). */
exports.listMyReceivedGifts = (0, sentry_1.onCall)(async (request) => {
    var _a, _b;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const householdId = (_b = userSnap.data()) === null || _b === void 0 ? void 0 : _b.householdId;
    if (!householdId)
        return { gifts: [] };
    await assertHouseholdMember(request.auth.uid, householdId);
    const gifts = await loadReceivedGiftsForHousehold(householdId);
    return { gifts };
});
/** Mark a received gift box as viewed (does not accept or convert). */
exports.markReceivedGiftViewed = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const giftInviteId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.giftInviteId) !== null && _c !== void 0 ? _c : '').trim();
    if (!giftInviteId)
        throw new sentry_1.HttpsError('invalid-argument', 'giftInviteId is required.');
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const householdId = (_d = userSnap.data()) === null || _d === void 0 ? void 0 : _d.householdId;
    if (!householdId)
        throw new sentry_1.HttpsError('failed-precondition', 'No household.');
    await assertHouseholdMember(request.auth.uid, householdId);
    const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
    await ensureReceivedGiftDoc(householdId, giftInviteId);
    const now = new Date().toISOString();
    await giftRef.set({ viewedAt: now, updatedAt: now }, { merge: true });
    return { ok: true };
});
function normalizeGiftLineItems(raw) {
    if (!Array.isArray(raw) || !raw.length) {
        throw new sentry_1.HttpsError('invalid-argument', 'lineItems are required.');
    }
    return raw.map((li, i) => {
        var _a, _b, _c;
        const itemId = String((_a = li.itemId) !== null && _a !== void 0 ? _a : '').trim();
        if (!itemId)
            throw new sentry_1.HttpsError('invalid-argument', `lineItems[${i}].itemId is required.`);
        return {
            slotId: String((_b = li.slotId) !== null && _b !== void 0 ? _b : 'addon'),
            itemId,
            quantity: Math.max(1, Math.floor(Number(li.quantity) || 1)),
            unitCents: Math.max(0, Math.round(Number(li.unitCents) || 0)),
            label: String((_c = li.label) !== null && _c !== void 0 ? _c : itemId),
        };
    });
}
/** Persist curated / add-on line items on a received gift box (status must stay available). */
exports.updateReceivedGiftLineItems = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const giftInviteId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.giftInviteId) !== null && _c !== void 0 ? _c : '').trim();
    if (!giftInviteId)
        throw new sentry_1.HttpsError('invalid-argument', 'giftInviteId is required.');
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const householdId = (_d = userSnap.data()) === null || _d === void 0 ? void 0 : _d.householdId;
    if (!householdId)
        throw new sentry_1.HttpsError('failed-precondition', 'No household.');
    await assertHouseholdMember(request.auth.uid, householdId);
    const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
    const giftSnap = await ensureReceivedGiftDoc(householdId, giftInviteId);
    const gift = (_e = giftSnap.data()) !== null && _e !== void 0 ? _e : {};
    if (gift.kind !== 'box') {
        throw new sentry_1.HttpsError('failed-precondition', 'Only gift boxes can be edited.');
    }
    if (gift.status !== 'available') {
        throw new sentry_1.HttpsError('failed-precondition', 'This gift can no longer be edited.');
    }
    const lineItems = normalizeGiftLineItems((Array.isArray((_f = request.data) === null || _f === void 0 ? void 0 : _f.lineItems) ? request.data.lineItems : []));
    const now = new Date().toISOString();
    const existingLines = (_g = gift.lineItems) !== null && _g !== void 0 ? _g : [];
    await (0, catalogInventory_1.assertBoxLinesWithinInventory)(db, lineItems, {
        creditLines: await (0, catalogInventory_1.heldReceivedGiftLines)(db, householdId, giftInviteId, existingLines),
    });
    const prepaidAddOnCents = typeof gift.prepaidAddOnCents === 'number' && Number.isFinite(gift.prepaidAddOnCents)
        ? Math.max(0, Math.round(gift.prepaidAddOnCents))
        : chargeableLineTotal(existingLines);
    await giftRef.update({
        lineItems,
        prepaidAddOnCents,
        viewedAt: (_h = gift.viewedAt) !== null && _h !== void 0 ? _h : now,
        updatedAt: now,
    });
    await recomputeBoxAllocationsLogged('updateReceivedGiftLineItems', { giftInviteId });
    return { ok: true, lineItems };
});
/**
 * Checkout paid add-ons on a received gift box (giver already paid the box base).
 * Applies household gift/platform credit; charges remainder via PaymentIntent.
 */
exports.createReceivedGiftCheckout = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    try {
        const giftInviteId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.giftInviteId) !== null && _c !== void 0 ? _c : '').trim();
        const shippingAddressRaw = (_d = request.data) === null || _d === void 0 ? void 0 : _d.shippingAddress;
        if (!giftInviteId || !(shippingAddressRaw === null || shippingAddressRaw === void 0 ? void 0 : shippingAddressRaw.line1) || !(shippingAddressRaw === null || shippingAddressRaw === void 0 ? void 0 : shippingAddressRaw.city)) {
            throw new sentry_1.HttpsError('invalid-argument', 'giftInviteId and shippingAddress are required.');
        }
        const shippingAddress = sanitizeShippingAddress(shippingAddressRaw);
        if (!shippingAddress.name || !shippingAddress.stateProvince || !shippingAddress.postalCode) {
            throw new sentry_1.HttpsError('invalid-argument', 'Please enter name, street, city, state/province, and postal code.');
        }
        const userSnap = await db.doc(`users/${request.auth.uid}`).get();
        const householdId = (_e = userSnap.data()) === null || _e === void 0 ? void 0 : _e.householdId;
        if (!householdId)
            throw new sentry_1.HttpsError('failed-precondition', 'No household.');
        const hhSnap = await assertHouseholdMember(request.auth.uid, householdId);
        const hhData = (_f = hhSnap.data()) !== null && _f !== void 0 ? _f : {};
        const giftCreditCents = typeof hhData.giftCreditCents === 'number' ? hhData.giftCreditCents : 0;
        const platformCreditCents = typeof hhData.platformCreditCents === 'number' ? hhData.platformCreditCents : 0;
        const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
        const giftSnap = await ensureReceivedGiftDoc(householdId, giftInviteId);
        const gift = (_g = giftSnap.data()) !== null && _g !== void 0 ? _g : {};
        if (gift.kind !== 'box') {
            throw new sentry_1.HttpsError('failed-precondition', 'Only gift boxes can be checked out.');
        }
        const lockAt = await getLockAt();
        if (isLocked(lockAt)) {
            throw new sentry_1.HttpsError('failed-precondition', 'The deadline to confirm gift boxes has passed. Email hello@grapejuice.co and we’ll help.');
        }
        // "Keep it a surprise" used to accept without an address; those still need one checkout.
        const acceptedWithoutCheckout = gift.status === 'accepted' && !gift.checkoutOrderId;
        if (gift.status !== 'available' && !acceptedWithoutCheckout) {
            throw new sentry_1.HttpsError('failed-precondition', 'This gift was already used or converted.');
        }
        const lineItems = Array.isArray((_h = request.data) === null || _h === void 0 ? void 0 : _h.lineItems) && request.data.lineItems.length
            ? normalizeGiftLineItems(request.data.lineItems)
            : normalizeGiftLineItems((_j = gift.lineItems) !== null && _j !== void 0 ? _j : []);
        const prepaidAddOnCents = typeof gift.prepaidAddOnCents === 'number' && Number.isFinite(gift.prepaidAddOnCents)
            ? Math.max(0, Math.round(gift.prepaidAddOnCents))
            : chargeableLineTotal((_k = gift.lineItems) !== null && _k !== void 0 ? _k : []);
        // Persist snapshot if missing so later edits don't rewrite the baseline.
        if (gift.prepaidAddOnCents == null) {
            await giftRef.set({ prepaidAddOnCents }, { merge: true });
        }
        // Giver already paid prepaidAddOnCents — recipient only pays upgrades above that.
        const subtotalCents = recipientGiftUpgradeCents(lineItems, prepaidAddOnCents);
        const shippingCents = SHIPPING_FLAT_CENTS;
        const buyerEmail = String((_o = (_m = (_l = userSnap.data()) === null || _l === void 0 ? void 0 : _l.email) !== null && _m !== void 0 ? _m : request.auth.token.email) !== null && _o !== void 0 ? _o : '').trim().toLowerCase() || null;
        const resolvedPromo = await (0, promotions_1.resolveCheckoutPromo)(db, (_p = request.data) === null || _p === void 0 ? void 0 : _p.promo, buyerEmail);
        const { discountCents, promo } = (0, promotions_1.applyResolvedPromo)(resolvedPromo, subtotalCents);
        const priced = (0, chargePilotBox_1.checkoutTotalsAfterCredit)(subtotalCents + shippingCents, giftCreditCents, platformCreditCents, discountCents);
        const { taxCents, totalCents, giftCreditApplied, platformCreditApplied, creditApplied } = priced;
        if (totalCents > 0 && totalCents < 50) {
            throw new sentry_1.HttpsError('invalid-argument', 'Order total is too small.');
        }
        const configSnap = await db.doc('config/hanukkah-2026').get();
        const configData = (_q = configSnap.data()) !== null && _q !== void 0 ? _q : {};
        const estimatedDelivery = (_r = configData.estimatedDeliveryBy) !== null && _r !== void 0 ? _r : '2026-11-24';
        const skipShipStation = ((_s = request.data) === null || _s === void 0 ? void 0 : _s.skipShipStation) === true || (0, testAccounts_1.isPlaythroughTestEmail)(buyerEmail);
        if (!skipShipStation) {
            await (0, catalogInventory_1.assertBoxLinesWithinInventory)(db, lineItems, {
                creditLines: await (0, catalogInventory_1.heldReceivedGiftLines)(db, householdId, giftInviteId, gift.lineItems),
            });
        }
        const orderRef = db.collection(`households/${householdId}/orders`).doc();
        const now = new Date().toISOString();
        const orderPayload = Object.assign({ status: totalCents === 0 ? 'confirmed' : 'pending', orderType: 'received_gift', giftInviteId,
            lineItems,
            subtotalCents,
            shippingCents, discountCents: priced.discountApplied, taxCents,
            totalCents, creditAppliedCents: creditApplied, giftCreditAppliedCents: giftCreditApplied, platformCreditAppliedCents: platformCreditApplied, shippingAddress, holidayId: HOLIDAY_ID, userId: request.auth.uid, estimatedDelivery,
            lockAt, createdAt: firestore_1.FieldValue.serverTimestamp() }, (promo ? { promo } : {}));
        if (totalCents === 0)
            orderPayload.confirmedAt = firestore_1.FieldValue.serverTimestamp();
        if (skipShipStation)
            orderPayload.playthrough = true;
        if (((_t = request.data) === null || _t === void 0 ? void 0 : _t.surprise) === true)
            orderPayload.giftSurprise = true;
        await orderRef.set(orderPayload);
        await (0, promotions_1.recordPromoRedemption)(db, {
            sourcePath: orderRef.path,
            kind: 'order',
            resolved: resolvedPromo,
            promo,
            householdId,
        });
        await giftRef.update({
            lineItems,
            viewedAt: (_u = gift.viewedAt) !== null && _u !== void 0 ? _u : now,
            updatedAt: now,
            checkoutOrderId: orderRef.id,
            surprise: ((_v = request.data) === null || _v === void 0 ? void 0 : _v.surprise) === true,
        });
        if (!skipShipStation) {
            await recomputeBoxAllocationsLogged('createReceivedGiftCheckout', {
                orderId: orderRef.id,
                giftInviteId,
            });
        }
        if (creditApplied > 0) {
            await db.doc(`households/${householdId}`).update(Object.assign(Object.assign(Object.assign({}, (giftCreditApplied > 0 ? { giftCreditCents: giftCreditCents - giftCreditApplied } : {})), (platformCreditApplied > 0
                ? { platformCreditCents: platformCreditCents - platformCreditApplied }
                : {})), { updatedAt: new Date().toISOString() }));
        }
        // Credit-covered orders skip Stripe entirely (same as marketplace $0 path).
        if (totalCents === 0) {
            await giftRef.update({
                status: 'accepted',
                acceptedAt: now,
                updatedAt: now,
            });
            await fulfillMarketplaceOrder(householdId, orderRef.id, orderPayload, skipShipStation);
            return {
                orderId: orderRef.id,
                totalCents: 0,
                clientSecret: null,
                status: 'confirmed',
            };
        }
        if (!stripe_1.stripe) {
            throw new sentry_1.HttpsError('failed-precondition', 'Stripe is not configured. Set STRIPE_SECRET_KEY on Functions.');
        }
        const paymentIntent = await stripe_1.stripe.paymentIntents.create({
            amount: totalCents,
            currency: 'usd',
            metadata: {
                householdId,
                orderId: orderRef.id,
                userId: request.auth.uid,
                type: 'received_gift',
                giftInviteId,
            },
            automatic_payment_methods: { enabled: true },
        });
        if (!paymentIntent.client_secret) {
            throw new sentry_1.HttpsError('internal', 'PaymentIntent missing client secret.');
        }
        await orderRef.update({ stripePaymentIntentId: paymentIntent.id });
        return {
            clientSecret: paymentIntent.client_secret,
            orderId: orderRef.id,
            totalCents,
            status: 'pending',
        };
    }
    catch (err) {
        if (err instanceof sentry_1.HttpsError)
            throw err;
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('createReceivedGiftCheckout failed', { err, message: msg });
        throw new sentry_1.HttpsError('internal', msg || 'Checkout failed. Please try again.');
    }
});
/** Convert a received gift box to spendable gift credit after viewing items. */
exports.convertReceivedGiftToCredit = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const giftInviteId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.giftInviteId) !== null && _c !== void 0 ? _c : '').trim();
    if (!giftInviteId)
        throw new sentry_1.HttpsError('invalid-argument', 'giftInviteId is required.');
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const householdId = (_d = userSnap.data()) === null || _d === void 0 ? void 0 : _d.householdId;
    if (!householdId)
        throw new sentry_1.HttpsError('failed-precondition', 'No household.');
    await assertHouseholdMember(request.auth.uid, householdId);
    const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
    const giftSnap = await ensureReceivedGiftDoc(householdId, giftInviteId);
    const gift = giftSnap.data();
    if (gift.kind !== 'box') {
        throw new sentry_1.HttpsError('failed-precondition', 'Only gift boxes can be converted to credit.');
    }
    if (gift.status !== 'available') {
        throw new sentry_1.HttpsError('failed-precondition', 'This gift was already used or converted.');
    }
    const creditCents = typeof gift.creditCents === 'number' ? gift.creditCents : DEFAULT_GIFT_CREDIT_CENTS;
    const now = new Date().toISOString();
    const hhRef = db.doc(`households/${householdId}`);
    const hhSnap = await hhRef.get();
    const currentGift = typeof ((_e = hhSnap.data()) === null || _e === void 0 ? void 0 : _e.giftCreditCents) === 'number' ? hhSnap.data().giftCreditCents : 0;
    await db.runTransaction(async (tx) => {
        var _a;
        const fresh = await tx.get(giftRef);
        if (!fresh.exists || ((_a = fresh.data()) === null || _a === void 0 ? void 0 : _a.status) !== 'available') {
            throw new sentry_1.HttpsError('failed-precondition', 'Gift already converted.');
        }
        tx.update(giftRef, { status: 'converted_to_credit', convertedAt: now, updatedAt: now });
        tx.update(hhRef, { giftCreditCents: currentGift + creditCents, updatedAt: now });
    });
    await recomputeBoxAllocationsLogged('convertReceivedGiftToCredit', { giftInviteId });
    return { ok: true, creditCentsAdded: creditCents };
});
/** Mark a received gift box as accepted (recipient is opening the gift box flow). */
exports.acceptReceivedGiftBox = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const giftInviteId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.giftInviteId) !== null && _c !== void 0 ? _c : '').trim();
    if (!giftInviteId)
        throw new sentry_1.HttpsError('invalid-argument', 'giftInviteId is required.');
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const householdId = (_d = userSnap.data()) === null || _d === void 0 ? void 0 : _d.householdId;
    if (!householdId)
        throw new sentry_1.HttpsError('failed-precondition', 'No household.');
    await assertHouseholdMember(request.auth.uid, householdId);
    const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
    const giftSnap = await ensureReceivedGiftDoc(householdId, giftInviteId);
    const gift = giftSnap.data();
    if (gift.kind !== 'box') {
        throw new sentry_1.HttpsError('failed-precondition', 'Not a gift box.');
    }
    if (gift.status !== 'available') {
        throw new sentry_1.HttpsError('failed-precondition', 'This gift is no longer available.');
    }
    const now = new Date().toISOString();
    await giftRef.update({ status: 'accepted', acceptedAt: now, updatedAt: now });
    return { ok: true };
});
/**
 * Undo accidental accept (e.g. old “Review” CTA) when no confirmed checkout exists,
 * so the recipient can manage / convert again.
 */
exports.reopenReceivedGiftBox = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const giftInviteId = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.giftInviteId) !== null && _c !== void 0 ? _c : '').trim();
    if (!giftInviteId)
        throw new sentry_1.HttpsError('invalid-argument', 'giftInviteId is required.');
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const householdId = (_d = userSnap.data()) === null || _d === void 0 ? void 0 : _d.householdId;
    if (!householdId)
        throw new sentry_1.HttpsError('failed-precondition', 'No household.');
    await assertHouseholdMember(request.auth.uid, householdId);
    const giftRef = db.doc(`households/${householdId}/receivedGifts/${giftInviteId}`);
    const giftSnap = await ensureReceivedGiftDoc(householdId, giftInviteId);
    const gift = (_e = giftSnap.data()) !== null && _e !== void 0 ? _e : {};
    if (gift.kind !== 'box') {
        throw new sentry_1.HttpsError('failed-precondition', 'Not a gift box.');
    }
    if (gift.status !== 'accepted') {
        throw new sentry_1.HttpsError('failed-precondition', 'Only accepted gifts can be reopened.');
    }
    const checkoutOrderId = typeof gift.checkoutOrderId === 'string' ? gift.checkoutOrderId.trim() : '';
    if (checkoutOrderId) {
        const orderSnap = await db.doc(`households/${householdId}/orders/${checkoutOrderId}`).get();
        const orderStatus = orderSnap.exists ? String((_g = (_f = orderSnap.data()) === null || _f === void 0 ? void 0 : _f.status) !== null && _g !== void 0 ? _g : '') : '';
        if (orderStatus === 'confirmed' || orderStatus === 'shipped' || orderStatus === 'delivered') {
            throw new sentry_1.HttpsError('failed-precondition', 'This gift already has a confirmed order and can’t be reopened.');
        }
    }
    const now = new Date().toISOString();
    await giftRef.update({
        status: 'available',
        acceptedAt: firestore_1.FieldValue.delete(),
        viewedAt: (_h = gift.viewedAt) !== null && _h !== void 0 ? _h : now,
        updatedAt: now,
    });
    return { ok: true };
});
/** Manual trigger for ops — send debrief reminder to one email. */
exports.sendDebriefReminders = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    const to = String((_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.email) !== null && _c !== void 0 ? _c : '').trim();
    const attempt = ((_d = request.data) === null || _d === void 0 ? void 0 : _d.attempt) === 2 ? 2 : 1;
    if (!to.includes('@'))
        throw new sentry_1.HttpsError('invalid-argument', 'email is required.');
    const claimUrl = `${(_e = process.env.PILOT_APP_BASE_URL) !== null && _e !== void 0 ? _e : 'https://app.grapejuice.co'}/?preview=debrief`;
    await (0, email_1.sendDebriefReminderEmail)({ to, attempt, claimUrl });
    return { ok: true, attempt };
});
/** Daily batch — eligible users who have not completed debrief (only after Hanukkah ends). */
exports.scheduledDebriefReminders = (0, sentry_1.onSchedule)('every day 10:00', async () => {
    await (0, debriefReminders_1.runDebriefReminderBatch)(db);
});
/** Daily batch — lock countdown for users with uncommitted box drafts. */
exports.scheduledLockReminders = (0, sentry_1.onSchedule)('every day 09:00', async () => {
    const lockAt = await getLockAt();
    if (!lockAt || isLocked(lockAt))
        return;
    await (0, lockReminders_1.runLockReminderBatch)(db, lockAt);
});
/** Gift boxes without a confirmed address: a week before lock and on deadline day. Stubs until the template env var is set. */
exports.scheduledGiftConfirmReminders = (0, sentry_1.onSchedule)({ schedule: 'every day 10:00', timeZone: 'America/New_York' }, async () => {
    await runGiftConfirmReminders();
});
/** Daily batch — account holders with a box draft but no shipping/payment yet (Customer.io event). */
exports.scheduledSetupNudges = (0, sentry_1.onSchedule)('every day 08:00', async () => {
    if (process.env.GJ_SETUP_NUDGE_ENABLED !== 'true') {
        logger.info('scheduledSetupNudges skipped — GJ_SETUP_NUDGE_ENABLED is not true');
        return;
    }
    const lockAt = await getLockAt();
    if (!lockAt || isLocked(lockAt))
        return;
    await (0, setupNudge_1.runSetupNudgeBatch)(db, lockAt);
});
/** Hourly — pilot invite links for newly eligible families (pilotParticipants.runPilotAutoInvites). */
exports.scheduledPilotAutoInvites = (0, sentry_1.onSchedule)('every 1 hours', async () => {
    if (process.env.GJ_PILOT_AUTO_INVITE_ENABLED !== 'true') {
        logger.info('scheduledPilotAutoInvites skipped — GJ_PILOT_AUTO_INVITE_ENABLED is not true');
        return;
    }
    await (0, pilotParticipants_1.runPilotAutoInvites)(db);
});
/** Charge committed Hanukkah box orders once lockAt has passed (final draft totals). */
exports.scheduledChargePilotBoxes = (0, sentry_1.onSchedule)('every 1 hours', async () => {
    if (!stripe_1.stripe) {
        logger.warn('scheduledChargePilotBoxes skipped — Stripe not configured');
    }
    else {
        await (0, chargePilotBox_1.runChargeEligiblePilotBoxOrders)(db, stripe_1.stripe);
        await runChargeEligibleMarketplaceOrders();
    }
    try {
        await runSettleUnconfirmedGiftBoxes();
        await runExportHeldOrders();
    }
    catch (giftErr) {
        logger.error('runExportHeldOrders failed', giftErr);
    }
    try {
        const alloc = await (0, catalogInventory_1.recomputeBoxAllocations)(db);
        logger.info('scheduledChargePilotBoxes box allocations', alloc);
    }
    catch (allocErr) {
        logger.error('recomputeBoxAllocations failed', allocErr);
    }
});
/** Release stale marketplace inventory reservations (pending unpaid checkouts). */
exports.scheduledReleaseStaleMarketplaceReservations = (0, sentry_1.onSchedule)('every 1 hours', async () => {
    const result = await (0, catalogInventory_1.releaseStaleMarketplaceReservations)(db);
    logger.info('scheduledReleaseStaleMarketplaceReservations', result);
});
/** Admin / QA: recompute boxAllocatedQty from active box orders (any time). */
exports.recomputeCatalogBoxAllocations = (0, sentry_1.onCall)(async (request) => {
    var _a;
    if (!((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
        throw new sentry_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    if (!(0, guestSessions_2.isAdminToken)(request.auth.token)) {
        throw new sentry_1.HttpsError('permission-denied', 'Admin only.');
    }
    return (0, catalogInventory_1.recomputeBoxAllocations)(db);
});
/**
 * Replace-sync Grapejuice Airtable catalog → Firestore catalog/hanukkah/items.
 * Auth: Authorization: Bearer $CATALOG_SYNC_SECRET
 * Also requires AIRTABLE_PAT (and optional AIRTABLE_BASE_ID).
 */
exports.syncAirtableCatalog = (0, sentry_1.onRequest)({
    cors: true,
    timeoutSeconds: 300,
    memory: '1GiB',
    // Public URL; auth is Authorization: Bearer $CATALOG_SYNC_SECRET
    invoker: 'public',
}, async (req, res) => {
    var _a;
    try {
        if (req.method !== 'POST' && req.method !== 'GET') {
            res.status(405).send('Method not allowed');
            return;
        }
        (0, airtableCatalogSync_1.assertCatalogSyncSecret)((_a = req.get('Authorization')) !== null && _a !== void 0 ? _a : undefined);
        const result = await (0, airtableCatalogSync_1.runAirtableCatalogReplaceSync)();
        logger.info('Airtable catalog sync complete', result);
        res.status(200).json(Object.assign({ ok: true }, result));
    }
    catch (e) {
        const status = e.status === 401 ? 401 : 500;
        logger.error('Airtable catalog sync failed', e);
        res.status(status).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
});
/**
 * Generate missing grid thumbnails from catalog photos already in Storage and write only
 * `imageThumbUrls` on each item — no Airtable resync. Dry run unless `?apply=1`.
 * `?maxCreate=N` caps thumbs encoded per call (default 400); re-run until `truncated` is false.
 * Auth: Authorization: Bearer $CATALOG_SYNC_SECRET
 */
exports.backfillCatalogThumbsHttp = (0, sentry_1.onRequest)({
    timeoutSeconds: 540,
    memory: '1GiB',
    invoker: 'public',
}, async (req, res) => {
    var _a;
    try {
        if (req.method !== 'POST') {
            res.status(405).send('Method not allowed');
            return;
        }
        (0, airtableCatalogSync_1.assertCatalogSyncSecret)((_a = req.get('Authorization')) !== null && _a !== void 0 ? _a : undefined);
        const maxCreate = Number(req.query.maxCreate);
        const result = await (0, catalogThumbs_1.backfillCatalogThumbs)({
            holiday: airtableCatalogSync_1.CATALOG_HOLIDAY,
            apply: req.query.apply === '1',
            maxCreate: Number.isFinite(maxCreate) && maxCreate >= 0 ? maxCreate : undefined,
        });
        logger.info('Catalog thumb backfill complete', result);
        res.status(200).json(Object.assign({ ok: true }, result));
    }
    catch (e) {
        const status = e.status === 401 ? 401 : 500;
        logger.error('Catalog thumb backfill failed', e);
        res.status(status).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
});
/** Near-realtime safety net — full replace sync every 5 minutes when PAT is configured. */
exports.scheduledAirtableCatalogSync = (0, sentry_1.onSchedule)({ schedule: 'every 5 minutes', timeoutSeconds: 300, memory: '1GiB' }, async () => {
    var _a;
    if (!((_a = process.env.AIRTABLE_PAT) === null || _a === void 0 ? void 0 : _a.trim())) {
        logger.warn('Skipping scheduled catalog sync — AIRTABLE_PAT unset');
        return;
    }
    const result = await (0, airtableCatalogSync_1.runAirtableCatalogReplaceSync)();
    logger.info('Scheduled Airtable catalog sync complete', result);
});
/**
 * Attest community eligibility → generate a Hanukkah box discount code and email it.
 * Auth optional (guests can request with email); signed-in users also store code on household.
 */
exports.requestBoxDiscountCode = (0, sentry_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const email = String((_b = (_a = request.data) === null || _a === void 0 ? void 0 : _a.email) !== null && _b !== void 0 ? _b : '')
        .trim()
        .toLowerCase();
    const attestAllTrue = ((_c = request.data) === null || _c === void 0 ? void 0 : _c.attestAllTrue) === true;
    const statements = Array.isArray((_d = request.data) === null || _d === void 0 ? void 0 : _d.statements) ? request.data.statements : [];
    if (!email.includes('@')) {
        throw new sentry_1.HttpsError('invalid-argument', 'A valid email is required.');
    }
    if (!attestAllTrue) {
        throw new sentry_1.HttpsError('failed-precondition', 'Please attest that all statements are true.');
    }
    const allAffirmed = statements.every((s) => s && s.affirmed === true);
    if (!allAffirmed || statements.length < 1) {
        throw new sentry_1.HttpsError('failed-precondition', 'Please confirm each eligibility statement.');
    }
    const code = `GJ70-${(0, crypto_1.randomBytes)(3).toString('hex').toUpperCase()}`;
    const uid = (_f = (_e = request.auth) === null || _e === void 0 ? void 0 : _e.uid) !== null && _f !== void 0 ? _f : null;
    let householdId = null;
    if (uid) {
        const userSnap = await db.doc(`users/${uid}`).get();
        householdId = (_h = (_g = userSnap.data()) === null || _g === void 0 ? void 0 : _g.householdId) !== null && _h !== void 0 ? _h : null;
    }
    await db.collection('discountAttestations').add({
        email,
        uid,
        householdId,
        code,
        statements,
        attestAllTrue,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    if (householdId) {
        await db.doc(`households/${householdId}`).set({
            boxDiscountCode: code,
            updatedAt: new Date().toISOString(),
        }, { merge: true });
    }
    try {
        await (0, email_1.sendEmail)({
            to: email,
            template: 'box-discount',
            data: {
                code,
                boxPrice: '$80',
                boxValue: '$250',
            },
        });
    }
    catch (e) {
        logger.warn('requestBoxDiscountCode email failed', e);
    }
    return { code };
});
//# sourceMappingURL=index.js.map