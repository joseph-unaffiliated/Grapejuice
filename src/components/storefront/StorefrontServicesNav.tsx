import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import {
  boxLockChipLabel,
  HANUKKAH_BOX_LOCK_YEAR_LABEL,
  lockedBoxChipLabel,
  MY_HANUKKAH_BOX_LABEL,
} from '../../constants/hanukkahBoxLock';
import { useStorefrontHomeMode } from '../../hooks/useStorefrontHomeMode';
import { useLayoutBreakpoint } from '../../hooks/useLayoutBreakpoint';
import { usePreviewNow } from '../../hooks/useUserStatePreview';
import { getHanukkahConfig } from '../../services/firestore/config';
import { STOREFRONT_H_SCROLL_CLASS } from './storefrontScroll';
import {
  borderRadius,
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
  const { isCompact: compact } = useLayoutBreakpoint();
  const [lockAt, setLockAt] = useState<string | null>(null);
  const [startsOn, setStartsOn] = useState<string | null>(null);
  const [estimatedDeliveryBy, setEstimatedDeliveryBy] = useState<string | null>(null);
  const mode = useStorefrontHomeMode(lockAt, startsOn);
  const now = usePreviewNow();

  useEffect(() => {
    let cancelled = false;
    getHanukkahConfig().then((config) => {
      if (cancelled) return;
      setLockAt(config.lockAt);
      setStartsOn(config.startsOn);
      setEstimatedDeliveryBy(config.estimatedDeliveryBy);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { yearLabel, chipLabel } = useMemo(() => {
    if (mode === 'locked') {
      return {
        yearLabel: MY_HANUKKAH_BOX_LABEL,
        chipLabel: lockedBoxChipLabel(estimatedDeliveryBy, now),
      };
    }
    return {
      yearLabel: HANUKKAH_BOX_LOCK_YEAR_LABEL,
      chipLabel: boxLockChipLabel(now, lockAt),
    };
  }, [mode, estimatedDeliveryBy, lockAt, now]);

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

        {mode !== 'passover' ? (
          <TouchableOpacity
            style={styles.lockGroup}
            onPress={() => onPress('box')}
            accessibilityRole="button"
            accessibilityLabel={`${yearLabel}, ${chipLabel}`}
          >
            <Text style={styles.lockYear}>{yearLabel}</Text>
            <View style={styles.lockChip}>
              <Text style={styles.lockChipText}>{chipLabel}</Text>
            </View>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.lockGroup}
          onPress={() => onPress('passover')}
          accessibilityRole="button"
          accessibilityLabel="2027 Passover"
        >
          <Text style={styles.lockYear}>2027 Passover</Text>
          <View style={styles.lockChip}>
            <Text style={styles.lockChipText}>Coming soon</Text>
          </View>
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
