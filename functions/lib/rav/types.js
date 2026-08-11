"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeRavPane = sanitizeRavPane;
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