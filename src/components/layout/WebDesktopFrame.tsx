import React, { type ReactNode } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebSidebarProvider, useWebSidebar } from '../../context/WebSidebarContext';
import { useWebLayout } from '../../hooks/useWebLayout';
import { WebDesktopNav } from './WebDesktopNav';
import { semanticColors } from '../../constants/theme';

type Props = {
  children: ReactNode;
};

function DesktopShell({ children }: Props) {
  const { collapsed, toggleCollapsed } = useWebSidebar()!;

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
  mainArea: {
    flex: 1,
    minWidth: 0,
    /** Required so My Box / Home ScrollViews stay viewport-bound (not content-tall). */
    minHeight: 0,
    backgroundColor: semanticColors.bgPrimary,
    overflow: 'hidden' as const,
  },
});
