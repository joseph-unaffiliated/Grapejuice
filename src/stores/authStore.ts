import { create } from 'zustand';
import {
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  signInWithApple,
  signOut,
  resetPassword,
  onAuthStateChange,
  completeGoogleRedirectIfNeeded,
  getCurrentAuthUser,
  GOOGLE_REDIRECT_PENDING,
  GOOGLE_REDIRECT_SESSION_LOST,
  isRestrictedWebAuthEnvironment,
  type AuthUser,
} from '../services/auth/auth';
import { persistGuestToAccount } from '../services/guest/persistGuestToAccount';
import { useGuestSessionStore } from './guestSessionStore';

let guestMergeInFlight: Promise<boolean> | null = null;
let guestMergeUid: string | null = null;

async function mergeGuestSession(user: AuthUser): Promise<boolean> {
  if (guestMergeInFlight && guestMergeUid === user.uid) {
    return guestMergeInFlight;
  }
  guestMergeUid = user.uid;
  guestMergeInFlight = persistGuestToAccount(user)
    .then(() => true)
    .catch((error) => {
      console.warn('[auth] Guest session merge failed:', error);
      return false;
    })
    .finally(() => {
      guestMergeInFlight = null;
      guestMergeUid = null;
    });
  return guestMergeInFlight;
}

function commitAuthenticatedUser(
  set: (partial: {
    user: AuthUser;
    isAuthenticated: true;
    isLoading: false;
    error: null;
  }) => void,
  user: AuthUser,
  clearGuest: boolean
) {
  set({ user, isAuthenticated: true, isLoading: false, error: null });
  if (clearGuest) {
    useGuestSessionStore.getState().reset();
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message === GOOGLE_REDIRECT_PENDING) {
    return 'Redirecting to Google…';
  }
  if (error instanceof Error && error.message === GOOGLE_REDIRECT_SESSION_LOST) {
    if (isRestrictedWebAuthEnvironment()) {
      return 'Google sign-in can’t save a session in this embedded browser. Open http://localhost:8081 in Chrome for Google, or use email sign-in here.';
    }
    return 'Google sign-in couldn’t restore your session (browser storage blocked). Allow site data for localhost, try Chrome, or use email sign-in.';
  }
  if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
    const code = String((error as { code: unknown }).code);
    const message = String((error as { message: unknown }).message);
    if (code === 'auth/popup-blocked') {
      return 'Google sign-in popup was blocked. Allow popups for this site, open in Chrome, or use email sign-in.';
    }
    if (code === 'auth/unauthorized-domain') {
      return 'This domain is not authorized for Google sign-in. Add localhost in Firebase Console → Authentication → Settings → Authorized domains.';
    }
    if (code === 'auth/internal-error') {
      if (typeof window !== 'undefined' && isRestrictedWebAuthEnvironment()) {
        return 'Google sign-in is limited in this embedded browser. Use email sign-in here, or open http://localhost:8081 in Chrome for Google.';
      }
      return 'Google sign-in failed (auth/internal-error). Try Chrome on localhost, or use email sign-in. If it keeps failing, check the browser console for CSP errors and confirm Google is enabled in Firebase Auth.';
    }
    if (
      code === 'auth/invalid-credential' ||
      code === 'auth/invalid-login-credentials' ||
      code === 'auth/wrong-password' ||
      code === 'auth/user-not-found'
    ) {
      return 'Email or password did not match. If you usually use Google, tap Continue with Google instead — or create an account if you have not signed up on this project yet.';
    }
    if (code === 'auth/invalid-email') {
      return 'That email address does not look valid.';
    }
    if (code === 'auth/too-many-requests') {
      return 'Too many failed attempts. Wait a minute and try again, or reset your password.';
    }
    if (code === 'auth/operation-not-allowed') {
      return 'Email/password sign-in is disabled for this Firebase project. Enable it in Authentication → Sign-in method.';
    }
    return message;
  }
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred';
}

export type GoogleSignInReturnTo =
  | 'Stay'
  | 'Checkout'
  | 'Rav'
  | 'Account'
  | 'Profiles'
  | 'MyBox'
  | 'GiftClaim'
  | 'History';

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  initialize: () => () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  googleSignIn: (returnTo?: GoogleSignInReturnTo | null) => Promise<void>;
  appleSignIn: () => Promise<void>;
  logout: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  error: null,

  initialize: () => {
    let cancelled = false;
    let redirectSettled = false;
    let authStateSettled = false;

    const finishLoadingIfReady = () => {
      if (cancelled || !redirectSettled || !authStateSettled) return;
      set((s) => (s.isLoading ? { isLoading: false } : s));
    };

    void (async () => {
      try {
        const redirected = await completeGoogleRedirectIfNeeded();
        if (cancelled) return;
        if (redirected) {
          const merged = await mergeGuestSession(redirected);
          commitAuthenticatedUser(set, redirected, merged);
        }
      } catch (error) {
        if (cancelled) return;
        set({ error: getErrorMessage(error) });
      } finally {
        redirectSettled = true;
        finishLoadingIfReady();
      }
    })();

    const unsubscribe = onAuthStateChange((user) => {
      if (cancelled) return;
      if (user) {
        const prev = get().user;
        const needsMerge = !prev || prev.uid !== user.uid;
        if (needsMerge) {
          // Persist the guest box before SessionContext loads a stub profile
          // with onboardingComplete: false (that gate dumps them into onboarding).
          void (async () => {
            const merged = await mergeGuestSession(user);
            if (cancelled) return;
            authStateSettled = true;
            commitAuthenticatedUser(set, user, merged);
            finishLoadingIfReady();
          })();
          return;
        }
        authStateSettled = true;
        set({ user, isAuthenticated: true });
      } else if (redirectSettled) {
        // Ignore null until redirect completion — Auth often emits null before getRedirectResult.
        // If Firebase already has a currentUser, prefer that over a stale null event.
        authStateSettled = true;
        const current = getCurrentAuthUser();
        if (current) {
          set({ user: current, isAuthenticated: true });
        } else {
          set({ user: null, isAuthenticated: false });
        }
      } else {
        authStateSettled = true;
      }
      finishLoadingIfReady();
    });

    const fallback = setTimeout(() => {
      redirectSettled = true;
      authStateSettled = true;
      finishLoadingIfReady();
    }, 8000);

    return () => {
      cancelled = true;
      unsubscribe();
      clearTimeout(fallback);
    };
  },

  signIn: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const user = await signInWithEmail(email, password);
      const merged = await mergeGuestSession(user);
      commitAuthenticatedUser(set, user, merged);
    } catch (error) {
      set({ error: getErrorMessage(error), isLoading: false });
      throw error;
    }
  },

  signUp: async (email, password, displayName) => {
    set({ isLoading: true, error: null });
    try {
      const user = await signUpWithEmail(email, password, displayName);
      const merged = await mergeGuestSession(user);
      commitAuthenticatedUser(set, user, merged);
    } catch (error) {
      set({ error: getErrorMessage(error), isLoading: false });
      throw error;
    }
  },

  googleSignIn: async (returnTo) => {
    set({ isLoading: true, error: null });
    try {
      const user = await signInWithGoogle(returnTo ?? null);
      const merged = await mergeGuestSession(user);
      commitAuthenticatedUser(set, user, merged);
    } catch (error) {
      if (error instanceof Error && error.message === GOOGLE_REDIRECT_PENDING) {
        // Keep loading while the browser navigates to Google.
        set({ error: null, isLoading: true });
        return;
      }
      set({ error: getErrorMessage(error), isLoading: false });
      throw error;
    }
  },

  appleSignIn: async () => {
    set({ isLoading: true, error: null });
    try {
      const user = await signInWithApple();
      const merged = await mergeGuestSession(user);
      commitAuthenticatedUser(set, user, merged);
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
