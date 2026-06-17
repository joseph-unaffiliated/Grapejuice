import { Platform } from 'react-native';

const STORAGE_KEY = 'gj.pendingGiftClaimToken';

export function readGiftClaimTokenFromWindow(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const path = window.location.pathname.replace(/\/$/, '');
  if (!path.endsWith('/gift/claim')) return null;
  const token = new URLSearchParams(window.location.search).get('token')?.trim();
  return token || null;
}

export function persistGiftClaimToken(token: string): void {
  if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(STORAGE_KEY, token);
  }
}

export function consumePersistedGiftClaimToken(): string | null {
  if (Platform.OS !== 'web' || typeof sessionStorage === 'undefined') return null;
  const token = sessionStorage.getItem(STORAGE_KEY)?.trim();
  if (token) sessionStorage.removeItem(STORAGE_KEY);
  return token || null;
}

export function scrubGiftClaimUrl(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.history.replaceState({}, '', '/');
}
