import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { STOREFRONT_CATEGORIES } from '../../constants/storefrontCategories';
import { STOREFRONT_H_SCROLL_CLASS } from './storefrontScroll';
import {
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

type Props = {
  activeSlug?: string;
  onPress: (slug: string) => void;
};

export function StorefrontCategoryNav({ activeSlug, onPress }: Props) {
  return (
    <View style={styles.root}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        // @ts-expect-error web className
        className={Platform.OS === 'web' ? STOREFRONT_H_SCROLL_CLASS : undefined}
      >
        {STOREFRONT_CATEGORIES.map((c) => {
          const active = c.slug === activeSlug;
          return (
            <TouchableOpacity
              key={c.slug}
              style={styles.linkHit}
              onPress={() => onPress(c.slug)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={c.label}
            >
              <Text style={[styles.link, active && styles.linkActive]}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: semanticColors.logoDark,
  },
  row: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing.lg,
    paddingHorizontal: MOBILE_GUTTER,
    paddingVertical: spacing.sm,
  },
  linkHit: {
    flexShrink: 0,
  },
  link: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.textInverse,
    opacity: 0.85,
  },
  linkActive: {
    opacity: 1,
    textDecorationLine: 'underline',
  },
});
