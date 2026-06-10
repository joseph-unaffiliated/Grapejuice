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
const anthropicApiKey = (0, params_1.defineSecret)('ANTHROPIC_API_KEY');
exports.askPilotRav = (0, https_1.onCall)({ secrets: [anthropicApiKey], maxInstances: 10 }, async (request) => {
    var _a, _b, _c, _d;
    const data = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    const message = typeof data.message === 'string' ? data.message.trim() : '';
    if (!message)
        throw new https_1.HttpsError('invalid-argument', 'message is required.');
    const apiKey = (_b = anthropicApiKey.value()) === null || _b === void 0 ? void 0 : _b.trim();
    if (!apiKey) {
        throw new https_1.HttpsError('failed-precondition', 'AI is not configured. Set ANTHROPIC_API_KEY on Functions (firebase functions:secrets:set ANTHROPIC_API_KEY).');
    }
    const modeConfig = (0, modeRegistry_1.getRavModeConfig)(data.mode);
    const clientDraft = typeof data.boxDraftSummary === 'string' && data.boxDraftSummary.trim()
        ? data.boxDraftSummary.trim()
        : undefined;
    const [householdContext, catalogContext] = await Promise.all([
        ((_c = request.auth) === null || _c === void 0 ? void 0 : _c.uid)
            ? (0, context_1.buildHouseholdContext)(request.auth.uid, clientDraft)
            : Promise.resolve(clientDraft ? `Current box (guest): ${clientDraft}` : ''),
        (0, context_1.buildCatalogContext)(),
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
    const messages = [
        ...history.slice(-20),
        { role: 'user', content: message },
    ];
    try {
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            system: `${system}\n\n${modeConfig.jsonInstructions}`,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
        });
        const textBlock = response.content.find((b) => b.type === 'text');
        const raw = textBlock && textBlock.type === 'text' ? textBlock.text : '';
        let parsed = null;
        try {
            parsed = JSON.parse(raw);
        }
        catch (_e) {
            parsed = null;
        }
        const text = ((_d = parsed === null || parsed === void 0 ? void 0 : parsed.text) === null || _d === void 0 ? void 0 : _d.trim()) || raw.trim() || 'Sorry, I could not generate a reply.';
        const blocks = Array.isArray(parsed === null || parsed === void 0 ? void 0 : parsed.blocks) ? parsed.blocks : [];
        const actions = Array.isArray(parsed === null || parsed === void 0 ? void 0 : parsed.actions) ? parsed.actions : [];
        return { reply: text, text, blocks, actions };
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