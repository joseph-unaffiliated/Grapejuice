import { auth } from '../../lib/firebase';

/** Ensure Firestore requests include auth token (fixes Expo Go permission races). */
export async function ensureAuthTokenReady(uid: string): Promise<void> {
  if (!auth?.currentUser || auth.currentUser.uid !== uid) return;
  await auth.currentUser.getIdToken(true);
}
