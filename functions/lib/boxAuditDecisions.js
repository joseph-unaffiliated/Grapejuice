"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decideBoxAuditProblem = exports.BOX_AUDIT_DECISIONS = void 0;
exports.decisionDocId = decisionDocId;
exports.loadBoxAuditDecisions = loadBoxAuditDecisions;
exports.exceptionsWithDecisions = exceptionsWithDecisions;
exports.applyDecisionsToProblems = applyDecisionsToProblems;
exports.isOpenAfterDecision = isOpenAfterDecision;
exports.writeBoxAuditDecision = writeBoxAuditDecision;
/**
 * Admin decisions on included-items audit problems. Stored in Firestore so the Box
 * problems review sheet can approve, mark a donation, or flag follow-up without a deploy.
 */
const firestore_1 = require("firebase-admin/firestore");
const sentry_1 = require("./sentry");
const guestSessions_1 = require("./guestSessions");
const boxAuditExceptions_1 = require("./boxAuditExceptions");
const boxAuditLoad_1 = require("./boxAuditLoad");
exports.BOX_AUDIT_DECISIONS = 'boxAuditDecisions';
const BOX_AUDITS = 'boxAudits';
function problemKey(p) {
    var _a, _b;
    return [p.path, p.section, p.code, (_a = p.itemId) !== null && _a !== void 0 ? _a : '', (_b = p.childKey) !== null && _b !== void 0 ? _b : ''].join('|');
}
function decisionDocId(p) {
    return problemKey(p)
        .replace(/[/#]/g, '__')
        .replace(/[^a-zA-Z0-9._\-]/g, '_')
        .slice(0, 700);
}
function matchesDecision(d, path, p) {
    var _a, _b, _c, _d;
    return (d.path === path &&
        d.section === p.section &&
        d.code === p.code &&
        ((_a = d.itemId) !== null && _a !== void 0 ? _a : null) === ((_b = p.itemId) !== null && _b !== void 0 ? _b : null) &&
        ((_c = d.childKey) !== null && _c !== void 0 ? _c : null) === ((_d = p.childKey) !== null && _d !== void 0 ? _d : null));
}
/** Load every live admin decision (small collection). */
async function loadBoxAuditDecisions(db = (0, firestore_1.getFirestore)()) {
    const snap = await db.collection(exports.BOX_AUDIT_DECISIONS).get();
    return snap.docs.map((d) => {
        var _a, _b, _c, _d, _e, _f, _g;
        const x = d.data();
        return {
            id: d.id,
            path: String((_a = x.path) !== null && _a !== void 0 ? _a : ''),
            email: typeof x.email === 'string' ? x.email : null,
            section: String((_b = x.section) !== null && _b !== void 0 ? _b : ''),
            code: String((_c = x.code) !== null && _c !== void 0 ? _c : ''),
            itemId: typeof x.itemId === 'string' ? x.itemId : null,
            childKey: typeof x.childKey === 'string' ? x.childKey : null,
            detail: String((_d = x.detail) !== null && _d !== void 0 ? _d : ''),
            decision: x.decision,
            note: String((_e = x.note) !== null && _e !== void 0 ? _e : ''),
            decidedAt: String((_f = x.decidedAt) !== null && _f !== void 0 ? _f : ''),
            decidedBy: String((_g = x.decidedBy) !== null && _g !== void 0 ? _g : ''),
        };
    });
}
/** Static exceptions plus approve/donation decisions, for auditBoxRef matching. */
function exceptionsWithDecisions(decisions, path, email) {
    const live = decisions
        .filter((d) => d.path === path && (d.decision === 'approve' || d.decision === 'donation'))
        .map((d) => {
        var _a;
        return ({
            email: d.email || email || '',
            section: d.section,
            code: d.code,
            itemId: (_a = d.itemId) !== null && _a !== void 0 ? _a : undefined,
            note: d.decision === 'donation'
                ? d.note || 'Donation (admin)'
                : d.note || `Approved (${d.decidedAt.slice(0, 10) || 'admin'})`,
        });
    });
    return [...boxAuditExceptions_1.BOX_AUDIT_EXCEPTIONS, ...live];
}
/** Attach the admin decision (if any) onto each problem for the dashboard. */
function applyDecisionsToProblems(path, problems, decisions) {
    return problems.map((p) => {
        var _a, _b, _c;
        const d = decisions.find((x) => matchesDecision(x, path, p));
        let approved = p.approved;
        let likelyDonation = p.likelyDonation;
        if ((d === null || d === void 0 ? void 0 : d.decision) === 'approve' && !approved)
            approved = d.note || 'Approved (admin)';
        if ((d === null || d === void 0 ? void 0 : d.decision) === 'donation') {
            likelyDonation = true;
            if (!approved)
                approved = d.note || 'Donation (admin)';
        }
        return Object.assign(Object.assign({}, p), { approved,
            likelyDonation, decision: (_a = d === null || d === void 0 ? void 0 : d.decision) !== null && _a !== void 0 ? _a : null, decisionNote: (_b = d === null || d === void 0 ? void 0 : d.note) !== null && _b !== void 0 ? _b : null, decidedAt: (_c = d === null || d === void 0 ? void 0 : d.decidedAt) !== null && _c !== void 0 ? _c : null });
    });
}
/** A problem still needs a look after applying static exceptions and live decisions. */
function isOpenAfterDecision(p) {
    if (p.grandfathered)
        return false;
    if (p.decision === 'approve' || p.decision === 'donation')
        return false;
    if (p.approved)
        return false;
    if (p.likelyDonation)
        return false;
    return true;
}
/** Recompute open count on the stored audit after a decision changes. */
async function refreshStoredOpen(db, path, decisions) {
    const id = (0, boxAuditLoad_1.boxAuditId)(path);
    const ref = db.collection(BOX_AUDITS).doc(id);
    const snap = await ref.get();
    if (!snap.exists)
        return;
    const x = snap.data();
    const raw = (Array.isArray(x.problems) ? x.problems : []);
    const withDecisions = applyDecisionsToProblems(path, raw.map((p) => {
        var _a, _b, _c;
        return ({
            section: p.section,
            code: p.code,
            direction: p.direction,
            detail: p.detail,
            itemId: (_a = p.itemId) !== null && _a !== void 0 ? _a : null,
            childKey: (_b = p.childKey) !== null && _b !== void 0 ? _b : null,
            approved: (_c = p.approved) !== null && _c !== void 0 ? _c : null,
            grandfathered: p.grandfathered === true,
            likelyDonation: (0, boxAuditLoad_1.isLikelyDonation)(p),
        });
    }), decisions);
    const openCount = withDecisions.filter(isOpenAfterDecision).length;
    await ref.set({ open: openCount, ok: openCount === 0 }, { merge: true });
    return openCount;
}
async function writeBoxAuditDecision(db, decidedBy, body) {
    const path = typeof body.path === 'string' ? body.path.trim() : '';
    const section = typeof body.section === 'string' ? body.section.trim() : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!path || !section || !code)
        throw new sentry_1.HttpsError('invalid-argument', 'path, section and code are required.');
    const id = decisionDocId({
        path,
        section,
        code,
        itemId: body.itemId,
        childKey: body.childKey,
    });
    const ref = db.collection(exports.BOX_AUDIT_DECISIONS).doc(id);
    if (body.decision === null) {
        await ref.delete().catch(() => undefined);
        const decisions = await loadBoxAuditDecisions(db);
        await refreshStoredOpen(db, path, decisions);
        return null;
    }
    if (!['approve', 'donation', 'follow-up', 'emailed'].includes(body.decision)) {
        throw new sentry_1.HttpsError('invalid-argument', 'Unknown decision.');
    }
    const noteDefault = {
        approve: 'Approved as-is (admin)',
        donation: 'Donation (admin)',
        'follow-up': 'Needs a fix',
        emailed: 'Customer emailed',
    };
    const decision = {
        id,
        path,
        email: typeof body.email === 'string' ? body.email : null,
        section,
        code,
        itemId: typeof body.itemId === 'string' ? body.itemId : null,
        childKey: typeof body.childKey === 'string' ? body.childKey : null,
        detail: typeof body.detail === 'string' ? body.detail : '',
        decision: body.decision,
        note: (typeof body.note === 'string' && body.note.trim()) || noteDefault[body.decision],
        decidedAt: new Date().toISOString(),
        decidedBy,
    };
    await ref.set(decision);
    const decisions = await loadBoxAuditDecisions(db);
    await refreshStoredOpen(db, path, decisions);
    return decision;
}
exports.decideBoxAuditProblem = (0, sentry_1.onCall)(async (request) => {
    var _a;
    if (!request.auth)
        throw new sentry_1.HttpsError('unauthenticated', 'Sign in required.');
    if (!(0, guestSessions_1.isAdminToken)(request.auth.token))
        throw new sentry_1.HttpsError('permission-denied', 'Admin only.');
    const decision = await writeBoxAuditDecision((0, firestore_1.getFirestore)(), request.auth.uid, ((_a = request.data) !== null && _a !== void 0 ? _a : {}));
    return { ok: true, decision };
});
//# sourceMappingURL=boxAuditDecisions.js.map