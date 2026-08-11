"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertKidRavAllowed = assertKidRavAllowed;
exports.stripKidRavActions = stripKidRavActions;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const KID_RAV_HOURLY_LIMIT = 20;
async function assertKidRavAllowed(uid, childId) {
    var _a, _b;
    if (!childId || typeof childId !== 'string') {
        throw new https_1.HttpsError('permission-denied', 'Kid Rav requires a child profile.');
    }
    const db = (0, firestore_1.getFirestore)();
    const childSnap = await db.doc(`users/${uid}/children/${childId}`).get();
    if (!childSnap.exists) {
        throw new https_1.HttpsError('not-found', 'Child profile not found.');
    }
    const data = (_a = childSnap.data()) !== null && _a !== void 0 ? _a : {};
    if (data.ravEnabled !== true) {
        throw new https_1.HttpsError('permission-denied', 'Rav is not enabled for this child.');
    }
    const hourKey = new Date().toISOString().slice(0, 13);
    const usageRef = db.doc(`users/${uid}/ravKidUsage/${hourKey}`);
    const usageSnap = await usageRef.get();
    const count = typeof ((_b = usageSnap.data()) === null || _b === void 0 ? void 0 : _b.count) === 'number' ? usageSnap.data().count : 0;
    if (count >= KID_RAV_HOURLY_LIMIT) {
        throw new https_1.HttpsError('resource-exhausted', 'Rav needs a short break. Try again later or ask your grown-up.');
    }
    await usageRef.set({ count: count + 1, updatedAt: new Date().toISOString() }, { merge: true });
    const childName = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'friend';
    return { childName };
}
/** Strip box mutations and companion panes from kid Rav responses. */
function stripKidRavActions(response) {
    if (!response || typeof response !== 'object')
        return response;
    const _a = response, { actions: _removed, pane: _pane } = _a, rest = __rest(_a, ["actions", "pane"]);
    return rest;
}
//# sourceMappingURL=kidRavGuard.js.map