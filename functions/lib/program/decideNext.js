"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ABANDONER_HOLD_MS = exports.ACTIVITY_HOLD_MS = exports.STALE_DAYS = exports.SURVEY_CAP = exports.COUPON_LIFETIME_CAP = exports.PILOT_LIFETIME_CAP = exports.WEEKLY_CAP = exports.DAILY_CAP = exports.FACELIFT_CUTOFF = exports.WAVE2_END = exports.WAVE2_START = exports.WAVE1_END = exports.WAVE1_START = exports.PROGRAM_END = exports.PROGRAM_START = void 0;
exports.marketingToday = marketingToday;
exports.marketingInLast7Days = marketingInLast7Days;
exports.lifetimeProgramSends = lifetimeProgramSends;
exports.decideNext = decideNext;
exports.applyDecision = applyDecision;
/**
 * One person, one message. Pure: no Firestore, no clock other than `input.now`.
 * Every sender in the conversion program is a stage here.
 */
const time_1 = require("./time");
exports.PROGRAM_START = '2026-10-21';
exports.PROGRAM_END = '2026-11-07';
exports.WAVE1_START = '2026-10-22';
exports.WAVE1_END = '2026-10-28';
exports.WAVE2_START = '2026-11-04';
exports.WAVE2_END = '2026-11-07';
/** Phone layout went live Oct 11 2026 ~1pm ET. */
exports.FACELIFT_CUTOFF = '2026-10-11T17:00:00.000Z';
exports.DAILY_CAP = 1;
exports.WEEKLY_CAP = 4;
exports.PILOT_LIFETIME_CAP = 5;
exports.COUPON_LIFETIME_CAP = 6;
exports.SURVEY_CAP = 3;
exports.STALE_DAYS = 2;
exports.ACTIVITY_HOLD_MS = 48 * 60 * 60 * 1000;
exports.ABANDONER_HOLD_MS = 72 * 60 * 60 * 1000;
/** Stages that were already due before launch become due on launch day, not stale on day one. */
function floorDue(due) {
    return due < '2026-10-22' ? '2026-10-22' : due;
}
const LOCKS = [
    { stage: 'lock_t1', daysBefore: 1 },
    { stage: 'lock_t3', daysBefore: 3 },
    { stage: 'lock_t7', daysBefore: 7 },
];
function handled(input, stage) {
    const fromLog = input.sends.find((s) => s.stage === stage);
    if (fromLog)
        return fromLog;
    if (stage === 'pilot_invite' && input.pilotEmailedAt) {
        return { stage, at: input.pilotEmailedAt, marketing: true };
    }
    if (stage === 'pilot_d3' && input.pilotFollowUpAt) {
        return { stage, at: input.pilotFollowUpAt, marketing: true };
    }
    if (stage === 'pilot_d7' && input.pilotD7At) {
        return { stage, at: input.pilotD7At, marketing: true };
    }
    return null;
}
function isLock(stage) {
    return stage === 'lock_t7' || stage === 'lock_t3' || stage === 'lock_t1';
}
function countsDaily(s) {
    return s.marketing && !s.skipped;
}
function marketingToday(sends, now) {
    const day = (0, time_1.etDate)(now);
    return sends.filter((s) => countsDaily(s) && (0, time_1.etDate)(s.at) === day).length;
}
function marketingInLast7Days(sends, now) {
    const today = (0, time_1.etDate)(now);
    return sends.filter((s) => countsDaily(s) && (0, time_1.daysBetween)((0, time_1.etDate)(s.at), today) <= 6 && (0, time_1.daysBetween)((0, time_1.etDate)(s.at), today) >= 0).length;
}
function lifetimeProgramSends(sends) {
    return sends.filter((s) => countsDaily(s) && !isLock(s.stage) && s.stage !== 'survey' && s.stage !== 'swap').length;
}
function activityHold(input) {
    if (!input.draftTouchedAt)
        return false;
    const touched = Date.parse(input.draftTouchedAt);
    if (!Number.isFinite(touched))
        return false;
    return Date.parse(input.now) - touched < exports.ACTIVITY_HOLD_MS;
}
function abandonerHold(input) {
    const sent = handled(input, 'abandoner');
    if (!sent || sent.skipped)
        return false;
    return Date.parse(input.now) - Date.parse(sent.at) < exports.ABANDONER_HOLD_MS;
}
function dueList(input) {
    const lockDate = (0, time_1.etDate)(input.lockAt);
    const anchor = (0, time_1.etDate)(input.anchorAt);
    const out = [];
    for (const lock of LOCKS) {
        if (!handled(input, lock.stage))
            out.push({ stage: lock.stage, due: floorDue((0, time_1.addDays)(lockDate, -lock.daysBefore)) });
    }
    if (input.track === 'pilot' && !input.enrolled) {
        if (!handled(input, 'pilot_invite'))
            out.push({ stage: 'pilot_invite', due: floorDue(anchor) });
        const invite = handled(input, 'pilot_invite');
        if (invite && !handled(input, 'pilot_d3')) {
            const base = invite.skipped ? anchor : (0, time_1.etDate)(invite.at);
            out.push({ stage: 'pilot_d3', due: floorDue((0, time_1.addDays)(base, 3)) });
        }
        const d3 = handled(input, 'pilot_d3');
        if (d3 && !handled(input, 'pilot_d7')) {
            const inviteAt = invite ? (invite.skipped ? anchor : (0, time_1.etDate)(invite.at)) : anchor;
            const base = d3.skipped ? (0, time_1.addDays)(inviteAt, 3) : (0, time_1.etDate)(d3.at);
            out.push({ stage: 'pilot_d7', due: floorDue((0, time_1.addDays)(base, 4)) });
        }
    }
    if (input.track === 'coupon') {
        if (!handled(input, 'd1'))
            out.push({ stage: 'd1', due: floorDue(anchor) });
        const d1 = handled(input, 'd1');
        const codeLive = (0, time_1.etDate)(input.now) <= '2026-11-04';
        if (d1 && !handled(input, 'd4') && codeLive) {
            out.push({ stage: 'd4', due: floorDue((0, time_1.addDays)(d1.skipped ? anchor : (0, time_1.etDate)(d1.at), 3)) });
        }
        const d4 = handled(input, 'd4');
        if ((d4 || (d1 && !codeLive)) && !handled(input, 'd8')) {
            const d4Due = (0, time_1.addDays)(d1 ? (d1.skipped ? anchor : (0, time_1.etDate)(d1.at)) : anchor, 3);
            const base = d4 ? (d4.skipped ? d4Due : (0, time_1.etDate)(d4.at)) : d4Due;
            out.push({ stage: 'd8', due: floorDue((0, time_1.addDays)(base, 4)) });
        }
        if (!handled(input, 'wave2'))
            out.push({ stage: 'wave2', due: exports.WAVE2_START });
    }
    return out;
}
function variantFor(stage, input, merged) {
    const bits = [stage, ...merged];
    if (input.preFacelift && (stage === 'd1' || stage === 'pilot_invite'))
        bits.push('s6');
    if (input.reachedPayment && (stage === 'd1' || stage === 'd4' || stage === 'pilot_invite' || stage === 'abandoner')) {
        bits.push('was_at_payment');
    }
    return bits.join('+');
}
function send(stage, reason, input, merged = [], marketing = true) {
    return { action: 'send', stage, reason, merged, variant: variantFor(stage, input, merged), marketing };
}
const DRIP_HELD = new Set(['pilot_invite', 'pilot_d3', 'pilot_d7', 'd1', 'd4', 'd8', 'wave2', 'low_stock']);
function decideNext(input) {
    if (input.stopped)
        return { action: 'none', reason: 'stopped' };
    const today = (0, time_1.etDate)(input.now);
    if (input.swapDue && !input.sends.some((s) => s.stage === 'swap' && !s.skipped && (0, time_1.etDate)(s.at) === today)) {
        return send('swap', 'operational_swap', input, [], false);
    }
    if (today > exports.PROGRAM_END) {
        if (!input.surveyDue)
            return { action: 'none', reason: 'program_over' };
        const surveys = input.sends.filter((s) => s.stage === 'survey' && !s.skipped);
        const last = surveys[surveys.length - 1];
        if (surveys.length >= exports.SURVEY_CAP)
            return { action: 'none', reason: 'survey_cap' };
        if (last && (0, time_1.daysBetween)((0, time_1.etDate)(last.at), today) < 5)
            return { action: 'none', reason: 'survey_wait' };
        if (!(0, time_1.inQuietHours)(input.now))
            return { action: 'none', reason: 'quiet_hours' };
        return send('survey', 'pilot_survey', input, [], false);
    }
    const dues = dueList(input).sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
    const ready = dues.filter((d) => (0, time_1.daysBetween)(d.due, today) >= 0 && (0, time_1.daysBetween)(d.due, today) <= exports.STALE_DAYS);
    const lock = LOCKS.map((l) => ready.find((d) => d.stage === l.stage)).find(Boolean);
    // A date-fixed lock email is not postponed so we can skip an old drip step.
    // The stale step is skipped on the next day, when the lock is no longer due.
    if (!lock) {
        const stale = dues.find((d) => (0, time_1.daysBetween)(d.due, today) > exports.STALE_DAYS);
        if (stale)
            return { action: 'skip', stage: stale.stage, reason: `stale_${stale.stage}` };
    }
    const pilot = ready.find((d) => d.stage === 'pilot_invite' || d.stage === 'pilot_d3' || d.stage === 'pilot_d7');
    const drip = ready.find((d) => d.stage === 'd1' || d.stage === 'd4' || d.stage === 'd8' || d.stage === 'wave2');
    let chosen = null;
    let reason = '';
    if (lock) {
        chosen = lock.stage;
        reason = lock.stage;
    }
    else if (input.liveAbandonerDue && !handled(input, 'abandoner')) {
        chosen = 'abandoner';
        reason = 'live_abandoner';
    }
    else if (pilot) {
        chosen = pilot.stage;
        reason = pilot.stage;
    }
    else if (drip) {
        chosen = drip.stage;
        reason = drip.stage;
    }
    else if (input.lowStockDue && !handled(input, 'low_stock')) {
        chosen = 'low_stock';
        reason = 'low_stock';
    }
    else if (input.surveyDue) {
        const surveys = input.sends.filter((s) => s.stage === 'survey' && !s.skipped);
        const last = surveys[surveys.length - 1];
        if (surveys.length < exports.SURVEY_CAP && (!last || (0, time_1.daysBetween)((0, time_1.etDate)(last.at), today) >= 5)) {
            chosen = 'survey';
            reason = 'pilot_survey';
        }
    }
    if (!chosen)
        return { action: 'none', reason: 'nothing_due' };
    if (chosen !== 'survey' && !(0, time_1.inQuietHours)(input.now))
        return { action: 'none', reason: 'quiet_hours' };
    if (chosen === 'survey' && !(0, time_1.inQuietHours)(input.now))
        return { action: 'none', reason: 'quiet_hours' };
    if ((chosen === 'pilot_invite' || chosen === 'pilot_d3' || chosen === 'pilot_d7') && !(0, time_1.inPilotWindow)(input.now)) {
        return { action: 'none', reason: 'outside_pilot_window' };
    }
    if (chosen === 'pilot_invite' && input.allowPilotInvite === false) {
        return { action: 'none', reason: 'pilot_batch_full' };
    }
    if (activityHold(input) && DRIP_HELD.has(chosen))
        return { action: 'none', reason: 'activity_hold' };
    if (abandonerHold(input) && (chosen === 'd1' || chosen === 'd4' || chosen === 'd8' || chosen === 'wave2')) {
        return { action: 'none', reason: 'abandoner_hold' };
    }
    const marketing = chosen !== 'survey';
    if (marketing) {
        if (marketingToday(input.sends, input.now) >= exports.DAILY_CAP)
            return { action: 'none', reason: 'daily_cap' };
        if (marketingInLast7Days(input.sends, input.now) >= exports.WEEKLY_CAP)
            return { action: 'none', reason: 'weekly_cap' };
        const cap = input.track === 'pilot' ? exports.PILOT_LIFETIME_CAP : exports.COUPON_LIFETIME_CAP;
        if (!isLock(chosen) && lifetimeProgramSends(input.sends) >= cap)
            return { action: 'none', reason: 'lifetime_cap' };
    }
    const merged = [];
    if (chosen === 'lock_t3' &&
        input.track === 'coupon' &&
        !handled(input, 'wave2') &&
        today >= exports.WAVE2_START &&
        today <= exports.WAVE2_END) {
        merged.push('wave2');
    }
    return send(chosen, reason, input, merged, marketing);
}
function applyDecision(input, result) {
    if (result.action === 'none')
        return input;
    const extra = result.action === 'skip'
        ? [{ stage: result.stage, at: input.now, marketing: false, skipped: true }]
        : [
            { stage: result.stage, at: input.now, marketing: result.marketing },
            ...result.merged.map((stage) => ({ stage, at: input.now, marketing: false })),
        ];
    return Object.assign(Object.assign({}, input), { sends: [...input.sends, ...extra] });
}
//# sourceMappingURL=decideNext.js.map