import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import {
  metaServerContext,
  newMetaEventId,
  trackMeta,
  trackMetaCustom,
  type MetaServerContext,
} from './metaPixel';

type ServerEventName = 'CompleteRegistration' | 'PreRegister' | 'BoxBuilt';

/**
 * Broad ad sets optimize on BoxBuilt. A practice score above this is not reported as that
 * conversion. The numbers themselves are never a pixel or CAPI parameter.
 *
 * Both sliders default to 50 when untouched, so a practice score of exactly 50 is ambiguous.
 * Keep in sync with functions/src/metaPracticeCutoff.ts, which has the full tie-break rule:
 * practice 50 + Hanukkah 50 is ignored, practice 50 + Hanukkah under 60 counts, practice 50 +
 * Hanukkah 60 or above doesn't.
 */
export const META_BOX_BUILT_MAX_PRACTICE = 59;

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * True when a known practice score counts as low practice. A missing practice score is false
 * (admin filter and pilot invites leave those out). BoxBuilt is the exception: see
 * boxBuiltCountsForMeta, which still fires when there is no score.
 */
export function countsAsLowPractice(
  practiceFrequencyScore: number | null | undefined,
  familiarityScore?: number | null | undefined
): boolean {
  const practice = finite(practiceFrequencyScore);
  if (practice == null || practice > META_BOX_BUILT_MAX_PRACTICE) return false;
  if (practice === 50) {
    const hanukkah = finite(familiarityScore) ?? 50;
    if (hanukkah === 50) return false;
    return hanukkah < 60;
  }
  return true;
}

export function boxBuiltCountsForMeta(
  practiceFrequencyScore: number | null | undefined,
  familiarityScore?: number | null | undefined
): boolean {
  if (finite(practiceFrequencyScore) == null) return true;
  return countsAsLowPractice(practiceFrequencyScore, familiarityScore);
}

/** Conversions API copy of a browser event (same event id → Meta dedupes). Never throws. */
function sendServerEvent(
  eventName: ServerEventName,
  meta: MetaServerContext,
  contentName?: string,
  practiceFrequencyScore?: number | null,
  familiarityScore?: number | null,
): void {
  if (!functions || meta.skip) return;
  const callable = httpsCallable<
    {
      eventName: ServerEventName;
      meta: MetaServerContext;
      contentName?: string;
      practiceFrequencyScore?: number;
      familiarityScore?: number;
    },
    { ok: boolean }
  >(functions, 'trackMetaEvent');
  void callable({
    eventName,
    meta,
    ...(contentName ? { contentName } : {}),
    ...(eventName === 'BoxBuilt' && typeof practiceFrequencyScore === 'number'
      ? { practiceFrequencyScore }
      : {}),
    ...(eventName === 'BoxBuilt' && typeof familiarityScore === 'number' ? { familiarityScore } : {}),
  }).catch(() => undefined);
}

const REG_SENT_KEY = 'gj.metaRegSent';
const registeredThisLoad = new Set<string>();

/**
 * Concurrent first-time profile upserts (session load, guest persist, box entry) each
 * see "new profile" — only the first caller per uid may send.
 */
function claimRegistration(uid: string): boolean {
  if (registeredThisLoad.has(uid)) return false;
  registeredThisLoad.add(uid);
  try {
    if (typeof localStorage === 'undefined') return true;
    const key = `${REG_SENT_KEY}.${uid}`;
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, '1');
  } catch {
    // Storage blocked — the in-memory guard still covers this page load.
  }
  return true;
}

/** Once per account — `reg_<uid>` also keeps the server copy to a single send. */
export function trackRegistration(uid: string): void {
  if (!claimRegistration(uid)) return;
  const eventId = `reg_${uid}`;
  trackMeta('CompleteRegistration', undefined, eventId);
  sendServerEvent('CompleteRegistration', metaServerContext(eventId));
}

/** Grapejuice pre-registers / interest (custom event — the dataset's Lead belongs to other brands). */
export function trackPreRegister(interestKey: string): void {
  const eventId = newMetaEventId('prereg');
  trackMetaCustom('PreRegister', { content_name: interestKey }, eventId);
  sendServerEvent('PreRegister', metaServerContext(eventId), interestKey);
}

/**
 * Email entered on the box reveal gate. Browser copy only — revealBoxWithEmail sends the
 * server copy (with the hashed email) under the same event id. Custom, not `Lead`: the
 * dataset's Lead belongs to other brands.
 */
export function trackBoxEmail(): MetaServerContext {
  const eventId = newMetaEventId('boxemail');
  trackMetaCustom('BoxEmail', { content_name: 'Hanukkah box' }, eventId);
  return metaServerContext(eventId);
}

/**
 * Box builder produced a curated box (guest or signed in). Quiz-built boxes never fire
 * AddToCart, so BoxBuilt is the signal the broad campaigns optimize on.
 * A practice score above the cutoff (see boxBuiltCountsForMeta) does not fire BoxBuilt, but
 * still joins the follow-up audience (the server fires BoxFollowUp for every build).
 * The scores are never a pixel param.
 */
export function trackBoxBuilt(
  numItems: number,
  practiceFrequencyScore?: number | null,
  familiarityScore?: number | null
): void {
  const eventId = newMetaEventId('boxbuilt');
  if (boxBuiltCountsForMeta(practiceFrequencyScore, familiarityScore)) {
    trackMetaCustom('BoxBuilt', { content_name: 'Hanukkah box', num_items: numItems }, eventId);
  }
  sendServerEvent('BoxBuilt', metaServerContext(eventId), 'Hanukkah box', practiceFrequencyScore, familiarityScore);
}
