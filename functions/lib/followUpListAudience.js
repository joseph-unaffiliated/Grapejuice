"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduledFollowUpListAudience = void 0;
const params_1 = require("firebase-functions/params");
const firestore_1 = require("firebase-admin/firestore");
const email_1 = require("./email");
const cioPeople_1 = require("./cioPeople");
const logger = require("./logger");
const sentry_1 = require("./sentry");
const followUpAudience_1 = require("./followUpAudience");
/**
 * Set once: npx firebase-tools functions:secrets:set META_ADS_ACCESS_TOKEN_ADSMANAGEMENT --project grapejuice-pilot
 * Needs ads_management on act_1311852520406314.
 */
const metaAdsManagementToken = (0, params_1.defineSecret)('META_ADS_ACCESS_TOKEN_ADSMANAGEMENT');
/**
 * Daily add to the follow-up customer list. Adds unpaid drafts (signed-in and guest) on top of
 * the form leads and abandoners. Does not replace the list, so people already on it stay.
 */
exports.scheduledFollowUpListAudience = (0, sentry_1.onSchedule)({ schedule: '0 6 * * *', timeZone: 'America/New_York', secrets: [metaAdsManagementToken] }, async () => {
    var _a, _b;
    const token = (_a = metaAdsManagementToken.value()) === null || _a === void 0 ? void 0 : _a.trim();
    if (!token) {
        logger.warn('scheduledFollowUpListAudience skipped: META_ADS_ACCESS_TOKEN_ADSMANAGEMENT is empty');
        return;
    }
    const db = (0, firestore_1.getFirestore)();
    const staticRows = await (0, followUpAudience_1.loadStaticRows)(db);
    if (!staticRows) {
        logger.warn(`scheduledFollowUpListAudience: ${followUpAudience_1.STATIC_ROWS_DOC} has not been seeded; adding drafts without re-sending the lead rows`);
    }
    const builders = await (0, followUpAudience_1.selectBuilderRows)(db);
    const abandoners = await (0, followUpAudience_1.selectAbandonerRows)(db, builders.paidEmailHashes);
    let guestRows = [];
    const cioKey = (0, email_1.getCustomerioAppApiKey)();
    if (cioKey) {
        const leads = await (0, cioPeople_1.leadEmailsByHash)(cioKey);
        const guests = await db.collection('guestSessions').select('lineItems', 'gateEmailHash', 'lastLeadEmailHash').get();
        guestRows = (0, followUpAudience_1.selectGuestDraftRows)(guests.docs.map((d) => d.data()), leads, builders.paidEmailHashes);
    }
    else {
        logger.warn('scheduledFollowUpListAudience: no Customer.io key, guest drafts were not added');
    }
    const { rows, duplicates, staticPaid } = (0, followUpAudience_1.combineFollowUpRows)([...builders.rows, ...abandoners, ...guestRows], staticRows !== null && staticRows !== void 0 ? staticRows : [], builders.paidEmailHashes);
    const counts = {
        builders: builders.rows.length,
        abandoners: abandoners.length,
        guests: guestRows.length,
        skipped: builders.skipped,
        staticRows: (_b = staticRows === null || staticRows === void 0 ? void 0 : staticRows.length) !== null && _b !== void 0 ? _b : 0,
        staticPaid,
        duplicates,
        rows: rows.length,
    };
    try {
        const result = await (0, followUpAudience_1.addAudienceMembers)(followUpAudience_1.FOLLOW_UP_LIST_AUDIENCE_ID, rows, token);
        logger.info('scheduledFollowUpListAudience added', Object.assign(Object.assign({}, counts), result));
    }
    catch (err) {
        logger.error('scheduledFollowUpListAudience failed', err instanceof Error ? err : new Error(String(err)), counts);
    }
});
//# sourceMappingURL=followUpListAudience.js.map