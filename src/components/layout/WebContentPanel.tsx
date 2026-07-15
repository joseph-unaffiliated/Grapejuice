import React, { type ReactNode } from 'react';
import { View, StyleSheet, Platform, type ViewStyle } from 'react-native';
import { useWebLayout } from '../../hooks/useWebLayout';
import { spacing, MOBILE_GUTTER, LAYOUT } from '../../constants/theme';

type Props = {
  children: ReactNode;
  style?: ViewStyle;
  /** Use the wider panel (My Box, checkout). */
  wide?: boolean;
  /** Skip horizontal padding (e.g. full-bleed carousels inside). */
  flush?: boolean;
  /** Apply Figma 24px horizontal gutter on phone / mobile web. */
  gutter?: boolean;
  /** Drop desktop top padding when a full-bleed bar sits above this panel (e.g. Home header). */
  omitDesktopTopPadding?: boolean;
  /** Center the content panel horizontally on desktop web. */
  centerDesktop?: boolean;
  desktopContentMaxWidth?: number;
};

/** Constrains main content to a readable panel on desktop web. */
export function WebContentPanel({
  children,
  style,
  wide = false,
  flush = false,
  gutter = false,
  omitDesktopTopPadding = false,
  centerDesktop = false,
  desktopContentMaxWidth,
}: Props) {
  const { isDesktop, contentMaxWidth, widePanelMaxWidth } = useWebLayout();
  const maxWidth = desktopContentMaxWidth ?? (wide ? widePanelMaxWidth : contentMaxWidth);

  if (Platform.OS !== 'web' || !isDesktop) {
    return (
      <View style={[styles.native, gutter && styles.nativeGutter, style]}>{children}</View>
    );
  }

  if (centerDesktop) {
    return (
      <View
        style={[
          styles.desktopOuter,
          flush && styles.desktopOuterFlush,
          omitDesktopTopPadding && styles.desktopOuterNoTopPad,
          styles.desktopOuterCentered,
          style,
        ]}
      >
        <View style={styles.desktopFullWidthHost}>{children}</View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.desktopOuter,
        flush && styles.desktopOuterFlush,
        omitDesktopTopPadding && styles.desktopOuterNoTopPad,
        centerDesktop && styles.desktopOuterCentered,
        style,
      ]}
    >
      <View
        style={[
          styles.desktopPanel,
          centerDesktop && styles.desktopPanelCentered,
          { maxWidth, width: '100%' },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  native: { flex: 1, width: '100%', overflow: 'visible' as const },
  nativeGutter: { paddingHorizontal: MOBILE_GUTTER },
  desktopOuter: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    alignItems: 'flex-start',
  },
  desktopOuterFlush: {
    paddingHorizontal: spacing.lg,
  },
  desktopOuterNoTopPad: {
    paddingTop: 0,
  },
  desktopOuterCentered: {
    alignItems: 'center',
    paddingHorizontal: LAYOUT.WEB_CONTENT_GUTTER,
    overflow: 'visible' as const,
  },
  desktopPanelCentered: {
    alignSelf: 'center',
  },
  /** Full-width scroll host when content is centered inside screen scroll views. */
  desktopFullWidthHost: {
    flex: 1,
    width: '100%',
    minWidth: 0,
    minHeight: 0,
    alignSelf: 'stretch',
    overflow: 'visible' as const,
  },
  desktopPanel: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: 'visible' as const,
  },
});
