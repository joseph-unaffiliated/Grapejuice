import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { AIChatMessage, AIChatThread } from '../../types/aiChat';

function toIso(value: unknown): string {
  if (typeof value === 'string') return value;
  const ts = value as { toDate?: () => Date };
  return ts?.toDate?.()?.toISOString?.() ?? new Date().toISOString();
}

function dataToThread(id: string, data: Record<string, unknown>): AIChatThread {
  const messages = Array.isArray(data.messages)
    ? (data.messages as Array<{ role?: string; content?: string }>).map((m) => ({
        role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: String(m.content ?? ''),
      }))
    : [];
  return {
    id,
    title: String(data.title ?? 'Kid chat'),
    messages,
    updatedAt: toIso(data.updatedAt),
  };
}

function threadCol(uid: string, childId: string) {
  return collection(db!, 'users', uid, 'children', childId, 'ravThreads');
}

/** Kid Rav threads — parent-readable in pilot; stored per child profile. */
export const kidRavChatService = {
  async getThread(uid: string, childId: string, threadId: string): Promise<AIChatThread | null> {
    if (!db) return null;
    const snap = await getDoc(doc(threadCol(uid, childId), threadId));
    if (!snap.exists()) return null;
    return dataToThread(snap.id, snap.data() as Record<string, unknown>);
  },

  async getOrCreateDefaultThread(
    uid: string,
    childId: string
  ): Promise<{ threadId: string; thread: AIChatThread }> {
    const DEFAULT_ID = 'default';
    const existing = await this.getThread(uid, childId, DEFAULT_ID);
    if (existing) return { threadId: DEFAULT_ID, thread: existing };
    if (!db) throw new Error('Firestore not configured');
    const now = new Date().toISOString();
    await setDoc(doc(threadCol(uid, childId), DEFAULT_ID), {
      title: 'Kid chat',
      messages: [],
      updatedAt: now,
    });
    return {
      threadId: DEFAULT_ID,
      thread: { id: DEFAULT_ID, title: 'Kid chat', messages: [], updatedAt: now },
    };
  },

  async appendMessages(
    uid: string,
    childId: string,
    threadId: string,
    newMessages: AIChatMessage[]
  ): Promise<void> {
    if (!db) throw new Error('Firestore not configured');
    const ref = doc(threadCol(uid, childId), threadId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data() as Record<string, unknown>;
    const existing = Array.isArray(data.messages) ? (data.messages as AIChatMessage[]) : [];
    await updateDoc(ref, {
      messages: [...existing, ...newMessages],
      updatedAt: serverTimestamp(),
    });
  },

  async updateTitle(uid: string, childId: string, threadId: string, title: string): Promise<void> {
    if (!db) throw new Error('Firestore not configured');
    await updateDoc(doc(threadCol(uid, childId), threadId), {
      title: title.trim() || 'Kid chat',
      updatedAt: serverTimestamp(),
    });
  },

  async createThread(uid: string, childId: string, title = 'Kid chat'): Promise<string> {
    if (!db) throw new Error('Firestore not configured');
    const docRef = await addDoc(threadCol(uid, childId), {
      title,
      messages: [],
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  },
};
