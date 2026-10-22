"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduledInventoryEmails = exports.CONVERSION_WINDOW_MS = exports.PRIORITY_ITEM_IDS = exports.INVENTORY_ALERT_CONTACTS = exports.INVENTORY_LOW_SENT = exports.INVENTORY_EMAIL_LOG = void 0;
exports.planInventoryEmails = planInventoryEmails;
exports.buildRecipients = buildRecipients;
exports.inventoryEmailStats = inventoryEmailStats;
exports.etDate = etDate;
exports.previousDate = previousDate;
exports.displayName = displayName;
exports.subjectWords = subjectWords;
exports.emailDataFor = emailDataFor;
exports.inventoryUtm = inventoryUtm;
exports.runInventoryEmails = runInventoryEmails;
const firestore_1 = require("firebase-admin/firestore");
const logger = require("./logger");
const sentry_1 = require("./sentry");
const email_1 = require("./email");
const emailItems_1 = require("./emailItems");
const guestSessions_1 = require("./guestSessions");
const loginLinks_1 = require("./loginLinks");
const cioPeople_1 = require("./cioPeople");
const catalogInventory_1 = require("./catalogInventory");
const context_1 = require("./rav/context");
const inventoryWatch_1 = require("./inventoryWatch");
/**
 * Daily 10am ET inventory emails to people whose unsecured draft box is affected:
 *   inventory-swapped  a sold-out item was swapped out (once per swap, inventorySwaps/{id}.emailed)
 *   inventory-low      an item in their box is almost sold out (once per person per item,
 *                      inventoryLowSent/{emailHash}_{itemId})
 * At most one email per person per ET day (inventoryEmailLog/{emailHash}_{yyyy-mm-dd}, claimed in a
 * transaction), and no low-stock email the day after one (every other day at most). Swapped
 * emails go first, then low-stock; the Lego Menorah leads each group.
 * Accounts get a signed checkout link; signed-out visitors (matched through their Retention lead in
 * Customer.io) get a resume link. Unsubscribed people and secured boxes are skipped.
 * Off unless GJ_INVENTORY_EMAILS_ENABLED=true; GJ_INVENTORY_EMAILS_START (yyyy-mm-dd, ET) holds the
 * first send. scripts/inventory-alerts-preview.mjs runs it dry.
 */
exports.INVENTORY_EMAIL_LOG = 'inventoryEmailLog';
exports.INVENTORY_LOW_SENT = 'inventoryLowSent';
exports.INVENTORY_ALERT_CONTACTS = 'inventoryAlertContacts';
/** Matches the guest session lifetime. */
const CONTACT_TTL_MS = 60 * 24 * 60 * 60 * 1000;
/** Sent first within each group. */
exports.PRIORITY_ITEM_IDS = ['lego-menorah'];
/** Swaps older than this without a reachable recipient stop being considered. */
const SWAP_EMAIL_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
function itemRank(itemId, order) {
    const p = exports.PRIORITY_ITEM_IDS.indexOf(itemId);
    if (p >= 0)
        return p;
    const o = order.indexOf(itemId);
    return exports.PRIORITY_ITEM_IDS.length + (o >= 0 ? o : order.length);
}
/** One pick per person: their highest-priority unsent email. Pure. */
function planInventoryEmails(input) {
    var _a;
    const byDraft = new Map();
    for (const r of input.recipients)
        for (const key of r.draftKeys)
            byDraft.set(key, r);
    const candidates = new Map();
    const add = (pick) => { var _a; return candidates.set(pick.hash, [...((_a = candidates.get(pick.hash)) !== null && _a !== void 0 ? _a : []), pick]); };
    const unreachableSwapIds = [];
    for (const swap of input.swaps) {
        const r = byDraft.get(swap.draftKey);
        if (!r)
            unreachableSwapIds.push(swap.id);
        else
            add({ kind: 'swapped', hash: r.hash, swap });
    }
    const swappedFor = new Set(input.swaps.map((s) => { var _a; return `${(_a = byDraft.get(s.draftKey)) === null || _a === void 0 ? void 0 : _a.hash}_${s.fromItemId}`; }));
    for (const r of input.recipients) {
        for (const itemId of input.lowItemIds) {
            if (!r.itemIds.has(itemId))
                continue;
            const key = `${r.hash}_${itemId}`;
            if (input.lowAlreadySent.has(key) || swappedFor.has(key))
                continue;
            add({ kind: 'low', hash: r.hash, itemId });
        }
    }
    const order = input.lowItemIds;
    const rank = (p) => (p.kind === 'swapped' ? 0 : 1000) + itemRank(p.kind === 'swapped' ? p.swap.fromItemId : p.itemId, order);
    const skipped = { unsubscribed: 0, alreadyToday: 0, lowCooldown: 0, nothingNew: 0 };
    const picks = [];
    const seen = new Set();
    for (const r of input.recipients) {
        if (seen.has(r.hash))
            continue;
        seen.add(r.hash);
        const all = (_a = candidates.get(r.hash)) !== null && _a !== void 0 ? _a : [];
        if (!all.length) {
            skipped.nothingNew += 1;
            continue;
        }
        const mine = input.lowYesterday.has(r.hash) ? all.filter((p) => p.kind !== 'low') : all;
        if (!mine.length) {
            skipped.lowCooldown += 1;
            continue;
        }
        if (input.unsubscribed.has(r.hash)) {
            skipped.unsubscribed += 1;
            continue;
        }
        if (input.sentToday.has(r.hash)) {
            skipped.alreadyToday += 1;
            continue;
        }
        picks.push([...mine].sort((a, b) => rank(a) - rank(b))[0]);
    }
    picks.sort((a, b) => rank(a) - rank(b));
    return { picks, skipped, unreachableSwapIds };
}
/** Accounts win over signed-out sessions for the same address (signed link beats resume link). */
function buildRecipients(drafts, leadEmails) {
    var _a;
    const byHash = new Map();
    const ordered = [...drafts.filter((d) => d.kind === 'household'), ...drafts.filter((d) => d.kind === 'guest')];
    for (const d of ordered) {
        if (d.test)
            continue;
        const email = d.kind === 'household' ? (_a = d.ownerEmail) === null || _a === void 0 ? void 0 : _a.trim().toLowerCase() : d.leadEmailHash ? leadEmails.get(d.leadEmailHash) : undefined;
        if (!email || !email.includes('@'))
            continue;
        if (d.kind === 'household' && !d.ownerId)
            continue;
        const hash = (0, guestSessions_1.emailHash)(email);
        const existing = byHash.get(hash);
        const r = existing !== null && existing !== void 0 ? existing : {
            hash,
            email,
            kind: d.kind,
            uid: d.kind === 'household' ? d.ownerId : undefined,
            visitorId: d.kind === 'guest' ? d.ref.id : undefined,
            itemIds: new Set(),
            draftKeys: new Set(),
        };
        r.draftKeys.add(d.key);
        for (const line of [...d.lines, ...d.giftLines])
            r.itemIds.add(line.itemId);
        byHash.set(hash, r);
    }
    return [...byHash.values()];
}
/** A secured box counts toward an email when it was secured within this long after the send. */
exports.CONVERSION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Draft → secured conversions after inventory emails. A person's households: draft keys
 * (`hh_<id>`), their account, and the account their signed-out session later became. Pure.
 */
function inventoryEmailStats(input) {
    var _a, _b, _c;
    const emptyKind = () => ({ sends: 0, clicked: 0, secured: 0, securedAfterClick: 0 });
    const stats = {
        sends: input.sends.length,
        people: 0,
        clickedPeople: 0,
        securedPeople: 0,
        securedAfterClickPeople: 0,
        byKind: { low: emptyKind(), swapped: emptyKind() },
        windowDays: exports.CONVERSION_WINDOW_MS / (24 * 60 * 60 * 1000),
    };
    const securedByHousehold = new Map();
    for (const b of input.securedBoxes) {
        securedByHousehold.set(b.householdId, [...((_a = securedByHousehold.get(b.householdId)) !== null && _a !== void 0 ? _a : []), b.securedMs]);
    }
    const byPerson = new Map();
    for (const s of input.sends) {
        byPerson.set(s.emailHash, [...((_b = byPerson.get(s.emailHash)) !== null && _b !== void 0 ? _b : []), s]);
        stats.byKind[s.kind].sends += 1;
        if (s.clicked)
            stats.byKind[s.kind].clicked += 1;
    }
    stats.people = byPerson.size;
    for (const sends of byPerson.values()) {
        sends.sort((a, b) => a.sentMs - b.sentMs);
        if (sends.some((s) => s.clicked))
            stats.clickedPeople += 1;
        const households = new Set();
        const uids = new Set();
        for (const s of sends) {
            for (const key of s.draftKeys)
                if (key.startsWith('hh_'))
                    households.add(key.slice(3));
            if (s.uid)
                uids.add(s.uid);
            const converted = s.visitorId ? input.convertedUidByVisitor.get(s.visitorId) : undefined;
            if (converted)
                uids.add(converted);
        }
        for (const uid of uids)
            for (const hid of (_c = input.householdsByOwner.get(uid)) !== null && _c !== void 0 ? _c : [])
                households.add(hid);
        const firstSent = sends[0].sentMs;
        const securedMs = [...households]
            .flatMap((hid) => { var _a; return (_a = securedByHousehold.get(hid)) !== null && _a !== void 0 ? _a : []; })
            .filter((t) => t >= firstSent)
            .sort((a, b) => a - b)[0];
        if (securedMs == null)
            continue;
        const credited = [...sends].reverse().find((s) => s.sentMs <= securedMs && securedMs - s.sentMs <= exports.CONVERSION_WINDOW_MS);
        if (!credited)
            continue;
        stats.securedPeople += 1;
        stats.byKind[credited.kind].secured += 1;
        const clickedSend = sends.some((s) => s.clicked && s.sentMs <= securedMs && securedMs - s.sentMs <= exports.CONVERSION_WINDOW_MS);
        if (clickedSend) {
            stats.securedAfterClickPeople += 1;
            stats.byKind[credited.kind].securedAfterClick += 1;
        }
    }
    return stats;
}
/**
 * Retention lead email per signed-out visitor, keyed by email hash. Matches are cached in
 * inventoryAlertContacts/{visitorId} (functions only) and used when Customer.io can't be reached.
 */
async function guestLeadEmails(db, apiKey, guests, writeCache) {
    try {
        const leads = await (0, cioPeople_1.leadEmailsByHash)(apiKey);
        if (writeCache) {
            const now = Date.now();
            const matched = guests.filter((d) => d.leadEmailHash && leads.has(d.leadEmailHash));
            for (let i = 0; i < matched.length; i += 400) {
                const batch = db.batch();
                for (const d of matched.slice(i, i + 400)) {
                    batch.set(db.doc(`${exports.INVENTORY_ALERT_CONTACTS}/${d.ref.id}`), {
                        emailHash: d.leadEmailHash,
                        email: leads.get(d.leadEmailHash),
                        matchedAt: firestore_1.Timestamp.fromMillis(now),
                        expireAt: firestore_1.Timestamp.fromMillis(now + CONTACT_TTL_MS),
                    });
                }
                await batch.commit();
            }
        }
        return leads;
    }
    catch (err) {
        logger.warn('inventoryEmails: lead lookup failed, using cached contacts', { err: String(err).slice(0, 200) });
        const snaps = await db.getAll(...guests.map((d) => db.doc(`${exports.INVENTORY_ALERT_CONTACTS}/${d.ref.id}`)));
        return new Map(snaps.flatMap((s) => {
            const c = s.data();
            return typeof (c === null || c === void 0 ? void 0 : c.emailHash) === 'string' && typeof c.email === 'string' ? [[c.emailHash, c.email]] : [];
        }));
    }
}
function etDate(now) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
}
/** yyyy-mm-dd → the calendar day before. */
function previousDate(date) {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
}
/** Catalog names carry quotes for brand words ("Lego" Menorah); emails drop them. */
function displayName(name) {
    return name.replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
}
/** "The Lego Menorah is" / "The Roll Your Own Beeswax Candles are". Books are quoted, no "The". */
function subjectWords(name, isBook = false) {
    const clean = displayName(name);
    const plural = /s$/i.test(clean) && !/ss$/i.test(clean);
    return {
        item_title: isBook ? `"${clean}"` : `The ${clean}`,
        is_are: plural ? 'are' : 'is',
        it_they: plural ? 'they' : 'it',
        it_them: plural ? 'them' : 'it',
    };
}
/** Book titles are quoted in emails ("A Rugrats Chanukah"); other items stay bare. */
function emailName(id, catalog) {
    var _a;
    const doc = catalog.get(id);
    const clean = displayName(String((_a = doc === null || doc === void 0 ? void 0 : doc.name) !== null && _a !== void 0 ? _a : id));
    const isBook = id.startsWith('book-') || (doc === null || doc === void 0 ? void 0 : doc.category) === 'Book';
    return isBook ? `"${clean}"` : clean;
}
function isBookItem(id, catalog) {
    var _a;
    return id.startsWith('book-') || ((_a = catalog.get(id)) === null || _a === void 0 ? void 0 : _a.category) === 'Book';
}
async function loadCatalogDocs(db, ids) {
    const unique = [...new Set(ids)];
    if (!unique.length)
        return new Map();
    const snaps = await db.getAll(...unique.map((id) => db.doc(`catalog/${catalogInventory_1.CATALOG_HOLIDAY}/items/${id}`)));
    return new Map(snaps.filter((s) => s.exists).map((s) => [s.id, s.data()]));
}
/** Trigger data for one pick (see docs/customerio-inventory-*.html). */
async function emailDataFor(pick, catalog, links, imageFor) {
    var _a, _b, _c, _d;
    const name = (id) => { var _a, _b; return String((_b = (_a = catalog.get(id)) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : id); };
    if (pick.kind === 'low') {
        return {
            template: 'inventory-low',
            data: Object.assign(Object.assign({}, subjectWords(name(pick.itemId), isBookItem(pick.itemId, catalog))), { item_id: pick.itemId, item_name: emailName(pick.itemId, catalog), 
                // Books show their cover (primary); everything else keeps the secondary shot.
                image_url: (_a = (await imageFor(pick.itemId, isBookItem(pick.itemId, catalog) ? 'primary' : 'secondary'))) !== null && _a !== void 0 ? _a : '', cta_url: links.secure }),
        };
    }
    const { fromItemId, toItemId } = pick.swap;
    return {
        template: 'inventory-swapped',
        data: Object.assign(Object.assign({}, subjectWords(name(fromItemId), isBookItem(fromItemId, catalog))), { item_id: fromItemId, item_name: emailName(fromItemId, catalog), image_url: (_b = (await imageFor(fromItemId, 'primary'))) !== null && _b !== void 0 ? _b : '', has_replacement: !!toItemId, replacement_id: toItemId !== null && toItemId !== void 0 ? toItemId : '', replacement_name: toItemId ? emailName(toItemId, catalog) : '', replacement_image_url: toItemId ? (_c = (await imageFor(toItemId, 'primary'))) !== null && _c !== void 0 ? _c : '' : '', cta_url: links.secure, customize_url: (_d = links.customize) !== null && _d !== void 0 ? _d : '' }),
    };
}
/** UTMs on every link so the order's client attribution (lastTouch) names the email. */
function inventoryUtm(kind, button) {
    return {
        utm_source: 'grapejuice',
        utm_medium: 'email',
        utm_campaign: kind === 'low' ? 'inventory_low' : 'inventory_swapped',
        utm_content: button,
    };
}
/**
 * "Secure my box" opens checkout; "Customize my box" (swapped email only) opens My Box. Each link's
 * token carries the log id so a click is recorded on that send (recordInventoryEmailClick).
 */
async function ctaLinksFor(db, r, kind, emailLogId) {
    const withCustomize = kind === 'swapped';
    if (r.kind === 'household' && r.uid) {
        const account = { uid: r.uid, email: r.email, emailLogId };
        return {
            secure: await (0, loginLinks_1.mintInventoryAlertUrl)(db, Object.assign(Object.assign({}, account), { next: '/checkout', query: inventoryUtm(kind, 'secure') })),
            customize: withCustomize
                ? await (0, loginLinks_1.mintInventoryAlertUrl)(db, Object.assign(Object.assign({}, account), { next: '/box', query: inventoryUtm(kind, 'customize') }))
                : undefined,
        };
    }
    if (r.visitorId) {
        const { url } = await (0, guestSessions_1.mintResumeToken)(db, r.visitorId, r.email, new Date(), emailLogId);
        const withUtm = (button) => `${url}&${new URLSearchParams(inventoryUtm(kind, button))}`;
        return {
            secure: `${withUtm('secure')}&next=checkout`,
            customize: withCustomize ? withUtm('customize') : undefined,
        };
    }
    throw new Error('recipient has no account or visitor id');
}
/** Claim today's slot for this person; false when someone (or an earlier run) already did. */
async function claimDailySlot(db, r, date, pick) {
    const ref = db.doc(`${exports.INVENTORY_EMAIL_LOG}/${r.hash}_${date}`);
    return db.runTransaction(async (tx) => {
        var _a, _b;
        if ((await tx.get(ref)).exists)
            return false;
        tx.set(ref, {
            emailHash: r.hash,
            date,
            kind: pick.kind,
            itemId: pick.kind === 'low' ? pick.itemId : pick.swap.fromItemId,
            // Who got it, so dashboard conversion stats can find the box they later secured.
            uid: (_a = r.uid) !== null && _a !== void 0 ? _a : null,
            visitorId: (_b = r.visitorId) !== null && _b !== void 0 ? _b : null,
            draftKeys: [...r.draftKeys],
            clicks: 0,
            status: 'sending',
            createdAt: firestore_1.Timestamp.now(),
        });
        return true;
    });
}
function pickKey(p) {
    var _a;
    return p.kind === 'low' ? `low:${p.itemId}` : `swapped:${p.swap.fromItemId}->${(_a = p.swap.toItemId) !== null && _a !== void 0 ? _a : 'removed'}`;
}
async function runInventoryEmails(db, options = {}) {
    var _a, _b, _c;
    const now = (_a = options.now) !== null && _a !== void 0 ? _a : new Date();
    const result = {
        locked: await (0, inventoryWatch_1.lockPassed)(db),
        recipients: { household: 0, guest: 0 },
        guestsWithoutLead: 0,
        lowItems: [],
        pendingSwaps: 0,
        swapsNoLongerDraft: 0,
        picks: {},
        skipped: { unsubscribed: 0, alreadyToday: 0, lowCooldown: 0, nothingNew: 0 },
        sent: 0,
        failed: 0,
    };
    if (result.locked)
        return result;
    const apiKey = (0, email_1.getCustomerioAppApiKey)();
    if (!apiKey)
        throw new Error('CUSTOMERIO_APP_API_KEY not set');
    const date = etDate(now);
    const [drafts, rows, swapSnap, lowSentSnap, todaySnap, yesterdaySnap] = await Promise.all([
        (0, inventoryWatch_1.loadUnsecuredDrafts)(db),
        (0, context_1.loadCatalogRows)(db).then(context_1.toBoxRulesRows),
        db.collection(inventoryWatch_1.INVENTORY_SWAPS).where('emailed', '==', false).get(),
        db.collection(exports.INVENTORY_LOW_SENT).select().get(),
        db.collection(exports.INVENTORY_EMAIL_LOG).where('date', '==', date).select('emailHash').get(),
        db.collection(exports.INVENTORY_EMAIL_LOG).where('date', '==', previousDate(date)).select('emailHash', 'kind').get(),
    ]);
    const guestDrafts = drafts.filter((d) => d.kind === 'guest' && d.leadEmailHash);
    const [leadEmails, unsubscribed] = await Promise.all([
        guestDrafts.length ? guestLeadEmails(db, apiKey, guestDrafts, !options.dryRun) : Promise.resolve(new Map()),
        (0, cioPeople_1.unsubscribedHashes)([apiKey, ...((_b = options.extraUnsubKeys) !== null && _b !== void 0 ? _b : [])]),
    ]);
    const recipients = buildRecipients(drafts, leadEmails);
    result.recipients = {
        household: recipients.filter((r) => r.kind === 'household').length,
        guest: recipients.filter((r) => r.kind === 'guest').length,
    };
    result.guestsWithoutLead = drafts.filter((d) => d.kind === 'guest' && (!d.leadEmailHash || !leadEmails.has(d.leadEmailHash))).length;
    const held = (0, inventoryWatch_1.countDraftHolds)(drafts);
    const catalogRows = rows.map((r) => { var _a; return (Object.assign(Object.assign({}, r), { draftHeld: (_a = held.get(r.id)) !== null && _a !== void 0 ? _a : 0 })); });
    const low = (0, inventoryWatch_1.lowItemsReport)(catalogRows).low.sort((a, b) => { var _a, _b; return itemRank(a.id, []) - itemRank(b.id, []) || ((_a = a.remaining) !== null && _a !== void 0 ? _a : 0) - ((_b = b.remaining) !== null && _b !== void 0 ? _b : 0); });
    result.lowItems = low.map((i) => ({ id: i.id, remaining: i.remaining }));
    const swaps = swapSnap.docs.flatMap((d) => {
        const s = d.data();
        const at = s.swappedAt instanceof firestore_1.Timestamp ? s.swappedAt.toMillis() : 0;
        if (!at || now.getTime() - at > SWAP_EMAIL_MAX_AGE_MS)
            return [];
        return [{ id: d.id, draftKey: String(s.draftKey), fromItemId: String(s.fromItemId), toItemId: typeof s.toItemId === 'string' ? s.toItemId : null }];
    });
    result.pendingSwaps = swaps.length;
    const plan = planInventoryEmails({
        recipients,
        lowItemIds: low.map((i) => i.id),
        swaps,
        lowAlreadySent: new Set(lowSentSnap.docs.map((d) => d.id)),
        sentToday: new Set(todaySnap.docs.map((d) => String(d.data().emailHash))),
        lowYesterday: new Set(yesterdaySnap.docs.filter((d) => d.data().kind === 'low').map((d) => String(d.data().emailHash))),
        unsubscribed,
    });
    result.skipped = plan.skipped;
    for (const p of plan.picks)
        result.picks[pickKey(p)] = ((_c = result.picks[pickKey(p)]) !== null && _c !== void 0 ? _c : 0) + 1;
    const liveDraftKeys = new Set(drafts.map((d) => d.key));
    const securedSwapIds = plan.unreachableSwapIds.filter((id) => {
        const swap = swaps.find((s) => s.id === id);
        return swap && !liveDraftKeys.has(swap.draftKey);
    });
    result.swapsNoLongerDraft = securedSwapIds.length;
    if (options.dryRun)
        return result;
    for (const id of securedSwapIds) {
        await db.doc(`${inventoryWatch_1.INVENTORY_SWAPS}/${id}`).set({ emailed: true, emailSkipped: 'no-longer-draft' }, { merge: true });
    }
    const catalog = await loadCatalogDocs(db, plan.picks.flatMap((p) => (p.kind === 'low' ? [p.itemId] : [p.swap.fromItemId, ...(p.swap.toItemId ? [p.swap.toItemId] : [])])));
    const images = new Map();
    const imageFor = (id, prefer) => {
        const key = `${id}:${prefer}`;
        if (!images.has(key)) {
            const cat = catalog.get(id);
            images.set(key, cat ? (0, emailItems_1.catalogEmailImage)(id, cat, prefer).catch(() => null) : Promise.resolve(null));
        }
        return images.get(key);
    };
    const byHash = new Map(recipients.map((r) => [r.hash, r]));
    const { etDate: programDay } = await Promise.resolve().then(() => require('./program/time'));
    const marketedToday = new Set();
    const logSnap = await db.collection('messageLog').select('sends').get();
    for (const doc of logSnap.docs) {
        const sends = doc.data().sends;
        if (!Array.isArray(sends))
            continue;
        if (sends.some((s) => s && s.marketing === true && s.skipped !== true && typeof s.at === 'string' && programDay(s.at) === date)) {
            marketedToday.add(doc.id);
        }
    }
    for (const pick of plan.picks) {
        const r = byHash.get(pick.hash);
        if (pick.kind === 'low' && marketedToday.has(pick.hash)) {
            result.skipped.lowCooldown += 1;
            continue;
        }
        if (!(await claimDailySlot(db, r, date, pick)))
            continue;
        const logRef = db.doc(`${exports.INVENTORY_EMAIL_LOG}/${r.hash}_${date}`);
        try {
            const links = await ctaLinksFor(db, r, pick.kind, logRef.id);
            const { template, data } = await emailDataFor(pick, catalog, links, imageFor);
            const status = await (0, email_1.sendEmail)({ to: r.email, template, data });
            if (status !== 'sent')
                throw new Error(`sendEmail ${status}`);
            if (pick.kind === 'low') {
                await db.doc(`${exports.INVENTORY_LOW_SENT}/${r.hash}_${pick.itemId}`).set({
                    emailHash: r.hash,
                    itemId: pick.itemId,
                    sentAt: firestore_1.Timestamp.now(),
                });
            }
            else {
                await db.doc(`${inventoryWatch_1.INVENTORY_SWAPS}/${pick.swap.id}`).set({ emailed: true, emailedAt: firestore_1.Timestamp.now() }, { merge: true });
            }
            await logRef.set({ status: 'sent', sentAt: firestore_1.Timestamp.now() }, { merge: true });
            result.sent += 1;
        }
        catch (err) {
            result.failed += 1;
            await logRef.delete().catch(() => undefined);
            logger.error('inventoryEmails: send failed', { kind: pick.kind, err: String(err).slice(0, 300) });
        }
    }
    return result;
}
exports.scheduledInventoryEmails = (0, sentry_1.onSchedule)({
    schedule: 'every day 10:00',
    timeZone: 'America/New_York',
    memory: '1GiB',
    timeoutSeconds: 540,
}, async () => {
    var _a, _b;
    if (process.env.GJ_INVENTORY_EMAILS_ENABLED !== 'true')
        return;
    const start = (_a = process.env.GJ_INVENTORY_EMAILS_START) === null || _a === void 0 ? void 0 : _a.trim();
    if (start && etDate(new Date()) < start)
        return;
    const extra = ((_b = process.env.CUSTOMERIO_UNSUB_EXTRA_APP_API_KEYS) !== null && _b !== void 0 ? _b : '')
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
    const result = await runInventoryEmails((0, firestore_1.getFirestore)(), { extraUnsubKeys: extra });
    logger.info('scheduledInventoryEmails', result);
});
//# sourceMappingURL=inventoryEmails.js.map