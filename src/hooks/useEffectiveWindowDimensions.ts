import { Platform, useWindowDimensions } from 'react-native';
import { LAYOUT } from '../constants/theme';

/** Max readable width for a single-column panel at a given viewport. */
export function getWebContentMaxWidth(windowWidth: number): number {
  if (windowWidth >= LAYOUT.BREAKPOINT_DESKTOP) return LAYOUT.WEB_DESKTOP_MAX_WIDTH;
  if (windowWidth >= LAYOUT.BREAKPOINT_TABLET) return LAYOUT.WEB_TABLET_MAX_WIDTH;
  return windowWidth;
}

/**
 * Full window dimensions on web. Use `useWebLayout().layoutWidth` for card/carousel sizing
 * inside the content panel.
 */
export function useEffectiveWindowDimensions() {
  const { width, height } = useWindowDimensions();
  return { width, height };
}
