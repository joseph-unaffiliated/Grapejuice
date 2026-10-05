"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpsError = void 0;
exports.reportError = reportError;
exports.onCall = onCall;
exports.onRequest = onRequest;
exports.onSchedule = onSchedule;
exports.withSentry = withSentry;
const Sentry = require("@sentry/node");
const https = require("firebase-functions/v2/https");
const scheduler = require("firebase-functions/v2/scheduler");
/** Public client key for Sentry project grapejuice-functions (org unaffiliated-4g). */
const SENTRY_DSN = 'https://7e9d48cda21605204f53ce39d7c49d5a@o4512205993476096.ingest.us.sentry.io/4512206028603392';
/** Only deployed functions report; local builds, tests, deploy discovery and the emulator stay silent. */
const enabled = Boolean(process.env.K_SERVICE) && process.env.FUNCTIONS_EMULATOR !== 'true';
Sentry.init({
    dsn: SENTRY_DSN,
    enabled,
    environment: (_a = process.env.GCLOUD_PROJECT) !== null && _a !== void 0 ? _a : 'local',
    serverName: process.env.K_SERVICE,
    // Handlers carry children's names, emails and addresses; send stack traces only.
    dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
        databaseQueryData: false,
        queues: false,
        stackFrameVariables: false,
        genAI: { inputs: false, outputs: false },
    },
});
/** HttpsError codes the client is meant to handle (bad input, auth, state) — not bugs. */
const EXPECTED_HTTPS_CODES = new Set([
    'cancelled',
    'invalid-argument',
    'not-found',
    'already-exists',
    'permission-denied',
    'resource-exhausted',
    'failed-precondition',
    'aborted',
    'out-of-range',
    'unauthenticated',
]);
function reportError(err, message) {
    if (!enabled)
        return;
    if (err instanceof https.HttpsError && EXPECTED_HTTPS_CODES.has(err.code))
        return;
    Sentry.withScope((scope) => {
        if (process.env.K_SERVICE)
            scope.setTag('function', process.env.K_SERVICE);
        if (message)
            scope.setContext('log', { message });
        if (err instanceof Error)
            Sentry.captureException(err);
        else
            Sentry.captureMessage(message !== null && message !== void 0 ? message : String(err), 'error');
    });
}
/** Cloud Functions throttles CPU once a handler returns, so send queued events first. */
async function flush() {
    if (enabled)
        await Sentry.flush(2000);
}
async function captured(run) {
    try {
        return await run();
    }
    catch (err) {
        reportError(err);
        throw err;
    }
    finally {
        await flush();
    }
}
function onCall(optsOrHandler, maybeHandler) {
    if (typeof optsOrHandler === 'function') {
        const handler = optsOrHandler;
        return https.onCall((req, res) => captured(() => handler(req, res)));
    }
    const handler = maybeHandler;
    return https.onCall(optsOrHandler, (req, res) => captured(() => handler(req, res)));
}
function onRequest(optsOrHandler, maybeHandler) {
    if (typeof optsOrHandler === 'function') {
        const handler = optsOrHandler;
        return https.onRequest((req, res) => captured(() => handler(req, res)));
    }
    const handler = maybeHandler;
    return https.onRequest(optsOrHandler, (req, res) => captured(() => handler(req, res)));
}
function onSchedule(schedule, handler) {
    const wrapped = (event) => captured(() => handler(event));
    return typeof schedule === 'string'
        ? scheduler.onSchedule(schedule, wrapped)
        : scheduler.onSchedule(schedule, wrapped);
}
/** For triggers without a wrapper above (e.g. v1 auth.user().onCreate). */
function withSentry(handler) {
    return (...args) => captured(() => handler(...args));
}
var https_1 = require("firebase-functions/v2/https");
Object.defineProperty(exports, "HttpsError", { enumerable: true, get: function () { return https_1.HttpsError; } });
//# sourceMappingURL=sentry.js.map