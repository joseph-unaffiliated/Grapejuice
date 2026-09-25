import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  freeShippingPromoLine,
  guestBoxSecurePromoLine,
} from '../../constants/hanukkahBoxLock';
import { getHanukkahConfig, peekHanukkahConfig } from '../../services/firestore/config';
import { useStorefrontHomeMode } from '../../hooks/useStorefrontHomeMode';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import {
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

/** Centered promo line; wraps as one unit if the viewport is too narrow. */
export function StorefrontPromoStrip() {
  const insets = useSafeAreaInsets();
  // Seed from cache so remounts (tablet Rav dock swaps chrome trees) don't flash fallback copy.
  const cached = peekHanukkahConfig();
  const [lockAt, setLockAt] = useState<string | null>(cached?.lockAt ?? null);
  const [startsOn, setStartsOn] = useState<string | null>(cached?.startsOn ?? null);
  const [estimatedDeliveryBy, setEstimatedDeliveryBy] = useState<string | null>(
    cached?.estimatedDeliveryBy ?? null
  );
  const mode = useStorefrontHomeMode(lockAt, startsOn);
  const startAuthFromGuest = useAuthFlowStore((s) => s.startAuthFromGuest);
  const isGuestBox = mode === 'guest_box';
  const paddingTop =
    Platform.OS === 'web'
      ? // Prefer CSS env so iPhone Safari notch clearance works even if RN insets lag.
        (`max(${spacing.sm}px, env(safe-area-inset-top, 0px))` as unknown as number)
      : spacing.sm + insets.top;

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

  const promo = isGuestBox
    ? guestBoxSecurePromoLine(lockAt)
    : freeShippingPromoLine(estimatedDeliveryBy, startsOn);

  const content = <Text style={styles.line}>{promo}</Text>;

  return (
    <View style={[styles.root, { paddingTop }]}>
      {isGuestBox ? (
        <Pressable
          onPress={() => startAuthFromGuest('MyBox', 'signup', 'SignUp')}
          accessibilityRole="button"
          accessibilityLabel="Create an account to secure the items in your box"
          style={({ pressed }) => [pressed && styles.pressed]}
        >
          {content}
        </Pressable>
      ) : (
        content
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: semanticColors.accentCream,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.border,
  },
  pressed: {
    opacity: 0.75,
  },
  line: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
    textAlign: 'center',
  },
});
