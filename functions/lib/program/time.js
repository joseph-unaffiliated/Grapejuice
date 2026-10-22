"use strict";
/** Eastern calendar helpers for the conversion program. No clock math that ignores DST. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.etDate = etDate;
exports.etHour = etHour;
exports.etWeekday = etWeekday;
exports.daysBetween = daysBetween;
exports.addDays = addDays;
exports.inQuietHours = inQuietHours;
exports.inPilotWindow = inPilotWindow;
const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function etDate(iso) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date(iso));
}
function etHour(iso) {
    const raw = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        hourCycle: 'h23',
    }).format(new Date(iso));
    const hour = Number(raw);
    return hour === 24 ? 0 : hour;
}
function etWeekday(iso) {
    var _a;
    const name = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(new Date(iso));
    return (_a = WEEKDAY[name]) !== null && _a !== void 0 ? _a : 0;
}
/** Calendar days from `from` to `to` (ET dates YYYY-MM-DD). Positive when `to` is later. */
function daysBetween(from, to) {
    const a = Date.parse(`${from}T00:00:00Z`);
    const b = Date.parse(`${to}T00:00:00Z`);
    return Math.round((b - a) / 86400000);
}
function addDays(date, days) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, (m !== null && m !== void 0 ? m : 1) - 1, (d !== null && d !== void 0 ? d : 1) + days)).toISOString().slice(0, 10);
}
/** 9:00am inclusive through 8:00pm exclusive, Eastern. */
function inQuietHours(iso) {
    const hour = etHour(iso);
    return hour >= 9 && hour < 20;
}
/** Tue–Thu 9–11am ET, or Sunday 6–8pm ET. Never Friday. */
function inPilotWindow(iso) {
    const weekday = etWeekday(iso);
    const hour = etHour(iso);
    if (weekday >= 2 && weekday <= 4 && hour >= 9 && hour < 11)
        return true;
    if (weekday === 0 && hour >= 18 && hour < 20)
        return true;
    return false;
}
//# sourceMappingURL=time.js.map