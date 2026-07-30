import React, { useEffect, type ReactNode } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useNavigationState } from '@react-navigation/native';
import type { NavigationState, PartialState } from '@react-navigation/native';
import { WebSidebarProvider, useWebSidebar } from '../../context/WebSidebarContext';
import { useWebLayout } from '../../hooks/useWebLayout';
import { WebDesktopNav } from './WebDesktopNav';
import { LAYOUT, semanticColors } from '../../constants/theme';

type Props = {
  children: ReactNode;
};

const STOREFRONT_ROUTES = new Set([
  'StorefrontHome',
  'StorefrontCategory',
  'CatalogProduct',
]);

function leafRouteName(
  state: NavigationState | PartialState<NavigationState> | undefined
): string | undefined {
  if (!state?.routes?.length) return undefined;
  const index = state.index ?? 0;
  const route = state.routes[index];
  if (!route) return undefined;
  if (route.state) return leafRouteName(route.state);
  return route.name;
}

function useHideDesktopSidebar(): boolean {
  return useNavigationState((state) => STOREFRONT_ROUTES.has(leafRouteName(state) ?? ''));
}

function DesktopShell({ children }: Props) {
  const hideSidebar = useHideDesktopSidebar();
  const { collapsed, toggleCollapsed, setLayoutSidebarWidth } = useWebSidebar()!;

  useEffect(() => {
    if (hideSidebar) {
      setLayoutSidebarWidth(0);
      return;
    }
    setLayoutSidebarWidth(
      collapsed ? LAYOUT.WEB_SIDEBAR_COLLAPSED_WIDTH : LAYOUT.WEB_SIDEBAR_WIDTH
    );
  }, [hideSidebar, collapsed, setLayoutSidebarWidth]);

  if (hideSidebar) {
    return (
      <View style={styles.desktopRootFull}>
        <View style={styles.mainAreaFull}>{children}</View>
      </View>
    );
  }

  return (
    <View style={styles.desktopRoot}>
      <WebDesktopNav collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      <View style={styles.mainArea}>{children}</View>
    </View>
  );
}

/** Full-width web shell: left nav rail + main content area on tablet/desktop. */
export function WebDesktopFrame({ children }: Props) {
  const { isDesktop } = useWebLayout();

  if (Platform.OS !== 'web' || !isDesktop) {
    return <View style={styles.nativeRoot}>{children}</View>;
  }

  return (
    <WebSidebarProvider>
      <DesktopShell>{children}</DesktopShell>
    </WebSidebarProvider>
  );
}

const styles = StyleSheet.create({
  nativeRoot: { flex: 1, backgroundColor: semanticColors.bgPrimary },
  desktopRoot: {
    flex: 1,
    flexDirection: 'row',
    width: '100%',
    minHeight: '100%',
    backgroundColor: semanticColors.accentCream,
  },
  desktopRootFull: {
    flex: 1,
    width: '100%',
    minHeight: '100%',
    backgroundColor: semanticColors.bgPrimary,
  },
  mainArea: {
    flex: 1,
    minWidth: 0,
    backgroundColor: semanticColors.bgPrimary,
    overflow: 'visible' as const,
  },
  mainAreaFull: {
    flex: 1,
    minWidth: 0,
    width: '100%',
    backgroundColor: semanticColors.bgPrimary,
    overflow: 'visible' as const,
  },
});
