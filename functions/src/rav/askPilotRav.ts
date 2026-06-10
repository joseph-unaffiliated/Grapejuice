import * as logger from 'firebase-functions/logger';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import Anthropic from '@anthropic-ai/sdk';
import { PRESENCE_APPEND } from './presence';
import { getRavModeConfig } from './modeRegistry';
import { buildCatalogContext, buildHouseholdContext } from './context';
import type { AskPilotRavData, RavResponse } from './types';

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

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

    const modeConfig = getRavModeConfig(data.mode);
    const clientDraft =
      typeof data.boxDraftSummary === 'string' && data.boxDraftSummary.trim()
        ? data.boxDraftSummary.trim()
        : undefined;

    const [householdContext, catalogContext] = await Promise.all([
      request.auth?.uid
        ? buildHouseholdContext(request.auth.uid, clientDraft)
        : Promise.resolve(clientDraft ? `Current box (guest): ${clientDraft}` : ''),
      buildCatalogContext(),
    ]);

    const contextParts = [householdContext, catalogContext ? `Catalog (id slot name):\n${catalogContext}` : '']
      .filter(Boolean)
      .join('\n\n');

    const systemBase = `${modeConfig.systemPrompt}${PRESENCE_APPEND}`;
    const system = contextParts
      ? `${systemBase}\n\n---\nCONTEXT (use when relevant; do not recite verbatim):\n${contextParts}`
      : systemBase;

    const anthropic = new Anthropic({ apiKey });
    const history = Array.isArray(data.conversationHistory) ? data.conversationHistory : [];
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
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
      let parsed: RavResponse | null = null;
      try {
        parsed = JSON.parse(raw) as RavResponse;
      } catch {
        parsed = null;
      }
      const text = parsed?.text?.trim() || raw.trim() || 'Sorry, I could not generate a reply.';
      const blocks = Array.isArray(parsed?.blocks) ? parsed!.blocks : [];
      const actions = Array.isArray(parsed?.actions) ? parsed!.actions : [];
      return { reply: text, text, blocks, actions };
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
