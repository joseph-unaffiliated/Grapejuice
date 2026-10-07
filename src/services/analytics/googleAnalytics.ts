import { Platform } from 'react-native';
import type { MetaCustomEvent, MetaEventParams, MetaStandardEvent } from './metaPixel';

/** GA4 property. Keep in sync with public/index.html (gtag stub + loader). */
export const GA_MEASUREMENT_ID = 'G-217ZZMLJSE';

type Gtag = (command: 'event', eventName: string, params?: Record<string, unknown>) => void;

declare global {
  interface Window {
    gtag?: Gtag;
  }
}

/**
 * GA honors `window['ga-disable-<id>']` per hit, including its own automatic SPA
 * page views — set it before navigation so suppressed sessions send nothing.
 */
export function setGaDisabled(disabled: boolean): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  (window as unknown as Record<string, unknown>)[`ga-disable-${GA_MEASUREMENT_ID}`] = disabled;
}

/** Meta event → GA4 recommended event. PageView is omitted (GA tracks history changes itself). */
const GA_EVENT_FOR_META: Partial<Record<MetaStandardEvent | MetaCustomEvent, string>> = {
  ViewContent: 'view_item',
  AddToCart: 'add_to_cart',
  InitiateCheckout: 'begin_checkout',
  AddPaymentInfo: 'add_payment_info',
  Purchase: 'purchase',
  CompleteRegistration: 'sign_up',
  PreRegister: 'generate_lead',
  /** Guest box restored from a Retention recovery email (ResumeLinkEffect). */
  ResumeBox: 'resume_box',
  /** Box builder quiz produced a curated box (OnboardingStack). */
  BoxBuilt: 'box_built',
  /** Gift funnel (giftFunnel.ts) — payment steps reuse begin_checkout / purchase. */
  /** `/gift` landing page. */
  GiftPageView: 'gift_page_view',
  GiftStart: 'gift_start',
  GiftPathChosen: 'gift_path_chosen',
  GiftDetails: 'gift_details',
  GiftSignupPrompt: 'gift_signup_prompt',
  GiftCustomize: 'gift_customize',
  /** Gift paid; fires alongside the gift Purchase so Meta can optimize on gifts only. */
  GiftSent: 'gift_sent',
};

function gaParamsFromMeta(params: MetaEventParams | undefined): Record<string, unknown> {
  if (!params) return {};
  const out: Record<string, unknown> = {};
  if (typeof params.value === 'number') {
    out.value = params.value;
    out.currency = params.currency ?? 'USD';
  }
  if (params.order_id) out.transaction_id = params.order_id;
  const ids = params.content_ids ?? [];
  if (ids.length) {
    out.items = ids.map((id) => ({
      item_id: id,
      ...(ids.length === 1 && params.content_name ? { item_name: params.content_name } : null),
    }));
  } else if (params.content_name) {
    out.items = [{ item_name: params.content_name }];
  }
  return out;
}

/** Mirror a Meta browser event to GA4. Caller decides suppression. */
export function trackGaForMetaEvent(
  eventName: MetaStandardEvent | MetaCustomEvent,
  params?: MetaEventParams
): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const gaEvent = GA_EVENT_FOR_META[eventName];
  const gtag = window.gtag;
  if (!gaEvent || typeof gtag !== 'function') return;
  try {
    gtag('event', gaEvent, gaParamsFromMeta(params));
  } catch {
    // Analytics must never break the app.
  }
}
