"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduledBoxAudit = exports.BOX_AUDIT_RUNS = exports.BOX_AUDITS = void 0;
exports.writeBoxAudit = writeBoxAudit;
exports.refreshAccountBoxAudit = refreshAccountBoxAudit;
exports.refreshGuestBoxAudits = refreshGuestBoxAudits;
exports.runBoxAuditSweep = runBoxAuditSweep;
exports.loadBoxProblems = loadBoxProblems;
/**
 * Server side of the included-items audit. boxAudits/{id} holds the latest audit of each box
 * (written by the box write triggers in ./boxHistory and by the daily sweep below); a doc is
 * only rewritten when its result changes. boxAuditRuns/{date} keeps each sweep's totals.
 * Read-only for boxes: nothing here changes a line (scripts/box-audit.ts --apply does, by hand).
 */
const firestore_1 = require("firebase-admin/firestore");
const logger = require("./logger");
const sentry_1 = require("./sentry");
const boxHistoryDiff_1 = require("./boxHistoryDiff");
const boxAuditLoad_1 = require("./boxAuditLoad");
const boxProblemFixes_1 = require("./boxProblemFixes");
exports.BOX_AUDITS = 'boxAudits';
exports.BOX_AUDIT_RUNS = 'boxAuditRuns';
const CATALOG_TTL_MS = 10 * 60 * 1000;
let catalogCache = null;
async function catalogRows(db) {
    if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS)
        return catalogCache.rows;
    const rows = await (0, boxAuditLoad_1.loadAuditCatalog)(db);
    catalogCache = { rows, at: Date.now() };
    return rows;
}
function signature(r) {
    return JSON.stringify([r.problems, r.sections, r.open, r.committed, r.email, r.test, r.kids, r.people]);
}
/**
 * Store a box's audit (or remove it when the box is gone), skipping writes that change nothing.
 * Pass `existing` when the stored doc is already in hand (the sweep).
 */
async function writeBoxAudit(db, path, record, opts = {}) {
    var _a;
    const ref = db.collection(exports.BOX_AUDITS).doc((0, boxAuditLoad_1.boxAuditId)(path));
    const existing = 'existing' in opts ? opts.existing : (await ref.get()).data();
    if (!record) {
        if (!existing)
            return 'absent';
        await ref.delete();
        return 'deleted';
    }
    const sig = signature(record);
    if ((existing === null || existing === void 0 ? void 0 : existing.signature) === sig)
        return 'unchanged';
    const now = new Date().toISOString();
    const openSince = record.open > 0 ? (typeof (existing === null || existing === void 0 ? void 0 : existing.openSince) === 'string' ? existing.openSince : now) : null;
    await ref.set((0, boxHistoryDiff_1.withoutUndefined)(Object.assign(Object.assign({}, record), { signature: sig, auditedAt: now, openSince })));
    if (opts.warnNewlyOpen && !record.test && record.open > 0 && !(Number((_a = existing === null || existing === void 0 ? void 0 : existing.open) !== null && _a !== void 0 ? _a : 0) > 0)) {
        logger.warn('boxAudit: box has new included-items problems', {
            path,
            kind: record.kind,
            committed: record.committed,
            problems: record.problems.filter(boxAuditLoad_1.isOpenProblem).map((p) => `${p.section}:${p.code} ${p.detail}`),
        });
    }
    return 'written';
}
async function writeRef(db, path, box) {
    if (!box)
        return writeBoxAudit(db, path, null, { warnNewlyOpen: true });
    const { exceptionsWithDecisions, loadBoxAuditDecisions } = await Promise.resolve().then(() => require('./boxAuditDecisions'));
    const decisions = await loadBoxAuditDecisions(db);
    const exceptions = exceptionsWithDecisions(decisions, box.path, box.email);
    return writeBoxAudit(db, path, (0, boxAuditLoad_1.auditBoxRef)(box, await catalogRows(db), exceptions), { warnNewlyOpen: true });
}
/** After an account draft's lines change. */
async function refreshAccountBoxAudit(db, householdId, path, data) {
    return writeRef(db, path, await (0, boxAuditLoad_1.accountBoxRef)(db, householdId, path, data));
}
/** After a guestSessions doc's box or gift lines change. */
async function refreshGuestBoxAudits(db, path, data) {
    const { guest, gift } = (0, boxAuditLoad_1.guestBoxRefs)(path, data);
    await writeRef(db, path, guest);
    await writeRef(db, `${path}#gift`, gift);
}
/** Audit every box, store changed results, drop audits of boxes that no longer exist. */
async function runBoxAuditSweep(db) {
    var _a, _b;
    const { exceptionsWithDecisions, loadBoxAuditDecisions } = await Promise.resolve().then(() => require('./boxAuditDecisions'));
    const [{ boxes, catalog }, decisions] = await Promise.all([
        (0, boxAuditLoad_1.loadBoxes)(db, { includeSecuredDrafts: true }),
        loadBoxAuditDecisions(db),
    ]);
    const existing = await db.collection(exports.BOX_AUDITS).get();
    const previous = new Map(existing.docs.map((d) => [d.id, d.data()]));
    const seen = new Set();
    const orderHouseholds = new Set(boxes.flatMap((box) => {
        var _a;
        if (box.kind !== 'order')
            return [];
        const householdId = (_a = box.path.match(/^households\/([^/]+)\//)) === null || _a === void 0 ? void 0 : _a[1];
        return householdId ? [householdId] : [];
    }));
    const result = { boxes: boxes.length, real: 0, open: 0, openCommitted: 0, written: 0, deleted: 0, newlyOpen: [] };
    for (const box of boxes) {
        const id = (0, boxAuditLoad_1.boxAuditId)(box.path);
        seen.add(id);
        const record = (0, boxAuditLoad_1.auditBoxRef)(box, catalog, exceptionsWithDecisions(decisions, box.path, box.email));
        if (!box.test) {
            result.real += 1;
            if ((0, boxAuditLoad_1.countsTowardOpenList)(box.kind, box.path, record.open, orderHouseholds)) {
                result.open += 1;
                if (record.committed)
                    result.openCommitted += 1;
                if (!(Number((_b = (_a = previous.get(id)) === null || _a === void 0 ? void 0 : _a.open) !== null && _b !== void 0 ? _b : 0) > 0))
                    result.newlyOpen.push(box.path);
            }
        }
        if ((await writeBoxAudit(db, box.path, record, { existing: previous.get(id) })) === 'written')
            result.written += 1;
    }
    for (const doc of existing.docs) {
        if (seen.has(doc.id))
            continue;
        await doc.ref.delete();
        result.deleted += 1;
    }
    await db
        .collection(exports.BOX_AUDIT_RUNS)
        .doc(new Date().toISOString().slice(0, 10))
        .set(Object.assign(Object.assign({}, result), { newlyOpen: result.newlyOpen.slice(0, 50), at: new Date().toISOString() }));
    return result;
}
/** Every stored audit with at least one problem (open or not), plus the latest sweep's totals. */
async function loadBoxProblems(db) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    const [{ applyDecisionsToProblems, isOpenAfterDecision, loadBoxAuditDecisions }, audits, runs] = await Promise.all([
        Promise.resolve().then(() => require('./boxAuditDecisions')),
        db.collection(exports.BOX_AUDITS).get(),
        db.collection(exports.BOX_AUDIT_RUNS).orderBy('at', 'desc').limit(1).get(),
    ]);
    const decisions = await loadBoxAuditDecisions(db);
    const text = (v) => (typeof v === 'string' && v ? v : null);
    let fixCatalog = null;
    const boxProblems = [];
    for (const d of audits.docs) {
        const x = d.data();
        const problems = Array.isArray(x.problems) ? x.problems : [];
        if (!problems.length)
            continue;
        const path = String((_a = x.path) !== null && _a !== void 0 ? _a : '');
        const viewed = applyDecisionsToProblems(path, problems.map((p) => {
            var _a, _b, _c, _d;
            return ({
                section: p.section,
                code: p.code,
                direction: p.direction,
                detail: p.detail,
                itemId: (_a = p.itemId) !== null && _a !== void 0 ? _a : null,
                slotId: (_b = p.slotId) !== null && _b !== void 0 ? _b : null,
                childKey: (_c = p.childKey) !== null && _c !== void 0 ? _c : null,
                approved: (_d = p.approved) !== null && _d !== void 0 ? _d : null,
                grandfathered: p.grandfathered === true,
                likelyDonation: (0, boxAuditLoad_1.isLikelyDonation)(p),
            });
        }), decisions);
        const open = viewed.filter(isOpenAfterDecision).length;
        let lines = null;
        if (open > 0) {
            if (!fixCatalog)
                fixCatalog = await (0, boxProblemFixes_1.loadFixCatalog)(db);
            lines = await (0, boxProblemFixes_1.loadFixBox)(db, path).catch(() => null);
        }
        boxProblems.push({
            id: d.id,
            kind: x.kind,
            path,
            householdId: (_c = (_b = path.match(/^households\/([^/]+)\//)) === null || _b === void 0 ? void 0 : _b[1]) !== null && _c !== void 0 ? _c : null,
            email: text(x.email),
            test: x.test === true,
            committed: x.committed === true,
            kids: Number((_d = x.kids) !== null && _d !== void 0 ? _d : 0),
            people: Number((_e = x.people) !== null && _e !== void 0 ? _e : 0),
            open,
            openSince: text(x.openSince),
            auditedAt: text(x.auditedAt),
            problems: viewed.map((p) => {
                var _a, _b, _c;
                return (Object.assign(Object.assign({}, p), { slotId: (_a = p.slotId) !== null && _a !== void 0 ? _a : null, fixes: lines && fixCatalog && isOpenAfterDecision(p)
                        ? (0, boxProblemFixes_1.fixesForProblem)(p, lines.lines, fixCatalog, Number((_b = x.people) !== null && _b !== void 0 ? _b : 0), Number((_c = x.kids) !== null && _c !== void 0 ? _c : 0))
                        : [] }));
            }),
        });
    }
    // Committed households keep a draft that mirrors the order; list the order once.
    const householdsWithOrder = new Set(boxProblems.filter((b) => b.kind === 'order' && b.householdId).map((b) => b.householdId));
    const deduped = boxProblems.filter((b) => !(b.kind === 'account' && b.householdId && householdsWithOrder.has(b.householdId)));
    boxProblems.length = 0;
    boxProblems.push(...deduped);
    const run = (_f = runs.docs[0]) === null || _f === void 0 ? void 0 : _f.data();
    const boxAuditRun = run
        ? {
            boxes: Number((_g = run.boxes) !== null && _g !== void 0 ? _g : 0),
            real: Number((_h = run.real) !== null && _h !== void 0 ? _h : 0),
            open: Number((_j = run.open) !== null && _j !== void 0 ? _j : 0),
            openCommitted: Number((_k = run.openCommitted) !== null && _k !== void 0 ? _k : 0),
            written: Number((_l = run.written) !== null && _l !== void 0 ? _l : 0),
            deleted: Number((_m = run.deleted) !== null && _m !== void 0 ? _m : 0),
            at: String((_o = run.at) !== null && _o !== void 0 ? _o : ''),
        }
        : null;
    const fixLog = await (0, boxProblemFixes_1.loadBoxFixLog)(db).catch(() => []);
    return { boxProblems, boxAuditRun, fixLog };
}
exports.scheduledBoxAudit = (0, sentry_1.onSchedule)({ schedule: 'every day 06:00', timeZone: 'America/New_York', memory: '1GiB', timeoutSeconds: 540 }, async () => {
    const result = await runBoxAuditSweep((0, firestore_1.getFirestore)());
    logger.info('scheduledBoxAudit', result);
    if (result.newlyOpen.length) {
        logger.warn('scheduledBoxAudit: boxes with new included-items problems', { paths: result.newlyOpen });
    }
});
//# sourceMappingURL=boxAuditJob.js.map