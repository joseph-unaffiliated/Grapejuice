"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.simulateProgram = simulateProgram;
const decideNext_1 = require("./decideNext");
const time_1 = require("./time");
/** Walk every person through `ticks` (ISO timestamps). Mutates nothing on the inputs. */
function simulateProgram(people, ticks, pilotInviteCap = 90) {
    var _a, _b;
    const byTouches = {};
    let maxTouches = 0;
    let overDaily = 0;
    let overWeekly = 0;
    let skips = 0;
    let sends = 0;
    for (const start of people) {
        let state = Object.assign(Object.assign({}, start), { sends: [...start.sends] });
        const dayCount = new Map();
        let invitesToday = 0;
        let lastDay = '';
        for (const now of ticks) {
            const day = (0, time_1.etDate)(now);
            if (day !== lastDay) {
                invitesToday = 0;
                lastDay = day;
            }
            state = Object.assign(Object.assign({}, state), { now, allowPilotInvite: invitesToday < pilotInviteCap });
            const result = (0, decideNext_1.decideNext)(state);
            if (result.action === 'skip')
                skips += 1;
            if (result.action === 'send') {
                sends += 1;
                if (result.stage === 'pilot_invite')
                    invitesToday += 1;
                if (result.marketing) {
                    dayCount.set(day, ((_a = dayCount.get(day)) !== null && _a !== void 0 ? _a : 0) + 1);
                }
            }
            state = (0, decideNext_1.applyDecision)(state, result);
        }
        const touches = state.sends.filter((s) => !s.skipped && s.stage !== 'swap').length;
        maxTouches = Math.max(maxTouches, touches);
        const key = String(touches);
        byTouches[key] = ((_b = byTouches[key]) !== null && _b !== void 0 ? _b : 0) + 1;
        for (const n of dayCount.values())
            if (n > 1)
                overDaily += 1;
        if (weeklyOverflow(state, ticks))
            overWeekly += 1;
    }
    return { people: people.length, byTouches, maxTouches, overDaily, overWeekly, skips, sends };
}
function weeklyOverflow(state, ticks) {
    const days = state.sends.filter((s) => s.marketing && !s.skipped).map((s) => (0, time_1.etDate)(s.at));
    const uniq = [...new Set(ticks.map(time_1.etDate))];
    for (const day of uniq) {
        const inWindow = days.filter((d) => d <= day && d >= addCalendar(day, -6));
        if (inWindow.length > 4)
            return true;
    }
    return false;
}
function addCalendar(date, days) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, (m !== null && m !== void 0 ? m : 1) - 1, (d !== null && d !== void 0 ? d : 1) + days)).toISOString().slice(0, 10);
}
//# sourceMappingURL=simulate.js.map