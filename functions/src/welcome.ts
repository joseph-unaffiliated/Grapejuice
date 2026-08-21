import * as logger from 'firebase-functions/logger';
import * as functions from 'firebase-functions/v1';
import { customerioAppApiKey, sendEmail } from './email';

/** Welcome email on Firebase Auth account create (email, Google, or Apple). */
export const sendWelcomeOnSignup = functions
  .runWith({ secrets: [customerioAppApiKey] })
  .auth.user()
  .onCreate(async (user) => {
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
  });
