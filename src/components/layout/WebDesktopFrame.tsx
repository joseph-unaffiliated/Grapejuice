import React, { type ReactNode } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useWebLayout } from '../../hooks/useWebLayout';
import { WebDesktopNav } from './WebDesktopNav';
import { semanticColors } from '../../constants/theme';

type Props = {
  children: ReactNode;
};

/** Full-width web shell: left nav rail + main content area on tablet/desktop. */
export function WebDesktopFrame({ children }: Props) {
  const { isDesktop, sidebarWidth } = useWebLayout();

  if (Platform.OS !== 'web' || !isDesktop) {
    return <View style={styles.nativeRoot}>{children}</View>;
  }

  return (
    <View style={styles.desktopRoot}>
      <WebDesktopNav width={sidebarWidth} />
      <View style={styles.mainArea}>{children}</View>
    </View>
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
    backgroundColor: semanticColors.bgPrimary,
  },
});
