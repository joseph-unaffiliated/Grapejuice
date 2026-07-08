import { Platform, useWindowDimensions } from 'react-native';
import { LAYOUT } from '../constants/theme';
import { getWebContentMaxWidth } from './useEffectiveWindowDimensions';
import { useWebSidebar } from '../context/WebSidebarContext';

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
  const sidebar = useWebSidebar();
  const sidebarWidth = isTabletUp
    ? (sidebar?.sidebarWidth ?? LAYOUT.WEB_SIDEBAR_WIDTH)
    : 0;
  const mainAreaWidth = Math.max(0, width - sidebarWidth);
  const gutter = isTabletUp ? LAYOUT.WEB_CONTENT_GUTTER : 0;
  const contentMaxWidth = Math.min(getWebContentMaxWidth(width), mainAreaWidth - gutter * 2);
  const widePanelMaxWidth = Math.min(LAYOUT.WEB_WIDE_PANEL_MAX_WIDTH, mainAreaWidth - gutter * 2);
  const layoutWidth = isTabletUp ? contentMaxWidth : width;

  return {
    tier,
    windowWidth: width,
    windowHeight: height,
    contentMaxWidth,
    widePanelMaxWidth,
    /** Width for cards/carousels inside the content panel. */
    layoutWidth,
    isDesktop: isTabletUp,
    isTabletUp,
    sidebarWidth,
    sceneInsetLeft: sidebarWidth,
  };
}
