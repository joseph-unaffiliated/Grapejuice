import { create } from 'zustand';
import type { AuthStackParamList, MainStackParamList } from '../navigation/types';

export type AuthReturnRoute =
  | 'Checkout'
  | 'Rav'
  | 'Account'
  | 'Profiles'
  | 'MyBox'
  | 'GiftClaim'
  | 'GiftGiverCustomize'
  | 'History';

export type PendingGiftCustomize = MainStackParamList['GiftGiverCustomize'];

type AuthEntry = 'signup' | 'signin';

type AuthFlowState = {
  pendingReturn: AuthReturnRoute | null;
  pendingGiftClaimToken: string | null;
  /** Gift box draft restored after auth (form, kids, swaps). */
  pendingGiftCustomize: PendingGiftCustomize | null;
  authEntry: AuthEntry;
  authScreen: keyof AuthStackParamList | null;
  /** Prefill SignInEmail after visitor playthrough Exit. */
  restoreSignInEmail: string | null;
  startAuthForCheckout: (entry?: AuthEntry) => void;
  startAuthForRav: (entry?: AuthEntry) => void;
  startAuthFromGuest: (
    returnTo: AuthReturnRoute,
    entry?: AuthEntry,
    screen?: keyof AuthStackParamList
  ) => void;
  /** Sign in/up from gift customize — keeps draft and resumes that screen. */
  startAuthForGiftCustomize: (entry: AuthEntry, draft: PendingGiftCustomize) => void;
  prepareAdminSignIn: (email: string) => void;
  clearRestoreSignInEmail: () => void;
  setPendingGiftClaimToken: (token: string | null) => void;
  clearPending: () => void;
};

export const useAuthFlowStore = create<AuthFlowState>((set) => ({
  pendingReturn: null,
  pendingGiftClaimToken: null,
  pendingGiftCustomize: null,
  authEntry: 'signup',
  authScreen: null,
  restoreSignInEmail: null,
  startAuthForCheckout: (entry = 'signup') =>
    set({
      pendingReturn: 'Checkout',
      pendingGiftCustomize: null,
      authEntry: entry,
      authScreen: entry === 'signin' ? 'SignIn' : 'SignUp',
    }),
  startAuthForRav: (entry = 'signin') =>
    set({
      pendingReturn: 'Rav',
      pendingGiftCustomize: null,
      authEntry: entry,
      authScreen: entry === 'signin' ? 'SignIn' : 'SignUp',
    }),
  startAuthFromGuest: (returnTo, entry = 'signin', screen) =>
    set({
      pendingReturn: returnTo,
      pendingGiftCustomize: null,
      authEntry: entry,
      authScreen: screen ?? (entry === 'signin' ? 'SignIn' : 'SignUp'),
    }),
  startAuthForGiftCustomize: (entry, draft) =>
    set({
      pendingReturn: 'GiftGiverCustomize',
      pendingGiftCustomize: draft,
      authEntry: entry,
      authScreen: entry === 'signin' ? 'SignIn' : 'SignUp',
    }),
  prepareAdminSignIn: (email) =>
    set({
      pendingReturn: null,
      pendingGiftClaimToken: null,
      pendingGiftCustomize: null,
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
      restoreSignInEmail: null,
    }),
}));
