"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.programClockTicks = programClockTicks;
const time_1 = require("./time");
/** The clocks the jobs actually use: 10:30am ET daily, and 7pm ET on Sundays. */
function programClockTicks(from = '2026-10-22', to = '2026-11-07') {
    const ticks = [];
    const [y, m, d] = from.split('-').map(Number);
    const cursor = new Date(Date.UTC(y, (m !== null && m !== void 0 ? m : 1) - 1, d !== null && d !== void 0 ? d : 1));
    const end = to;
    while (cursor.toISOString().slice(0, 10) <= end) {
        const morning = new Date(cursor);
        morning.setUTCHours(14, 30, 0, 0);
        // After Nov 1 the same UTC hour is 9:30am EST, still inside the send window.
        if (cursor.toISOString().slice(0, 10) >= '2026-11-02')
            morning.setUTCHours(15, 30, 0, 0);
        ticks.push(morning.toISOString());
        if ((0, time_1.etWeekday)(morning.toISOString()) === 0) {
            const evening = new Date(morning);
            evening.setUTCHours(cursor.toISOString().slice(0, 10) >= '2026-11-02' ? 23 : 23, 0, 0, 0);
            ticks.push(evening.toISOString());
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return ticks;
}
//# sourceMappingURL=ticks.js.map