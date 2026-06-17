import { create } from 'zustand';
import type { AuthStackParamList } from '../navigation/types';

export type AuthReturnRoute = 'Checkout' | 'Rav' | 'Account' | 'Profiles' | 'MyBox' | 'GiftClaim';

type AuthEntry = 'signup' | 'signin';

type AuthFlowState = {
  pendingReturn: AuthReturnRoute | null;
  pendingGiftClaimToken: string | null;
  authEntry: AuthEntry;
  authScreen: keyof AuthStackParamList | null;
  startAuthForCheckout: (entry?: AuthEntry) => void;
  startAuthForRav: (entry?: AuthEntry) => void;
  startAuthFromGuest: (
    returnTo: AuthReturnRoute,
    entry?: AuthEntry,
    screen?: keyof AuthStackParamList
  ) => void;
  setPendingGiftClaimToken: (token: string | null) => void;
  clearPending: () => void;
};

export const useAuthFlowStore = create<AuthFlowState>((set) => ({
  pendingReturn: null,
  pendingGiftClaimToken: null,
  authEntry: 'signup',
  authScreen: null,
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
  setPendingGiftClaimToken: (token) => set({ pendingGiftClaimToken: token }),
  clearPending: () => set({ pendingReturn: null, authScreen: null, pendingGiftClaimToken: null }),
}));
