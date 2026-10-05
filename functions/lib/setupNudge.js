"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SETUP_NUDGE_EVENT = void 0;
exports.draftItemCount = draftItemCount;
exports.setupNudgeSkipReason = setupNudgeSkipReason;
exports.lockDateLabel = lockDateLabel;
exports.runSetupNudgeBatch = runSetupNudgeBatch;
const logger = require("firebase-functions/logger");
const auth_1 = require("firebase-admin/auth");
const emailItems_1 = require("./emailItems");
const guestSessions_1 = require("./guestSessions");
const untraditionalCio_1 = require("./untraditionalCio");
/**
 * "Finish setting up your box" nudge: account holders with a Hanukkah box draft who have not
 * committed it yet (no shipping address and/or no card). One Customer.io event per household,
 * ever; the campaign itself lives in the Untraditional workspace.
 */
const HOLIDAY_ID = 'hanukkah-2026';
exports.SETUP_NUDGE_EVENT = 'grapejuice_account_setup_needed';
/** Give people a day to finish on their own before emailing. */
const MIN_DRAFT_AGE_MS = 24 * 60 * 60 * 1000;
const UTM = 'utm_source=lifecycle&utm_medium=email&utm_campaign=account_setup';
function draftItemCount(lineItems) {
    if (!Array.isArray(lineItems))
        return 0;
    return lineItems.reduce((sum, line) => {
        const qty = line && typeof line === 'object' ? line.quantity : 0;
        return sum + (typeof qty === 'number' && qty > 0 ? qty : 0);
    }, 0);
}
function setupNudgeSkipReason(c, now) {
    if (c.setupNudgeSentAt)
        return 'already_sent';
    if (c.hasCommittedOrder)
        return 'committed';
    if (draftItemCount(c.lineItems) === 0)
        return 'empty_draft';
    const updated = typeof c.draftUpdatedAt === 'string' ? Date.parse(c.draftUpdatedAt) : NaN;
    if (Number.isFinite(updated) && now.getTime() - updated < MIN_DRAFT_AGE_MS)
        return 'too_recent';
    return null;
}
/** "November 7" in Eastern time, for copy like "until November 7". */
function lockDateLabel(lockAt) {
    return new Date(lockAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/New_York' });
}
async function ownerEmail(db, ownerId) {
    var _a, _b;
    if (!ownerId)
        return null;
    const user = await db.doc(`users/${ownerId}`).get();
    const fromDoc = (_a = user.data()) === null || _a === void 0 ? void 0 : _a.email;
    if (typeof fromDoc === 'string' && fromDoc.includes('@'))
        return fromDoc.trim();
    const authUser = await (0, auth_1.getAuth)()
        .getUser(ownerId)
        .catch(() => null);
    return (_b = authUser === null || authUser === void 0 ? void 0 : authUser.email) !== null && _b !== void 0 ? _b : null;
}
async function hasCommittedOrder(db, householdId) {
    const snap = await db
        .collection(`households/${householdId}/orders`)
        .where('holidayId', '==', HOLIDAY_ID)
        .where('status', '==', 'committed')
        .limit(1)
        .get();
    return !snap.empty;
}
async function runSetupNudgeBatch(db, lockAt, now = new Date()) {
    var _a;
    const drafts = await db.collectionGroup('boxDrafts').get();
    const skipped = {};
    const skip = (reason) => {
        var _a;
        skipped[reason] = ((_a = skipped[reason]) !== null && _a !== void 0 ? _a : 0) + 1;
    };
    let sent = 0;
    const origin = (0, guestSessions_1.appOrigin)();
    const checkoutUrl = `${origin}/checkout?${UTM}`;
    const boxUrl = `${origin}/box?${UTM}`;
    const lockDate = lockDateLabel(lockAt);
    for (const draftDoc of drafts.docs) {
        const householdRef = draftDoc.ref.parent.parent;
        if (draftDoc.id !== HOLIDAY_ID || (householdRef === null || householdRef === void 0 ? void 0 : householdRef.parent.id) !== 'households')
            continue;
        const draft = draftDoc.data();
        const household = (_a = (await householdRef.get()).data()) !== null && _a !== void 0 ? _a : {};
        const reason = setupNudgeSkipReason({
            lineItems: draft.lineItems,
            draftUpdatedAt: draft.updatedAt,
            setupNudgeSentAt: household.setupNudgeSentAt,
            hasCommittedOrder: await hasCommittedOrder(db, householdRef.id),
        }, now);
        if (reason) {
            skip(reason);
            continue;
        }
        const email = await ownerEmail(db, household.ownerId);
        if (!email) {
            skip('no_email');
            continue;
        }
        try {
            const { items, more } = await (0, emailItems_1.lineItemsEmailItems)(db, draft.lineItems, boxUrl);
            const hasCard = Boolean(household.cardOnFileAt);
            await (0, untraditionalCio_1.untraditionalIdentify)(email, {
                grapejuice_account: true,
                grapejuice_setup_complete: false,
                grapejuice_box_item_count: draftItemCount(draft.lineItems),
                grapejuice_card_on_file: hasCard,
            });
            const delivered = await (0, untraditionalCio_1.untraditionalEvent)(email, exports.SETUP_NUDGE_EVENT, {
                checkout_url: checkoutUrl,
                box_url: boxUrl,
                lock_date: lockDate,
                has_card: hasCard,
                items,
                items_more: more,
            });
            if (!delivered) {
                skip('cio_not_configured');
                continue;
            }
            await householdRef.set({ setupNudgeSentAt: now.toISOString() }, { merge: true });
            sent += 1;
        }
        catch (err) {
            logger.error('Setup nudge failed', { householdId: householdRef.id, err: String(err) });
            skip('error');
        }
    }
    logger.info('Setup nudge batch complete', { sent, skipped });
    return { sent, skipped };
}
//# sourceMappingURL=setupNudge.js.map