import { Platform, useWindowDimensions } from 'react-native';
import { LAYOUT } from '../constants/theme';
import { getWebContentMaxWidth } from './useEffectiveWindowDimensions';

export type WebLayoutTier = 'native' | 'mobile-web' | 'tablet-web' | 'desktop-web';

export { getWebContentMaxWidth };

export function useWebLayout() {
  const { width, height } = useWindowDimensions();

  if (Platform.OS !== 'web') {
    return {
      tier: 'native' as const,
      windowWidth: width,
      windowHeight: height,
      contentMaxWidth: width,
      widePanelMaxWidth: width,
      layoutWidth: width,
      isDesktop: false,
      isTabletUp: false,
      sidebarWidth: 0,
      mainAreaWidth: width,
      contentColumnOffset: 0,
      sceneInsetLeft: 0,
    };
  }

  const tier: WebLayoutTier =
    width >= LAYOUT.BREAKPOINT_DESKTOP
      ? 'desktop-web'
      : width >= LAYOUT.BREAKPOINT_TABLET
        ? 'tablet-web'
        : 'mobile-web';

  const isTabletUp = width >= LAYOUT.BREAKPOINT_TABLET;
  // Legacy left rail is retired — never reserve sidebar width.
  const sidebarWidth = 0;
  const mainAreaWidth = Math.max(0, width - sidebarWidth);
  const gutter = isTabletUp ? LAYOUT.WEB_CONTENT_GUTTER : 0;
  const contentMaxWidth = Math.min(getWebContentMaxWidth(width), mainAreaWidth - gutter * 2);
  const widePanelMaxWidth = Math.min(LAYOUT.WEB_WIDE_PANEL_MAX_WIDTH, mainAreaWidth - gutter * 2);
  const layoutWidth = isTabletUp ? contentMaxWidth : width;
  const contentColumnOffset = isTabletUp
    ? Math.max(0, (mainAreaWidth - layoutWidth) / 2)
    : 0;

  return {
    tier,
    windowWidth: width,
    windowHeight: height,
    contentMaxWidth,
    widePanelMaxWidth,
    /** Width for cards/carousels inside the content panel. */
    layoutWidth,
    /** Full width of the main area (sidebar retired). */
    mainAreaWidth,
    /** Left inset when a max-width column is centered in the main area. */
    contentColumnOffset,
    isDesktop: isTabletUp,
    isTabletUp,
    sidebarWidth,
    sceneInsetLeft: sidebarWidth,
  };
}
