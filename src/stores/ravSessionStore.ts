import { Platform } from 'react-native';
import type { AIChatMessage } from '../types/aiChat';

const STORAGE_KEY = 'gj.ravSession';

/** Closing and reopening Rav within this window resumes the last chat. */
export const RAV_SESSION_IDLE_MS = 30 * 60 * 1000;

export type RavSessionSnapshot = {
  /** `guest` or `{uid}:{childId|parent}` — a different owner starts fresh. */
  ownerKey: string;
  threadId: string | null;
  messages: AIChatMessage[];
  /** Thread activity time shown under the last message. */
  lastActivityAt: number;
  /** Last time the panel was used; drives the idle window. */
  touchedAt: number;
};

let memory: RavSessionSnapshot | null = null;

function hasSessionStorage(): boolean {
  return Platform.OS === 'web' && typeof sessionStorage !== 'undefined';
}

function read(): RavSessionSnapshot | null {
  if (memory) return memory;
  if (!hasSessionStorage()) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    memory = raw ? (JSON.parse(raw) as RavSessionSnapshot) : null;
  } catch {
    memory = null;
  }
  return memory;
}

function write(next: RavSessionSnapshot | null): void {
  memory = next;
  if (!hasSessionStorage()) return;
  try {
    if (next) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Last Rav chat for this browser tab. Returns null for a new session: new tab,
 * idle past RAV_SESSION_IDLE_MS, or a different signed-in owner.
 */
export function getResumableRavSession(ownerKey: string): RavSessionSnapshot | null {
  const snap = read();
  if (!snap || snap.ownerKey !== ownerKey || snap.messages.length === 0) return null;
  if (Date.now() - snap.touchedAt > RAV_SESSION_IDLE_MS) return null;
  return snap;
}

export function saveRavSession(
  snap: Omit<RavSessionSnapshot, 'touchedAt'>
): void {
  if (snap.messages.length === 0) {
    write(null);
    return;
  }
  write({ ...snap, touchedAt: Date.now() });
}

export function touchRavSession(): void {
  const snap = read();
  if (snap) write({ ...snap, touchedAt: Date.now() });
}

export function clearRavSession(): void {
  write(null);
}
