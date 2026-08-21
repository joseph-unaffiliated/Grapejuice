"use strict";
var _a, _b, _c, _d, _e, _f, _g, _h, _j;
Object.defineProperty(exports, "__esModule", { value: true });
exports.customerioAppApiKey = void 0;
exports.getCustomerioAppApiKey = getCustomerioAppApiKey;
exports.sendEmail = sendEmail;
exports.sendDebriefReminderEmail = sendDebriefReminderEmail;
exports.sendGiftClaimEmail = sendGiftClaimEmail;
exports.sendDebriefAmazonFallbackEmail = sendDebriefAmazonFallbackEmail;
exports.sendLockReminderEmail = sendLockReminderEmail;
const params_1 = require("firebase-functions/params");
/** Customer.io App API key — bind on every function that calls sendEmail / SMS. */
exports.customerioAppApiKey = (0, params_1.defineSecret)('CUSTOMERIO_APP_API_KEY');
const BASE_URL = 'https://api.customer.io/v1';
const FROM_EMAIL = (_a = process.env.CUSTOMERIO_FROM_EMAIL) !== null && _a !== void 0 ? _a : 'hello@grapejuice.co';
const TEMPLATE_IDS = {
    'order-confirmed': parseInt((_b = process.env.CUSTOMERIO_TEMPLATE_ORDER_CONFIRMED) !== null && _b !== void 0 ? _b : '0', 10) || 10,
    'partner-invite': parseInt((_c = process.env.CUSTOMERIO_TEMPLATE_PARTNER_INVITE) !== null && _c !== void 0 ? _c : '0', 10) || 0,
    'debrief-reminder': parseInt((_d = process.env.CUSTOMERIO_TEMPLATE_DEBRIEF_REMINDER) !== null && _d !== void 0 ? _d : '0', 10) || 0,
    'lock-reminder': parseInt((_e = process.env.CUSTOMERIO_TEMPLATE_LOCK_REMINDER) !== null && _e !== void 0 ? _e : '0', 10) || 0,
    'gift-claim': parseInt((_f = process.env.CUSTOMERIO_TEMPLATE_GIFT_CLAIM) !== null && _f !== void 0 ? _f : '0', 10) || 0,
    'debrief-amazon': parseInt((_g = process.env.CUSTOMERIO_TEMPLATE_DEBRIEF_AMAZON) !== null && _g !== void 0 ? _g : '0', 10) || 0,
    'box-discount': parseInt((_h = process.env.CUSTOMERIO_TEMPLATE_BOX_DISCOUNT) !== null && _h !== void 0 ? _h : '0', 10) || 0,
    welcome: parseInt((_j = process.env.CUSTOMERIO_TEMPLATE_WELCOME) !== null && _j !== void 0 ? _j : '0', 10) || 12,
};
/** Env vars for Customer.io transactional templates:
 *  CUSTOMERIO_APP_API_KEY (Firebase secret — see getCustomerioAppApiKey)
 *  CUSTOMERIO_FROM_EMAIL
 *  CUSTOMERIO_TEMPLATE_DEBRIEF_REMINDER, CUSTOMERIO_TEMPLATE_DEBRIEF_REMINDER_SMS, CUSTOMERIO_SMS_FROM
 *  CUSTOMERIO_TEMPLATE_LOCK_REMINDER, CUSTOMERIO_TEMPLATE_LOCK_REMINDER_SMS
 *  CUSTOMERIO_TEMPLATE_GIFT_CLAIM, CUSTOMERIO_TEMPLATE_ORDER_CONFIRMED
 *  CUSTOMERIO_TEMPLATE_BOX_DISCOUNT, CUSTOMERIO_TEMPLATE_WELCOME
 *
 *  Set once: npx firebase-tools functions:secrets:set CUSTOMERIO_APP_API_KEY --project grapejuice-pilot
 */
/** Resolve App API key from the bound secret (or env fallback). Call only inside a function invocation. */
function getCustomerioAppApiKey() {
    var _a, _b;
    try {
        const fromSecret = (_a = exports.customerioAppApiKey.value()) === null || _a === void 0 ? void 0 : _a.trim();
        if (fromSecret)
            return fromSecret;
    }
    catch (_c) {
        /* Secret not bound on this function */
    }
    return ((_b = process.env.CUSTOMERIO_APP_API_KEY) === null || _b === void 0 ? void 0 : _b.trim()) || '';
}
async function sendEmail({ to, template, data, }) {
    const transactionalMessageId = TEMPLATE_IDS[template];
    if (!transactionalMessageId) {
        console.warn('sendEmail: unknown template', template);
        return;
    }
    if (!(to === null || to === void 0 ? void 0 : to.includes('@')))
        return;
    const apiKey = getCustomerioAppApiKey();
    if (!apiKey) {
        console.warn('sendEmail: CUSTOMERIO_APP_API_KEY not set, skipping', { to, template });
        return;
    }
    const res = await fetch(`${BASE_URL}/send/email`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            to,
            transactional_message_id: transactionalMessageId,
            message_data: data,
            identifiers: { email: to },
            from: FROM_EMAIL,
        }),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Customer.io ${res.status}: ${text}`);
    }
}
/** Debrief outreach — up to 2 reminder attempts (Q5 panel). Stub when template/key missing. */
async function sendDebriefReminderEmail({ to, attempt, claimUrl, }) {
    const template = 'debrief-reminder';
    const transactionalMessageId = TEMPLATE_IDS[template];
    if (!transactionalMessageId || !getCustomerioAppApiKey()) {
        console.warn('sendDebriefReminderEmail: stub (Customer.io not configured)', { to, attempt });
        return;
    }
    await sendEmail({
        to,
        template,
        data: { attempt, claimUrl: claimUrl !== null && claimUrl !== void 0 ? claimUrl : 'https://app.grapejuice.co' },
    });
}
/** Magic link for gift recipient claim. */
async function sendGiftClaimEmail({ to, giverName, claimUrl, message, }) {
    const template = 'gift-claim';
    const transactionalMessageId = TEMPLATE_IDS[template];
    if (!transactionalMessageId || !getCustomerioAppApiKey()) {
        console.warn('sendGiftClaimEmail: stub (Customer.io not configured)', { to, giverName });
        return;
    }
    await sendEmail({ to, template, data: { giverName, claimUrl, message: message !== null && message !== void 0 ? message : '' } });
}
/** Q5 panel — $20 Amazon gift card fallback after 2 debrief nudges + 14 days. */
async function sendDebriefAmazonFallbackEmail({ to, claimUrl, }) {
    var _a;
    const templateId = parseInt((_a = process.env.CUSTOMERIO_TEMPLATE_DEBRIEF_AMAZON) !== null && _a !== void 0 ? _a : '0', 10) || 0;
    if (!templateId || !getCustomerioAppApiKey()) {
        console.warn('sendDebriefAmazonFallbackEmail: stub (template not configured)', { to, claimUrl });
        return;
    }
    await sendEmail({
        to,
        template: 'debrief-amazon',
        data: { claimUrl: claimUrl !== null && claimUrl !== void 0 ? claimUrl : 'https://app.grapejuice.co' },
    });
}
/** Lock countdown — up to 2 reminder attempts before customization closes. */
async function sendLockReminderEmail({ to, attempt, daysRemaining, myBoxUrl, }) {
    const template = 'lock-reminder';
    const transactionalMessageId = TEMPLATE_IDS[template];
    if (!transactionalMessageId || !getCustomerioAppApiKey()) {
        console.warn('sendLockReminderEmail: stub (Customer.io not configured)', { to, attempt });
        return;
    }
    await sendEmail({
        to,
        template,
        data: { attempt, daysRemaining, myBoxUrl },
    });
}
//# sourceMappingURL=email.js.map