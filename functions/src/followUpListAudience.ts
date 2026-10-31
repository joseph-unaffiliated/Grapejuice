import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { getCustomerioAppApiKey } from './email';
import { leadEmailsByHash } from './cioPeople';
import * as logger from './logger';
import { onSchedule } from './sentry';
import {
  FOLLOW_UP_LIST_AUDIENCE_ID,
  STATIC_ROWS_DOC,
  addAudienceMembers,
  combineFollowUpRows,
  loadStaticRows,
  selectAbandonerRows,
  selectBuilderRows,
  selectGuestDraftRows,
} from './followUpAudience';

/**
 * Set once: npx firebase-tools functions:secrets:set META_ADS_ACCESS_TOKEN_ADSMANAGEMENT --project grapejuice-pilot
 * Needs ads_management on act_1311852520406314.
 */
const metaAdsManagementToken = defineSecret('META_ADS_ACCESS_TOKEN_ADSMANAGEMENT');

/**
 * Daily add to the follow-up customer list. Adds unpaid drafts (signed-in and guest) on top of
 * the form leads and abandoners. Does not replace the list, so people already on it stay.
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
      logger.warn(`scheduledFollowUpListAudience: ${STATIC_ROWS_DOC} has not been seeded; adding drafts without re-sending the lead rows`);
    }
    const builders = await selectBuilderRows(db);
    const abandoners = await selectAbandonerRows(db, builders.paidEmailHashes);
    let guestRows: ReturnType<typeof selectGuestDraftRows> = [];
    const cioKey = getCustomerioAppApiKey();
    if (cioKey) {
      const leads = await leadEmailsByHash(cioKey);
      const guests = await db.collection('guestSessions').select('lineItems', 'gateEmailHash', 'lastLeadEmailHash').get();
      guestRows = selectGuestDraftRows(
        guests.docs.map((d) => d.data()),
        leads,
        builders.paidEmailHashes
      );
    } else {
      logger.warn('scheduledFollowUpListAudience: no Customer.io key, guest drafts were not added');
    }
    const { rows, duplicates, staticPaid } = combineFollowUpRows(
      [...builders.rows, ...abandoners, ...guestRows],
      staticRows ?? [],
      builders.paidEmailHashes
    );
    const counts = {
      builders: builders.rows.length,
      abandoners: abandoners.length,
      guests: guestRows.length,
      skipped: builders.skipped,
      staticRows: staticRows?.length ?? 0,
      staticPaid,
      duplicates,
      rows: rows.length,
    };
    try {
      const result = await addAudienceMembers(FOLLOW_UP_LIST_AUDIENCE_ID, rows, token);
      logger.info('scheduledFollowUpListAudience added', { ...counts, ...result });
    } catch (err) {
      logger.error('scheduledFollowUpListAudience failed', err instanceof Error ? err : new Error(String(err)), counts);
    }
  }
);
