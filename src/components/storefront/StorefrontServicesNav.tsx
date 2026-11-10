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
  MY_HANUKKAH_BOX_LABEL,
} from '../../constants/hanukkahBoxLock';
import { useStorefrontHomeMode } from '../../hooks/useStorefrontHomeMode';
import { useLayoutBreakpoint } from '../../hooks/useLayoutBreakpoint';
import { shopHasBoxOrder as resolveShopHasBoxOrder, usePreviewNow } from '../../hooks/useUserStatePreview';
import { usePaymentGate } from '../../hooks/usePaymentGate';
import { getHanukkahConfig, peekHanukkahConfig } from '../../services/firestore/config';
import { STOREFRONT_H_SCROLL_CLASS } from './storefrontScroll';
import {
  borderRadius,
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

export type StorefrontServiceId = 'shop' | 'box' | 'gift' | 'story';

type Props = {
  onPress: (id: StorefrontServiceId) => void;
};

/** Desktop/tablet only — mobile uses the hamburger side menu instead. */
export function StorefrontServicesNav({ onPress }: Props) {
  const { isCompact: compact } = useLayoutBreakpoint();
  const cached = peekHanukkahConfig();
  const [lockAt, setLockAt] = useState<string | null>(cached?.lockAt ?? null);
  const [startsOn, setStartsOn] = useState<string | null>(cached?.startsOn ?? null);
  const mode = useStorefrontHomeMode(lockAt, startsOn);
  const now = usePreviewNow();
  const { openOrder } = usePaymentGate();
  const shopHasBoxOrder = resolveShopHasBoxOrder(mode, openOrder);
  /** Cold shop: no box nav. Box holders / pre-lock: show My Hanukkah box. */
  const showBoxNav = mode !== 'passover' && (mode !== 'shop' || shopHasBoxOrder);

  useEffect(() => {
    let cancelled = false;
    getHanukkahConfig().then((config) => {
      if (cancelled) return;
      setLockAt(config.lockAt);
      setStartsOn(config.startsOn);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { yearLabel, chipLabel } = useMemo(() => {
    if (mode === 'shop' || mode === 'locked') {
      return {
        yearLabel: MY_HANUKKAH_BOX_LABEL,
        // Shop: no “Nd to ship” / Nov 21 arrival estimate — box is locked.
        chipLabel: 'Locked',
      };
    }
    return {
      yearLabel: HANUKKAH_BOX_LOCK_YEAR_LABEL,
      chipLabel: boxLockChipLabel(now, lockAt),
    };
  }, [mode, lockAt, now]);

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

        {showBoxNav ? (
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

        {mode !== 'shop' && mode !== 'locked' ? (
          <TouchableOpacity
            style={styles.linkHit}
            onPress={() => onPress('gift')}
            accessibilityRole="button"
            accessibilityLabel="Send a Gift"
          >
            <Text style={styles.link}>Send a Gift</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.linkHit}
          onPress={() => onPress('story')}
          accessibilityRole="button"
          accessibilityLabel="Our Story"
        >
          <Text style={styles.link}>Our Story</Text>
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
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
  },
});
