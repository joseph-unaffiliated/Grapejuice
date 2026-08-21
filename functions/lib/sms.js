"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendDebriefReminderSms = sendDebriefReminderSms;
exports.sendLockReminderSms = sendLockReminderSms;
const email_1 = require("./email");
const BASE_URL = 'https://api.customer.io/v1';
/** Customer.io transactional SMS — stub when key / template missing. */
async function sendDebriefReminderSms({ to, attempt, claimUrl, }) {
    var _a, _b;
    const transactionalMessageId = parseInt((_a = process.env.CUSTOMERIO_TEMPLATE_DEBRIEF_REMINDER_SMS) !== null && _a !== void 0 ? _a : '0', 10) || 0;
    const apiKey = (0, email_1.getCustomerioAppApiKey)();
    if (!transactionalMessageId || !apiKey) {
        console.warn('sendDebriefReminderSms: stub (Customer.io SMS not configured)', { to, attempt });
        return;
    }
    if (!(to === null || to === void 0 ? void 0 : to.replace(/\D/g, '').length))
        return;
    const from = (_b = process.env.CUSTOMERIO_SMS_FROM) === null || _b === void 0 ? void 0 : _b.trim();
    const res = await fetch(`${BASE_URL}/send/sms`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(Object.assign(Object.assign({ to }, (from ? { from } : {})), { transactional_message_id: transactionalMessageId, message_data: { attempt, claimUrl }, identifiers: { id: to } })),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Customer.io SMS ${res.status}: ${text}`);
    }
}
/** Lock countdown SMS — stub when template/key missing. */
async function sendLockReminderSms({ to, attempt, daysRemaining, myBoxUrl, }) {
    var _a, _b;
    const transactionalMessageId = parseInt((_a = process.env.CUSTOMERIO_TEMPLATE_LOCK_REMINDER_SMS) !== null && _a !== void 0 ? _a : '0', 10) || 0;
    const apiKey = (0, email_1.getCustomerioAppApiKey)();
    if (!transactionalMessageId || !apiKey) {
        console.warn('sendLockReminderSms: stub (Customer.io SMS not configured)', { to, attempt });
        return;
    }
    if (!(to === null || to === void 0 ? void 0 : to.replace(/\D/g, '').length))
        return;
    const from = (_b = process.env.CUSTOMERIO_SMS_FROM) === null || _b === void 0 ? void 0 : _b.trim();
    const res = await fetch(`${BASE_URL}/send/sms`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(Object.assign(Object.assign({ to }, (from ? { from } : {})), { transactional_message_id: transactionalMessageId, message_data: { attempt, daysRemaining, myBoxUrl }, identifiers: { id: to } })),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Customer.io SMS ${res.status}: ${text}`);
    }
}
//# sourceMappingURL=sms.js.map