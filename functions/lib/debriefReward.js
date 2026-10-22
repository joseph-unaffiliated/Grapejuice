"use strict";
/**
 * Hanukkah debrief incentive. A fully completed debrief earns one reward per user:
 * through Dec 31 that is the $80 platform credit; Jan 1–31 the user picks the credit or a $20 Amazon gift card.
 * After Jan 31 the debrief stays open but earns nothing. Nothing is ever given for an incomplete debrief.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEBRIEF_REWARD_THROUGH = exports.DEBRIEF_CREDIT_ONLY_THROUGH = exports.DEBRIEF_GIFT_CARD_CENTS = exports.DEBRIEF_CREDIT_CENTS = void 0;
exports.etDay = etDay;
exports.debriefRewardOptions = debriefRewardOptions;
exports.isDebriefComplete = isDebriefComplete;
exports.DEBRIEF_CREDIT_CENTS = 8000;
exports.DEBRIEF_GIFT_CARD_CENTS = 2000;
/** Last Eastern day the credit is the only offer. */
exports.DEBRIEF_CREDIT_ONLY_THROUGH = '2026-12-31';
/** Last Eastern day any debrief reward is given. */
exports.DEBRIEF_REWARD_THROUGH = '2027-01-31';
function etDay(now = new Date()) {
    return now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}
function debriefRewardOptions(todayEt) {
    if (todayEt <= exports.DEBRIEF_CREDIT_ONLY_THROUGH)
        return ['credit'];
    if (todayEt <= exports.DEBRIEF_REWARD_THROUGH)
        return ['credit', 'gift_card'];
    return [];
}
function filled(v) {
    return typeof v === 'string' && v.trim().length > 0;
}
/** Every prompt answered. `wins` carries a trailing "Nights: …" line appended by the client. */
function isDebriefComplete(data) {
    if (!data)
        return false;
    const raw = typeof data.wins === 'string' ? data.wins : '';
    const cut = raw.lastIndexOf('\nNights:');
    const wins = cut >= 0 ? raw.slice(0, cut) : raw;
    return (filled(wins) &&
        filled(data.hardMoments) &&
        filled(data.favoriteNight) &&
        (data.nextYearShift === 'yes' || data.nextYearShift === 'maybe' || data.nextYearShift === 'no'));
}
//# sourceMappingURL=debriefReward.js.map