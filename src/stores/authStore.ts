import { create } from 'zustand';
import {
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  signOut,
  resetPassword,
  onAuthStateChange,
  type AuthUser,
} from '../services/auth/auth';
import { persistGuestToAccount } from '../services/guest/persistGuestToAccount';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred';
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  initialize: () => () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  googleSignIn: () => Promise<void>;
  logout: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  error: null,

  initialize: () => {
    const unsubscribe = onAuthStateChange((user) => {
      set({ user, isAuthenticated: !!user, isLoading: false });
    });
    const fallback = setTimeout(() => {
      set((s) => (s.isLoading ? { isLoading: false } : {}));
    }, 5000);
    return () => {
      unsubscribe();
      clearTimeout(fallback);
    };
  },

  signIn: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const user = await signInWithEmail(email, password);
      await persistGuestToAccount(user);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ error: getErrorMessage(error), isLoading: false });
      throw error;
    }
  },

  signUp: async (email, password, displayName) => {
    set({ isLoading: true, error: null });
    try {
      const user = await signUpWithEmail(email, password, displayName);
      await persistGuestToAccount(user);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ error: getErrorMessage(error), isLoading: false });
      throw error;
    }
  },

  googleSignIn: async () => {
    set({ isLoading: true, error: null });
    try {
      const user = await signInWithGoogle();
      await persistGuestToAccount(user);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ error: getErrorMessage(error), isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    await signOut();
    set({ user: null, isAuthenticated: false, error: null });
  },

  sendPasswordReset: async (email) => {
    set({ error: null });
    try {
      await resetPassword(email);
    } catch (error) {
      set({ error: getErrorMessage(error) });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));
