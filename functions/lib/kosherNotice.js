"use strict";
/**
 * Kosher food note. Sends once, from the hourly job, while food is still in the box.
 * sendEmail skips it while the Customer.io template id is 0, and nothing is marked sent.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.mentionsKeepingKosher = mentionsKeepingKosher;
exports.mentionsVeganOrGlutenFree = mentionsVeganOrGlutenFree;
exports.hasLatkeOrSufganiyotKit = hasLatkeOrSufganiyotKit;
exports.edibleFoodLines = edibleFoodLines;
exports.kosherNoticeVersion = kosherNoticeVersion;
exports.renderKosherNotice = renderKosherNotice;
exports.runKosherNotices = runKosherNotices;
const emailLayout_1 = require("./emailLayout");
const email_1 = require("./email");
const testAccounts_1 = require("./testAccounts");
function withoutNegatedKosher(text) {
    return text
        .replace(/\bkosher-style\b/gi, '')
        .replace(/\b(?:not|non|isn't|isnt|aren't|arent)\b(?:\s+\w+){0,3}\s+kosher\b/gi, '');
}
/** Same reading as dietNotes: “not kosher” and “kosher-style” do not count. */
function mentionsKeepingKosher(text) {
    const cleaned = withoutNegatedKosher((text !== null && text !== void 0 ? text : '').replace(/\s+/g, ' ').trim());
    return /\bkosher\b/i.test(cleaned);
}
function withoutNegatedDiet(text) {
    return text
        .replace(/\bnon[-\s]?vegan\b/gi, '')
        .replace(/\b(?:not|isn't|isnt|aren't|arent)\b(?:\s+\w+){0,4}\s+vegan\b/gi, '')
        .replace(/\b(?:not|isn't|isnt|aren't|arent)\b(?:\s+\w+){0,4}\s+(?:gluten[-\s]?free|celiac|coeliac)\b/gi, '')
        .replace(/\b(?:not|isn't|isnt|aren't|arent)\b(?:\s+\w+){0,3}\s+gluten\b/gi, '');
}
/** A household note that mentions vegan, celiac, or gluten-free. “Not vegan” does not count. */
function mentionsVeganOrGlutenFree(text) {
    const cleaned = withoutNegatedDiet((text !== null && text !== void 0 ? text : '').replace(/\s+/g, ' ').trim());
    if (/\bvegan\b/i.test(cleaned))
        return true;
    return (/\b(?:gluten[-\s]?free|no gluten|without gluten|zero gluten|celiac|coeliac|gluten[-\s]?(?:allergy|intoleran\w*)|allergic to gluten)\b/i.test(cleaned) || /\b(?:can't|cannot|cant|don't|do not|won't|wont|avoid)\s+(?:have\s+|eat\s+|do\s+)?gluten\b/i.test(cleaned));
}
/** Latke mix or sufganiyot mix still in the box. Gelt, books, and stuffies do not count. */
function hasLatkeOrSufganiyotKit(lines) {
    return lines.some((line) => {
        var _a, _b, _c, _d;
        const slot = String((_a = line.slotId) !== null && _a !== void 0 ? _a : '').replace(/::x$/i, '');
        const item = String((_b = line.itemId) !== null && _b !== void 0 ? _b : '');
        const label = String((_d = (_c = line.label) !== null && _c !== void 0 ? _c : line.name) !== null && _d !== void 0 ? _d : '');
        const hay = `${slot} ${item} ${label}`.toLowerCase();
        if (/stuffie|plush|\bbook\b/.test(hay))
            return false;
        if (/sufgan/.test(hay))
            return true;
        if (slot === 'latke-mix' || slot === 'latke-kit')
            return true;
        return /latke[-\s]?(kit|mix)/.test(hay);
    });
}
function edibleFoodLines(lines) {
    var _a, _b, _c, _d, _e;
    const out = [];
    for (const line of lines) {
        const slot = String((_a = line.slotId) !== null && _a !== void 0 ? _a : '').replace(/::x$/i, '');
        const item = String((_b = line.itemId) !== null && _b !== void 0 ? _b : '');
        const label = String((_d = (_c = line.label) !== null && _c !== void 0 ? _c : line.name) !== null && _d !== void 0 ? _d : '').trim();
        const hay = `${slot} ${item} ${label}`.toLowerCase();
        if (/stuffie|plush|\bbook\b/.test(hay))
            continue;
        const food = /sufgan/.test(hay) ||
            slot === 'latke-mix' ||
            slot === 'latke-kit' ||
            /\blatke\b/.test(hay) ||
            slot === 'gelt' ||
            slot.startsWith('gelt-') ||
            /\bgelt\b/.test(hay);
        if (!food)
            continue;
        const name = label || (/sufgan/.test(hay) ? 'Sufganiyot kit' : /\bgelt\b/.test(hay) ? 'Chocolate gelt' : 'Latke kit');
        out.push({ name, imageUrl: (_e = line.imageUrl) !== null && _e !== void 0 ? _e : '' });
    }
    return out;
}
/**
 * Who gets the note. Only while latke mix, sufganiyot mix, or gelt is still in the box.
 * A kosher household note, a Rav message, or a touched practice score of 80 or higher qualifies.
 * A vegan, celiac, or gluten-free note qualifies only when a latke or sufganiyot kit is still in the box.
 * An untouched 50 does not. A high Hanukkah score by itself does not.
 */
function kosherNoticeVersion(input) {
    if (!input.edibleNames.length)
        return null;
    const saidKosher = mentionsKeepingKosher(input.householdNote) || mentionsKeepingKosher(input.ravText);
    const highPractice = input.practiceTouched === true &&
        typeof input.practiceScore === 'number' &&
        input.practiceScore >= 80;
    const dietNote = mentionsVeganOrGlutenFree(input.householdNote) && input.hasMixKit === true;
    if (saidKosher || highPractice || dietNote)
        return 'with_food';
    return null;
}
function renderKosherNotice(input) {
    return {
        subject: 'A note about the food items in your box',
        html: (0, emailLayout_1.grapejuiceEmailHtml)({
            campaign: 'kosher_notice',
            preheader: "You can ignore this if you don't have dietary restrictions",
            title: 'Review the food items in your box',
            paragraphs: [
                "You can ignore this if it's not relevant to you, but we just wanted to ensure you were aware that (a) none of the food items in this box are certified kosher and (b) the latke and sufganiyot mixes have flour and call for egg.",
                'All items are dairy-free (pareve), including the gelt, and the mixes can be made vegan with an egg-substitute (not provided).',
                'Make any swaps or changes between now and Nov. 7.',
            ],
            thumbsTitle: 'Food items in your box',
            thumbs: input.foods.map((food) => ({ name: food.name, imageUrl: food.imageUrl })),
            ctaLabel: 'Review my box',
            ctaUrl: input.boxUrl,
        }),
    };
}
/** One note per person. Already-sent accounts are skipped. A failed send is retried next hour. */
async function runKosherNotices(db, now = new Date()) {
    var _a, _b, _c, _d, _e;
    const [users, drafts, chats] = await Promise.all([
        db.collection('users').select('email', 'ravNotes', 'lastBoxAnswers', 'householdId', 'kosherNoticeSentAt').get(),
        db.collectionGroup('boxDrafts').get(),
        db.collectionGroup('aiChats').select('messages').get(),
    ]);
    const ravByUid = new Map();
    for (const doc of chats.docs) {
        const uid = (_a = doc.ref.parent.parent) === null || _a === void 0 ? void 0 : _a.id;
        if (!uid || doc.ref.parent.id !== 'aiChats' || ravByUid.has(uid))
            continue;
        const msgs = doc.data().messages;
        if (!Array.isArray(msgs))
            continue;
        const text = msgs
            .filter((m) => m && m.role !== 'assistant')
            .map((m) => { var _a; return String((_a = m.content) !== null && _a !== void 0 ? _a : ''); })
            .join('\n');
        if (mentionsKeepingKosher(text))
            ravByUid.set(uid, text);
    }
    const draftByHousehold = new Map();
    for (const doc of drafts.docs) {
        const hh = doc.ref.parent.parent;
        if (doc.id !== 'hanukkah-2026' || (hh === null || hh === void 0 ? void 0 : hh.parent.id) !== 'households')
            continue;
        const lines = doc.data().lineItems;
        draftByHousehold.set(hh.id, Array.isArray(lines) ? lines : []);
    }
    const pending = [];
    const itemIds = new Set();
    for (const user of users.docs) {
        const data = user.data();
        if (typeof data.kosherNoticeSentAt === 'string')
            continue;
        const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
        if (!email || (0, testAccounts_1.isTest)(email))
            continue;
        const answers = ((_b = data.lastBoxAnswers) !== null && _b !== void 0 ? _b : {});
        const practice = typeof answers.practiceFrequencyScore === 'number' ? answers.practiceFrequencyScore : null;
        const hid = typeof data.householdId === 'string' ? data.householdId : '';
        const lines = (_c = draftByHousehold.get(hid)) !== null && _c !== void 0 ? _c : [];
        const foods = edibleFoodLines(lines);
        const householdNote = [data.ravNotes, answers.ravNotes].filter((n) => typeof n === 'string').join('\n');
        const version = kosherNoticeVersion({
            householdNote,
            ravText: (_d = ravByUid.get(user.id)) !== null && _d !== void 0 ? _d : '',
            practiceScore: practice,
            practiceTouched: practice != null && practice !== 50,
            edibleNames: foods.map((food) => food.name),
            hasMixKit: hasLatkeOrSufganiyotKit(lines),
        });
        if (!version)
            continue;
        for (const line of lines) {
            if ((line === null || line === void 0 ? void 0 : line.itemId) && edibleFoodLines([line]).length)
                itemIds.add(line.itemId);
        }
        pending.push({ ref: user.ref, email, lines });
    }
    const imageById = new Map();
    if (itemIds.size) {
        const snaps = await db.getAll(...[...itemIds].map((id) => db.doc(`catalog/hanukkah/items/${id}`)));
        for (const snap of snaps) {
            const image = (_e = snap.data()) === null || _e === void 0 ? void 0 : _e.imageUrl;
            if (typeof image === 'string' && image)
                imageById.set(snap.id, image);
        }
    }
    let sent = 0;
    for (const person of pending) {
        const foods = person.lines.flatMap((line) => {
            var _a;
            const [food] = edibleFoodLines([line]);
            if (!food)
                return [];
            const fromCatalog = line.itemId ? (_a = imageById.get(line.itemId)) !== null && _a !== void 0 ? _a : '' : '';
            return [{ name: food.name, imageUrl: line.imageUrl || fromCatalog }];
        });
        const rendered = renderKosherNotice({ foods, boxUrl: 'https://grapejuice.co/box' });
        const result = await (0, email_1.sendEmail)({
            to: person.email,
            template: 'kosher-notice',
            data: { subject: rendered.subject, html: rendered.html },
        });
        if (result !== 'sent')
            continue;
        await person.ref.set({ kosherNoticeSentAt: now.toISOString() }, { merge: true });
        sent += 1;
    }
    return { sent };
}
//# sourceMappingURL=kosherNotice.js.map