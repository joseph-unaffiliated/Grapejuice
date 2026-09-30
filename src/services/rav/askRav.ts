import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import type { RavBlock, RavDraftAction, RavMode } from '../../types/pilot';
import { sanitizeClientPane, type RavPaneHint } from './resolveRavPane';
import type { RavCopilotClientContext } from './ravCopilotTypes';

export type AskRavParams = {
  message: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Current box draft summary from client (guest or authed). */
  boxDraftSummary?: string;
  /** Practice intensity for guests (authed users load from user doc). */
  familiarityLevel?: 'minimal' | 'moderate' | 'all-in';
  /** Rav mode — defaults to facilitator (Grapejuice holiday guide). */
  mode?: RavMode;
  /** Required for facilitator_kid mode. */
  childId?: string;
  /** Live screen + non-PII user memory for co-pilot. */
  surface?: RavCopilotClientContext['surface'];
  userMemory?: RavCopilotClientContext['userMemory'];
};

export type AskRavResult = {
  reply: string;
  text?: string;
  blocks?: RavBlock[];
  actions?: RavDraftAction[];
  pane?: RavPaneHint;
  /** Server-sanitized in-app destination when the user asked Rav to go somewhere. */
  navigate?: RavNavigate;
};

export type RavNavigate = { path: string; label: string };

function sanitizeClientNavigate(raw: unknown): RavNavigate | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const n = raw as Record<string, unknown>;
  if (typeof n.path !== 'string' || !n.path.startsWith('/') || n.path.startsWith('//')) {
    return undefined;
  }
  const label = typeof n.label === 'string' && n.label.trim() ? n.label.trim() : 'that page';
  return { path: n.path, label };
}

function callableMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const msg = String((error as { message: unknown }).message);
    if (msg && msg !== 'INTERNAL') return msg;
  }
  if (typeof error === 'object' && error !== null && 'details' in error) {
    return String((error as { details: unknown }).details);
  }
  return 'Rav is temporarily unavailable. Try again in a moment.';
}

export async function askRav(params: AskRavParams): Promise<AskRavResult> {
  if (!functions) {
    return {
      reply: 'Rav is in pilot mode right now. You can still customize your box in My Box.',
      blocks: [],
    };
  }
  const fn = httpsCallable<AskRavParams, AskRavResult>(functions, 'askPilotRav');
  try {
    const { data } = await fn(params);
    if (!data?.reply && !data?.text) throw new Error('Invalid AI response');
    return {
      ...data,
      reply: data.reply ?? data.text ?? '',
      text: data.text ?? data.reply ?? '',
      blocks: Array.isArray(data.blocks) ? data.blocks : [],
      actions: Array.isArray(data.actions) ? data.actions : [],
      pane: sanitizeClientPane(data.pane),
      navigate: sanitizeClientNavigate(data.navigate),
    };
  } catch (err) {
    throw new Error(callableMessage(err));
  }
}
