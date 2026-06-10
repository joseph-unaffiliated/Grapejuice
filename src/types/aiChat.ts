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
};

export type AIChatThreadSummary = {
  id: string;
  title: string;
  updatedAt: string;
};
