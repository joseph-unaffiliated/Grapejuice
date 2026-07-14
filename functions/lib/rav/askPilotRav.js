"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.askPilotRav = void 0;
const logger = require("firebase-functions/logger");
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const sdk_1 = require("@anthropic-ai/sdk");
const presence_1 = require("./presence");
const modeRegistry_1 = require("./modeRegistry");
const context_1 = require("./context");
const kidRavGuard_1 = require("./kidRavGuard");
const anthropicApiKey = (0, params_1.defineSecret)('ANTHROPIC_API_KEY');
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
exports.askPilotRav = (0, https_1.onCall)({ secrets: [anthropicApiKey], maxInstances: 10 }, async (request) => {
    var _a, _b, _c, _d, _e;
    const data = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    const message = typeof data.message === 'string' ? data.message.trim() : '';
    if (!message)
        throw new https_1.HttpsError('invalid-argument', 'message is required.');
    const apiKey = (_b = anthropicApiKey.value()) === null || _b === void 0 ? void 0 : _b.trim();
    if (!apiKey) {
        throw new https_1.HttpsError('failed-precondition', 'AI is not configured. Set ANTHROPIC_API_KEY on Functions (firebase functions:secrets:set ANTHROPIC_API_KEY).');
    }
    const modeName = data.mode === 'facilitator_kid' ? 'facilitator_kid' : data.mode;
    let kidChildName;
    if (modeName === 'facilitator_kid') {
        if (!((_c = request.auth) === null || _c === void 0 ? void 0 : _c.uid)) {
            throw new https_1.HttpsError('unauthenticated', 'Sign in required for kid Rav.');
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
    const [householdContext, catalogContext] = await Promise.all([
        ((_d = request.auth) === null || _d === void 0 ? void 0 : _d.uid) && modeName !== 'facilitator_kid'
            ? (0, context_1.buildHouseholdContext)(request.auth.uid, clientDraft)
            : Promise.resolve(modeName === 'facilitator_kid' && kidChildName
                ? `Child profile: ${kidChildName}. Hanukkah 2026 at-home guide only.`
                : clientDraft
                    ? `Current box (guest): ${clientDraft}`
                    : ''),
        modeName === 'facilitator_kid' ? Promise.resolve('') : (0, context_1.buildCatalogContext)(),
    ]);
    const contextParts = [householdContext, catalogContext ? `Catalog (id slot name):\n${catalogContext}` : '']
        .filter(Boolean)
        .join('\n\n');
    const systemBase = `${modeConfig.systemPrompt}${presence_1.PRESENCE_APPEND}`;
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
        const blocks = modeName === 'facilitator_kid' ? [] : Array.isArray(parsed === null || parsed === void 0 ? void 0 : parsed.blocks) ? parsed.blocks : [];
        const actions = modeName === 'facilitator_kid' ? [] : Array.isArray(parsed === null || parsed === void 0 ? void 0 : parsed.actions) ? parsed.actions : [];
        const payload = (0, kidRavGuard_1.stripKidRavActions)({ reply: text, text, blocks, actions });
        return payload;
    }
    catch (err) {
        const errMessage = err instanceof Error ? err.message : String(err);
        logger.error('askPilotRav Anthropic error', errMessage);
        if (errMessage.includes('authentication_error') || errMessage.includes('invalid x-api-key')) {
            throw new https_1.HttpsError('failed-precondition', 'AI authentication failed. Check ANTHROPIC_API_KEY.');
        }
        throw new https_1.HttpsError('internal', 'Rav is temporarily unavailable. Try again in a moment.');
    }
});
//# sourceMappingURL=askPilotRav.js.map