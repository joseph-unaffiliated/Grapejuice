"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduledCheckoutAbandoner = exports.scheduledDraftLifecycleSunday = exports.scheduledDraftLifecycle = void 0;
exports.runDraftLifecycle = runDraftLifecycle;
exports.runCheckoutAbandoner = runCheckoutAbandoner;
/**
 * Daily (and Sunday evening) pass of decideNext.
 * Sends only stages whose piece has been approved. Until then it records what it would have done.
 */
const firestore_1 = require("firebase-admin/firestore");
const logger = require("./logger");
const sentry_1 = require("./sentry");
const email_1 = require("./email");
const cioPeople_1 = require("./cioPeople");
const guestSessions_1 = require("./guestSessions");
const emailItems_1 = require("./emailItems");
const decideNext_1 = require("./program/decideNext");
const config_1 = require("./program/config");
const loadPeople_1 = require("./program/loadPeople");
const pieces_1 = require("./program/pieces");
const simulate_1 = require("./program/simulate");
const ticks_1 = require("./program/ticks");
const PILOT_INVITE_CAP = 80;
const TEMPLATE_BY_STAGE = {
    pilot_invite: 'program-pilot-invite',
    pilot_d3: 'program-pilot-d3',
    pilot_d7: 'program-pilot-d7',
    d1: 'program-d1',
    d4: 'program-d4',
    d8: 'program-d8',
    abandoner: 'program-abandoner',
    wave2: 'program-wave2',
    lock_t1: 'program-lock-t1',
    lock_t7: 'lock-reminder',
    lock_t3: 'lock-reminder',
    survey: 'program-survey',
    s6: 'program-s6',
};
function approvedDecision(input, enabled) {
    let state = input;
    for (let i = 0; i < 8; i += 1) {
        const result = (0, decideNext_1.decideNext)(state);
        if (result.action === 'none')
            return result;
        if (result.action === 'skip') {
            if (enabled.has(result.stage))
                return result;
            state = (0, decideNext_1.applyDecision)(state, result);
            continue;
        }
        if ((0, config_1.stageIsEnabled)(enabled, result.stage, result.variant))
            return result;
        state = (0, decideNext_1.applyDecision)(state, { action: 'skip', stage: result.stage, reason: 'not_approved' });
    }
    return { action: 'none', reason: 'not_approved' };
}
async function seedCodes(db) {
    var _a;
    let created = 0;
    for (const code of pieces_1.OFFER_CODES) {
        const ref = db.doc(`discountCodes/${code.code}`);
        const snap = await ref.get();
        if (snap.exists) {
            if (code.endsAt && ((_a = snap.data()) === null || _a === void 0 ? void 0 : _a.endsAt) == null) {
                await ref.set({ endsAt: code.endsAt, updatedAt: new Date().toISOString() }, { merge: true });
            }
            continue;
        }
        await ref.set({
            code: code.code,
            percentOff: code.percentOff,
            amountOffCents: null,
            freeShipping: code.freeShipping === true,
            startsAt: code.startsAt,
            endsAt: code.endsAt,
            maxRedemptions: null,
            onePerAccount: true,
            active: code.active,
            note: code.note,
            createdAt: new Date().toISOString(),
            createdByEmail: 'program',
            updatedAt: new Date().toISOString(),
        });
        created += 1;
    }
    return created;
}
async function seedApprovals(db) {
    for (const piece of pieces_1.PROGRAM_PIECES) {
        const ref = db.doc(`programApprovals/${piece.id}`);
        const snap = await ref.get();
        if (snap.exists)
            continue;
        await ref.set(Object.assign(Object.assign({}, piece), { status: 'pending', seededAt: new Date().toISOString() }));
    }
}
const BOX_THUMB_STAGES = new Set(['d1', 'abandoner', 'wave2', 'lock_t1']);
async function emailData(db, person, result) {
    const origin = (0, guestSessions_1.appOrigin)();
    const code = result.stage === 'pilot_d7' ? 'TENOFF' : person.track === 'coupon' && !result.stage.startsWith('pilot_') ? 'FIFTEENOFF' : '';
    const path = person.inviteToken && result.stage.startsWith('pilot_') ? `/pilot/${person.inviteToken}` : '/box';
    const url = `${origin}${path}?utm_source=lifecycle&utm_medium=email&utm_campaign=${result.stage}${code ? `&code=${code}` : ''}`;
    const data = {
        stage: result.stage,
        variant: result.variant,
        cta_url: url,
        offer_code: code,
        pre_facelift: person.preFacelift,
        reached_payment: person.reachedPayment,
    };
    if (BOX_THUMB_STAGES.has(result.stage) && !result.variant.includes('s6')) {
        Object.assign(data, (0, emailItems_1.boxThumbFields)(await (0, emailItems_1.lineItemsEmailItems)(db, person.boxLines, url)));
    }
    if (result.stage === 'd8') {
        const book = person.draftKey ? await (0, emailItems_1.soldOutBookItem)(db, person.draftKey, url) : null;
        if (!book)
            return null;
        data.sold_out_name = book.name;
        data.sold_out_image_url = book.image_url;
    }
    return data;
}
async function persist(db, person, result, sent) {
    if (result.action === 'none')
        return;
    const ref = db.doc(`messageLog/${person.personKey}`);
    const entry = result.action === 'skip'
        ? { stage: result.stage, at: person.now, marketing: false, skipped: true, reason: result.reason }
        : Object.assign({ stage: result.stage, at: person.now, marketing: result.marketing && sent, skipped: !sent, reason: result.reason, variant: result.variant }, (result.merged.length ? { merged: result.merged.join(',') } : {}));
    const extra = result.action === 'send'
        ? result.merged.map((stage) => ({ stage, at: person.now, marketing: false, skipped: !sent, reason: 'merged' }))
        : [];
    await ref.set({
        email: person.email,
        track: person.track,
        segment: person.segment,
        householdId: person.householdId,
        sends: firestore_1.FieldValue.arrayUnion(entry, ...extra),
        updatedAt: new Date().toISOString(),
    }, { merge: true });
    if (result.action === 'send' && sent && person.inviteToken) {
        const stamp = result.stage === 'pilot_invite' ? 'emailedAt' : result.stage === 'pilot_d3' ? 'followUpAt' : result.stage === 'pilot_d7' ? 'd7At' : null;
        if (stamp) {
            await db.doc(`pilotInvites/${person.inviteToken}`).set({ [stamp]: new Date().toISOString() }, { merge: true });
        }
    }
}
async function runDraftLifecycle(db, now = new Date()) {
    const counts = { people: 0, wouldSend: 0, sent: 0, skipped: 0, held: 0, failed: 0 };
    const enabled = await (0, config_1.enabledStageSet)(db);
    counts.codes = await seedCodes(db);
    await seedApprovals(db);
    let leadEmails;
    let unsubscribed;
    const apiKey = (0, email_1.getCustomerioAppApiKey)();
    if (apiKey) {
        try {
            [leadEmails, unsubscribed] = await Promise.all([(0, cioPeople_1.leadEmailsByHash)(apiKey), (0, cioPeople_1.unsubscribedHashes)([apiKey])]);
        }
        catch (err) {
            logger.warn('draftLifecycle: customer.io lookup failed', { err: String(err).slice(0, 200) });
        }
    }
    const people = await (0, loadPeople_1.loadProgramPeople)(db, now, { leadEmails, unsubscribed });
    counts.people = people.length;
    let invites = 0;
    for (const person of people) {
        const input = Object.assign(Object.assign({}, person), { now: now.toISOString(), allowPilotInvite: invites < PILOT_INVITE_CAP });
        const result = approvedDecision(input, enabled);
        if (result.action === 'none') {
            counts.held += 1;
            continue;
        }
        if (result.action === 'skip') {
            counts.skipped += 1;
            await persist(db, Object.assign(Object.assign({}, person), { now: now.toISOString() }), result, false);
            continue;
        }
        counts.wouldSend += 1;
        const template = result.variant.includes('s6')
            ? TEMPLATE_BY_STAGE.s6
            : result.variant.includes('wave2')
                ? TEMPLATE_BY_STAGE.wave2
                : TEMPLATE_BY_STAGE[result.stage];
        let sent = false;
        if (template) {
            try {
                const data = await emailData(db, person, result);
                if (!data) {
                    counts.wouldSend -= 1;
                    counts.skipped += 1;
                    await persist(db, Object.assign(Object.assign({}, person), { now: now.toISOString() }), { action: 'skip', stage: result.stage, reason: 'no_sold_out_book' }, false);
                    continue;
                }
                const status = await (0, email_1.sendEmail)({ to: person.email, template, data });
                sent = status === 'sent';
            }
            catch (err) {
                counts.failed += 1;
                logger.error('draftLifecycle: send failed', { stage: result.stage, err: String(err).slice(0, 240) });
            }
        }
        if (!sent) {
            counts.held += 1;
            continue;
        }
        counts.sent += 1;
        if (result.stage === 'pilot_invite')
            invites += 1;
        await persist(db, Object.assign(Object.assign({}, person), { now: now.toISOString() }), result, true);
    }
    const histogram = (0, simulate_1.simulateProgram)(people.map((p) => (Object.assign(Object.assign({}, p), { sends: p.sends.filter((s) => !s.skipped) }))), (0, ticks_1.programClockTicks)());
    await db.doc('programJobs/draftLifecycle').set({
        at: now.toISOString(),
        counts,
        enabledStages: [...enabled],
        histogram,
        ok: true,
    });
    await db.doc(config_1.LIFECYCLE_DOC).set({ lastRunAt: now.toISOString() }, { merge: true });
    if (histogram.overDaily > 0 || histogram.overWeekly > 0) {
        await db.collection('programAlerts').add({
            at: now.toISOString(),
            kind: 'simulation_cap',
            overDaily: histogram.overDaily,
            overWeekly: histogram.overWeekly,
            open: true,
        });
    }
    return counts;
}
async function runCheckoutAbandoner(db, now = new Date()) {
    const enabled = await (0, config_1.enabledStageSet)(db);
    if (!enabled.has('abandoner')) {
        await db.doc('programJobs/abandoner').set({ at: now.toISOString(), ok: true, skipped: 'not_approved' });
        return { considered: 0, sent: 0 };
    }
    const people = await (0, loadPeople_1.loadProgramPeople)(db, now);
    let considered = 0;
    let sent = 0;
    for (const person of people) {
        if (!person.liveAbandonerDue)
            continue;
        considered += 1;
        const result = approvedDecision(Object.assign(Object.assign({}, person), { now: now.toISOString() }), enabled);
        if (result.action !== 'send' || result.stage !== 'abandoner')
            continue;
        try {
            const data = await emailData(db, person, result);
            if (!data)
                continue;
            const status = await (0, email_1.sendEmail)({ to: person.email, template: 'program-abandoner', data });
            if (status !== 'sent')
                continue;
            sent += 1;
            await persist(db, Object.assign(Object.assign({}, person), { now: now.toISOString() }), result, true);
        }
        catch (err) {
            logger.error('abandoner: send failed', { err: String(err).slice(0, 240) });
        }
    }
    await db.doc('programJobs/abandoner').set({ at: now.toISOString(), ok: true, considered, sent });
    return { considered, sent };
}
const schedule = {
    memory: '1GiB',
    timeoutSeconds: 540,
    timeZone: 'America/New_York',
};
exports.scheduledDraftLifecycle = (0, sentry_1.onSchedule)(Object.assign(Object.assign({}, schedule), { schedule: '30 10 * * *' }), async () => {
    try {
        const counts = await runDraftLifecycle((0, firestore_1.getFirestore)());
        logger.info('draftLifecycle', counts);
    }
    catch (err) {
        logger.error('draftLifecycle failed', err instanceof Error ? err : new Error(String(err)));
        await (0, firestore_1.getFirestore)().doc('programJobs/draftLifecycle').set({ at: new Date().toISOString(), ok: false, error: String(err).slice(0, 400) });
        await (0, firestore_1.getFirestore)().collection('programAlerts').add({ at: new Date().toISOString(), kind: 'job_error', job: 'draftLifecycle', open: true });
    }
});
exports.scheduledDraftLifecycleSunday = (0, sentry_1.onSchedule)(Object.assign(Object.assign({}, schedule), { schedule: '0 19 * * 0' }), async () => {
    try {
        await runDraftLifecycle((0, firestore_1.getFirestore)());
    }
    catch (err) {
        logger.error('draftLifecycle sunday failed', err instanceof Error ? err : new Error(String(err)));
    }
});
exports.scheduledCheckoutAbandoner = (0, sentry_1.onSchedule)(Object.assign(Object.assign({}, schedule), { schedule: 'every 30 minutes' }), async () => {
    try {
        await runCheckoutAbandoner((0, firestore_1.getFirestore)());
    }
    catch (err) {
        logger.error('abandoner failed', err instanceof Error ? err : new Error(String(err)));
        await (0, firestore_1.getFirestore)().doc('programJobs/abandoner').set({ at: new Date().toISOString(), ok: false, error: String(err).slice(0, 400) });
    }
});
//# sourceMappingURL=draftLifecycle.js.map