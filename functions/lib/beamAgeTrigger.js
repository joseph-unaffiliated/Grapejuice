"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanBeamAgeTriggers = void 0;
const logger = require("firebase-functions/logger");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-admin/firestore");
const TRIGGER_WINDOW_MONTHS = 6;
function parseBirthdate(data) {
    const raw = typeof data.birthdate === 'string'
        ? data.birthdate
        : typeof data.birthday === 'string'
            ? data.birthday
            : null;
    if (!raw)
        return null;
    const d = new Date(`${raw}T12:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
}
function monthsUntilAge(birthdate, targetAge, now) {
    const milestone = new Date(Date.UTC(birthdate.getUTCFullYear() + targetAge, birthdate.getUTCMonth(), birthdate.getUTCDate(), 12));
    const diffMs = milestone.getTime() - now.getTime();
    return diffMs / (1000 * 60 * 60 * 24 * 30.4375);
}
function findMilestone(birthdate, now) {
    const checks = [
        { age: 11, type: 'bat_mitzvah' },
        { age: 12, type: 'bar_mitzvah' },
    ];
    let best = null;
    for (const { age, type } of checks) {
        const months = monthsUntilAge(birthdate, age, now);
        if (months >= 0 && months <= TRIGGER_WINDOW_MONTHS) {
            if (!best || months < best.monthsUntil) {
                best = { childId: '', childName: '', milestoneType: type, monthsUntil: Math.round(months * 10) / 10 };
            }
        }
    }
    return best;
}
/** Nightly scan of child birthdates — writes upcomingBeamMilestone (no UI yet). */
exports.scanBeamAgeTriggers = (0, scheduler_1.onSchedule)({
    schedule: '0 6 * * *',
    timeZone: 'America/New_York',
}, async () => {
    var _a;
    const db = (0, firestore_1.getFirestore)();
    const now = new Date();
    const childrenSnap = await db.collectionGroup('children').get();
    const byUser = new Map();
    for (const docSnap of childrenSnap.docs) {
        const data = docSnap.data();
        if (data.beamStatus === 'enrolled' || data.beamStatus === 'completed')
            continue;
        const birthdate = parseBirthdate(data);
        if (!birthdate)
            continue;
        const candidate = findMilestone(birthdate, now);
        if (!candidate) {
            if (data.beamStatus === 'eligible') {
                await docSnap.ref.set({ beamStatus: 'not_eligible' }, { merge: true });
            }
            continue;
        }
        const pathParts = docSnap.ref.path.split('/');
        const userId = pathParts[1];
        if (!userId)
            continue;
        candidate.childId = docSnap.id;
        candidate.childName = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Your child';
        const list = (_a = byUser.get(userId)) !== null && _a !== void 0 ? _a : [];
        list.push({ ref: docSnap.ref, candidate });
        byUser.set(userId, list);
    }
    let updatedUsers = 0;
    for (const [userId, entries] of byUser.entries()) {
        entries.sort((a, b) => a.candidate.monthsUntil - b.candidate.monthsUntil);
        const nearest = entries[0];
        if (!nearest)
            continue;
        await nearest.ref.set({ beamStatus: 'eligible' }, { merge: true });
        const userRef = db.doc(`users/${userId}`);
        await userRef.set({
            upcomingBeamMilestone: {
                childId: nearest.candidate.childId,
                childName: nearest.candidate.childName,
                milestoneType: nearest.candidate.milestoneType,
                monthsUntil: nearest.candidate.monthsUntil,
                triggeredAt: now.toISOString(),
            },
            updatedAt: now.toISOString(),
        }, { merge: true });
        updatedUsers += 1;
    }
    logger.info('scanBeamAgeTriggers complete', { childrenScanned: childrenSnap.size, usersUpdated: updatedUsers });
});
//# sourceMappingURL=beamAgeTrigger.js.map