"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduledBoxAudit = void 0;
exports.refreshAccountBoxAudit = refreshAccountBoxAudit;
exports.refreshGuestBoxAudits = refreshGuestBoxAudits;
exports.runBoxAuditSweep = runBoxAuditSweep;
exports.loadBoxProblems = loadBoxProblems;
const sentry_1 = require("./sentry");
/** Box problems are no longer tracked. Boxes are locked. */
async function refreshAccountBoxAudit(_db, _householdId, _path, _data) { }
/** Box problems are no longer tracked. Boxes are locked. */
async function refreshGuestBoxAudits(_db, _path, _data) { }
/** Box problems are no longer tracked. Boxes are locked. */
async function runBoxAuditSweep(_db) {
    return { boxes: 0, real: 0, open: 0, openCommitted: 0, written: 0, deleted: 0, newlyOpen: [] };
}
/** Box problems are no longer tracked. Boxes are locked. */
async function loadBoxProblems(_db) {
    return { boxProblems: [], boxAuditRun: null, fixLog: [] };
}
exports.scheduledBoxAudit = (0, sentry_1.onSchedule)({ schedule: 'every day 06:00', timeZone: 'America/New_York', memory: '256MiB', timeoutSeconds: 60 }, async () => { });
//# sourceMappingURL=boxAuditJob.js.map