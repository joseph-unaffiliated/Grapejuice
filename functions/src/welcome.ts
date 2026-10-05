import * as logger from './logger';
import * as functions from 'firebase-functions/v1';
import { customerioAppApiKey, sendEmail } from './email';
import { withSentry } from './sentry';
import { untraditionalMarkSafe } from './untraditionalCio';

/** Welcome email on Firebase Auth account create (email, Google, or Apple). */
export const sendWelcomeOnSignup = functions
  .runWith({ secrets: [customerioAppApiKey] })
  .auth.user()
  .onCreate(withSentry(async (user: functions.auth.UserRecord) => {
    const to = user.email;
    if (!to?.includes('@')) {
      logger.info('sendWelcomeOnSignup: no email, skipping', { uid: user.uid });
      return;
    }
    const firstName = user.displayName?.trim().split(/\s+/)[0];
    try {
      await sendEmail({
        to,
        template: 'welcome',
        data: { displayName: firstName || '' },
      });
    } catch (err) {
      logger.error('sendWelcomeOnSignup failed', err);
    }
    // Exit signal for the guest-box recovery campaigns (Untraditional workspace).
    await untraditionalMarkSafe(to, {
      grapejuice_account: true,
      grapejuice_account_at: new Date().toISOString(),
    });
  }));
