"use strict";
var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = sendEmail;
const apiKey = (_a = process.env.CUSTOMERIO_APP_API_KEY) !== null && _a !== void 0 ? _a : '';
const BASE_URL = 'https://api.customer.io/v1';
const FROM_EMAIL = (_b = process.env.CUSTOMERIO_FROM_EMAIL) !== null && _b !== void 0 ? _b : 'hello@grapejuice.co';
const TEMPLATE_IDS = {
    'order-confirmed': parseInt((_c = process.env.CUSTOMERIO_TEMPLATE_ORDER_CONFIRMED) !== null && _c !== void 0 ? _c : '0', 10) || 10,
    'partner-invite': parseInt((_d = process.env.CUSTOMERIO_TEMPLATE_PARTNER_INVITE) !== null && _d !== void 0 ? _d : '0', 10) || 0,
};
async function sendEmail({ to, template, data, }) {
    const transactionalMessageId = TEMPLATE_IDS[template];
    if (!transactionalMessageId) {
        console.warn('sendEmail: unknown template', template);
        return;
    }
    if (!(to === null || to === void 0 ? void 0 : to.includes('@')))
        return;
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
//# sourceMappingURL=email.js.map