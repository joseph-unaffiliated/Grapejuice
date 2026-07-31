/** AI chat thread at users/{uid}/aiChats/{threadId} */

import type { RavBlock } from './pilot';

export type AIChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  blocks?: RavBlock[];
};

export type AIChatThread = {
  id: string;
  title: string;
  messages: AIChatMessage[];
  updatedAt: string;
  /** Soft-archive timestamp; omitted/null when active. */
  archivedAt?: string | null;
};

export type AIChatThreadSummary = {
  id: string;
  title: string;
  updatedAt: string;
  /** Snippet of the last message for list previews. */
  preview: string;
  archivedAt?: string | null;
};
