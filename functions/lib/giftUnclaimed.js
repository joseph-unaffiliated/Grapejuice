"use strict";
/**
 * Unclaimed paid gift notes. Templates stay at id 0 until the renders are approved, so sendEmail skips them.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.unclaimedGiftNoteDue = unclaimedGiftNoteDue;
exports.renderGiftRecipientEmail = renderGiftRecipientEmail;
exports.senderFollowUpCopy = senderFollowUpCopy;
exports.renderGiftSenderEmail = renderGiftSenderEmail;
exports.runUnclaimedGiftNotes = runUnclaimedGiftNotes;
const emailLayout_1 = require("./emailLayout");
const email_1 = require("./email");
const giftShip_1 = require("./giftShip");
const DAY_MS = 86400000;
function unclaimedGiftNoteDue(input) {
    if (!input.paid)
        return null;
    if (input.status === 'claimed')
        return null;
    if (input.senderSentAt)
        return null;
    if (!input.recipientSentAt)
        return 'recipient';
    const sent = Date.parse(input.recipientSentAt);
    if (Number.isNaN(sent) || input.now - sent < DAY_MS)
        return null;
    return 'sender';
}
function renderGiftRecipientEmail(input) {
    const giver = input.giverName.trim() || 'Someone';
    return {
        subject: `${giver} sent you a Hanukkah box`,
        html: (0, emailLayout_1.grapejuiceEmailHtml)({
            campaign: 'gift_unclaimed_recipient',
            preheader: `${giver} sent you a box. Finish receiving it.`,
            title: `${giver} sent you a box`,
            paragraphs: [
                `${giver} put a Hanukkah box together for you.`,
                'Finish receiving it so we know where it should go.',
            ],
            thumbs: input.items,
            ctaLabel: 'Finish receiving it',
            ctaUrl: input.claimUrl,
        }),
    };
}
function senderFollowUpCopy(reason) {
    if (reason === 'ships') {
        return 'If they never accept it, it still ships. The address on the invite is complete, and tax is waived. Nothing else is owed.';
    }
    if (reason === 'no_address') {
        return 'It will not ship until a complete shipping address is on the invite. Tax alone would not hold it.';
    }
    return 'It will not ship until the remaining add-ons are paid. Tax alone would not hold it. Shipping is not what is owed.';
}
function renderGiftSenderEmail(input) {
    const who = input.recipientName.trim() || 'They';
    return {
        subject: `${who} has not accepted the box yet`,
        html: (0, emailLayout_1.grapejuiceEmailHtml)({
            campaign: 'gift_unclaimed_sender',
            preheader: 'Follow up with them directly.',
            title: 'They have not accepted it yet',
            paragraphs: [
                `${who} has not accepted the gift. A note went to them yesterday.`,
                'Follow up with them directly.',
                senderFollowUpCopy(input.reason),
            ],
            ctaLabel: 'Open the gift',
            ctaUrl: input.boxUrl,
        }),
    };
}
function paidInvite(data) {
    return data.paymentStatus === 'paid' || Boolean(data.claimEmailSentAt);
}
function shipReason(data) {
    const address = data.shippingAddress;
    const complete = Boolean((address === null || address === void 0 ? void 0 : address.name) && address.line1 && address.city && address.stateProvince && address.postalCode);
    const lines = Array.isArray(data.lineItems) ? data.lineItems : [];
    const prepaid = typeof data.prepaidAddOnCents === 'number' ? data.prepaidAddOnCents : 0;
    const upgrade = lines.reduce((sum, line) => {
        var _a, _b;
        return sum + Math.max(0, (_a = line === null || line === void 0 ? void 0 : line.unitCents) !== null && _a !== void 0 ? _a : 0) * Math.max(1, (_b = line === null || line === void 0 ? void 0 : line.quantity) !== null && _b !== void 0 ? _b : 1);
    }, 0);
    return (0, giftShip_1.unclaimedGiftShipDecision)({
        addressComplete: complete,
        upgradeCents: Math.max(0, upgrade - Math.max(0, prepaid)),
    }).reason;
}
/**
 * Recipient now, giver one day later if the invite is still unaccepted.
 * sendEmail returns skipped while the template id is 0, and nothing is marked sent.
 */
async function runUnclaimedGiftNotes(db, now = new Date()) {
    var _a;
    const invites = await db.collection('giftInvites').get();
    let considered = 0;
    const appBase = (_a = process.env.PILOT_APP_BASE_URL) !== null && _a !== void 0 ? _a : 'https://grapejuice.co';
    for (const doc of invites.docs) {
        const data = doc.data();
        const due = unclaimedGiftNoteDue({
            paid: paidInvite(data),
            status: typeof data.status === 'string' ? data.status : null,
            recipientSentAt: typeof data.recipientNoteSentAt === 'string' ? data.recipientNoteSentAt : null,
            senderSentAt: typeof data.senderNoteSentAt === 'string' ? data.senderNoteSentAt : null,
            now: now.getTime(),
        });
        if (!due)
            continue;
        considered += 1;
        if (due === 'recipient') {
            const giver = typeof data.giverName === 'string' ? data.giverName : 'Someone';
            const token = typeof data.claimToken === 'string' ? data.claimToken : '';
            const to = typeof data.recipientEmail === 'string' ? data.recipientEmail : '';
            const rendered = renderGiftRecipientEmail({
                giverName: giver,
                claimUrl: `${appBase}/gift/claim?token=${token}`,
                items: [],
            });
            const result = await (0, email_1.sendEmail)({
                to,
                template: 'gift-unclaimed-recipient',
                data: { subject: rendered.subject, html: rendered.html, giver_name: giver },
            });
            if (result === 'sent') {
                await doc.ref.set({ recipientNoteSentAt: now.toISOString() }, { merge: true });
            }
            continue;
        }
        const to = typeof data.giverEmail === 'string' ? data.giverEmail : '';
        const rendered = renderGiftSenderEmail({
            recipientName: typeof data.recipientEmail === 'string' ? data.recipientEmail : '',
            reason: shipReason(data),
            boxUrl: `${appBase}/gift/give`,
        });
        const result = await (0, email_1.sendEmail)({
            to,
            template: 'gift-unclaimed-sender',
            data: { subject: rendered.subject, html: rendered.html },
        });
        if (result === 'sent') {
            await doc.ref.set({ senderNoteSentAt: now.toISOString() }, { merge: true });
        }
    }
    return { considered };
}
//# sourceMappingURL=giftUnclaimed.js.map