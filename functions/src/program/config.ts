import type { Firestore } from 'firebase-admin/firestore';

export const LIFECYCLE_DOC = 'programConfig/lifecycle';

export async function enabledStageSet(db: Firestore): Promise<Set<string>> {
  const snap = await db.doc(LIFECYCLE_DOC).get();
  const raw = snap.data()?.enabledStages;
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((s): s is string => typeof s === 'string'));
}

/** S6 is its own approval. A pre-facelift first touch waits for that tick. */
export function stageIsEnabled(enabled: Set<string>, stage: string, variant: string): boolean {
  if (variant.includes('s6')) return enabled.has('s6');
  if (stage === 'wave2' && enabled.has('wave2')) return true;
  if (stage === 'lock_t3' && variant.includes('wave2')) return enabled.has('lock_t3') || enabled.has('wave2');
  return enabled.has(stage);
}
