import { Platform } from 'react-native';

const KEY = 'gj.welcomeAccountEmail';

/** One-shot flag after an invite/login path creates an Auth user. */
export function queueWelcomeAccountToast(email: string) {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return;
  if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem(KEY, trimmed);
      return;
    } catch {
      /* fall through */
    }
  }
  pendingMemory = trimmed;
}

let pendingMemory: string | null = null;

/** Consume once; returns the email to show in the welcome copy. */
export function consumeWelcomeAccountToast(): string | null {
  if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
    try {
      const email = sessionStorage.getItem(KEY);
      if (email) {
        sessionStorage.removeItem(KEY);
        return email;
      }
    } catch {
      /* fall through */
    }
  }
  const email = pendingMemory;
  pendingMemory = null;
  return email;
}

export function welcomeAccountMessage(email: string): string {
  return `Welcome! An account has been created with email ${email}. To sign back in, request a link sent to your email.`;
}
