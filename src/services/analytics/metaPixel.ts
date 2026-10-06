import { Platform } from 'react-native';
import { auth } from '../../lib/firebase';
import { isAdminEmail } from '../../constants/admin';
import { useUserStatePreviewStore } from '../../stores/userStatePreviewStore';
import { useDevPreviewStore } from '../../stores/devPreviewStore';
import { useMockFlowStore } from '../../stores/mockFlowStore';
import {
  readAttributionSnapshot,
  readFbc,
  readFbp,
  type AttributionSnapshot,
} from '../../stores/entryContextStore';
import { setGaDisabled, trackGaForMetaEvent } from './googleAnalytics';

/** "Unaffiliated" dataset. Keep in sync with public/index.html and functions/src/metaCapi.ts. */
export const META_PIXEL_ID = '809409995127436';
const CONTENT_CATEGORY = 'grapejuice';
/** `localStorage.setItem('gj.metaDebug', '1')` — fire on localhost / admin sessions for QA. */
const DEBUG_KEY = 'gj.metaDebug';

export type MetaStandardEvent =
  | 'PageView'
  | 'ViewContent'
  | 'AddToCart'
  | 'InitiateCheckout'
  | 'CompleteRegistration'
  | 'AddPaymentInfo'
  | 'Purchase';

export type GiftStepEvent =
  | 'GiftStart'
  | 'GiftPathChosen'
  | 'GiftDetails'
  | 'GiftSignupPrompt'
  | 'GiftCustomize';

export type MetaCustomEvent = 'PreRegister' | 'ResumeBox' | 'BoxBuilt' | GiftStepEvent;

export type MetaEventParams = {
  value?: number;
  currency?: string;
  content_name?: string;
  content_ids?: string[];
  content_type?: 'product' | 'product_group';
  num_items?: number;
  order_id?: string;
};

/** Browser context forwarded to callables so CAPI events match and dedupe. */
export type MetaServerContext = {
  skip?: boolean;
  eventId?: string;
  fbp?: string;
  fbc?: string;
  url?: string;
};

type Fbq = (
  command: 'trackSingle' | 'trackSingleCustom',
  pixelId: string,
  event: string,
  params?: Record<string, unknown>,
  options?: { eventID?: string }
) => void;

declare global {
  interface Window {
    fbq?: Fbq;
  }
}

function debugEnabled(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

/** Admin previews, visitor playthroughs, ops accounts, and localhost stay out of the ad dataset. */
export function metaTrackingSuppressed(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return true;
  if (useMockFlowStore.getState().active) return true;
  if (debugEnabled()) return false;
  if (useUserStatePreviewStore.getState().preview !== null) return true;
  if (useDevPreviewStore.getState().enabled) return true;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return true;
  const user = auth?.currentUser;
  if (user) {
    if (isAdminEmail(user.email)) return true;
    if (user.providerData.some((p) => isAdminEmail(p.email))) return true;
  }
  return false;
}

/** Deterministic ids shared with functions/src (Conversions API) so Meta dedupes browser + server. */
export const metaEventIds = {
  purchase: (orderId: string) => `purchase_${orderId}`,
  giftPurchase: (giftInviteId: string) => `purchase_gift_${giftInviteId}`,
  addPaymentInfo: (setupIntentId: string) => `payment_${setupIntentId}`,
};

export function newMetaEventId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand}`;
}

// `track` drops every PageView after the first per page load (SPA routes included);
// `trackSingle` has no such dedup.
function send(
  command: 'trackSingle' | 'trackSingleCustom',
  eventName: string,
  params: MetaEventParams | undefined,
  eventId: string
): string | null {
  const suppressed = metaTrackingSuppressed();
  setGaDisabled(suppressed);
  if (suppressed) return null;
  trackGaForMetaEvent(eventName as MetaStandardEvent | MetaCustomEvent, params);
  const fbq = window.fbq;
  if (typeof fbq !== 'function') return null;
  try {
    fbq(
      command,
      META_PIXEL_ID,
      eventName,
      { ...params, content_category: CONTENT_CATEGORY },
      { eventID: eventId }
    );
    return eventId;
  } catch {
    return null;
  }
}

/**
 * Fire a standard Meta event. Pass a deterministic `eventId` (e.g. `purchase_<orderId>`)
 * when the server sends the same event via CAPI so Meta dedupes the pair.
 */
export function trackMeta(
  eventName: MetaStandardEvent,
  params?: MetaEventParams,
  eventId: string = newMetaEventId(eventName.toLowerCase())
): string | null {
  return send('trackSingle', eventName, params, eventId);
}

export function trackMetaCustom(
  eventName: MetaCustomEvent,
  params?: MetaEventParams,
  eventId: string = newMetaEventId(eventName.toLowerCase())
): string | null {
  return send('trackSingleCustom', eventName, params, eventId);
}

/** ViewContent / AddToCart for one catalog item (browser only). */
export function trackMetaProduct(
  eventName: 'ViewContent' | 'AddToCart',
  item: { id: string; name?: string; priceCents?: number | null }
): void {
  trackMeta(eventName, {
    content_ids: [item.id],
    content_type: 'product',
    ...(item.name ? { content_name: item.name } : {}),
    ...(typeof item.priceCents === 'number' ? { value: item.priceCents / 100, currency: 'USD' } : {}),
  });
}

/** `{ skip: true }` for suppressed sessions so the server drops its CAPI copy too. */
export function metaServerContext(eventId?: string): MetaServerContext {
  if (metaTrackingSuppressed()) return { skip: true };
  const ctx: MetaServerContext = { url: window.location.href.slice(0, 500) };
  if (eventId) ctx.eventId = eventId;
  const fbp = readFbp();
  const fbc = readFbc();
  if (fbp) ctx.fbp = fbp;
  if (fbc) ctx.fbc = fbc;
  return ctx;
}

export function attributionForServer(): AttributionSnapshot | undefined {
  if (Platform.OS !== 'web' || useMockFlowStore.getState().active) return undefined;
  return readAttributionSnapshot() ?? undefined;
}
