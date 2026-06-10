import { create } from 'zustand';

type AuthReturnRoute = 'Checkout' | 'Rav';

type AuthFlowState = {
  pendingReturn: AuthReturnRoute | null;
  authEntry: 'signup' | 'signin';
  startAuthForCheckout: (entry?: 'signup' | 'signin') => void;
  startAuthForRav: (entry?: 'signup' | 'signin') => void;
  clearPending: () => void;
};

export const useAuthFlowStore = create<AuthFlowState>((set) => ({
  pendingReturn: null,
  authEntry: 'signup',
  startAuthForCheckout: (entry = 'signup') => set({ pendingReturn: 'Checkout', authEntry: entry }),
  startAuthForRav: (entry = 'signin') => set({ pendingReturn: 'Rav', authEntry: entry }),
  clearPending: () => set({ pendingReturn: null }),
}));
