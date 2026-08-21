"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWelcomeOnSignup = void 0;
const logger = require("firebase-functions/logger");
const functions = require("firebase-functions/v1");
const email_1 = require("./email");
/** Welcome email on Firebase Auth account create (email, Google, or Apple). */
exports.sendWelcomeOnSignup = functions
    .runWith({ secrets: [email_1.customerioAppApiKey] })
    .auth.user()
    .onCreate(async (user) => {
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
});
//# sourceMappingURL=welcome.js.map