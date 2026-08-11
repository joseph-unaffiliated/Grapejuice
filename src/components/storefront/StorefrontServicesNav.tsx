import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import {
  boxLockChipLabel,
  HANUKKAH_BOX_LOCK_YEAR_LABEL,
} from '../../constants/hanukkahBoxLock';
import { STOREFRONT_H_SCROLL_CLASS } from './storefrontScroll';
import {
  borderRadius,
  LAYOUT,
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

export type StorefrontServiceId = 'shop' | 'box' | 'passover' | 'story';

type Props = {
  onPress: (id: StorefrontServiceId) => void;
};

/** Desktop/tablet only — mobile uses the hamburger side menu instead. */
export function StorefrontServicesNav({ onPress }: Props) {
  const { width } = useWindowDimensions();
  const compact = width < LAYOUT.BREAKPOINT_TABLET;
  const lockLabel = useMemo(() => boxLockChipLabel(), []);

  if (compact) return null;

  return (
    <View style={styles.root}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        // @ts-expect-error web className
        className={Platform.OS === 'web' ? STOREFRONT_H_SCROLL_CLASS : undefined}
      >
        <TouchableOpacity
          style={styles.linkHit}
          onPress={() => onPress('shop')}
          accessibilityRole="button"
          accessibilityLabel="Shop"
        >
          <Text style={styles.link}>Shop</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.lockGroup}
          onPress={() => onPress('box')}
          accessibilityRole="button"
          accessibilityLabel={`${HANUKKAH_BOX_LOCK_YEAR_LABEL}, ${lockLabel}`}
        >
          <Text style={styles.lockYear}>{HANUKKAH_BOX_LOCK_YEAR_LABEL}</Text>
          <View style={styles.lockChip}>
            <Text style={styles.lockChipText}>{lockLabel}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkHit}
          onPress={() => onPress('passover')}
          accessibilityRole="button"
          accessibilityLabel="2027 Passover"
        >
          <Text style={styles.link}>2027 Passover</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkHit}
          onPress={() => onPress('story')}
          accessibilityRole="button"
          accessibilityLabel="Our story"
        >
          <Text style={styles.link}>Our story</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.border,
    backgroundColor: semanticColors.bgDark,
  },
  row: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: MOBILE_GUTTER,
    paddingVertical: spacing.sm,
  },
  lockGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 0,
  },
  lockYear: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
    flexShrink: 0,
  },
  lockChip: {
    backgroundColor: semanticColors.accentCream,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.brand,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    flexShrink: 0,
  },
  lockChipText: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.goldMuted,
  },
  linkHit: {
    flexShrink: 0,
  },
  link: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textSecondary,
  },
});
