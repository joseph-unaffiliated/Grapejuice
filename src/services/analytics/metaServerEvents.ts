import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import {
  metaServerContext,
  newMetaEventId,
  trackMeta,
  trackMetaCustom,
  type MetaServerContext,
} from './metaPixel';

type ServerEventName = 'CompleteRegistration' | 'PreRegister';

/** Conversions API copy of a browser event (same event id → Meta dedupes). Never throws. */
function sendServerEvent(
  eventName: ServerEventName,
  meta: MetaServerContext,
  contentName?: string
): void {
  if (!functions || meta.skip) return;
  const callable = httpsCallable<
    { eventName: ServerEventName; meta: MetaServerContext; contentName?: string },
    { ok: boolean }
  >(functions, 'trackMetaEvent');
  void callable({ eventName, meta, ...(contentName ? { contentName } : {}) }).catch(() => undefined);
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
