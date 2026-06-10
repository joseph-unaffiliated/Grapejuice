"use strict";
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripe = void 0;
exports.verifyWebhook = verifyWebhook;
const stripe_1 = require("stripe");
const stripeSecretKey = (_a = process.env.STRIPE_SECRET_KEY) !== null && _a !== void 0 ? _a : '';
const webhookSecret = (_b = process.env.STRIPE_WEBHOOK_SECRET) !== null && _b !== void 0 ? _b : '';
exports.stripe = stripeSecretKey
    ? new stripe_1.default(stripeSecretKey, { apiVersion: '2025-02-24.acacia' })
    : null;
function verifyWebhook(rawBody, signature) {
    if (!exports.stripe || !webhookSecret) {
        throw new Error('Stripe webhook not configured');
    }
    return exports.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}
//# sourceMappingURL=stripe.js.map