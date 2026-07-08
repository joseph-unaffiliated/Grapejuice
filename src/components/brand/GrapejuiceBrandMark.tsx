import React from 'react';
import { View, Image, StyleSheet, Platform } from 'react-native';

const WORDMARK = require('../../../assets/brand/grapejuice-wordmark.png');
const LOGOMARK = require('../../../assets/brand/grapejuice-logomark.png');

type Props = {
  compact?: boolean;
  markOnly?: boolean;
  /** Figma Rav welcome — compact sidebar wordmark */
  variant?: 'default' | 'footer' | 'sidebar';
  align?: 'left' | 'center';
};

/** Wordmark + grape logomark — Figma Rav welcome header assets. */
export function GrapejuiceBrandMark({
  compact = false,
  markOnly = false,
  variant = 'default',
  align = 'center',
}: Props) {
  const source = markOnly || variant === 'footer' ? LOGOMARK : WORDMARK;
  const size =
    variant === 'footer'
      ? styles.logomarkFooter
      : variant === 'sidebar'
        ? styles.wordmarkSidebar
        : markOnly
        ? compact
          ? styles.logomarkCompact
          : styles.logomark
        : compact
          ? styles.wordmarkCompact
          : styles.wordmark;

  return (
    <View style={[styles.wrap, align === 'left' && styles.wrapLeft]}>
      <Image
        source={source}
        style={[size, Platform.OS === 'web' ? styles.crisp : null]}
        resizeMode="contain"
        accessibilityLabel="Grapejuice"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  wrapLeft: { alignItems: 'flex-start', alignSelf: 'flex-start' },
  wordmark: { width: 75, height: 59 },
  wordmarkCompact: { width: 61, height: 56 },
  wordmarkSidebar: { width: 16, height: 14.5 },
  logomark: { width: 30, height: 28 },
  logomarkCompact: { width: 24, height: 22 },
  /** Figma 366:1375 — 16×14.5pt display from 48×44 @3x asset */
  logomarkFooter: { width: 16, height: 15 },
  crisp: Platform.OS === 'web' ? ({ imageRendering: 'crisp-edges' } as object) : {},
});
