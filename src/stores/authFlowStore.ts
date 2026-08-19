import { create } from 'zustand';
import type { AuthStackParamList } from '../navigation/types';

export type AuthReturnRoute =
  | 'Checkout'
  | 'Rav'
  | 'Account'
  | 'Profiles'
  | 'MyBox'
  | 'GiftClaim'
  | 'History';

type AuthEntry = 'signup' | 'signin';

type AuthFlowState = {
  pendingReturn: AuthReturnRoute | null;
  pendingGiftClaimToken: string | null;
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
  prepareAdminSignIn: (email: string) => void;
  clearRestoreSignInEmail: () => void;
  setPendingGiftClaimToken: (token: string | null) => void;
  clearPending: () => void;
};

export const useAuthFlowStore = create<AuthFlowState>((set) => ({
  pendingReturn: null,
  pendingGiftClaimToken: null,
  authEntry: 'signup',
  authScreen: null,
  restoreSignInEmail: null,
  startAuthForCheckout: (entry = 'signup') =>
    set({ pendingReturn: 'Checkout', authEntry: entry, authScreen: entry === 'signin' ? 'SignIn' : 'SignUp' }),
  startAuthForRav: (entry = 'signin') =>
    set({ pendingReturn: 'Rav', authEntry: entry, authScreen: entry === 'signin' ? 'SignIn' : 'SignUp' }),
  startAuthFromGuest: (returnTo, entry = 'signin', screen) =>
    set({
      pendingReturn: returnTo,
      authEntry: entry,
      authScreen: screen ?? (entry === 'signin' ? 'SignIn' : 'SignUp'),
    }),
  prepareAdminSignIn: (email) =>
    set({
      pendingReturn: null,
      pendingGiftClaimToken: null,
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
      restoreSignInEmail: null,
    }),
}));
