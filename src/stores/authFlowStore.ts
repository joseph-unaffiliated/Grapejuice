import { create } from 'zustand';
import type { AuthStackParamList, MainStackParamList } from '../navigation/types';
import type { GiftChildDraft, GiftGiveFormValues } from '../screens/gift/giftGiveTypes';

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
  prepareAdminSignIn: (email) =>
    set({
      pendingReturn: null,
      pendingGiftClaimToken: null,
      pendingGiftCustomize: null,
      pendingGiftGive: null,
      authEntry: 'signin',
      authScreen: 'SignInEmail',
      restoreSignInEmail: email.trim(),
    }),
  clearRestoreSignInEmail: () => set({ restoreSignInEmail: null }),
  setPendingGiftClaimToken: (token) => set({ pendingGiftClaimToken: token }),
  clearPending: () =>
    set({
      pendingReturn: null,
      authScreen: null,
      pendingGiftClaimToken: null,
      pendingGiftCustomize: null,
      pendingGiftGive: null,
      restoreSignInEmail: null,
    }),
}));
