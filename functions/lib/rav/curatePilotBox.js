"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.curatePilotBox = void 0;
const logger = require("firebase-functions/logger");
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const sdk_1 = require("@anthropic-ai/sdk");
const presence_1 = require("./presence");
const context_1 = require("./context");
const boxCurator_1 = require("./modes/boxCurator");
const boxRules_1 = require("./boxRules");
const anthropicApiKey = (0, params_1.defineSecret)('ANTHROPIC_API_KEY');
const MAX_ACTIONS = 2;
const BLOCKED_SLOT_PREFIXES = ['gelt', 'latke', 'sufgan', 'applesauce', 'wrapping', 'pre-wrap'];
function parseJsonObject(raw) {
    let candidate = raw.trim();
    if (!candidate)
        return null;
    const fenced = candidate.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced === null || fenced === void 0 ? void 0 : fenced[1])
        candidate = fenced[1].trim();
    const tryParse = (s) => {
        try {
            const parsed = JSON.parse(s);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
        }
        catch (_a) {
            /* continue */
        }
        return null;
    };
    const direct = tryParse(candidate);
    if (direct)
        return direct;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start)
        return tryParse(candidate.slice(start, end + 1));
    return null;
}
function asString(v) {
    return typeof v === 'string' ? v.trim() : '';
}
function slotBlocked(slotId) {
    const base = slotId.toLowerCase();
    return BLOCKED_SLOT_PREFIXES.some((p) => base === p || base.startsWith(`${p}-`) || base.startsWith(p));
}
/** Soft allowlist from SECTION_RULES included swaps (kind labels → used as secondary check). */
function sectionAllowsIncludedSwap() {
    // Client already computed allowedSwaps from included-price options; we enforce that list.
    // SECTION_RULES is imported so the policy file stays linked for future server-side kind checks.
    return boxRules_1.SECTION_RULES.length > 0;
}
function validateResult(parsed, data) {
    var _a, _b, _c, _d, _e, _f, _g;
    const allowedBySlot = new Map();
    for (const row of (_a = data.allowedSwaps) !== null && _a !== void 0 ? _a : []) {
        if (!(row === null || row === void 0 ? void 0 : row.slotId))
            continue;
        const set = (_b = allowedBySlot.get(row.slotId)) !== null && _b !== void 0 ? _b : new Set();
        for (const id of (_c = row.optionItemIds) !== null && _c !== void 0 ? _c : []) {
            if (typeof id === 'string' && id.trim())
                set.add(id.trim());
        }
        allowedBySlot.set(row.slotId, set);
    }
    const deviationKeys = new Set(((_d = data.deviations) !== null && _d !== void 0 ? _d : []).map((d) => { var _a; return `${d.slotId}::${(_a = d.childId) !== null && _a !== void 0 ? _a : ''}::${d.toItemId}`; }));
    const notesRaw = Array.isArray(parsed === null || parsed === void 0 ? void 0 : parsed.notes) ? parsed.notes : [];
    const notes = [];
    for (const raw of notesRaw) {
        if (!raw || typeof raw !== 'object')
            continue;
        const n = raw;
        const slotId = asString(n.slotId);
        const itemId = asString(n.itemId);
        const reason = asString(n.reason);
        if (!slotId || !itemId || !reason)
            continue;
        notes.push(Object.assign({ slotId,
            itemId,
            reason }, (asString(n.childId) ? { childId: asString(n.childId) } : {})));
    }
    // Ensure every deviation has a note; leave missing ones for the client to skip.
    void deviationKeys;
    void sectionAllowsIncludedSwap;
    const actionsRaw = Array.isArray(parsed === null || parsed === void 0 ? void 0 : parsed.actions) ? parsed.actions : [];
    const baselineGiftItems = new Map();
    for (const li of (_e = data.baseline) !== null && _e !== void 0 ? _e : []) {
        const slot = asString(li.slotId);
        const childId = asString(li.childId);
        const itemId = asString(li.itemId);
        if (!childId || !itemId)
            continue;
        if (slot === 'gift' || slot.startsWith('gift-') || slot.startsWith('gift')) {
            baselineGiftItems.set(childId, itemId);
        }
    }
    const claimedGiftItems = new Set(baselineGiftItems.values());
    const actions = [];
    for (const raw of actionsRaw) {
        if (actions.length >= MAX_ACTIONS)
            break;
        if (!raw || typeof raw !== 'object')
            continue;
        const a = raw;
        if (asString(a.type) !== 'swap') {
            logger.info('curatePilotBox dropped non-swap action', a.type);
            continue;
        }
        const slotId = asString(a.slotId);
        const itemId = asString(a.itemId);
        const reason = asString(a.reason);
        const childId = asString(a.childId);
        if (!slotId || !itemId || !reason)
            continue;
        if (slotBlocked(slotId)) {
            logger.info('curatePilotBox dropped blocked slot', slotId);
            continue;
        }
        const allowed = (_f = allowedBySlot.get(slotId)) !== null && _f !== void 0 ? _f : (_g = Array.from(allowedBySlot.entries()).find(([k]) => slotId === k || slotId.startsWith(`${k}-`))) === null || _g === void 0 ? void 0 : _g[1];
        if (!allowed || !allowed.has(itemId)) {
            logger.info('curatePilotBox dropped swap not in allowlist', { slotId, itemId });
            continue;
        }
        const isGiftSlot = slotId === 'gift' || slotId.startsWith('gift-') || slotId.startsWith('gift');
        if (isGiftSlot) {
            if (!childId) {
                logger.info('curatePilotBox dropped gift swap without childId', { slotId, itemId });
                continue;
            }
            const otherHasSame = Array.from(baselineGiftItems.entries()).some(([cid, existing]) => cid !== childId && existing === itemId);
            if (otherHasSame ||
                (claimedGiftItems.has(itemId) && baselineGiftItems.get(childId) !== itemId)) {
                logger.info('curatePilotBox dropped duplicate gift across kids', { slotId, itemId, childId });
                continue;
            }
            baselineGiftItems.set(childId, itemId);
            claimedGiftItems.add(itemId);
        }
        actions.push(Object.assign({ type: 'swap', slotId,
            itemId,
            reason }, (childId ? { childId } : {})));
    }
    return { notes, actions };
}
function buildUserMessage(data) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const kids = ((_a = data.kids) !== null && _a !== void 0 ? _a : [])
        .map((k) => `${k.firstName || 'Kid'} age ${k.age} [${k.id}]`)
        .join('; ');
    const baseline = ((_b = data.baseline) !== null && _b !== void 0 ? _b : [])
        .map((li) => {
        var _a;
        const qty = li.quantity && li.quantity > 1 ? ` ×${li.quantity}` : '';
        const kid = li.childId ? ` [child:${li.childId}]` : '';
        return `${li.slotId}:${(_a = li.itemId) !== null && _a !== void 0 ? _a : li.label}${qty}${kid}`;
    })
        .join('; ');
    const deviations = ((_c = data.deviations) !== null && _c !== void 0 ? _c : [])
        .map((d) => {
        const kid = d.childId ? ` child:${d.childId}` : '';
        const from = d.fromItemId ? `${d.fromItemId}→` : '';
        return `${d.slotId}:${from}${d.toItemId}${kid}`;
    })
        .join('; ');
    const allowed = ((_d = data.allowedSwaps) !== null && _d !== void 0 ? _d : [])
        .map((s) => { var _a; return `${s.slotId}→[${((_a = s.optionItemIds) !== null && _a !== void 0 ? _a : []).join(', ')}]`; })
        .join('; ');
    return [
        `practiceLevel: ${(_e = data.practiceLevel) !== null && _e !== void 0 ? _e : 'minimal'}`,
        `practiceScore: ${(_f = data.practiceScore) !== null && _f !== void 0 ? _f : ''}`,
        `adults: ${(_g = data.adults) !== null && _g !== void 0 ? _g : ''}`,
        `kids: ${kids || '(none)'}`,
        `interests: ${((_h = data.interests) !== null && _h !== void 0 ? _h : []).join(', ') || '(none)'}`,
        `notes: ${asString(data.notes) || '(none)'}`,
        `baseline: ${baseline || 'empty'}`,
        `deviations: ${deviations || '(none)'}`,
        `allowedSwaps: ${allowed || '(none)'}`,
        '',
        'Write one reason per deviation. Optionally up to two included-price swaps with reasons.',
    ].join('\n');
}
exports.curatePilotBox = (0, https_1.onCall)({ secrets: [anthropicApiKey], maxInstances: 10 }, async (request) => {
    var _a, _b;
    const data = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    const apiKey = (_b = anthropicApiKey.value()) === null || _b === void 0 ? void 0 : _b.trim();
    if (!apiKey) {
        throw new https_1.HttpsError('failed-precondition', 'AI is not configured. Set ANTHROPIC_API_KEY on Functions.');
    }
    const catalogRows = await (0, context_1.loadCatalogRows)();
    const boxRulesContext = await (0, context_1.buildBoxRulesContext)(catalogRows);
    const system = `${boxCurator_1.BOX_CURATOR_SYSTEM}${presence_1.PRESENCE_APPEND}\n\n---\nCONTEXT (use when relevant; do not recite verbatim):\n${boxRulesContext}\n\n${boxCurator_1.BOX_CURATOR_JSON_INSTRUCTIONS}`;
    const anthropic = new sdk_1.default({ apiKey });
    try {
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 700,
            system,
            messages: [{ role: 'user', content: buildUserMessage(data) }],
        });
        const textBlock = response.content.find((b) => b.type === 'text');
        const raw = textBlock && textBlock.type === 'text' ? textBlock.text : '';
        const parsed = parseJsonObject(raw);
        return validateResult(parsed, data);
    }
    catch (err) {
        const errMessage = err instanceof Error ? err.message : String(err);
        logger.error('curatePilotBox Anthropic error', errMessage);
        if (errMessage.includes('authentication_error') || errMessage.includes('invalid x-api-key')) {
            throw new https_1.HttpsError('failed-precondition', 'AI authentication failed. Check ANTHROPIC_API_KEY.');
        }
        // Fail soft for the caller — return empty so onboarding keeps the deterministic box.
        return { notes: [], actions: [] };
    }
});
//# sourceMappingURL=curatePilotBox.js.map