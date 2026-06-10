import React, { type ReactNode } from 'react';
import { View, StyleSheet, Platform, type ViewStyle } from 'react-native';
import { useWebLayout } from '../../hooks/useWebLayout';
import { spacing, MOBILE_GUTTER } from '../../constants/theme';

type Props = {
  children: ReactNode;
  style?: ViewStyle;
  /** Use the wider panel (My Box, checkout). */
  wide?: boolean;
  /** Skip horizontal padding (e.g. full-bleed carousels inside). */
  flush?: boolean;
  /** Apply Figma 24px horizontal gutter on phone / mobile web. */
  gutter?: boolean;
};

/** Constrains main content to a readable panel on desktop web. */
export function WebContentPanel({ children, style, wide = false, flush = false, gutter = false }: Props) {
  const { isDesktop, contentMaxWidth, widePanelMaxWidth } = useWebLayout();
  const maxWidth = wide ? widePanelMaxWidth : contentMaxWidth;

  if (Platform.OS !== 'web' || !isDesktop) {
    return (
      <View style={[styles.native, gutter && styles.nativeGutter, style]}>{children}</View>
    );
  }

  return (
    <View style={[styles.desktopOuter, flush && styles.desktopOuterFlush, style]}>
      <View style={[styles.desktopPanel, { maxWidth, width: '100%' }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  native: { flex: 1, width: '100%', overflow: 'visible' as const },
  nativeGutter: { paddingHorizontal: MOBILE_GUTTER },
  desktopOuter: {
    flex: 1,
    width: '100%',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    alignItems: 'flex-start',
  },
  desktopOuterFlush: {
    paddingHorizontal: spacing.lg,
  },
  desktopPanel: {
    flex: 1,
    minWidth: 0,
    overflow: 'visible' as const,
  },
});
