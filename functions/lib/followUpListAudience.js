"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduledFollowUpListAudience = void 0;
const params_1 = require("firebase-functions/params");
const firestore_1 = require("firebase-admin/firestore");
const logger = require("./logger");
const sentry_1 = require("./sentry");
const followUpAudience_1 = require("./followUpAudience");
/**
 * Set once: npx firebase-tools functions:secrets:set META_ADS_ACCESS_TOKEN_ADSMANAGEMENT --project grapejuice-pilot
 * Needs ads_management on act_1311852520406314.
 */
const metaAdsManagementToken = (0, params_1.defineSecret)('META_ADS_ACCESS_TOKEN_ADSMANAGEMENT');
/**
 * Daily rebuild of the follow-up customer list (builders without a card + seeded lead rows).
 * Replaces the members each run so people who paid drop off. Logs counts only.
 */
exports.scheduledFollowUpListAudience = (0, sentry_1.onSchedule)({ schedule: '0 6 * * *', timeZone: 'America/New_York', secrets: [metaAdsManagementToken] }, async () => {
    var _a;
    const token = (_a = metaAdsManagementToken.value()) === null || _a === void 0 ? void 0 : _a.trim();
    if (!token) {
        logger.warn('scheduledFollowUpListAudience skipped: META_ADS_ACCESS_TOKEN_ADSMANAGEMENT is empty');
        return;
    }
    const db = (0, firestore_1.getFirestore)();
    const staticRows = await (0, followUpAudience_1.loadStaticRows)(db);
    if (!staticRows) {
        // Uploading without them would drop the lead rows from the audience.
        logger.warn(`scheduledFollowUpListAudience skipped: ${followUpAudience_1.STATIC_ROWS_DOC} has not been seeded`);
        return;
    }
    const builders = await (0, followUpAudience_1.selectBuilderRows)(db);
    const abandoners = await (0, followUpAudience_1.selectAbandonerRows)(db, builders.paidEmailHashes);
    const { rows, duplicates, staticPaid } = (0, followUpAudience_1.combineFollowUpRows)([...builders.rows, ...abandoners], staticRows, builders.paidEmailHashes);
    const counts = {
        builders: builders.rows.length,
        abandoners: abandoners.length,
        skipped: builders.skipped,
        staticRows: staticRows.length,
        staticPaid,
        duplicates,
        rows: rows.length,
    };
    try {
        const result = await (0, followUpAudience_1.replaceAudienceMembers)(followUpAudience_1.FOLLOW_UP_LIST_AUDIENCE_ID, rows, token);
        logger.info('scheduledFollowUpListAudience uploaded', Object.assign(Object.assign({}, counts), result));
    }
    catch (err) {
        logger.error('scheduledFollowUpListAudience failed', err instanceof Error ? err : new Error(String(err)), counts);
    }
});
//# sourceMappingURL=followUpListAudience.js.map