import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

const KID_RAV_HOURLY_LIMIT = 20;

export async function assertKidRavAllowed(
  uid: string,
  childId: string | undefined
): Promise<{ childName: string }> {
  if (!childId || typeof childId !== 'string') {
    throw new HttpsError('permission-denied', 'Kid Rav requires a child profile.');
  }

  const db = getFirestore();
  const childSnap = await db.doc(`users/${uid}/children/${childId}`).get();
  if (!childSnap.exists) {
    throw new HttpsError('not-found', 'Child profile not found.');
  }
  const data = childSnap.data() ?? {};
  if (data.ravEnabled !== true) {
    throw new HttpsError('permission-denied', 'Rav is not enabled for this child.');
  }

  const hourKey = new Date().toISOString().slice(0, 13);
  const usageRef = db.doc(`users/${uid}/ravKidUsage/${hourKey}`);
  const usageSnap = await usageRef.get();
  const count = typeof usageSnap.data()?.count === 'number' ? usageSnap.data()!.count : 0;
  if (count >= KID_RAV_HOURLY_LIMIT) {
    throw new HttpsError('resource-exhausted', 'Rav needs a short break. Try again later or ask your grown-up.');
  }
  await usageRef.set({ count: count + 1, updatedAt: new Date().toISOString() }, { merge: true });

  const childName = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'friend';
  return { childName };
}

/** Strip any box mutation actions from kid Rav responses. */
export function stripKidRavActions<T extends { actions?: unknown }>(response: T): T {
  if (!response || typeof response !== 'object') return response;
  const { actions: _removed, ...rest } = response as T & { actions?: unknown };
  return rest as T;
}
