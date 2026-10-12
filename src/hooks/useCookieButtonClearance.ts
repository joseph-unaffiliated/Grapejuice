import { useCallback, useEffect, useRef } from 'react';
import { Platform, type LayoutChangeEvent } from 'react-native';

const BODY_CLASS = 'gj-bottom-bar';
/** Checkout only: keep the cookie button visible in the slot above the bar. */
const GAP_CLASS = 'gj-cookie-gap';
const HEIGHT_VAR = '--gj-bottom-bar-h';

/** Space between the top of the white bar and the bottom of the cookie button. */
export const COOKIE_GAP_ABOVE_BAR_PX = 16;

/**
 * OneTrust's floating button stylesheet uses two IDs and !important, which beats the
 * lift rule in public/index.html. An inline important bottom is the offset that sticks.
 */
const COOKIE_BUTTON_SELECTOR = '#ot-sdk-btn-floating, .ot-floating-button';

type Options = {
  /**
   * Checkout: pin the cookie in the reserved gap above the bar.
   * Other bars keep the phone hide-when-covered behavior.
   */
  reserveGap?: boolean;
};

function cookieButtons(): HTMLElement[] {
  if (typeof document === 'undefined') return [];
  const out: HTMLElement[] = [];
  document.querySelectorAll(COOKIE_BUTTON_SELECTOR).forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.closest('#onetrust-banner-sdk, #onetrust-pc-sdk')) return;
    out.push(node);
  });
  return out;
}

function pinCookieAboveBar(bottomPx: number) {
  const bottom = `${bottomPx}px`;
  for (const el of cookieButtons()) {
    if (el.style.getPropertyValue('bottom') !== bottom || el.style.getPropertyPriority('bottom') !== 'important') {
      el.style.setProperty('bottom', bottom, 'important');
    }
    // Under the white bar (z-index 40) so a short measure can't cover the black CTA,
    // and still above the page so the part in the gap stays tappable.
    if (el.style.getPropertyValue('z-index') !== '35') {
      el.style.setProperty('z-index', '35', 'important');
    }
  }
}

function clearCookiePin() {
  for (const el of cookieButtons()) {
    el.style.removeProperty('bottom');
    el.style.removeProperty('z-index');
  }
}

/**
 * Web: while a full-width bottom bar is showing, lift OneTrust's floating cookie-settings
 * button above it (CSS in public/index.html). Attach the returned handler to the bar's onLayout.
 * `reserveGap` (checkout) keeps the button in the slot reserved above that bar.
 */
export function useCookieButtonClearance(
  active: boolean,
  options?: Options
): (event: LayoutChangeEvent) => void {
  const reserveGap = options?.reserveGap === true;
  const heightRef = useRef(0);

  const apply = useCallback(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !active) return;
    const height = heightRef.current;
    if (height > 0) document.body.style.setProperty(HEIGHT_VAR, `${height}px`);
    if (reserveGap && height > 0) pinCookieAboveBar(height + COOKIE_GAP_ABOVE_BAR_PX);
  }, [active, reserveGap]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !active) return;
    const body = document.body;
    body.classList.add(BODY_CLASS);
    if (reserveGap) body.classList.add(GAP_CLASS);
    if (reserveGap && heightRef.current === 0) {
      // Stacked checkout bar is taller than the 96px CSS fallback; onLayout replaces this.
      heightRef.current = 128;
    }
    apply();
    const observer = reserveGap
      ? new MutationObserver(() => apply())
      : null;
    observer?.observe(body, { childList: true, subtree: true });
    const interval = reserveGap ? window.setInterval(apply, 500) : 0;
    return () => {
      observer?.disconnect();
      if (interval) window.clearInterval(interval);
      body.classList.remove(BODY_CLASS);
      body.classList.remove(GAP_CLASS);
      body.style.removeProperty(HEIGHT_VAR);
      if (reserveGap) clearCookiePin();
    };
  }, [active, reserveGap, apply]);

  return useCallback(
    (event: LayoutChangeEvent) => {
      if (Platform.OS !== 'web' || typeof document === 'undefined' || !active) return;
      const height = Math.ceil(event.nativeEvent.layout.height);
      if (height > 0) heightRef.current = height;
      apply();
    },
    [active, apply]
  );
}
