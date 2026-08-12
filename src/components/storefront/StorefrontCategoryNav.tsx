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
          const isSale = c.navStyle === 'sale';
          return (
            <React.Fragment key={c.slug}>
              {c.separatorBefore ? (
                <Text
                  style={styles.separator}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  |
                </Text>
              ) : null}
              <TouchableOpacity
                style={[styles.linkHit, active && styles.linkHitActive]}
                onPress={() => onPress(c.slug)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={c.label}
              >
                <Text
                  style={[
                    styles.link,
                    isSale && styles.linkSale,
                    active && styles.linkActive,
                  ]}
                >
                  {c.label}
                </Text>
              </TouchableOpacity>
            </React.Fragment>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: semanticColors.logoDark,
    // No light/white bottom stroke on the dark secondary bar.
    borderBottomWidth: 0,
    borderTopWidth: 0,
  },
  row: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: MOBILE_GUTTER,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0,
  },
  separator: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.textInverse,
    opacity: 0.35,
    flexShrink: 0,
    // Match linkHit bottom inset so | aligns with category labels.
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  linkHit: {
    flexShrink: 0,
    // Border underline with modest air under label (tighter than StickySectionNav’s 8).
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  linkHitActive: {
    borderBottomColor: semanticColors.brand,
  },
  link: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.textInverse,
    opacity: 0.85,
  },
  linkSale: {
    color: semanticColors.brand,
    opacity: 1,
  },
  linkActive: {
    opacity: 1,
  },
});
