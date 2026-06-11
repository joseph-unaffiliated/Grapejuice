import { create } from 'zustand';
import {
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  signInWithApple,
  signOut,
  resetPassword,
  onAuthStateChange,
  type AuthUser,
} from '../services/auth/auth';
import { persistGuestToAccount } from '../services/guest/persistGuestToAccount';

async function mergeGuestSession(user: AuthUser): Promise<void> {
  try {
    await persistGuestToAccount(user);
  } catch (error) {
    console.warn('[auth] Guest session merge failed:', error);
  }
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
    const code = String((error as { code: unknown }).code);
    const message = String((error as { message: unknown }).message);
    if (code === 'auth/popup-blocked') {
      return 'Google sign-in popup was blocked. Allow popups for localhost or use email sign-in.';
    }
    if (code === 'auth/unauthorized-domain') {
      return 'This domain is not authorized for Google sign-in. Add localhost in Firebase Console → Authentication → Settings → Authorized domains.';
    }
    if (code === 'auth/internal-error') {
      return 'Google sign-in failed (auth/internal-error). Check the browser console for CSP or API-key errors, confirm Google is enabled in Firebase Auth, and try email sign-in on localhost.';
    }
    return message;
  }
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
  appleSignIn: () => Promise<void>;
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
      await mergeGuestSession(user);
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
      await mergeGuestSession(user);
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
      await mergeGuestSession(user);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ error: getErrorMessage(error), isLoading: false });
      throw error;
    }
  },

  appleSignIn: async () => {
    set({ isLoading: true, error: null });
    try {
      const user = await signInWithApple();
      await mergeGuestSession(user);
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
