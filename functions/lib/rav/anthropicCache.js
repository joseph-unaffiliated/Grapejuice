"use strict";
/**
 * Anthropic prompt-cache helpers for Rav.
 * @see https://platform.claude.com/docs/en/build-with-claude/prompt-caching
 *
 * SDK 0.39 types CacheControlEphemeral as `{ type: 'ephemeral' }` only; the API
 * also accepts `ttl: '5m' | '1h'`. We pass ttl through for 1h curator prefixes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cachedText = cachedText;
exports.plainText = plainText;
exports.formatCacheUsage = formatCacheUsage;
/** Text system block marked for prompt caching. Default TTL is Anthropic's 5 minutes. */
function cachedText(text, ttl = '5m') {
    return {
        type: 'text',
        text,
        cache_control: Object.assign({ type: 'ephemeral' }, (ttl === '1h' ? { ttl: '1h' } : {})),
    };
}
/** Plain system text block (not cached) — per-user / per-surface context. */
function plainText(text) {
    return { type: 'text', text };
}
/** Compact usage line for confirming cache hits after deploy. */
function formatCacheUsage(usage) {
    var _a, _b, _c, _d;
    return {
        input: Number((_a = usage === null || usage === void 0 ? void 0 : usage.input_tokens) !== null && _a !== void 0 ? _a : 0),
        output: Number((_b = usage === null || usage === void 0 ? void 0 : usage.output_tokens) !== null && _b !== void 0 ? _b : 0),
        cacheCreation: Number((_c = usage === null || usage === void 0 ? void 0 : usage.cache_creation_input_tokens) !== null && _c !== void 0 ? _c : 0),
        cacheRead: Number((_d = usage === null || usage === void 0 ? void 0 : usage.cache_read_input_tokens) !== null && _d !== void 0 ? _d : 0),
    };
}
//# sourceMappingURL=anthropicCache.js.map