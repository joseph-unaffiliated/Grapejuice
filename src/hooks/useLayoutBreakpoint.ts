import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { LAYOUT } from '../constants/theme';

/**
 * Layout viewport size for breakpoint / hero decisions.
 *
 * On web, prefer `window.innerWidth` / `innerHeight` (and documentElement)
 * over RN’s `visualViewport`-based Dimensions — pinch-zoom and some embedded
 * browsers under-report visualViewport (wrong “mobile” breakpoint) and the
 * first Dimensions height can be 0, which makes the hero jump after hydrate.
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

export function readLayoutViewportHeight(fallback = 0): number {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return fallback;
  }
  const fromInner = window.innerHeight;
  const fromDoc = document.documentElement?.clientHeight ?? 0;
  const h = fromInner || fromDoc || fallback;
  return Math.round(h);
}

export function useLayoutBreakpoint() {
  const { width: dimWidth, height: dimHeight } = useWindowDimensions();
  const [width, setWidth] = useState(() => readLayoutViewportWidth(dimWidth));
  const [height, setHeight] = useState(() =>
    readLayoutViewportHeight(dimHeight)
  );

  useEffect(() => {
    const sync = () => {
      setWidth(readLayoutViewportWidth(dimWidth));
      setHeight(readLayoutViewportHeight(dimHeight));
    };
    sync();
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    window.addEventListener('resize', sync);
    window.visualViewport?.addEventListener('resize', sync);
    return () => {
      window.removeEventListener('resize', sync);
      window.visualViewport?.removeEventListener('resize', sync);
    };
  }, [dimWidth, dimHeight]);

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
