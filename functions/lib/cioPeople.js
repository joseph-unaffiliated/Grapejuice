"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchPeopleEmails = searchPeopleEmails;
exports.leadEmailsByHash = leadEmailsByHash;
exports.unsubscribedHashes = unsubscribedHashes;
const guestSessions_1 = require("./guestSessions");
/**
 * Customer.io App API people search (POST /v1/customers). The inventory emails use it to find
 * the address behind a signed-out visitor's Retention lead (guestSessions.lastLeadEmailHash) and
 * to skip anyone unsubscribed. Returns hashes → addresses; callers never log the addresses.
 */
const BASE_URL = 'https://api.customer.io/v1';
const PAGE = 1000;
const MAX_PAGES = 50;
async function searchPeopleEmails(apiKey, filter, fetchImpl = fetch) {
    const emails = [];
    let start = null;
    for (let page = 0; page < MAX_PAGES; page++) {
        const url = `${BASE_URL}/customers?limit=${PAGE}${start ? `&start=${encodeURIComponent(start)}` : ''}`;
        const res = await fetchImpl(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ filter }),
        });
        if (!res.ok)
            throw new Error(`Customer.io people search ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const data = (await res.json());
        const ids = Array.isArray(data.identifiers) ? data.identifiers : [];
        for (const id of ids) {
            if (typeof (id === null || id === void 0 ? void 0 : id.email) === 'string' && id.email.includes('@'))
                emails.push(id.email.trim().toLowerCase());
        }
        start = typeof data.next === 'string' && data.next ? data.next : null;
        if (!start || !ids.length)
            break;
    }
    return emails;
}
const exists = (field) => ({ attribute: { field, operator: 'exists' } });
const isTrue = (field) => ({ attribute: { field, operator: 'eq', value: 'true' } });
/** Retention leads (grapejuice_lead) keyed by emailHash. */
async function leadEmailsByHash(apiKey, fetchImpl) {
    const emails = await searchPeopleEmails(apiKey, { and: [exists('grapejuice_lead')] }, fetchImpl);
    return new Map(emails.map((e) => [(0, guestSessions_1.emailHash)(e), e]));
}
/** Hashes of everyone unsubscribed in any of the given workspaces. */
async function unsubscribedHashes(apiKeys, fetchImpl) {
    const out = new Set();
    for (const key of apiKeys) {
        const emails = await searchPeopleEmails(key, { and: [isTrue('unsubscribed')] }, fetchImpl);
        for (const e of emails)
            out.add((0, guestSessions_1.emailHash)(e));
    }
    return out;
}
//# sourceMappingURL=cioPeople.js.map