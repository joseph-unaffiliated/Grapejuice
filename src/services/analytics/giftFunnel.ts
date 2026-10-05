import type { GiftPath } from '../../screens/gift/giftGiveTypes';
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
