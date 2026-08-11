import React, { type ReactNode } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useWebLayout } from '../../hooks/useWebLayout';
import { semanticColors } from '../../constants/theme';

type Props = {
  children: ReactNode;
};

/**
 * Web shell for MainStack. The legacy left sidebar is retired — storefront and
 * app screens share a full-width content area on desktop.
 */
export function WebDesktopFrame({ children }: Props) {
  const { isDesktop } = useWebLayout();

  if (Platform.OS !== 'web' || !isDesktop) {
    return <View style={styles.nativeRoot}>{children}</View>;
  }

  return (
    <View style={styles.desktopRootFull}>
      <View style={styles.mainAreaFull}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  nativeRoot: { flex: 1, backgroundColor: semanticColors.bgPrimary },
  desktopRootFull: {
    flex: 1,
    width: '100%',
    minHeight: '100%',
    backgroundColor: semanticColors.bgPrimary,
  },
  mainAreaFull: {
    flex: 1,
    minWidth: 0,
    width: '100%',
    backgroundColor: semanticColors.bgPrimary,
    overflow: 'visible' as const,
  },
});
