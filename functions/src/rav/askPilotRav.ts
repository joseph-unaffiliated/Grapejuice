import * as logger from 'firebase-functions/logger';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import Anthropic from '@anthropic-ai/sdk';
import { PRESENCE_APPEND } from './presence';
import { getRavModeConfig } from './modeRegistry';
import {
  buildCatalogContext,
  buildHouseholdContext,
  buildSurfaceContext,
  buildUserMemoryContext,
  buildBoxRulesContext,
  loadCatalogRows,
} from './context';
import { assertKidRavAllowed, stripKidRavActions } from './kidRavGuard';
import type { AskPilotRavData, RavBlock, RavPaneHint, RavResponse } from './types';
import { sanitizeRavPane } from './types';

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

function blockHasProducts(blocks: RavBlock[]): boolean {
  return blocks.some(
    (b) =>
      (b.type === 'curation' && Array.isArray(b.swapOptions) && b.swapOptions.length > 0) ||
      (b.type === 'product' && typeof b.itemId === 'string' && !!b.itemId.trim())
  );
}

/**
 * When the model lists products only via pane.optionItemIds / product_detail,
 * copy them into chat blocks so clients without a companion pane still render a rail.
 */
function ensureChatProductBlocks(blocks: RavBlock[], pane?: RavPaneHint): RavBlock[] {
  if (blockHasProducts(blocks)) return blocks;
  const next = [...blocks];
  if (pane?.optionItemIds?.length) {
    next.push({
      type: 'curation',
      title: pane.title?.trim() || 'Picks for you',
      swapOptions: pane.optionItemIds,
      ...(pane.slotId ? { slotId: pane.slotId } : {}),
    });
    return next;
  }
  if (pane?.kind === 'product_detail' && pane.itemId?.trim()) {
    next.push({
      type: 'product',
      title: pane.title?.trim() || 'Product',
      itemId: pane.itemId.trim(),
    });
  }
  return next;
}

/** Sonnet sometimes wraps the schema in ```json fences — strip and extract the object. */
function parseRavResponse(raw: string): RavResponse | null {
  let candidate = raw.trim();
  if (!candidate) return null;

  const fenced = candidate.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) candidate = fenced[1].trim();

  const tryParse = (s: string): RavResponse | null => {
    try {
      const parsed = JSON.parse(s) as RavResponse;
      if (parsed && typeof parsed === 'object' && typeof (parsed as RavResponse).text === 'string') {
        return parsed;
      }
    } catch {
      /* continue */
    }
    return null;
  };

  const direct = tryParse(candidate);
  if (direct) return direct;

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return tryParse(candidate.slice(start, end + 1));
  }
  return null;
}

export const askPilotRav = onCall(
  { secrets: [anthropicApiKey], maxInstances: 10 },
  async (request) => {
    const data = (request.data ?? {}) as AskPilotRavData;
    const message = typeof data.message === 'string' ? data.message.trim() : '';
    if (!message) throw new HttpsError('invalid-argument', 'message is required.');

    const apiKey = anthropicApiKey.value()?.trim();
    if (!apiKey) {
      throw new HttpsError(
        'failed-precondition',
        'AI is not configured. Set ANTHROPIC_API_KEY on Functions (firebase functions:secrets:set ANTHROPIC_API_KEY).'
      );
    }

    const modeName = data.mode === 'facilitator_kid' ? 'facilitator_kid' : data.mode;
    let kidChildName: string | undefined;

    if (modeName === 'facilitator_kid') {
      if (!request.auth?.uid) {
        throw new HttpsError('unauthenticated', 'Sign in required for kid Rav.');
      }
      const { childName } = await assertKidRavAllowed(request.auth.uid, data.childId);
      kidChildName = childName;
    }

    const modeConfig = getRavModeConfig(modeName);
    const clientDraft =
      modeName === 'facilitator_kid'
        ? undefined
        : typeof data.boxDraftSummary === 'string' && data.boxDraftSummary.trim()
          ? data.boxDraftSummary.trim()
          : undefined;

    const [householdContext, catalogRows] = await Promise.all([
      request.auth?.uid && modeName !== 'facilitator_kid'
        ? buildHouseholdContext(request.auth.uid, clientDraft)
        : Promise.resolve(
            modeName === 'facilitator_kid' && kidChildName
              ? `Child profile: ${kidChildName}. Hanukkah 2026 at-home guide only.`
              : clientDraft
                ? `Current box (guest): ${clientDraft}`
                : ''
          ),
      modeName === 'facilitator_kid' ? Promise.resolve([]) : loadCatalogRows(),
    ]);

    const surfaceContext =
      modeName === 'facilitator_kid' ? '' : buildSurfaceContext(data.surface);
    const userMemoryContext =
      modeName === 'facilitator_kid' ? '' : buildUserMemoryContext(data.userMemory);
    const [catalogContext, boxRulesContext] =
      modeName === 'facilitator_kid'
        ? (['', ''] as const)
        : await Promise.all([
            buildCatalogContext(data.surface, data.userMemory, catalogRows),
            buildBoxRulesContext(catalogRows),
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

    const systemBase = `${modeConfig.systemPrompt}${PRESENCE_APPEND}`;
    const system = contextParts
      ? `${systemBase}\n\n---\nCONTEXT (use when relevant; do not recite verbatim):\n${contextParts}`
      : systemBase;

    const anthropic = new Anthropic({ apiKey });
    const history = Array.isArray(data.conversationHistory) ? data.conversationHistory : [];
    const historyLimit = modeName === 'facilitator_kid' ? 6 : 20;
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
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
      const text = parsed?.text?.trim() || raw.trim() || 'Sorry, I could not generate a reply.';
      let blocks = modeName === 'facilitator_kid' ? [] : Array.isArray(parsed?.blocks) ? parsed!.blocks : [];
      const actions = modeName === 'facilitator_kid' ? [] : Array.isArray(parsed?.actions) ? parsed!.actions : [];
      const pane =
        modeName === 'facilitator_kid' ? undefined : sanitizeRavPane(parsed?.pane ?? null);
      // Model often puts product ids only on pane.optionItemIds and leaves blocks empty.
      // Chat UIs (storefront drawer) have no companion pane — mirror ids into a curation block.
      if (modeName !== 'facilitator_kid') {
        blocks = ensureChatProductBlocks(blocks, pane);
      }
      const payload = stripKidRavActions({ reply: text, text, blocks, actions, pane });
      return payload;
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      logger.error('askPilotRav Anthropic error', errMessage);
      if (errMessage.includes('authentication_error') || errMessage.includes('invalid x-api-key')) {
        throw new HttpsError('failed-precondition', 'AI authentication failed. Check ANTHROPIC_API_KEY.');
      }
      throw new HttpsError('internal', 'Rav is temporarily unavailable. Try again in a moment.');
    }
  }
);
