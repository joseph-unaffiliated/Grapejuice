import { Platform } from 'react-native';
import type { NavigationState, PartialState } from '@react-navigation/native';

/** Pilot Participants invite page: `/pilot/<token>`. Private (noindex), never linked from the site. */
export const PILOT_PATH_PREFIX = '/pilot';
const STORAGE_KEY = 'gj.pendingPilotToken';

export function pilotPathForToken(token: string): string {
  return `${PILOT_PATH_PREFIX}/${encodeURIComponent(token)}`;
}

export function readPilotTokenFromPath(pathname: string): string | null {
  const path = pathname.replace(/\/$/, '');
  if (!path.startsWith(`${PILOT_PATH_PREFIX}/`)) return null;
  const raw = path.slice(PILOT_PATH_PREFIX.length + 1).split('/')[0] ?? '';
  try {
    return decodeURIComponent(raw).trim() || null;
  } catch {
    return raw.trim() || null;
  }
}

export function pilotTokenFromState(
  state: NavigationState | PartialState<NavigationState> | undefined
): string | null {
  let current: NavigationState | PartialState<NavigationState> | undefined = state;
  while (current?.routes?.length) {
    const route = current.routes[current.index ?? 0];
    if (!route) break;
    if (route.name === 'PilotInvite') {
      const token = (route.params as { token?: string } | undefined)?.token;
      return token || readPersistedPilotToken();
    }
    current = route.state;
  }
  return null;
}

function pilotStorage(): Storage | null {
  if (Platform.OS !== 'web') return null;
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Kept on the device so sign-in (often a new tab from the login email) and building a box can
 * bring them back. Cleared once they've joined or the invite is gone.
 */
export function persistPilotToken(token: string): void {
  pilotStorage()?.setItem(STORAGE_KEY, token);
}

export function readPersistedPilotToken(): string | null {
  return pilotStorage()?.getItem(STORAGE_KEY)?.trim() || null;
}

export function clearPersistedPilotToken(): void {
  pilotStorage()?.removeItem(STORAGE_KEY);
}
