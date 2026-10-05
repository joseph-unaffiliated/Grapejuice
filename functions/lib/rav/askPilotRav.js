"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.askPilotRav = void 0;
const logger = require("../logger");
const sentry_1 = require("../sentry");
const params_1 = require("firebase-functions/params");
const sdk_1 = require("@anthropic-ai/sdk");
const presence_1 = require("./presence");
const modeRegistry_1 = require("./modeRegistry");
const context_1 = require("./context");
const kidRavGuard_1 = require("./kidRavGuard");
const types_1 = require("./types");
const plainTalk_1 = require("./plainTalk");
const anthropicApiKey = (0, params_1.defineSecret)('ANTHROPIC_API_KEY');
function blockHasProducts(blocks) {
    return blocks.some((b) => (b.type === 'curation' && Array.isArray(b.swapOptions) && b.swapOptions.length > 0) ||
        (b.type === 'product' && typeof b.itemId === 'string' && !!b.itemId.trim()));
}
/**
 * When the model lists products only via pane.optionItemIds / product_detail,
 * copy them into chat blocks so clients without a companion pane still render a rail.
 */
function ensureChatProductBlocks(blocks, pane) {
    var _a, _b, _c, _d;
    if (blockHasProducts(blocks))
        return blocks;
    const next = [...blocks];
    if ((_a = pane === null || pane === void 0 ? void 0 : pane.optionItemIds) === null || _a === void 0 ? void 0 : _a.length) {
        next.push(Object.assign({ type: 'curation', title: ((_b = pane.title) === null || _b === void 0 ? void 0 : _b.trim()) || 'Picks for you', swapOptions: pane.optionItemIds }, (pane.slotId ? { slotId: pane.slotId } : {})));
        return next;
    }
    if ((pane === null || pane === void 0 ? void 0 : pane.kind) === 'product_detail' && ((_c = pane.itemId) === null || _c === void 0 ? void 0 : _c.trim())) {
        next.push({
            type: 'product',
            title: ((_d = pane.title) === null || _d === void 0 ? void 0 : _d.trim()) || 'Product',
            itemId: pane.itemId.trim(),
        });
    }
    return next;
}
/**
 * One product rail per reply: drop items already shown in an earlier block and
 * any curation block left empty (the model sometimes repeats the same ids).
 */
function dedupeBlocks(blocks) {
    const seen = new Set();
    const out = [];
    let curationKept = false;
    for (const b of blocks) {
        if (b.type === 'curation' && Array.isArray(b.swapOptions)) {
            const ids = b.swapOptions.filter((id) => typeof id === 'string' && !seen.has(id));
            if (!ids.length)
                continue;
            if (curationKept) {
                // Fold extra rails into the first so chat shows a single row.
                const first = out.find((x) => x.type === 'curation');
                if (first === null || first === void 0 ? void 0 : first.swapOptions)
                    first.swapOptions = [...first.swapOptions, ...ids];
            }
            else {
                out.push(Object.assign(Object.assign({}, b), { swapOptions: ids }));
                curationKept = true;
            }
            ids.forEach((id) => seen.add(id));
            continue;
        }
        if (b.type === 'product' && typeof b.itemId === 'string') {
            if (seen.has(b.itemId))
                continue;
            seen.add(b.itemId);
        }
        out.push(b);
    }
    return out;
}
/**
 * Conservative shopping-intent check on the latest user message. When absent,
 * product blocks / product panes are dropped (box actions still pass through).
 */
const SHOPPING_INTENT_RE = /\b(buy|shop|shopping|get|purchase|order|recommend|recommendation|suggest|option|options|alternatives?|swap|switch|replace|gift|gifts|present|price|prices|cost|costs|how much|show me|see (?:the|some|your|other)|which .* should|add|in my box|my box|browse|pick|choose|compare|cheaper|link)\b/i;
function hasShoppingIntent(message) {
    return SHOPPING_INTENT_RE.test(message);
}
const PRODUCT_PANE_KINDS = new Set(['swap_pick', 'curation', 'product_detail']);
/** Sonnet sometimes wraps the schema in ```json fences — strip and extract the object. */
function parseRavResponse(raw) {
    let candidate = raw.trim();
    if (!candidate)
        return null;
    const fenced = candidate.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced === null || fenced === void 0 ? void 0 : fenced[1])
        candidate = fenced[1].trim();
    const tryParse = (s) => {
        try {
            const parsed = JSON.parse(s);
            if (parsed && typeof parsed === 'object' && typeof parsed.text === 'string') {
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
    if (start >= 0 && end > start) {
        return tryParse(candidate.slice(start, end + 1));
    }
    return null;
}
exports.askPilotRav = (0, sentry_1.onCall)({ secrets: [anthropicApiKey], maxInstances: 10 }, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g;
    const data = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    const message = typeof data.message === 'string' ? data.message.trim() : '';
    if (!message)
        throw new sentry_1.HttpsError('invalid-argument', 'message is required.');
    const apiKey = (_b = anthropicApiKey.value()) === null || _b === void 0 ? void 0 : _b.trim();
    if (!apiKey) {
        throw new sentry_1.HttpsError('failed-precondition', 'AI is not configured. Set ANTHROPIC_API_KEY on Functions (firebase functions:secrets:set ANTHROPIC_API_KEY).');
    }
    const modeName = data.mode === 'facilitator_kid' ? 'facilitator_kid' : data.mode;
    let kidChildName;
    if (modeName === 'facilitator_kid') {
        if (!((_c = request.auth) === null || _c === void 0 ? void 0 : _c.uid)) {
            throw new sentry_1.HttpsError('unauthenticated', 'Sign in required for kid Rav.');
        }
        const { childName } = await (0, kidRavGuard_1.assertKidRavAllowed)(request.auth.uid, data.childId);
        kidChildName = childName;
    }
    const modeConfig = (0, modeRegistry_1.getRavModeConfig)(modeName);
    const clientDraft = modeName === 'facilitator_kid'
        ? undefined
        : typeof data.boxDraftSummary === 'string' && data.boxDraftSummary.trim()
            ? data.boxDraftSummary.trim()
            : undefined;
    const [householdContext, catalogRows] = await Promise.all([
        ((_d = request.auth) === null || _d === void 0 ? void 0 : _d.uid) && modeName !== 'facilitator_kid'
            ? (0, context_1.buildHouseholdContext)(request.auth.uid, clientDraft, {
                includeBeam: modeName === 'project_partner',
            })
            : Promise.resolve(modeName === 'facilitator_kid' && kidChildName
                ? `Child profile: ${kidChildName}. Hanukkah 2026 at-home guide only.`
                : [
                    clientDraft ? `Current box (guest): ${clientDraft}` : '',
                    typeof data.familiarityLevel === 'string' && data.familiarityLevel
                        ? `Practice intensity (how much they currently do Hanukkah — not knowledge): ${data.familiarityLevel}`
                        : '',
                ]
                    .filter(Boolean)
                    .join('\n')),
        modeName === 'facilitator_kid' ? Promise.resolve([]) : (0, context_1.loadCatalogRows)(),
    ]);
    const surfaceContext = modeName === 'facilitator_kid' ? '' : (0, context_1.buildSurfaceContext)(data.surface);
    const userMemoryContext = modeName === 'facilitator_kid' ? '' : (0, context_1.buildUserMemoryContext)(data.userMemory);
    const [catalogContext, boxRulesContext] = modeName === 'facilitator_kid'
        ? ['', '']
        : await Promise.all([
            (0, context_1.buildCatalogContext)(data.surface, data.userMemory, catalogRows),
            (0, context_1.buildBoxRulesContext)(catalogRows),
        ]);
    const contextParts = [
        surfaceContext,
        householdContext,
        userMemoryContext,
        boxRulesContext,
        catalogContext,
    ]
        .filter(Boolean)
        .join('\n\n');
    const plainTalk = modeName === 'project_partner' ? '' : plainTalk_1.PLAIN_TALK_APPEND;
    const systemBase = `${modeConfig.systemPrompt}${presence_1.PRESENCE_APPEND}${plainTalk}`;
    const system = contextParts
        ? `${systemBase}\n\n---\nCONTEXT (use when relevant; do not recite verbatim):\n${contextParts}`
        : systemBase;
    const anthropic = new sdk_1.default({ apiKey });
    const history = Array.isArray(data.conversationHistory) ? data.conversationHistory : [];
    const historyLimit = modeName === 'facilitator_kid' ? 6 : 20;
    const messages = [
        ...history.slice(-historyLimit),
        { role: 'user', content: message },
    ];
    try {
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 1024,
            system: `${system}\n\n${modeConfig.jsonInstructions}`,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
        });
        const textBlock = response.content.find((b) => b.type === 'text');
        const raw = textBlock && textBlock.type === 'text' ? textBlock.text : '';
        const parsed = parseRavResponse(raw);
        const text = ((_e = parsed === null || parsed === void 0 ? void 0 : parsed.text) === null || _e === void 0 ? void 0 : _e.trim()) || raw.trim() || 'Sorry, I could not generate a reply.';
        let blocks = modeName === 'facilitator_kid' ? [] : Array.isArray(parsed === null || parsed === void 0 ? void 0 : parsed.blocks) ? parsed.blocks : [];
        const actions = modeName === 'facilitator_kid' ? [] : Array.isArray(parsed === null || parsed === void 0 ? void 0 : parsed.actions) ? parsed.actions : [];
        let pane = modeName === 'facilitator_kid' ? undefined : (0, types_1.sanitizeRavPane)((_f = parsed === null || parsed === void 0 ? void 0 : parsed.pane) !== null && _f !== void 0 ? _f : null);
        const navigate = modeName === 'facilitator_kid' ? undefined : (0, types_1.sanitizeRavNavigate)((_g = parsed === null || parsed === void 0 ? void 0 : parsed.navigate) !== null && _g !== void 0 ? _g : null);
        if (modeName !== 'facilitator_kid' && !hasShoppingIntent(message)) {
            // How-to / meaning / conversation: text only — no product rails or product panes.
            blocks = blocks.filter((b) => b.type !== 'curation' && b.type !== 'product');
            if (pane && PRODUCT_PANE_KINDS.has(pane.kind))
                pane = undefined;
        }
        // Model often puts product ids only on pane.optionItemIds and leaves blocks empty.
        // Chat UIs (storefront drawer) have no companion pane — mirror ids into a curation block.
        if (modeName !== 'facilitator_kid') {
            blocks = dedupeBlocks(ensureChatProductBlocks(blocks, pane));
        }
        const payload = (0, kidRavGuard_1.stripKidRavActions)({ reply: text, text, blocks, actions, pane });
        return navigate ? Object.assign(Object.assign({}, payload), { navigate }) : payload;
    }
    catch (err) {
        const errMessage = err instanceof Error ? err.message : String(err);
        logger.error('askPilotRav Anthropic error', errMessage);
        if (errMessage.includes('authentication_error') || errMessage.includes('invalid x-api-key')) {
            throw new sentry_1.HttpsError('failed-precondition', 'AI authentication failed. Check ANTHROPIC_API_KEY.');
        }
        throw new sentry_1.HttpsError('internal', 'Rav is temporarily unavailable. Try again in a moment.');
    }
});
//# sourceMappingURL=askPilotRav.js.map