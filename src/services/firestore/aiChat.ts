import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { AIChatMessage, AIChatThread, AIChatThreadSummary } from '../../types/aiChat';

function toIso(value: unknown): string {
  if (typeof value === 'string') return value;
  const ts = value as { toDate?: () => Date };
  return ts?.toDate?.()?.toISOString?.() ?? new Date().toISOString();
}

function dataToThread(id: string, data: Record<string, unknown>): AIChatThread {
  const messages = Array.isArray(data.messages)
    ? (data.messages as Array<{ role?: string; content?: string; blocks?: unknown }>).map((m) => ({
        role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: String(m.content ?? ''),
        blocks: Array.isArray(m.blocks) ? (m.blocks as AIChatMessage['blocks']) : undefined,
      }))
    : [];
  const archivedAt =
    data.archivedAt == null || data.archivedAt === ''
      ? null
      : toIso(data.archivedAt);
  return {
    id,
    title: String(data.title ?? 'Chat'),
    messages,
    updatedAt: toIso(data.updatedAt),
    archivedAt,
  };
}

function previewFromMessages(messages: unknown): string {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  const last = messages[messages.length - 1] as { content?: unknown };
  const text = String(last?.content ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!text) return '';
  return text.length <= 100 ? text : `${text.slice(0, 97)}…`;
}

export const aiChatService = {
  async getThread(uid: string, threadId: string): Promise<AIChatThread | null> {
    if (!db) return null;
    const snap = await getDoc(doc(db, 'users', uid, 'aiChats', threadId));
    if (!snap.exists()) return null;
    return dataToThread(snap.id, snap.data() as Record<string, unknown>);
  },

  async createThread(uid: string, title = 'Chat'): Promise<string> {
    if (!db) throw new Error('Firestore not configured');
    const docRef = await addDoc(collection(db, 'users', uid, 'aiChats'), {
      title,
      messages: [],
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  },

  async appendMessages(uid: string, threadId: string, newMessages: AIChatMessage[]): Promise<void> {
    if (!db) throw new Error('Firestore not configured');
    const ref = doc(db, 'users', uid, 'aiChats', threadId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data() as Record<string, unknown>;
    const existing = Array.isArray(data.messages) ? (data.messages as AIChatMessage[]) : [];
    await updateDoc(ref, {
      messages: [...existing, ...newMessages],
      updatedAt: serverTimestamp(),
    });
  },

  async updateTitle(uid: string, threadId: string, title: string): Promise<void> {
    if (!db) throw new Error('Firestore not configured');
    await updateDoc(doc(db, 'users', uid, 'aiChats', threadId), {
      title: title.trim() || 'Chat',
      updatedAt: serverTimestamp(),
    });
  },

  async listThreads(uid: string, opts?: { includeArchived?: boolean }): Promise<AIChatThreadSummary[]> {
    if (!db) return [];
    // Fetch extra so empty "New chat" stubs don't crowd real threads out of the window.
    const q = query(collection(db, 'users', uid, 'aiChats'), orderBy('updatedAt', 'desc'), limit(50));
    const snap = await getDocs(q);
    const includeArchived = opts?.includeArchived === true;
    return snap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>;
        const archivedAt =
          data.archivedAt == null || data.archivedAt === ''
            ? null
            : toIso(data.archivedAt);
        return {
          id: d.id,
          title: String(data.title ?? 'Chat'),
          updatedAt: toIso(data.updatedAt),
          preview: previewFromMessages(data.messages),
          archivedAt,
        };
      })
      .filter((t) => t.preview.length > 0)
      .filter((t) => includeArchived || !t.archivedAt)
      .slice(0, 20);
  },

  async archiveThread(uid: string, threadId: string): Promise<void> {
    if (!db) throw new Error('Firestore not configured');
    await updateDoc(doc(db, 'users', uid, 'aiChats', threadId), {
      archivedAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });
  },

  async getOrCreateDefaultThread(uid: string): Promise<{ threadId: string; thread: AIChatThread }> {
    const DEFAULT_ID = 'default';
    const existing = await this.getThread(uid, DEFAULT_ID);
    if (existing) return { threadId: DEFAULT_ID, thread: existing };
    if (!db) throw new Error('Firestore not configured');
    const now = new Date().toISOString();
    await setDoc(doc(db, 'users', uid, 'aiChats', DEFAULT_ID), {
      title: 'Chat',
      messages: [],
      updatedAt: now,
    });
    return { threadId: DEFAULT_ID, thread: { id: DEFAULT_ID, title: 'Chat', messages: [], updatedAt: now } };
  },
};
