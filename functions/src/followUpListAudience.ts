import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import * as logger from './logger';
import { onSchedule } from './sentry';
import {
  FOLLOW_UP_LIST_AUDIENCE_ID,
  STATIC_ROWS_DOC,
  combineFollowUpRows,
  loadStaticRows,
  replaceAudienceMembers,
  selectBuilderRows,
} from './followUpAudience';

/**
 * Set once: npx firebase-tools functions:secrets:set META_ADS_ACCESS_TOKEN_ADSMANAGEMENT --project grapejuice-pilot
 * Needs ads_management on act_1311852520406314.
 */
const metaAdsManagementToken = defineSecret('META_ADS_ACCESS_TOKEN_ADSMANAGEMENT');

/**
 * Daily rebuild of the follow-up customer list (builders without a card + seeded lead rows).
 * Replaces the members each run so people who paid drop off. Logs counts only.
 */
export const scheduledFollowUpListAudience = onSchedule(
  { schedule: '0 6 * * *', timeZone: 'America/New_York', secrets: [metaAdsManagementToken] },
  async () => {
    const token = metaAdsManagementToken.value()?.trim();
    if (!token) {
      logger.warn('scheduledFollowUpListAudience skipped: META_ADS_ACCESS_TOKEN_ADSMANAGEMENT is empty');
      return;
    }
    const db = getFirestore();
    const staticRows = await loadStaticRows(db);
    if (!staticRows) {
      // Uploading without them would drop the lead rows from the audience.
      logger.warn(`scheduledFollowUpListAudience skipped: ${STATIC_ROWS_DOC} has not been seeded`);
      return;
    }
    const builders = await selectBuilderRows(db);
    const { rows, duplicates, staticPaid } = combineFollowUpRows(builders.rows, staticRows, builders.paidEmailHashes);
    const counts = {
      builders: builders.rows.length,
      skipped: builders.skipped,
      staticRows: staticRows.length,
      staticPaid,
      duplicates,
      rows: rows.length,
    };
    try {
      const result = await replaceAudienceMembers(FOLLOW_UP_LIST_AUDIENCE_ID, rows, token);
      logger.info('scheduledFollowUpListAudience uploaded', { ...counts, ...result });
    } catch (err) {
      logger.error('scheduledFollowUpListAudience failed', err instanceof Error ? err : new Error(String(err)), counts);
    }
  }
);
