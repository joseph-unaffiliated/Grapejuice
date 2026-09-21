import { create } from 'zustand';
import type { AuthStackParamList, MainStackParamList } from '../navigation/types';
import type { GiftChildDraft, GiftGiveFormValues } from '../screens/gift/giftGiveTypes';
import {
  clearPersistedGiftClaimToken,
  persistGiftClaimToken,
} from '../navigation/giftClaimLink';

export type AuthReturnRoute =
  /** Sign in/up from nav — stay on the current screen, just authenticated. */
  | 'Stay'
  | 'Checkout'
  | 'MarketplaceCheckout'
  | 'Rav'
  | 'Account'
  | 'Orders'
  | 'MyGifts'
  | 'Profiles'
  | 'MyBox'
  | 'GiftClaim'
  | 'GiftGive'
  | 'GiftGiverCustomize'
  | 'History';

/**
 * Auth handoffs that must NOT dump the user into Build-a-Box / onboarding.
 * Only `MyBox` is omitted — that path may continue into box builder when there
 * is no guest box yet (e.g. explicit “build my box” → save account).
 */
const AUTH_RETURNS_SKIP_BOX_ONBOARDING: ReadonlySet<AuthReturnRoute> = new Set([
  'Stay',
  'Checkout',
  'MarketplaceCheckout',
  'Rav',
  'Account',
  'Orders',
  'MyGifts',
  'Profiles',
  'History',
  'GiftClaim',
  'GiftGive',
  'GiftGiverCustomize',
]);

/** True when post-auth should resume Main (or gift/checkout) instead of Onboarding. */
export function authReturnSkipsBoxOnboarding(
  pendingReturn: AuthReturnRoute | null | undefined
): boolean {
  return pendingReturn != null && AUTH_RETURNS_SKIP_BOX_ONBOARDING.has(pendingReturn);
}

export type PendingGiftCustomize = MainStackParamList['GiftGiverCustomize'];

/** Credit-only gift form restored after auth. */
export type PendingGiftGive = {
  form: GiftGiveFormValues;
  childDrafts: GiftChildDraft[];
};

type AuthEntry = 'signup' | 'signin';

type AuthFlowState = {
  pendingReturn: AuthReturnRoute | null;
  pendingGiftClaimToken: string | null;
  /** Gift box draft restored after auth (form, kids, swaps). */
  pendingGiftCustomize: PendingGiftCustomize | null;
  /** Credit-only gift form restored after auth. */
  pendingGiftGive: PendingGiftGive | null;
  authEntry: AuthEntry;
  authScreen: keyof AuthStackParamList | null;
  /** Prefill SignInEmail after visitor playthrough Exit. */
  restoreSignInEmail: string | null;
  /** Firebase email-link oobCode for branded password reset. */
  passwordResetOobCode: string | null;
  startAuthForCheckout: (entry?: AuthEntry) => void;
  startAuthForMarketplaceCheckout: (entry?: AuthEntry) => void;
  startAuthForRav: (entry?: AuthEntry) => void;
  /** Nav sign in/up — no destination; the user keeps the page they were on. */
  startAuthInPlace: (entry?: AuthEntry, screen?: keyof AuthStackParamList) => void;
  startAuthFromGuest: (
    returnTo: AuthReturnRoute,
    entry?: AuthEntry,
    screen?: keyof AuthStackParamList
  ) => void;
  /** Sign in/up from gift customize — keeps draft and resumes that screen. */
  startAuthForGiftCustomize: (entry: AuthEntry, draft: PendingGiftCustomize) => void;
  /** Sign in/up from credit-only gift give — keeps form and resumes GiftGive. */
  startAuthForGiftGive: (entry: AuthEntry, draft: PendingGiftGive) => void;
  prepareAdminSignIn: (email: string) => void;
  clearRestoreSignInEmail: () => void;
  beginPasswordReset: (oobCode: string) => void;
  clearPasswordReset: () => void;
  setPendingGiftClaimToken: (token: string | null) => void;
  clearPending: () => void;
};

export const useAuthFlowStore = create<AuthFlowState>((set) => ({
  pendingReturn: null,
  pendingGiftClaimToken: null,
  pendingGiftCustomize: null,
  pendingGiftGive: null,
  authEntry: 'signup',
  authScreen: null,
  restoreSignInEmail: null,
  passwordResetOobCode: null,
  startAuthForCheckout: (entry = 'signup') =>
    set({
      pendingReturn: 'Checkout',
      pendingGiftCustomize: null,
      pendingGiftGive: null,
      authEntry: entry,
      authScreen: entry === 'signin' ? 'SignIn' : 'SignUp',
    }),
  startAuthForMarketplaceCheckout: (entry = 'signup') =>
    set({
      pendingReturn: 'MarketplaceCheckout',
      pendingGiftCustomize: null,
      pendingGiftGive: null,
      authEntry: entry,
      authScreen: entry === 'signin' ? 'SignIn' : 'SignUp',
    }),
  startAuthForRav: (entry = 'signin') =>
    set({
      pendingReturn: 'Rav',
      pendingGiftCustomize: null,
      pendingGiftGive: null,
      authEntry: entry,
      authScreen: entry === 'signin' ? 'SignIn' : 'SignUp',
    }),
  startAuthInPlace: (entry = 'signin', screen) =>
    set({
      pendingReturn: 'Stay',
      pendingGiftCustomize: null,
      pendingGiftGive: null,
      authEntry: entry,
      authScreen: screen ?? (entry === 'signin' ? 'SignIn' : 'SignUp'),
    }),
  startAuthFromGuest: (returnTo, entry = 'signin', screen) =>
    set({
      pendingReturn: returnTo,
      pendingGiftCustomize: null,
      pendingGiftGive: null,
      authEntry: entry,
      authScreen: screen ?? (entry === 'signin' ? 'SignIn' : 'SignUp'),
    }),
  startAuthForGiftCustomize: (entry, draft) =>
    set({
      pendingReturn: 'GiftGiverCustomize',
      pendingGiftCustomize: draft,
      pendingGiftGive: null,
      authEntry: entry,
      authScreen: entry === 'signin' ? 'SignIn' : 'SignUp',
    }),
  startAuthForGiftGive: (entry, draft) =>
    set({
      pendingReturn: 'GiftGive',
      pendingGiftGive: draft,
      pendingGiftCustomize: null,
      authEntry: entry,
      authScreen: entry === 'signin' ? 'SignIn' : 'SignUp',
    }),
  prepareAdminSignIn: (email) => {
    clearPersistedGiftClaimToken();
    set({
      pendingReturn: null,
      pendingGiftClaimToken: null,
      pendingGiftCustomize: null,
      pendingGiftGive: null,
      authEntry: 'signin',
      authScreen: 'SignInEmail',
      restoreSignInEmail: email.trim(),
    });
  },
  clearRestoreSignInEmail: () => set({ restoreSignInEmail: null }),
  beginPasswordReset: (oobCode) => {
    clearPersistedGiftClaimToken();
    set({
      passwordResetOobCode: oobCode,
      pendingReturn: null,
      pendingGiftClaimToken: null,
      pendingGiftCustomize: null,
      pendingGiftGive: null,
      authEntry: 'signin',
      authScreen: 'ResetPasswordConfirm',
      restoreSignInEmail: null,
    });
  },
  clearPasswordReset: () => set({ passwordResetOobCode: null, authScreen: null }),
  setPendingGiftClaimToken: (token) => {
    const trimmed = token?.trim() || null;
    if (trimmed) persistGiftClaimToken(trimmed);
    else clearPersistedGiftClaimToken();
    set({ pendingGiftClaimToken: trimmed });
  },
  // Keep pendingGiftClaimToken — clearing it here races signup→GiftClaim remounts
  // and flashes "invalid link" before claim/navigation can finish.
  clearPending: () =>
    set({
      pendingReturn: null,
      authScreen: null,
      pendingGiftCustomize: null,
      pendingGiftGive: null,
      restoreSignInEmail: null,
      passwordResetOobCode: null,
    }),
}));
