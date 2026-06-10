import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  User,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { auth } from '../../lib/firebase';

const FIREBASE_NOT_CONFIGURED = 'Firebase is not configured. Add EXPO_PUBLIC_FIREBASE_* to .env and restart.';

const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
const webClientId = extra?.googleWebClientId;

let GoogleSigninModule: typeof import('@react-native-google-signin/google-signin')['GoogleSignin'] | null = null;
let googleSigninAvailable: boolean | null = null;

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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'An unexpected error occurred';
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

export async function signInWithGoogle(): Promise<AuthUser> {
  if (!auth) throw new Error(FIREBASE_NOT_CONFIGURED);
  if (Platform.OS === 'web') {
    const provider = new GoogleAuthProvider();
    const userCredential = await signInWithPopup(auth, provider);
    return formatUser(userCredential.user);
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
