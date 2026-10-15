/**
 * Box history: every write that changes a box's lines appends a `history` entry under the box
 * (who, what changed, the full lines before and after), and `history/default` keeps the box the
 * builder handed them. Covers account drafts (households/{h}/boxDrafts/{holiday}) and signed-out
 * boxes and gift drafts (guestSessions/{visitor}).
 *
 * Writers say who they are with `lastChangeSource` on the box document (the app sets it on every
 * save; jobs and scripts set their own label). It is consumed here and cleared, so a stale label
 * never sticks to a later write.
 */
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import * as logger from './logger';
import { withSentry } from './sentry';
import { diffBoxLines, historyLines, nextDefault, withoutUndefined } from './boxHistoryDiff';
import { BOX_AUDIT_HOLIDAY_ID } from './boxAuditLoad';
import { refreshAccountBoxAudit, refreshGuestBoxAudits } from './boxAuditJob';

type Doc = Record<string, unknown> | undefined;
type ListName = 'box' | 'gift';

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

async function recordList(
  historyRef: FirebaseFirestore.CollectionReference,
  list: ListName,
  source: string,
  by: string | null,
  beforeRaw: unknown,
  afterRaw: unknown
): Promise<boolean> {
  const before = historyLines(beforeRaw);
  const after = historyLines(afterRaw);
  const changes = diffBoxLines(before, after);
  if (!changes.length) return false;
  const at = new Date().toISOString();
  await historyRef.add(withoutUndefined({ at, source, by, list, changes, before, after }));
  const defaultRef = historyRef.doc('default');
  const existing = (await defaultRef.get()).data()?.[list];
  const next = nextDefault(existing, source, after);
  if (next) await defaultRef.set({ [list]: withoutUndefined({ ...next, at }) }, { merge: true });
  return true;
}

/** The included-items audit never blocks history. */
async function audited(path: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (err) {
    logger.warn('boxHistory: box audit failed', { path, err: String(err) });
  }
}

async function clearSource(ref: DocumentReference, after: Doc): Promise<void> {
  if (!after || !('lastChangeSource' in after)) return;
  await ref.update({ lastChangeSource: FieldValue.delete() }).catch((err) => {
    logger.warn('boxHistory: could not clear lastChangeSource', { path: ref.path, err: String(err) });
  });
}

export const recordBoxDraftHistory = onDocumentWritten(
  { document: 'households/{householdId}/boxDrafts/{holidayId}', memory: '256MiB' },
  withSentry(async (event) => {
    const before = event.data?.before?.data() as Doc;
    const afterSnap = event.data?.after;
    const after = afterSnap?.exists ? (afterSnap.data() as Doc) : undefined;
    const ref = (afterSnap ?? event.data?.before)?.ref;
    if (!ref) return;
    const source = str(after?.lastChangeSource) ?? (after ? 'unknown' : 'deleted');
    const changed = await recordList(ref.collection('history'), 'box', source, str(after?.updatedBy), before?.lineItems, after?.lineItems);
    await clearSource(ref, after);
    if (changed && event.params.holidayId === BOX_AUDIT_HOLIDAY_ID) {
      await audited(ref.path, () => refreshAccountBoxAudit(ref.firestore, event.params.householdId, ref.path, after));
    }
  })
);

function guestLists(data: Doc): { box: unknown; gift: unknown; builtAt: string | null } {
  const snapshot = isRecord(data?.snapshot) ? data!.snapshot : {};
  const guest = isRecord(snapshot.guest) ? snapshot.guest : {};
  const gift = isRecord(snapshot.gift) && isRecord(snapshot.gift.draft) ? snapshot.gift.draft : {};
  return { box: guest.lineItems, gift: gift.lineItems, builtAt: str(guest.boxBuiltAt) };
}

export const recordGuestBoxHistory = onDocumentWritten(
  { document: 'guestSessions/{visitorId}', memory: '256MiB' },
  withSentry(async (event) => {
    const before = event.data?.before?.data() as Doc;
    const afterSnap = event.data?.after;
    if (!afterSnap?.exists) return;
    const after = afterSnap.data() as Doc;
    const prev = guestLists(before);
    const next = guestLists(after);
    const jobSource = str(after?.lastChangeSource);
    const boxSource = jobSource ?? (next.builtAt && next.builtAt !== prev.builtAt ? 'default-build' : 'customer');
    const historyRef = afterSnap.ref.collection('history');
    const boxChanged = await recordList(historyRef, 'box', boxSource, null, prev.box, next.box);
    const giftChanged = await recordList(historyRef, 'gift', jobSource ?? 'customer', null, prev.gift, next.gift);
    await clearSource(afterSnap.ref, after);
    if (boxChanged || giftChanged) {
      await audited(afterSnap.ref.path, () => refreshGuestBoxAudits(afterSnap.ref.firestore, afterSnap.ref.path, after));
    }
  })
);

/**
 * After a signed-out visitor creates an account: their household's default box is the one
 * they were first handed as a guest, unless the household already has a real build.
 */
export async function carryGuestDefaultToHousehold(
  db: FirebaseFirestore.Firestore,
  visitorId: string,
  householdId: string,
  holidayId: string
): Promise<void> {
  const guestDefault = (await db.doc(`guestSessions/${visitorId}/history/default`).get()).data()?.box;
  if (!isRecord(guestDefault)) return;
  const ref = db.doc(`households/${householdId}/boxDrafts/${holidayId}/history/default`);
  const current = (await ref.get()).data()?.box;
  if (isRecord(current) && current.source === 'default-build') return;
  await ref.set({ box: { ...guestDefault, fromGuestSession: visitorId } }, { merge: true });
}
