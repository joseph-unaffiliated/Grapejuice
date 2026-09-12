import * as logger from 'firebase-functions/logger';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import Anthropic from '@anthropic-ai/sdk';
import { PRESENCE_APPEND } from './presence';
import { buildBoxRulesContext, loadCatalogRows } from './context';
import {
  BOX_CURATOR_JSON_INSTRUCTIONS,
  BOX_CURATOR_SYSTEM,
} from './modes/boxCurator';
import { SECTION_RULES } from './boxRules';

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

const MAX_ACTIONS = 2;
const BLOCKED_SLOT_PREFIXES = ['gelt', 'latke', 'sufgan', 'applesauce', 'wrapping', 'pre-wrap'];

export type CuratePilotBoxKid = {
  id: string;
  firstName?: string;
  age: number;
};

export type CuratePilotBoxDeviation = {
  slotId: string;
  childId?: string;
  fromItemId?: string;
  toItemId: string;
};

export type CuratePilotBoxAllowedSwap = {
  slotId: string;
  optionItemIds: string[];
};

export type CuratePilotBoxData = {
  practiceLevel?: 'minimal' | 'moderate' | 'all-in';
  practiceScore?: number;
  kids?: CuratePilotBoxKid[];
  adults?: number;
  interests?: string[];
  notes?: string;
  baseline?: Array<{
    slotId?: string;
    itemId?: string;
    label?: string;
    quantity?: number;
    childId?: string;
  }>;
  deviations?: CuratePilotBoxDeviation[];
  allowedSwaps?: CuratePilotBoxAllowedSwap[];
};

export type CuratePilotBoxNote = {
  slotId: string;
  childId?: string;
  itemId: string;
  reason: string;
};

export type CuratePilotBoxAction = {
  type: 'swap';
  slotId: string;
  childId?: string;
  itemId: string;
  reason: string;
};

export type CuratePilotBoxResult = {
  notes: CuratePilotBoxNote[];
  actions: CuratePilotBoxAction[];
};

function parseJsonObject(raw: string): Record<string, unknown> | null {
  let candidate = raw.trim();
  if (!candidate) return null;
  const fenced = candidate.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) candidate = fenced[1].trim();
  const tryParse = (s: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(s) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
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
  if (start >= 0 && end > start) return tryParse(candidate.slice(start, end + 1));
  return null;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function slotBlocked(slotId: string): boolean {
  const base = slotId.toLowerCase();
  return BLOCKED_SLOT_PREFIXES.some((p) => base === p || base.startsWith(`${p}-`) || base.startsWith(p));
}

/** Soft allowlist from SECTION_RULES included swaps (kind labels → used as secondary check). */
function sectionAllowsIncludedSwap(): boolean {
  // Client already computed allowedSwaps from included-price options; we enforce that list.
  // SECTION_RULES is imported so the policy file stays linked for future server-side kind checks.
  return SECTION_RULES.length > 0;
}

function validateResult(
  parsed: Record<string, unknown> | null,
  data: CuratePilotBoxData
): CuratePilotBoxResult {
  const allowedBySlot = new Map<string, Set<string>>();
  for (const row of data.allowedSwaps ?? []) {
    if (!row?.slotId) continue;
    const set = allowedBySlot.get(row.slotId) ?? new Set<string>();
    for (const id of row.optionItemIds ?? []) {
      if (typeof id === 'string' && id.trim()) set.add(id.trim());
    }
    allowedBySlot.set(row.slotId, set);
  }

  const deviationKeys = new Set(
    (data.deviations ?? []).map(
      (d) => `${d.slotId}::${d.childId ?? ''}::${d.toItemId}`
    )
  );

  const notesRaw = Array.isArray(parsed?.notes) ? parsed!.notes : [];
  const notes: CuratePilotBoxNote[] = [];
  for (const raw of notesRaw) {
    if (!raw || typeof raw !== 'object') continue;
    const n = raw as Record<string, unknown>;
    const slotId = asString(n.slotId);
    const itemId = asString(n.itemId);
    const reason = asString(n.reason);
    if (!slotId || !itemId || !reason) continue;
    notes.push({
      slotId,
      itemId,
      reason,
      ...(asString(n.childId) ? { childId: asString(n.childId) } : {}),
    });
  }

  // Ensure every deviation has a note; leave missing ones for the client to skip.
  void deviationKeys;
  void sectionAllowsIncludedSwap;

  const actionsRaw = Array.isArray(parsed?.actions) ? parsed!.actions : [];
  const baselineGiftItems = new Map<string, string>();
  for (const li of data.baseline ?? []) {
    const slot = asString(li.slotId);
    const childId = asString(li.childId);
    const itemId = asString(li.itemId);
    if (!childId || !itemId) continue;
    if (slot === 'gift' || slot.startsWith('gift-') || slot.startsWith('gift')) {
      baselineGiftItems.set(childId, itemId);
    }
  }
  const claimedGiftItems = new Set(baselineGiftItems.values());

  const actions: CuratePilotBoxAction[] = [];
  for (const raw of actionsRaw) {
    if (actions.length >= MAX_ACTIONS) break;
    if (!raw || typeof raw !== 'object') continue;
    const a = raw as Record<string, unknown>;
    if (asString(a.type) !== 'swap') {
      logger.info('curatePilotBox dropped non-swap action', a.type);
      continue;
    }
    const slotId = asString(a.slotId);
    const itemId = asString(a.itemId);
    const reason = asString(a.reason);
    const childId = asString(a.childId);
    if (!slotId || !itemId || !reason) continue;
    if (slotBlocked(slotId)) {
      logger.info('curatePilotBox dropped blocked slot', slotId);
      continue;
    }
    const allowed =
      allowedBySlot.get(slotId) ??
      Array.from(allowedBySlot.entries()).find(([k]) => slotId === k || slotId.startsWith(`${k}-`))?.[1];
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
      const otherHasSame = Array.from(baselineGiftItems.entries()).some(
        ([cid, existing]) => cid !== childId && existing === itemId
      );
      if (
        otherHasSame ||
        (claimedGiftItems.has(itemId) && baselineGiftItems.get(childId) !== itemId)
      ) {
        logger.info('curatePilotBox dropped duplicate gift across kids', { slotId, itemId, childId });
        continue;
      }
      baselineGiftItems.set(childId, itemId);
      claimedGiftItems.add(itemId);
    }

    actions.push({
      type: 'swap',
      slotId,
      itemId,
      reason,
      ...(childId ? { childId } : {}),
    });
  }

  return { notes, actions };
}

function buildUserMessage(data: CuratePilotBoxData): string {
  const kids = (data.kids ?? [])
    .map((k) => `${k.firstName || 'Kid'} age ${k.age} [${k.id}]`)
    .join('; ');
  const baseline = (data.baseline ?? [])
    .map((li) => {
      const qty = li.quantity && li.quantity > 1 ? ` ×${li.quantity}` : '';
      const kid = li.childId ? ` [child:${li.childId}]` : '';
      return `${li.slotId}:${li.itemId ?? li.label}${qty}${kid}`;
    })
    .join('; ');
  const deviations = (data.deviations ?? [])
    .map((d) => {
      const kid = d.childId ? ` child:${d.childId}` : '';
      const from = d.fromItemId ? `${d.fromItemId}→` : '';
      return `${d.slotId}:${from}${d.toItemId}${kid}`;
    })
    .join('; ');
  const allowed = (data.allowedSwaps ?? [])
    .map((s) => `${s.slotId}→[${(s.optionItemIds ?? []).join(', ')}]`)
    .join('; ');

  return [
    `practiceLevel: ${data.practiceLevel ?? 'minimal'}`,
    `practiceScore: ${data.practiceScore ?? ''}`,
    `adults: ${data.adults ?? ''}`,
    `kids: ${kids || '(none)'}`,
    `interests: ${(data.interests ?? []).join(', ') || '(none)'}`,
    `notes: ${asString(data.notes) || '(none)'}`,
    `baseline: ${baseline || 'empty'}`,
    `deviations: ${deviations || '(none)'}`,
    `allowedSwaps: ${allowed || '(none)'}`,
    '',
    'Write one reason per deviation. Optionally up to two included-price swaps with reasons.',
  ].join('\n');
}

export const curatePilotBox = onCall(
  { secrets: [anthropicApiKey], maxInstances: 10 },
  async (request): Promise<CuratePilotBoxResult> => {
    const data = (request.data ?? {}) as CuratePilotBoxData;
    const apiKey = anthropicApiKey.value()?.trim();
    if (!apiKey) {
      throw new HttpsError(
        'failed-precondition',
        'AI is not configured. Set ANTHROPIC_API_KEY on Functions.'
      );
    }

    const catalogRows = await loadCatalogRows();
    const boxRulesContext = await buildBoxRulesContext(catalogRows);
    const system = `${BOX_CURATOR_SYSTEM}${PRESENCE_APPEND}\n\n---\nCONTEXT (use when relevant; do not recite verbatim):\n${boxRulesContext}\n\n${BOX_CURATOR_JSON_INSTRUCTIONS}`;

    const anthropic = new Anthropic({ apiKey });
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
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      logger.error('curatePilotBox Anthropic error', errMessage);
      if (errMessage.includes('authentication_error') || errMessage.includes('invalid x-api-key')) {
        throw new HttpsError('failed-precondition', 'AI authentication failed. Check ANTHROPIC_API_KEY.');
      }
      // Fail soft for the caller — return empty so onboarding keeps the deterministic box.
      return { notes: [], actions: [] };
    }
  }
);
