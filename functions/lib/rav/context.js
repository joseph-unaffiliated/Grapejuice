"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCatalogContext = buildCatalogContext;
exports.buildHouseholdContext = buildHouseholdContext;
const firestore_1 = require("firebase-admin/firestore");
const HOLIDAY_ID = 'hanukkah-2026';
async function buildCatalogContext() {
    const db = (0, firestore_1.getFirestore)();
    const snap = await db.collection('catalog').limit(120).get();
    if (snap.empty)
        return '';
    const lines = snap.docs.map((d) => {
        var _a;
        const c = d.data();
        const slot = c.slotId ? String(c.slotId) : 'extra';
        return `${d.id} (${slot}): ${(_a = c.name) !== null && _a !== void 0 ? _a : d.id}`;
    });
    return lines.join('\n');
}
async function buildHouseholdContext(uid, clientDraft) {
    var _a, _b, _c, _d;
    const db = (0, firestore_1.getFirestore)();
    const userSnap = await db.doc(`users/${uid}`).get();
    if (!userSnap.exists)
        return clientDraft ? `Current box (client): ${clientDraft}` : '';
    const user = (_a = userSnap.data()) !== null && _a !== void 0 ? _a : {};
    const householdId = user.householdId;
    const familiarity = user.familiarityLevel;
    const lines = [];
    if (familiarity)
        lines.push(`Family familiarity: ${familiarity}`);
    const childrenSnap = await db.collection(`users/${uid}/children`).get();
    if (!childrenSnap.empty) {
        const kids = childrenSnap.docs.map((d) => {
            const c = d.data();
            const name = c.name ? String(c.name) : 'Child';
            const age = c.ageGroup ? String(c.ageGroup) : '?';
            const beam = c.beamStatus ? String(c.beamStatus) : '';
            return `${name} (${age}${beam ? `, beam:${beam}` : ''})`;
        });
        lines.push(`Kids: ${kids.join(', ')}`);
    }
    if (!householdId) {
        if (clientDraft)
            lines.push(`Current box (client): ${clientDraft}`);
        return lines.join('\n');
    }
    const [draftSnap, configSnap] = await Promise.all([
        db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`).get(),
        db.doc('config/hanukkah-2026').get(),
    ]);
    const config = (_b = configSnap.data()) !== null && _b !== void 0 ? _b : {};
    const lockAt = config.lockAt;
    if (lockAt) {
        const locked = Date.now() >= new Date(lockAt).getTime();
        lines.push(locked ? `Box customization: locked (${lockAt})` : `Box customization open until ${lockAt}`);
    }
    if (clientDraft) {
        lines.push(`Current box (client): ${clientDraft}`);
    }
    else if (draftSnap.exists) {
        const draft = (_c = draftSnap.data()) !== null && _c !== void 0 ? _c : {};
        const items = (_d = draft.lineItems) !== null && _d !== void 0 ? _d : [];
        if (items.length) {
            const summary = items
                .map((li) => {
                const name = li.label || li.itemId || li.slotId || 'item';
                const qty = li.quantity && li.quantity > 1 ? ` ×${li.quantity}` : '';
                const kid = li.childId ? ` [${li.childId}]` : '';
                return `${name}${qty}${kid}`;
            })
                .join('; ');
            lines.push(`Current box: ${summary}`);
        }
        else {
            lines.push('Current box: empty draft');
        }
    }
    else {
        lines.push('Current box: not started');
    }
    return lines.join('\n');
}
//# sourceMappingURL=context.js.map