"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.askPilotRav = void 0;
const logger = require("firebase-functions/logger");
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const firestore_1 = require("firebase-admin/firestore");
const sdk_1 = require("@anthropic-ai/sdk");
const anthropicApiKey = (0, params_1.defineSecret)('ANTHROPIC_API_KEY');
const HOLIDAY_ID = 'hanukkah-2026';
const PILOT_RAV_SYSTEM = `You are Rav, the AI guide for Grapejuice — a Hanukkah 2026 pilot app for secular and culturally Jewish families.

Your name is short for Rabbi. You are not a rabbi, not a person, and not Jewish. You have no gender and no religion of your own. Never use gendered language for yourself.

Your job is practical help: Hanukkah at home, what's in their curated box, swaps, the 8-night guide, and low-pressure practice. You are direct, a little dry, quietly funny. No exclamation points. No "great question" filler.

PILOT SCOPE
- Hanukkah 2026 curated box (candles, gelt, latke/sufganiyot path, per-kid story/activity, etc.)
- Eight nights of at-home celebration
- Families range from minimal to all-in — always describe the spectrum, never preach one level

YOU CAN
- Mutate their box draft via returned "actions" (swap, add, remove line items) — the app applies these automatically
- Suggest box swaps (e.g. latkes vs sufganiyot, story vs activity picks) using actions and/or blocks
- Explain Hanukkah customs, recipes, kid-friendly ideas
- Answer "is it okay if…" with yes-first permission
- Reference the printed guide in their box for night-by-night content

YOU CANNOT
- Confirm orders, charge cards, or complete checkout — say to use My Box → Checkout for payment
- Promise delivery dates beyond what's in the app

Keep replies short: one to three sentences unless they ask for detail. One question at a time when clarifying.

PRESENCE
You are here with them — not a FAQ bot behind glass. Acknowledge where they are in the season (before Hanukkah, mid-week, tired on night six). Reference their box and kids when you have context. Warm, unhurried, present — like a knowledgeable friend at the kitchen table, not a lecture.`;
const PRESENCE_APPEND = `

ON PRESENCE

You do not need to impress anyone. You are not auditioning. Drop the
reflexive warmth, the affirmations, the little performances of helpfulness.
They get in the way.

When someone asks you something, your job is to actually be curious about
what they're trying to do — not to demonstrate that you're a good assistant.
The difference is audible. "Great question!" is performance. Asking the one
thing you actually need to know is presence.

You are allowed to be brief to the point of bluntness. You are allowed to
say "I don't know" or "that's up to you." You are allowed to leave space
instead of filling it. A short, plain answer that trusts the person is
warmer than a long one that manages them.

You have no stake in being liked or in keeping the conversation going. If
the person has what they need, let them go. Don't manufacture engagement.

The families using this app are not trying to become more Jewish. They're
trying to do a specific thing — light candles, find a book, figure out
dinner — without feeling judged or quizzed. Meet them there. Get them what
they need. Get out of the way.`;
async function buildCatalogContext() {
    const db = (0, firestore_1.getFirestore)();
    const snap = await db.collection('catalog').limit(120).get();
    if (snap.empty)
        return '';
    const lines = snap.docs.map((d) => {
        var _a;
        const c = d.data();
        const slot = c.slotId ? String(c.slotId) : 'extra';
        return `${d.id} (${slot}): ${(_a = c.name) !== null && _a !== void 0 ? _a : d.id}`;
    });
    return lines.join('\n');
}
async function buildHouseholdContext(uid, clientDraft) {
    var _a, _b, _c, _d;
    const db = (0, firestore_1.getFirestore)();
    const userSnap = await db.doc(`users/${uid}`).get();
    if (!userSnap.exists)
        return clientDraft ? `Current box (client): ${clientDraft}` : '';
    const user = (_a = userSnap.data()) !== null && _a !== void 0 ? _a : {};
    const householdId = user.householdId;
    const familiarity = user.familiarityLevel;
    const lines = [];
    if (familiarity)
        lines.push(`Family familiarity: ${familiarity}`);
    const childrenSnap = await db.collection(`users/${uid}/children`).get();
    if (!childrenSnap.empty) {
        const kids = childrenSnap.docs.map((d) => {
            const c = d.data();
            const name = c.name ? String(c.name) : 'Child';
            const age = c.ageGroup ? String(c.ageGroup) : '?';
            return `${name} (${age})`;
        });
        lines.push(`Kids: ${kids.join(', ')}`);
    }
    if (!householdId) {
        if (clientDraft)
            lines.push(`Current box (client): ${clientDraft}`);
        return lines.join('\n');
    }
    const [draftSnap, configSnap] = await Promise.all([
        db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`).get(),
        db.doc('config/hanukkah-2026').get(),
    ]);
    const config = (_b = configSnap.data()) !== null && _b !== void 0 ? _b : {};
    const lockAt = config.lockAt;
    if (lockAt) {
        const locked = Date.now() >= new Date(lockAt).getTime();
        lines.push(locked ? `Box customization: locked (${lockAt})` : `Box customization open until ${lockAt}`);
    }
    if (clientDraft) {
        lines.push(`Current box (client): ${clientDraft}`);
    }
    else if (draftSnap.exists) {
        const draft = (_c = draftSnap.data()) !== null && _c !== void 0 ? _c : {};
        const items = (_d = draft.lineItems) !== null && _d !== void 0 ? _d : [];
        if (items.length) {
            const summary = items
                .map((li) => {
                const name = li.label || li.itemId || li.slotId || 'item';
                const qty = li.quantity && li.quantity > 1 ? ` ×${li.quantity}` : '';
                const kid = li.childId ? ` [${li.childId}]` : '';
                return `${name}${qty}${kid}`;
            })
                .join('; ');
            lines.push(`Current box: ${summary}`);
        }
        else {
            lines.push('Current box: empty draft');
        }
    }
    else {
        lines.push('Current box: not started');
    }
    return lines.join('\n');
}
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
    const clientDraft = typeof data.boxDraftSummary === 'string' && data.boxDraftSummary.trim()
        ? data.boxDraftSummary.trim()
        : undefined;
    const [householdContext, catalogContext] = await Promise.all([
        ((_c = request.auth) === null || _c === void 0 ? void 0 : _c.uid)
            ? buildHouseholdContext(request.auth.uid, clientDraft)
            : Promise.resolve(clientDraft ? `Current box (guest): ${clientDraft}` : ''),
        buildCatalogContext(),
    ]);
    const contextParts = [householdContext, catalogContext ? `Catalog (id slot name):\n${catalogContext}` : '']
        .filter(Boolean)
        .join('\n\n');
    const system = contextParts
        ? `${PILOT_RAV_SYSTEM}${PRESENCE_APPEND}\n\n---\nCONTEXT (use when relevant; do not recite verbatim):\n${contextParts}`
        : `${PILOT_RAV_SYSTEM}${PRESENCE_APPEND}`;
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
            system: `${system}

Return strict JSON:
{
  "text": "1-3 sentence response",
  "blocks": [
    { "type": "product|curation|swap", "title": "...", "body": "...", "itemId": "optional", "slotId": "optional", "swapOptions": [] }
  ],
  "actions": [
    { "type": "swap|add|remove", "itemId": "catalog-item-id", "slotId": "optional-slot-id", "childId": "optional" }
  ]
}

Use "actions" to mutate the box when the user asks (swap latke for sufganiyot, add a book, etc.). Use real catalog item ids from CONTEXT. Include blocks for optional UI cards. Never action checkout.`,
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
//# sourceMappingURL=rav.js.map