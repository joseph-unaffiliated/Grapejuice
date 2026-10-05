"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWelcomeOnSignup = void 0;
const logger = require("./logger");
const functions = require("firebase-functions/v1");
const email_1 = require("./email");
const sentry_1 = require("./sentry");
const untraditionalCio_1 = require("./untraditionalCio");
/** Welcome email on Firebase Auth account create (email, Google, or Apple). */
exports.sendWelcomeOnSignup = functions
    .runWith({ secrets: [email_1.customerioAppApiKey] })
    .auth.user()
    .onCreate((0, sentry_1.withSentry)(async (user) => {
    var _a;
    const to = user.email;
    if (!(to === null || to === void 0 ? void 0 : to.includes('@'))) {
        logger.info('sendWelcomeOnSignup: no email, skipping', { uid: user.uid });
        return;
    }
    const firstName = (_a = user.displayName) === null || _a === void 0 ? void 0 : _a.trim().split(/\s+/)[0];
    try {
        await (0, email_1.sendEmail)({
            to,
            template: 'welcome',
            data: { displayName: firstName || '' },
        });
    }
    catch (err) {
        logger.error('sendWelcomeOnSignup failed', err);
    }
    // Exit signal for the guest-box recovery campaigns (Untraditional workspace).
    await (0, untraditionalCio_1.untraditionalMarkSafe)(to, {
        grapejuice_account: true,
        grapejuice_account_at: new Date().toISOString(),
    });
}));
//# sourceMappingURL=welcome.js.map