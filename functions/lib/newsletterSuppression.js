"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduledNewsletterSuppression = void 0;
exports.syncNewsletterSuppression = syncNewsletterSuppression;
/**
 * Daily list of Grapejuice account and purchaser emails, written for the Unaffiliated
 * newsletter workspace (198880) to exclude. Upload runs when CUSTOMERIO_NEWSLETTER_APP_API_KEY
 * is set; until then the hashes sit on adminConfig/newsletterSuppression for the manual segment.
 */
const crypto_1 = require("crypto");
const firestore_1 = require("firebase-admin/firestore");
const logger = require("./logger");
const sentry_1 = require("./sentry");
const guestSessions_1 = require("./guestSessions");
const testAccounts_1 = require("./testAccounts");
const SEGMENT_NAME = 'Grapejuice customers and drafts (suppress)';
async function emails(db) {
    const [users, orders] = await Promise.all([
        db.collection('users').select('email').get(),
        db.collectionGroup('orders').select('status', 'holidayId', 'email').get(),
    ]);
    const out = new Set();
    const add = (raw) => {
        if (typeof raw !== 'string' || !raw.includes('@'))
            return;
        const email = raw.trim().toLowerCase();
        if (!(0, testAccounts_1.isTest)(email))
            out.add(email);
    };
    for (const u of users.docs)
        add(u.data().email);
    for (const o of orders.docs) {
        if (o.data().holidayId === 'hanukkah-2026' && o.data().status === 'committed')
            add(o.data().email);
    }
    return [...out];
}
async function syncNewsletterSuppression(db, apiKey) {
    var _a, _b, _c;
    const list = await emails(db);
    const hashes = list.map((e) => (0, guestSessions_1.emailHash)(e));
    await db.doc('adminConfig/newsletterSuppression').set({
        count: list.length,
        hashes,
        updatedAt: new Date().toISOString(),
    });
    if (!apiKey)
        return { emails: list.length, uploaded: false };
    const auth = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
    const existing = await fetch('https://api.customer.io/v1/segments?limit=100', { headers: auth });
    if (!existing.ok)
        throw new Error(`Customer.io segments ${existing.status}`);
    const body = (await existing.json());
    let id = (_b = (_a = body.segments) === null || _a === void 0 ? void 0 : _a.find((s) => s.name === SEGMENT_NAME)) === null || _b === void 0 ? void 0 : _b.id;
    if (!id) {
        const made = await fetch('https://api.customer.io/v1/segments', {
            method: 'POST',
            headers: auth,
            body: JSON.stringify({ segment: { name: SEGMENT_NAME, description: 'Do not pitch Grapejuice to these people.' } }),
        });
        if (!made.ok)
            throw new Error(`Customer.io create segment ${made.status}`);
        const created = (await made.json());
        id = (_c = created.segment) === null || _c === void 0 ? void 0 : _c.id;
    }
    if (!id)
        throw new Error('Newsletter suppression segment has no id');
    for (let i = 0; i < list.length; i += 1000) {
        const chunk = list.slice(i, i + 1000);
        const res = await fetch(`https://track.customer.io/api/v1/segments/${id}/add_customers`, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ids: chunk.map((e) => (0, crypto_1.createHash)('sha256').update(e).digest('hex')) }),
        });
        if (!res.ok) {
            logger.warn('newsletterSuppression: add_customers not accepted, hashes are stored', { status: res.status });
            return { emails: list.length, uploaded: false };
        }
    }
    return { emails: list.length, uploaded: true };
}
exports.scheduledNewsletterSuppression = (0, sentry_1.onSchedule)({ schedule: '15 6 * * *', timeZone: 'America/New_York', memory: '512MiB', timeoutSeconds: 300 }, async () => {
    var _a;
    const db = (0, firestore_1.getFirestore)();
    try {
        const key = ((_a = process.env.CUSTOMERIO_NEWSLETTER_APP_API_KEY) === null || _a === void 0 ? void 0 : _a.trim()) || null;
        const result = await syncNewsletterSuppression(db, key);
        await db.doc('programJobs/newsletterSuppression').set(Object.assign({ at: new Date().toISOString(), ok: true }, result));
        logger.info('newsletterSuppression', result);
    }
    catch (err) {
        logger.error('newsletterSuppression failed', err instanceof Error ? err : new Error(String(err)));
        await db.doc('programJobs/newsletterSuppression').set({ at: new Date().toISOString(), ok: false, error: String(err).slice(0, 400) });
    }
});
//# sourceMappingURL=newsletterSuppression.js.map