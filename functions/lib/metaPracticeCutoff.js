"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.META_BOX_BUILT_MAX_PRACTICE = void 0;
exports.practiceAboveMetaCutoff = practiceAboveMetaCutoff;
exports.practiceEligibleForFollowUp = practiceEligibleForFollowUp;
/**
 * Broad campaigns optimize on BoxBuilt. Follow-up membership uses the same line.
 * The score is never a Meta parameter. Keep in sync with
 * src/services/analytics/metaServerEvents.ts.
 */
exports.META_BOX_BUILT_MAX_PRACTICE = 49;
function practiceAboveMetaCutoff(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > exports.META_BOX_BUILT_MAX_PRACTICE;
}
/** At least one numeric score, and every one of them at or under the cutoff. */
function practiceEligibleForFollowUp(...values) {
    const scores = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
    return scores.length > 0 && scores.every((n) => n <= exports.META_BOX_BUILT_MAX_PRACTICE);
}
//# sourceMappingURL=metaPracticeCutoff.js.map