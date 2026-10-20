"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PILOT_DEFAULT_ITEMS = exports.PILOT_SURVEY_DUE_AT = exports.PILOT_SURVEY_DUE_LABEL = exports.PILOT_AGREEMENT_VERSION = exports.PILOT_PICK_COUNT = void 0;
exports.isPilotLine = isPilotLine;
exports.pilotLineFor = pilotLineFor;
exports.mergePilotLines = mergePilotLines;
exports.pickProblem = pickProblem;
exports.formatPilotDollars = formatPilotDollars;
exports.formatPilotDay = formatPilotDay;
exports.pilotAgreementText = pilotAgreementText;
exports.agreementHash = agreementHash;
exports.hasRealFirstName = hasRealFirstName;
exports.isAutoInviteEligible = isAutoInviteEligible;
exports.maskEmail = maskEmail;
/**
 * Pilot Participants rules with no Firestore access (see pilotParticipants.ts).
 * The agreement text must match src/services/pilot/pilotAgreement.ts word for word: the client shows
 * it, the server rebuilds it and refuses to enroll when the two differ.
 */
const node_crypto_1 = require("node:crypto");
const metaPracticeCutoff_1 = require("./metaPracticeCutoff");
exports.PILOT_PICK_COUNT = 3;
exports.PILOT_AGREEMENT_VERSION = '2026-10-14';
exports.PILOT_SURVEY_DUE_LABEL = 'January 15, 2027';
/** End of Jan 15, 2027 in New York. */
exports.PILOT_SURVEY_DUE_AT = '2027-01-16T04:59:59.000Z';
/** Approved items in display order (stuffies spread out), with the names the page and agreement use. */
exports.PILOT_DEFAULT_ITEMS = [
    { id: 'toddler-play-menorah', name: 'Toddler play menorah' },
    { id: 'crispy-the-latke-stuffie', name: 'Crispy the Latke stuffie' },
    { id: 'airdry-clay-dreidel', name: 'Air-dry clay dreidel' },
    { id: 'party-bag-of-gelt', name: 'Party bag of gelt' },
    { id: 'shamash-the-menorah-stuffie', name: 'Shamash the Menorah stuffie' },
    { id: 'dreidel-cookie-cutters', name: 'Dreidel cookie cutters' },
    { id: 'gimmel-the-dreidel-stuffie', name: 'Gimmel the Dreidel stuffie' },
    { id: 'airdry-clay-menorah', name: 'Air-dry clay menorah' },
    { id: 'jelly-the-sufganiyah-stuffie', name: 'Jelly the Sufganiyah stuffie' },
];
function isPilotLine(line) {
    return (line === null || line === void 0 ? void 0 : line.program) === 'pilot';
}
function pilotLineFor(pick) {
    return {
        slotId: `pilot-${pick.itemId}`,
        itemId: pick.itemId,
        quantity: 1,
        includedQty: 1,
        unitCents: 0,
        label: pick.name,
        program: 'pilot',
        deferredChargeCents: pick.deferredChargeCents,
    };
}
/**
 * Box lines with exactly the enrollment's pilot lines: any pilot line the client dropped or edited is
 * restored, stray ones removed. `changed` is false when the input already matched.
 */
function mergePilotLines(lines, pilotLines) {
    const rest = lines.filter((li) => !isPilotLine(li));
    const current = lines.filter((li) => isPilotLine(li));
    const same = current.length === pilotLines.length &&
        pilotLines.every((p) => current.some((c) => JSON.stringify(sortKeys(c)) === JSON.stringify(sortKeys(p))));
    if (same)
        return { lines, changed: false };
    return { lines: [...rest, ...pilotLines], changed: true };
}
function sortKeys(o) {
    return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
}
/**
 * Picks must be PILOT_PICK_COUNT distinct approved items, none already in the box as a regular line.
 * Returns an error message for the participant, or null when the picks are fine.
 */
function pickProblem(picks, approvedIds, boxLines, nameOf) {
    if (picks.length !== exports.PILOT_PICK_COUNT)
        return `Pick ${exports.PILOT_PICK_COUNT} items.`;
    if (new Set(picks).size !== picks.length)
        return 'Pick three different items.';
    const bad = picks.find((id) => !approvedIds.includes(id));
    if (bad)
        return 'One of those items isn’t part of the pilot. Refresh and pick again.';
    const inBox = new Set(boxLines.filter((li) => !isPilotLine(li)).map((li) => { var _a; return String((_a = li.itemId) !== null && _a !== void 0 ? _a : ''); }));
    const dup = picks.find((id) => inBox.has(id));
    if (dup)
        return `${nameOf(dup)} is already in your box. Pick something else.`;
    return null;
}
function formatPilotDollars(cents) {
    const dollars = cents / 100;
    return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}
/** `Nov 7`. Date-only strings are calendar days (UTC); timestamps are read in New York. */
function formatPilotDay(iso) {
    if (!iso)
        return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return '';
    const timeZone = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? 'UTC' : 'America/New_York';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone });
}
function joinNames(names) {
    if (names.length <= 1)
        return names.join('');
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
/** Keep in sync with src/services/pilot/pilotAgreement.ts. */
function pilotAgreementText(picks) {
    const total = formatPilotDollars(picks.reduce((s, p) => s + p.deferredChargeCents, 0));
    return [
        `I'm joining Grapejuice Pilot Participants. I'll get these three items free: ${joinNames(picks.map((p) => p.name))} (value ${total}).`,
        `I agree to complete the post-Hanukkah survey by ${exports.PILOT_SURVEY_DUE_LABEL}. If I don't, I authorize Grapejuice to charge my card on file ${total} plus applicable tax, once, after that date.`,
        `Grapejuice may invite me to a paid follow-up conversation; that's optional and not guaranteed.`,
    ].join('\n');
}
function agreementHash(text) {
    return (0, node_crypto_1.createHash)('sha256').update(text, 'utf8').digest('hex');
}
/** The invite greets by first name, so a lone initial ("J", "J.") isn't enough. */
function hasRealFirstName(name) {
    var _a;
    const first = (_a = (name !== null && name !== void 0 ? name : '').trim().split(/\s+/)[0]) !== null && _a !== void 0 ? _a : '';
    return first.replace(/[.,'’\-_]/g, '').length >= 2;
}
function isAutoInviteEligible(c) {
    var _a;
    return ((0, metaPracticeCutoff_1.practiceQualifies)(c.jewish, c.hanukkah) &&
        !!((_a = c.email) === null || _a === void 0 ? void 0 : _a.includes('@')) &&
        hasRealFirstName(c.name) &&
        c.hasDraftLines &&
        !c.committed &&
        !c.playthrough &&
        !c.isTest &&
        !c.alreadyInvited);
}
/** `j•••@example.com` — enough for someone to recognize their own address. */
function maskEmail(email) {
    const [local, domain] = email.split('@');
    if (!local || !domain)
        return '•••';
    return `${local[0]}•••@${domain}`;
}
//# sourceMappingURL=pilotRules.js.map