import { Platform } from 'react-native';
import type { NavigationState, PartialState } from '@react-navigation/native';

export const MY_GIFTS_PATH = '/my-gifts';

export function giftBoxPath(giftInviteId: string): string {
  return `${MY_GIFTS_PATH}/box/${encodeURIComponent(giftInviteId)}`;
}

export function giftRevealPath(giftInviteId: string): string {
  return `${MY_GIFTS_PATH}/reveal/${encodeURIComponent(giftInviteId)}`;
}

export function readMyGiftsPathFromWindow(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  return path === MY_GIFTS_PATH;
}

function decodePathSegment(raw: string): string {
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

/** `/my-gifts/box/:giftInviteId` */
export function readGiftBoxIdFromPath(path: string): string | null {
  const normalized = path.replace(/\/$/, '') || '/';
  const match = normalized.match(/^\/my-gifts\/box\/([^/]+)$/);
  if (!match?.[1]) return null;
  const id = decodePathSegment(match[1]);
  return id || null;
}

/** `/my-gifts/reveal/:giftInviteId` */
export function readGiftRevealIdFromPath(path: string): string | null {
  const normalized = path.replace(/\/$/, '') || '/';
  const match = normalized.match(/^\/my-gifts\/reveal\/([^/]+)$/);
  if (!match?.[1]) return null;
  const id = decodePathSegment(match[1]);
  return id || null;
}

export function readGiftBoxIdFromWindow(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return readGiftBoxIdFromPath(window.location.pathname);
}

export function readGiftRevealIdFromWindow(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return readGiftRevealIdFromPath(window.location.pathname);
}

export function myGiftsFromState(
  state: NavigationState | PartialState<NavigationState> | undefined
): boolean {
  let current: NavigationState | PartialState<NavigationState> | undefined = state;
  while (current?.routes?.length) {
    const index = current.index ?? 0;
    const route = current.routes[index];
    if (!route) break;
    if (route.name === 'MyGifts') return true;
    current = route.state;
  }
  return false;
}

export function giftBoxFromState(
  state: NavigationState | PartialState<NavigationState> | undefined
): { giftInviteId: string } | null {
  let current: NavigationState | PartialState<NavigationState> | undefined = state;
  while (current?.routes?.length) {
    const index = current.index ?? 0;
    const route = current.routes[index];
    if (!route) break;
    if (route.name === 'GiftBox') {
      const params = route.params as { giftInviteId?: string } | undefined;
      const id = params?.giftInviteId?.trim();
      return id ? { giftInviteId: id } : null;
    }
    current = route.state;
  }
  return null;
}

export function giftRevealFromState(
  state: NavigationState | PartialState<NavigationState> | undefined
): { giftInviteId: string } | null {
  let current: NavigationState | PartialState<NavigationState> | undefined = state;
  while (current?.routes?.length) {
    const index = current.index ?? 0;
    const route = current.routes[index];
    if (!route) break;
    if (route.name === 'GiftRecipientReveal') {
      const params = route.params as { giftInviteId?: string } | undefined;
      const id = params?.giftInviteId?.trim();
      return id ? { giftInviteId: id } : null;
    }
    current = route.state;
  }
  return null;
}
