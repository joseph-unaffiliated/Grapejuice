"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.write = exports.log = exports.warn = exports.info = exports.debug = void 0;
exports.error = error;
const base = require("firebase-functions/logger");
const sentry_1 = require("./sentry");
exports.debug = base.debug, exports.info = base.info, exports.warn = base.warn, exports.log = base.log, exports.write = base.write;
/**
 * Same as firebase-functions/logger.error, plus a Sentry event. Only the message
 * string and any Error are sent — structured args can hold emails and addresses.
 */
function error(...args) {
    base.error(...args);
    const message = args.find((a) => typeof a === 'string');
    const err = args.find((a) => a instanceof Error);
    (0, sentry_1.reportError)(err !== null && err !== void 0 ? err : new Error(message !== null && message !== void 0 ? message : 'logger.error'), message);
}
//# sourceMappingURL=logger.js.map