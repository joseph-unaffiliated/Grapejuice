import { getFirestore } from 'firebase-admin/firestore';
import type { LineItem } from './types';

const HOLIDAY_ID = 'hanukkah-2026';

export async function buildCatalogContext(): Promise<string> {
  const db = getFirestore();
  const snap = await db.collection('catalog').limit(120).get();
  if (snap.empty) return '';
  const lines = snap.docs.map((d) => {
    const c = d.data();
    const slot = c.slotId ? String(c.slotId) : 'extra';
    return `${d.id} (${slot}): ${c.name ?? d.id}`;
  });
  return lines.join('\n');
}

export async function buildHouseholdContext(uid: string, clientDraft?: string): Promise<string> {
  const db = getFirestore();
  const userSnap = await db.doc(`users/${uid}`).get();
  if (!userSnap.exists) return clientDraft ? `Current box (client): ${clientDraft}` : '';

  const user = userSnap.data() ?? {};
  const householdId = user.householdId as string | undefined;
  const familiarity = user.familiarityLevel as string | undefined;
  const lines: string[] = [];

  if (familiarity) lines.push(`Family familiarity: ${familiarity}`);

  const childrenSnap = await db.collection(`users/${uid}/children`).get();
  if (!childrenSnap.empty) {
    const kids = childrenSnap.docs.map((d) => {
      const c = d.data();
      const name = c.name ? String(c.name) : 'Child';
      const age = c.ageGroup ? String(c.ageGroup) : '?';
      const beam = c.beamStatus ? String(c.beamStatus) : '';
      return `${name} (${age}${beam ? `, beam:${beam}` : ''})`;
    });
    lines.push(`Kids: ${kids.join(', ')}`);
  }

  if (!householdId) {
    if (clientDraft) lines.push(`Current box (client): ${clientDraft}`);
    return lines.join('\n');
  }

  const [draftSnap, configSnap] = await Promise.all([
    db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`).get(),
    db.doc('config/hanukkah-2026').get(),
  ]);

  const config = configSnap.data() ?? {};
  const lockAt = config.lockAt as string | undefined;
  if (lockAt) {
    const locked = Date.now() >= new Date(lockAt).getTime();
    lines.push(locked ? `Box customization: locked (${lockAt})` : `Box customization open until ${lockAt}`);
  }

  if (clientDraft) {
    lines.push(`Current box (client): ${clientDraft}`);
  } else if (draftSnap.exists) {
    const draft = draftSnap.data() ?? {};
    const items = (draft.lineItems as LineItem[]) ?? [];
    if (items.length) {
      const summary = items
        .map((li) => {
          const name = li.label || li.itemId || li.slotId || 'item';
          const qty = li.quantity && li.quantity > 1 ? ` ×${li.quantity}` : '';
          const kid = li.childId ? ` [${li.childId}]` : '';
          return `${name}${qty}${kid}`;
        })
        .join('; ');
      lines.push(`Current box: ${summary}`);
    } else {
      lines.push('Current box: empty draft');
    }
  } else {
    lines.push('Current box: not started');
  }

  return lines.join('\n');
}
