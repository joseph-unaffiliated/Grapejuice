import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  browserPopupRedirectResolver,
  User,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { auth } from '../../lib/firebase';

/** Explicit resolver — required if Auth was initialized without popupRedirectResolver (auth/argument-error). */
const webPopupRedirectResolver =
  Platform.OS === 'web' ? browserPopupRedirectResolver : undefined;

const FIREBASE_NOT_CONFIGURED = 'Firebase is not configured. Add EXPO_PUBLIC_FIREBASE_* to .env and restart.';

/** Soft signal: redirect was started; page will navigate away. */
export const GOOGLE_REDIRECT_PENDING = 'GOOGLE_REDIRECT_PENDING';

/** Thrown when redirect returned but no session could be restored (storage blocked). */
export const GOOGLE_REDIRECT_SESSION_LOST = 'GOOGLE_REDIRECT_SESSION_LOST';

const PENDING_GOOGLE_REDIRECT_KEY = 'gj_pending_google_redirect';
const PENDING_AUTH_RETURN_KEY = 'gj_pending_auth_return';

const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
const webClientId = extra?.googleWebClientId;

let GoogleSigninModule: typeof import('@react-native-google-signin/google-signin')['GoogleSignin'] | null = null;
let googleSigninAvailable: boolean | null = null;

/** Shared across React Strict Mode remounts — getRedirectResult may only be consumed once. */
let redirectCompletion: Promise<AuthUser | null> | null = null;
let redirectWarmStarted = false;

async function getGoogleSignin() {
  if (Constants.appOwnership === 'expo') {
    googleSigninAvailable = false;
    return null;
  }
  if (googleSigninAvailable === false) return null;
  if (GoogleSigninModule) return GoogleSigninModule;
  try {
    const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
    GoogleSigninModule = GoogleSignin;
    if (webClientId) GoogleSignin.configure({ webClientId });
    googleSigninAvailable = true;
    return GoogleSignin;
  } catch {
    googleSigninAvailable = false;
    return null;
  }
}

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

function formatUser(user: User): AuthUser {
  return {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null,
  };
}

function getErrorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String((error as { code: unknown }).code);
  }
  return null;
}

/**
 * Cursor Simple Browser / VS Code webviews / Electron shells often break
 * Firebase popup OAuth (COOP / window.closed → auth/internal-error).
 * Prefer redirect there; fall back to redirect if popup fails.
 */
export function isRestrictedWebAuthEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  if (/Electron|VSCode|Cursor|Code[/ ]/i.test(ua)) return true;
  const protocol = window.location?.protocol ?? '';
  if (protocol === 'vscode-file:' || protocol === 'vscode-webview:') return true;
  return false;
}

/** True when localStorage/sessionStorage look usable for Firebase Auth persistence. */
export function canPersistWebAuthSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const probe = '__gj_auth_probe__';
    window.sessionStorage.setItem(probe, '1');
    window.sessionStorage.removeItem(probe);
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function shouldFallbackGoogleRedirect(code: string | null): boolean {
  return (
    code === 'auth/popup-blocked' ||
    code === 'auth/cancelled-popup-request' ||
    code === 'auth/internal-error' ||
    code === 'auth/network-request-failed'
  );
}

function createGoogleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

function markPendingGoogleRedirect(returnTo?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(PENDING_GOOGLE_REDIRECT_KEY, '1');
    if (returnTo) {
      window.sessionStorage.setItem(PENDING_AUTH_RETURN_KEY, returnTo);
    }
  } catch {
    /* storage blocked — redirect result may also fail; surfaced on return */
  }
}

function consumePendingGoogleRedirectFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const pending = window.sessionStorage.getItem(PENDING_GOOGLE_REDIRECT_KEY) === '1';
    window.sessionStorage.removeItem(PENDING_GOOGLE_REDIRECT_KEY);
    return pending;
  } catch {
    return false;
  }
}

/** Restore post-redirect return target (Account, Checkout, …) if one was stashed. */
export function consumePendingAuthReturn(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.sessionStorage.getItem(PENDING_AUTH_RETURN_KEY);
    window.sessionStorage.removeItem(PENDING_AUTH_RETURN_KEY);
    return value;
  } catch {
    return null;
  }
}

async function signInWithGoogleRedirect(returnTo?: string | null): Promise<never> {
  if (!auth) throw new Error(FIREBASE_NOT_CONFIGURED);
  if (!canPersistWebAuthSession() && isRestrictedWebAuthEnvironment()) {
    throw new Error(GOOGLE_REDIRECT_SESSION_LOST);
  }
  markPendingGoogleRedirect(returnTo);
  await signInWithRedirect(auth, createGoogleProvider(), webPopupRedirectResolver);
  throw new Error(GOOGLE_REDIRECT_PENDING);
}

/**
 * Finish a pending Google redirect. Safe to call multiple times — shares one promise
 * so React Strict Mode / late RootNavigator mount cannot drop the result.
 */
export async function completeGoogleRedirectIfNeeded(): Promise<AuthUser | null> {
  if (Platform.OS !== 'web' || !auth) return null;
  if (!redirectCompletion) {
    redirectCompletion = (async () => {
      const wasPending = consumePendingGoogleRedirectFlag();
      try {
        const result = await getRedirectResult(auth, webPopupRedirectResolver);
        if (result?.user) return formatUser(result.user);
        if (auth.currentUser) return formatUser(auth.currentUser);
        if (wasPending) {
          throw new Error(GOOGLE_REDIRECT_SESSION_LOST);
        }
        return null;
      } catch (error) {
        if (error instanceof Error && error.message === GOOGLE_REDIRECT_SESSION_LOST) {
          throw error;
        }
        // Surface redirect failures to callers that await this during init.
        throw error;
      }
    })();
  }
  return redirectCompletion;
}

/**
 * Start redirect completion as early as possible on web (before font boot / React tree).
 * Firebase may lose redirect state if Auth + getRedirectResult run too late after return.
 */
export function warmWebAuth(): void {
  if (Platform.OS !== 'web' || !auth || redirectWarmStarted) return;
  redirectWarmStarted = true;
  void completeGoogleRedirectIfNeeded().catch(() => {
    /* authStore.initialize surfaces errors */
  });
}

export async function signInWithEmail(email: string, password: string): Promise<AuthUser> {
  if (!auth) throw new Error(FIREBASE_NOT_CONFIGURED);
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return formatUser(userCredential.user);
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string
): Promise<AuthUser> {
  if (!auth) throw new Error(FIREBASE_NOT_CONFIGURED);
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName.trim()) {
    await updateProfile(userCredential.user, { displayName: displayName.trim() });
  }
  return formatUser(userCredential.user);
}

export async function signInWithGoogle(returnTo?: string | null): Promise<AuthUser> {
  if (!auth) throw new Error(FIREBASE_NOT_CONFIGURED);
  if (Platform.OS === 'web') {
    if (isRestrictedWebAuthEnvironment()) {
      return signInWithGoogleRedirect(returnTo);
    }
    try {
      const userCredential = await signInWithPopup(
        auth,
        createGoogleProvider(),
        webPopupRedirectResolver
      );
      return formatUser(userCredential.user);
    } catch (error) {
      if (shouldFallbackGoogleRedirect(getErrorCode(error))) {
        return signInWithGoogleRedirect(returnTo);
      }
      throw error;
    }
  }
  const GoogleSignin = await getGoogleSignin();
  if (!GoogleSignin) {
    throw new Error('Google Sign-In needs a dev build or use email sign-in in Expo Go.');
  }
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  if (response.type === 'cancelled' || !response.data) {
    throw new Error('Google sign in was cancelled');
  }
  let idToken = response.data.idToken;
  if (!idToken) {
    const tokens = await GoogleSignin.getTokens();
    idToken = tokens.idToken;
  }
  if (!idToken) throw new Error('No Google idToken available');
  const googleCredential = GoogleAuthProvider.credential(idToken);
  const userCredential = await signInWithCredential(auth, googleCredential);
  return formatUser(userCredential.user);
}

export async function signInWithApple(): Promise<AuthUser> {
  if (Platform.OS !== 'ios') {
    throw new Error('Sign in with Apple is only available on iOS.');
  }
  if (!auth) throw new Error(FIREBASE_NOT_CONFIGURED);

  const appleCredential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!appleCredential.identityToken) {
    throw new Error('No identity token from Apple.');
  }

  const provider = new OAuthProvider('apple.com');
  const oauthCredential = provider.credential({ idToken: appleCredential.identityToken });
  const userCredential = await signInWithCredential(auth, oauthCredential);

  if (appleCredential.fullName?.givenName && !userCredential.user.displayName) {
    const name = [appleCredential.fullName.givenName, appleCredential.fullName.familyName]
      .filter(Boolean)
      .join(' ');
    if (name) {
      await updateProfile(userCredential.user, { displayName: name });
    }
  }

  return formatUser(userCredential.user);
}

export async function signOut(): Promise<void> {
  if (!auth) throw new Error(FIREBASE_NOT_CONFIGURED);
  if (Platform.OS !== 'web') {
    const GoogleSignin = await getGoogleSignin();
    if (GoogleSignin?.hasPreviousSignIn()) {
      await GoogleSignin.signOut();
    }
  }
  await firebaseSignOut(auth);
}

export async function resetPassword(email: string): Promise<void> {
  if (!auth) throw new Error(FIREBASE_NOT_CONFIGURED);
  await sendPasswordResetEmail(auth, email);
}

export function onAuthStateChange(callback: (user: AuthUser | null) => void): () => void {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return auth.onAuthStateChanged((user) => {
    callback(user ? formatUser(user) : null);
  });
}

/** Synchronous snapshot for race guards during init. */
export function getCurrentAuthUser(): AuthUser | null {
  if (!auth?.currentUser) return null;
  return formatUser(auth.currentUser);
}
