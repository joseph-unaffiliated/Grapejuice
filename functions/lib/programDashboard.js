"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildProgramDashboard = buildProgramDashboard;
exports.createAdminProgramDashboard = createAdminProgramDashboard;
const sentry_1 = require("./sentry");
const guestSessions_1 = require("./guestSessions");
const metaAdsInsights_1 = require("./metaAdsInsights");
const config_1 = require("./program/config");
const decideNext_1 = require("./program/decideNext");
const loadPeople_1 = require("./program/loadPeople");
const time_1 = require("./program/time");
const LAUNCH = '2026-10-21T04:00:00.000Z';
const TARGET = 50;
const LOCK = '2026-11-07';
function millis(v) {
    if (typeof v === 'string')
        return Date.parse(v);
    if (v && typeof v === 'object' && typeof v.toDate === 'function') {
        return v.toDate().getTime();
    }
    if (v && typeof v === 'object' && typeof v._seconds === 'number') {
        return v._seconds * 1000;
    }
    return 0;
}
async function buildProgramDashboard(db) {
    var _a, _b, _c, _d;
    const since = Date.parse(LAUNCH);
    const [orders, jobs, alerts, snapshots, funnels, enrollments, enabled, meta] = await Promise.all([
        db.collectionGroup('orders').select('status', 'holidayId', 'createdAt', 'promo', 'totalCents').get(),
        db.collection('programJobs').get(),
        db.collection('programAlerts').where('open', '==', true).limit(20).get().catch(() => null),
        db.collection('programSnapshots').orderBy('date', 'desc').limit(21).get().catch(() => null),
        db.collection('checkoutFunnel').limit(500).get(),
        db.collection('pilotEnrollments').select('status', 'enrolledAt').get(),
        (0, config_1.enabledStageSet)(db),
        (0, metaAdsInsights_1.metaStatsByAd)().catch(() => null),
    ]);
    const byCode = { pilot: 0, FIFTEENOFF: 0, otherCode: 0, none: 0 };
    let commits = 0;
    let revenueCents = 0;
    for (const o of orders.docs) {
        const d = o.data();
        if (d.holidayId !== 'hanukkah-2026' || d.status !== 'committed')
            continue;
        if (millis(d.createdAt) < since)
            continue;
        commits += 1;
        revenueCents += typeof d.totalCents === 'number' ? d.totalCents : 0;
        const code = typeof ((_a = d.promo) === null || _a === void 0 ? void 0 : _a.code) === 'string' ? d.promo.code : '';
        if (code === 'FIFTEENOFF')
            byCode.FIFTEENOFF += 1;
        else if (code)
            byCode.otherCode += 1;
        else
            byCode.none += 1;
    }
    for (const e of enrollments.docs) {
        if (e.data().status === 'enrolled' && millis(e.data().enrolledAt) >= since)
            byCode.pilot += 1;
    }
    const today = (0, time_1.etDate)(new Date().toISOString());
    const daysLeft = Math.max(0, Math.round((Date.parse(`${LOCK}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000));
    const elapsed = Math.max(1, 17 - daysLeft);
    const pace = Math.round((TARGET / 17) * elapsed);
    const steps = { view: 0, payment: 0, card: 0, purchased: 0 };
    const errors = {};
    for (const f of funnels.docs) {
        const s = f.data().steps;
        if (s && typeof s === 'object') {
            for (const key of Object.keys(steps))
                if (key in s)
                    steps[key] += 1;
        }
        const err = f.data().errors;
        if (err && typeof err === 'object') {
            for (const [stage, row] of Object.entries(err)) {
                errors[stage] = ((_b = errors[stage]) !== null && _b !== void 0 ? _b : 0) + (typeof (row === null || row === void 0 ? void 0 : row.count) === 'number' ? row.count : 1);
            }
        }
    }
    let spend = 0;
    let purchases = 0;
    if (meta) {
        for (const row of Object.values(meta)) {
            spend += row.spend;
            purchases += row.purchases;
        }
    }
    return {
        generatedAt: new Date().toISOString(),
        scoreboard: {
            commits,
            target: TARGET,
            pace,
            daysLeft,
            revenueCents,
            byCode,
            blendedCpp: commits > 0 && spend > 0 ? Math.round((spend / commits) * 100) / 100 : null,
            metaSpend: Math.round(spend * 100) / 100,
            metaPurchases: purchases,
        },
        checkout: { steps, errors },
        jobs: jobs.docs.map((d) => (Object.assign({ id: d.id }, d.data()))),
        alerts: ((_c = alerts === null || alerts === void 0 ? void 0 : alerts.docs) !== null && _c !== void 0 ? _c : []).map((d) => (Object.assign({ id: d.id }, d.data()))),
        enabledStages: [...enabled],
        snapshots: ((_d = snapshots === null || snapshots === void 0 ? void 0 : snapshots.docs) !== null && _d !== void 0 ? _d : []).map((d) => d.data()),
    };
}
function requireAdmin(auth) {
    if (!(auth === null || auth === void 0 ? void 0 : auth.uid))
        throw new sentry_1.HttpsError('unauthenticated', 'Must be signed in.');
    if (!(0, guestSessions_1.isAdminToken)(auth.token)) {
        throw new sentry_1.HttpsError('permission-denied', 'Admin only.');
    }
}
function createAdminProgramDashboard(db) {
    const dashboard = (0, sentry_1.onCall)({ secrets: [metaAdsInsights_1.metaAdsAccessToken] }, async (request) => {
        requireAdmin(request.auth);
        return buildProgramDashboard(db);
    });
    const person = (0, sentry_1.onCall)(async (request) => {
        var _a, _b, _c, _d;
        requireAdmin(request.auth);
        const email = typeof ((_a = request.data) === null || _a === void 0 ? void 0 : _a.email) === 'string' ? request.data.email.trim().toLowerCase() : '';
        if (!email.includes('@'))
            throw new sentry_1.HttpsError('invalid-argument', 'Enter an email.');
        const key = (0, guestSessions_1.emailHash)(email);
        const [log, override, people] = await Promise.all([
            db.doc(`messageLog/${key}`).get(),
            db.doc(`programOverrides/${key}`).get(),
            (0, loadPeople_1.loadProgramPeople)(db, new Date()).catch(() => []),
        ]);
        const found = (_b = people.find((p) => p.personKey === key)) !== null && _b !== void 0 ? _b : null;
        const next = found ? (0, decideNext_1.decideNext)(found) : null;
        return {
            email,
            log: (_c = log.data()) !== null && _c !== void 0 ? _c : null,
            override: (_d = override.data()) !== null && _d !== void 0 ? _d : null,
            person: found,
            next,
        };
    });
    const override = (0, sentry_1.onCall)(async (request) => {
        var _a, _b, _c, _d, _e;
        requireAdmin(request.auth);
        const email = typeof ((_a = request.data) === null || _a === void 0 ? void 0 : _a.email) === 'string' ? request.data.email.trim().toLowerCase() : '';
        const reason = typeof ((_b = request.data) === null || _b === void 0 ? void 0 : _b.reason) === 'string' ? request.data.reason.trim().slice(0, 280) : '';
        if (!email.includes('@') || reason.length < 3)
            throw new sentry_1.HttpsError('invalid-argument', 'Email and a reason are required.');
        const key = (0, guestSessions_1.emailHash)(email);
        await db.doc(`programOverrides/${key}`).set({
            email,
            trackOverride: 'coupon',
            reason,
            at: new Date().toISOString(),
            by: (_d = (_c = request.auth) === null || _c === void 0 ? void 0 : _c.token.email) !== null && _d !== void 0 ? _d : (_e = request.auth) === null || _e === void 0 ? void 0 : _e.uid,
        });
        return { ok: true };
    });
    return { getAdminProgramDashboard: dashboard, adminProgramPerson: person, adminProgramTrackOverride: override };
}
//# sourceMappingURL=programDashboard.js.map