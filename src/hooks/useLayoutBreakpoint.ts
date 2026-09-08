import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { LAYOUT } from '../constants/theme';

/**
 * Layout viewport width for breakpoint decisions.
 *
 * On web, prefer `window.innerWidth` / `documentElement.clientWidth` over RN’s
 * `visualViewport`-based Dimensions — pinch-zoom and some embedded browsers
 * under-report visualViewport and incorrectly flip the storefront into “mobile”.
 */
export function readLayoutViewportWidth(fallback = 0): number {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return fallback;
  }
  const fromInner = window.innerWidth;
  const fromDoc = document.documentElement?.clientWidth ?? 0;
  const w = fromInner || fromDoc || fallback;
  return Math.round(w);
}

export function useLayoutBreakpoint() {
  const { width: dimWidth, height } = useWindowDimensions();
  const [width, setWidth] = useState(() => readLayoutViewportWidth(dimWidth));

  useEffect(() => {
    const sync = () => setWidth(readLayoutViewportWidth(dimWidth));
    sync();
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    window.addEventListener('resize', sync);
    window.visualViewport?.addEventListener('resize', sync);
    return () => {
      window.removeEventListener('resize', sync);
      window.visualViewport?.removeEventListener('resize', sync);
    };
  }, [dimWidth]);

  const isCompact = width < LAYOUT.BREAKPOINT_TABLET;
  const isTabletUp = width >= LAYOUT.BREAKPOINT_TABLET;
  const isDesktop = width >= LAYOUT.BREAKPOINT_DESKTOP;

  return {
    width,
    height,
    /** Phone / narrow web — hamburger chrome, stacked heroes, etc. */
    isCompact,
    isTabletUp,
    isDesktop,
  };
}
