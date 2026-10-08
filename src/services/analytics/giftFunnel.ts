import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import type { GiftPath } from '../../screens/gift/giftGiveTypes';
import { getVisitorId } from '../guest/visitorId';
import { entryFromWindow } from '../guest/guestSessionSync';
import { trackMetaCustom, type GiftStepEvent } from './metaPixel';

const SESSION_KEY = 'gj.giftStepsSent';
const sentThisLoad = new Set<string>();

function claimStep(key: string): boolean {
  if (sentThisLoad.has(key)) return false;
  sentThisLoad.add(key);
  try {
    if (typeof sessionStorage === 'undefined') return true;
    const sent: string[] = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '[]');
    if (sent.includes(key)) return false;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...sent, key]));
  } catch {
    // Storage blocked — the in-memory guard still covers this page load.
  }
  return true;
}

/**
 * Gift funnel step, once per step + path per tab session — screens remount after
 * sign-in / Google redirect and must not count the visitor twice.
 */
export function trackGiftStep(step: GiftStepEvent, giftPath?: GiftPath | null): void {
  if (!claimStep(giftPath ? `${step}:${giftPath}` : step)) return;
  trackMetaCustom(step, giftPath ? { content_name: giftPath } : undefined);
}

/** Mirrors GIFT_FUNNEL_STEPS in functions/src/giftFunnel.ts. */
export type GiftFunnelStep =
  | 'landing'
  | 'start'
  | 'path'
  | 'family'
  | 'email'
  | 'box'
  | 'note'
  | 'send'
  | 'checkout'
  | 'paid';

const RECORDED_KEY = 'gj.giftFunnelRecorded';
const RECORDED_MAX = 100;
const recordedThisLoad = new Set<string>();

function readRecorded(): string[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(RECORDED_KEY) : null;
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

function writeRecorded(list: string[]): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(RECORDED_KEY, JSON.stringify(list.slice(-RECORDED_MAX)));
  } catch {
    // Storage blocked — the in-memory guard still covers this page load.
  }
}

function claimRecord(key: string): boolean {
  if (recordedThisLoad.has(key)) return false;
  recordedThisLoad.add(key);
  const list = readRecorded();
  if (list.includes(key)) return false;
  writeRecorded([...list, key]);
  return true;
}

function releaseRecord(key: string): void {
  recordedThisLoad.delete(key);
  writeRecorded(readRecorded().filter((k) => k !== key));
}

/**
 * First time this visitor reaches a gift step (signed in or not), for the admin Gift funnel tab.
 * Web only (needs the visitor id); never throws.
 */
export function recordGiftFunnelStep(
  step: GiftFunnelStep,
  opts: { path?: GiftPath | null; inviteId?: string } = {}
): void {
  const visitorId = getVisitorId();
  if (!functions || !visitorId) return;
  const key = [visitorId, step, opts.path, opts.inviteId].filter(Boolean).join(':');
  if (!claimRecord(key)) return;
  const callable = httpsCallable<
    { visitorId: string; step: GiftFunnelStep; path?: GiftPath; inviteId?: string; entry: unknown },
    { ok: boolean }
  >(functions, 'recordGiftStep');
  void callable({
    visitorId,
    step,
    ...(opts.path ? { path: opts.path } : {}),
    ...(opts.inviteId ? { inviteId: opts.inviteId } : {}),
    entry: entryFromWindow(),
  }).catch(() => releaseRecord(key));
}
