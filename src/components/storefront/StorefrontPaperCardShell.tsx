import React, { type ReactNode } from 'react';
import {
  View,
  StyleSheet,
  Platform,
  ImageBackground,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { borderRadius, MOBILE_GUTTER, spacing } from '../../constants/theme';

/** Same cold-press paper as Ask Rav / Our Story / PaperCardStrip. */
const PAPER_BG = require('../../../assets/storefront/cold-press-toothy.jpg');

type Props = {
  children: ReactNode;
  /** Merged onto the outer maxWidth wrapper. */
  style?: StyleProp<ViewStyle>;
  /** Merged onto the centered content column. */
  contentStyle?: StyleProp<ViewStyle>;
  /** Inner content max width (default 640, matching Ask Rav / PaperCard). */
  contentMaxWidth?: number;
  /**
   * Tighter top/bottom padding on the paper ImageBackground (spacing.md / 20).
   * Default keeps spacing.xxxl / 72 for Ask Rav / Our Story / Passover home strip.
   */
  compactVerticalPadding?: boolean;
  /** Allow absolute children (e.g. belief hover tooltips) to paint outside the paper. */
  overflowVisible?: boolean;
};

/**
 * Cold-press paper mid-band shell — ImageBackground, wash, radius, maxWidth 1024.
 * Content only; no brand mark / CTAs (those stay in PaperCardStrip / Ask Rav).
 */
export function StorefrontPaperCardShell({
  children,
  style,
  contentStyle,
  contentMaxWidth = 640,
  compactVerticalPadding = false,
  overflowVisible = false,
}: Props) {
  return (
    <View style={[styles.outer, style]}>
      <ImageBackground
        source={PAPER_BG}
        style={[
          styles.root,
          compactVerticalPadding ? styles.rootCompactVertical : null,
          overflowVisible ? styles.rootOverflowVisible : null,
        ]}
        imageStyle={styles.bgImage}
        resizeMode="cover"
      >
        <View style={styles.wash} pointerEvents="none" />
        <View style={[styles.inner, { maxWidth: contentMaxWidth }, contentStyle]}>
          {children}
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    maxWidth: 1024,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: MOBILE_GUTTER,
    marginVertical: spacing.md,
  },
  root: {
    paddingHorizontal: MOBILE_GUTTER,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxxl,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: '#F7F6F2',
  },
  rootOverflowVisible: {
    overflow: 'visible',
  },
  rootCompactVertical: {
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  bgImage: {
    width: '100%',
    height: '100%',
    borderRadius: borderRadius.md,
  },
  wash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(251, 248, 239, 0.42)',
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage:
            'linear-gradient(90deg, rgba(216, 201, 144, 0.18) 0%, rgba(255, 255, 255, 0.55) 42%, rgba(255, 255, 255, 0.62) 50%, rgba(255, 255, 255, 0.55) 58%, rgba(216, 201, 144, 0.18) 100%)',
        } as object)
      : null),
  },
  inner: {
    width: '100%',
    alignSelf: 'center',
    alignItems: 'center',
    gap: spacing.md,
    zIndex: 1,
  },
});
