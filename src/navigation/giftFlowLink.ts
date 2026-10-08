import { Platform } from 'react-native';
import type { NavigationState, PartialState } from '@react-navigation/native';
import { getBootLocation } from './bootLocation';
import type { MainStackParamList } from './types';
import type { GiftIntentDraft } from '../stores/giftIntentStore';
import { DEFAULT_GIFT_CHILDREN, parseGiftStep, type GiftStep } from '../screens/gift/giftGiveTypes';

export const GIFT_GIVE_PATH = '/gift/give';
export const GIFT_CUSTOMIZE_PATH = '/gift/customize';

export function isGiftGivePath(pathname: string): boolean {
  const path = pathname.replace(/\/$/, '') || '/';
  return path === GIFT_GIVE_PATH;
}

export function isGiftCustomizePath(pathname: string): boolean {
  const path = pathname.replace(/\/$/, '') || '/';
  return path === GIFT_CUSTOMIZE_PATH;
}

export function readGiftGivePathFromWindow(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const path = (getBootLocation()?.pathname ?? window.location.pathname).replace(/\/$/, '') || '/';
  return isGiftGivePath(path);
}

export function readGiftCustomizePathFromWindow(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const path = (getBootLocation()?.pathname ?? window.location.pathname).replace(/\/$/, '') || '/';
  return isGiftCustomizePath(path);
}

export function giftStepFromSearch(search: string): GiftStep | undefined {
  return parseGiftStep(new URLSearchParams(search).get('step'));
}

/** `?step=` on the URL the app booted with. */
export function readGiftStepFromWindow(): GiftStep | undefined {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
  return giftStepFromSearch(getBootLocation()?.search ?? window.location.search);
}

/** Resume an incomplete gift on /gift/give; the URL step wins over the saved one. */
export function giftGiveParamsFromDraft(
  draft: GiftIntentDraft | null,
  urlStep?: GiftStep
): MainStackParamList['GiftGive'] {
  if (!draft?.form) return undefined;
  return {
    form: draft.form,
    childDrafts: draft.childDrafts ?? DEFAULT_GIFT_CHILDREN,
    lineItems: draft.lineItems,
    initialGiftPath: draft.form.giftPath ?? undefined,
    step: urlStep ?? draft.step,
  };
}

function focusedRoute(
  state: NavigationState | PartialState<NavigationState> | undefined,
  name: string
): { params?: object } | null {
  let current: NavigationState | PartialState<NavigationState> | undefined = state;
  while (current?.routes?.length) {
    const index = current.index ?? 0;
    const route = current.routes[index];
    if (!route) break;
    if (route.name === name) return route as { params?: object };
    current = route.state;
  }
  return null;
}

export function giftGiveFromState(
  state: NavigationState | PartialState<NavigationState> | undefined
): boolean {
  return focusedRoute(state, 'GiftGive') != null;
}

/** Active GiftGive step (null when GiftGive isn't focused). */
export function giftGiveStepFromState(
  state: NavigationState | PartialState<NavigationState> | undefined
): GiftStep | null {
  const route = focusedRoute(state, 'GiftGive');
  if (!route) return null;
  return parseGiftStep((route.params as { step?: unknown } | undefined)?.step) ?? 'type';
}

export function giftCustomizeFromState(
  state: NavigationState | PartialState<NavigationState> | undefined
): boolean {
  return focusedRoute(state, 'GiftGiverCustomize') != null;
}
