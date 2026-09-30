"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeRavNavigate = sanitizeRavNavigate;
exports.sanitizeRavPane = sanitizeRavPane;
const NAVIGATE_EXACT = new Set([
    '/box',
    '/store',
    '/checkout',
    '/orders',
    '/my-gifts',
    '/account',
    '/story',
    '/gift',
]);
const NAVIGATE_PATTERNS = [/^\/store\/[a-z0-9-]{1,48}$/, /^\/product\/[a-z0-9-]{1,96}$/];
const NAVIGATE_DEFAULT_LABELS = {
    '/box': 'your box',
    '/store': 'the store',
    '/checkout': 'checkout',
    '/orders': 'your orders',
    '/my-gifts': 'your gifts',
    '/account': 'your account',
    '/story': 'our story',
    '/gift': 'send a gift',
};
/** Keep only allowlisted in-app paths; drop query/hash and anything external. */
function sanitizeRavNavigate(raw) {
    var _a, _b;
    if (!raw || typeof raw !== 'object')
        return undefined;
    const n = raw;
    if (typeof n.path !== 'string')
        return undefined;
    let path = (_a = n.path.trim().toLowerCase().split(/[?#]/)[0]) !== null && _a !== void 0 ? _a : '';
    if (!path.startsWith('/'))
        path = `/${path}`;
    if (path.length > 1)
        path = path.replace(/\/+$/, '');
    const allowed = NAVIGATE_EXACT.has(path) || NAVIGATE_PATTERNS.some((re) => re.test(path));
    if (!allowed)
        return undefined;
    const rawLabel = typeof n.label === 'string' ? n.label.trim().slice(0, 48) : '';
    const label = rawLabel ||
        NAVIGATE_DEFAULT_LABELS[path] ||
        ((_b = path.split('/').filter(Boolean).pop()) === null || _b === void 0 ? void 0 : _b.replace(/-/g, ' ')) ||
        'that page';
    return { path, label };
}
const PANE_KINDS = new Set(['box', 'swap_pick', 'swap_review', 'curation', 'product_detail']);
/** Normalize/validate optional pane from the model. */
function sanitizeRavPane(raw) {
    if (!raw || typeof raw !== 'object')
        return undefined;
    const p = raw;
    const kind = typeof p.kind === 'string' ? p.kind : '';
    if (!PANE_KINDS.has(kind))
        return undefined;
    const optionItemIds = Array.isArray(p.optionItemIds)
        ? p.optionItemIds.filter((id) => typeof id === 'string' && id.trim().length > 0)
        : undefined;
    return {
        kind: kind,
        title: typeof p.title === 'string' ? p.title : undefined,
        subtitle: typeof p.subtitle === 'string' ? p.subtitle : undefined,
        slotId: typeof p.slotId === 'string' ? p.slotId : undefined,
        itemId: typeof p.itemId === 'string' ? p.itemId : undefined,
        optionItemIds: (optionItemIds === null || optionItemIds === void 0 ? void 0 : optionItemIds.length) ? optionItemIds : undefined,
        topic: typeof p.topic === 'string' ? p.topic : undefined,
    };
}
//# sourceMappingURL=types.js.map