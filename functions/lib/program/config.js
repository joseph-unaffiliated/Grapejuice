"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LIFECYCLE_DOC = void 0;
exports.enabledStageSet = enabledStageSet;
exports.stageIsEnabled = stageIsEnabled;
exports.LIFECYCLE_DOC = 'programConfig/lifecycle';
async function enabledStageSet(db) {
    var _a;
    const snap = await db.doc(exports.LIFECYCLE_DOC).get();
    const raw = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.enabledStages;
    if (!Array.isArray(raw))
        return new Set();
    return new Set(raw.filter((s) => typeof s === 'string'));
}
/** S6 is its own approval. A pre-facelift first touch waits for that tick. */
function stageIsEnabled(enabled, stage, variant) {
    if (variant.includes('s6'))
        return enabled.has('s6');
    if (stage === 'wave2' && enabled.has('wave2'))
        return true;
    if (stage === 'lock_t3' && variant.includes('wave2'))
        return enabled.has('lock_t3') || enabled.has('wave2');
    return enabled.has(stage);
}
//# sourceMappingURL=config.js.map