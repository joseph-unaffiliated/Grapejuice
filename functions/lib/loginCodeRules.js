"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOGIN_CODE_LENGTH = exports.LOGIN_CODE_MAX_ATTEMPTS = exports.LOGIN_CODE_TTL_MS = void 0;
exports.generateLoginCode = generateLoginCode;
exports.normalizeLoginCode = normalizeLoginCode;
exports.spacedLoginCode = spacedLoginCode;
exports.hashLoginCode = hashLoginCode;
exports.checkLoginCode = checkLoginCode;
exports.clientStatusFor = clientStatusFor;
/**
 * Sign-in code rules, free of Firebase imports so they can be unit tested.
 *
 * A code is six digits, lives 10 minutes, and allows five wrong guesses before it is
 * locked. Only a salted hash of the code is stored (loginCodes/{emailHash}); the
 * document is replaced whenever a new code is requested, so there is at most one live
 * code per email.
 */
const crypto_1 = require("crypto");
exports.LOGIN_CODE_TTL_MS = 10 * 60 * 1000;
exports.LOGIN_CODE_MAX_ATTEMPTS = 5;
exports.LOGIN_CODE_LENGTH = 6;
function millis(v) {
    if (typeof v === 'number')
        return v;
    return v && typeof v.toMillis === 'function' ? v.toMillis() : 0;
}
/** Cryptographically random six digits, left-padded, as a string. */
function generateLoginCode() {
    return String((0, crypto_1.randomInt)(0, 10 ** exports.LOGIN_CODE_LENGTH)).padStart(exports.LOGIN_CODE_LENGTH, '0');
}
/** Digits only; "412 839", "412-839" and "412839" are the same code. */
function normalizeLoginCode(raw) {
    if (typeof raw !== 'string' && typeof raw !== 'number')
        return null;
    const digits = String(raw).replace(/\D/g, '');
    return digits.length === exports.LOGIN_CODE_LENGTH ? digits : null;
}
/** "412839" shown as "412 839" in the email. */
function spacedLoginCode(code) {
    return `${code.slice(0, 3)} ${code.slice(3)}`;
}
/** The hash is salted with the email hash so the same code for two people never collides. */
function hashLoginCode(code, emailHash) {
    return (0, crypto_1.createHash)('sha256').update(`${emailHash}:${code}`).digest('hex');
}
/**
 * Check one guess against the stored document. Returns the status and the document
 * to write back: a wrong guess bumps `attempts`, a right one sets `usedAt`. Nothing is
 * written for expired, used or locked codes; the caller treats those as failures.
 */
function checkLoginCode(doc, guessHash, now) {
    if (!doc || typeof doc.codeHash !== 'string' || typeof doc.uid !== 'string')
        return { status: 'invalid' };
    if (doc.usedAt)
        return { status: 'used' };
    const expires = millis(doc.expiresAt);
    if (!expires || expires < now)
        return { status: 'expired' };
    const attempts = Number(doc.attempts) || 0;
    if (attempts >= exports.LOGIN_CODE_MAX_ATTEMPTS)
        return { status: 'locked' };
    if (doc.codeHash !== guessHash) {
        return { status: 'mismatch', next: { attempts: attempts + 1 } };
    }
    return { status: 'ok', next: { usedAt: now } };
}
/** What the client is told. Wrong guesses and unknown emails look the same, so nothing leaks. */
function clientStatusFor(status) {
    if (status === 'ok')
        return 'ok';
    if (status === 'expired' || status === 'used')
        return 'expired';
    if (status === 'locked')
        return 'locked';
    return 'invalid';
}
//# sourceMappingURL=loginCodeRules.js.map