import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, Platform } from 'react-native';
import { daysToBoxLock } from '../../../constants/hanukkahBoxLock';
import { semanticColors, spacing, typeface } from '../../../constants/theme';

const AUTO_DISMISS_MS = 2000;

export function congratsDaysLine(lockAt?: string | null, now: Date = new Date()): string {
  const days = daysToBoxLock(now, lockAt);
  if (days <= 0) return 'You can still add or swap items in your box today';
  return `You have another ${days} ${days === 1 ? 'day' : 'days'} to add or swap items in your box`;
}

/** Full-screen "Congratulations!" after the box is committed; any tap or 2s → onDone. */
export function CheckoutCongratsOverlay({
  lockAt,
  onDone,
}: {
  lockAt?: string | null;
  onDone: () => void;
}) {
  const doneRef = useRef(false);
  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  useEffect(() => {
    const id = setTimeout(finish, AUTO_DISMISS_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Pressable
      style={styles.overlay}
      onPress={finish}
      accessibilityRole="button"
      accessibilityLabel="Go to My Box"
    >
      <View style={styles.inner}>
        <Text style={styles.title} accessibilityRole="header">
          Congratulations!
        </Text>
        <Text style={styles.body}>{congratsDaysLine(lockAt)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    ...(Platform.OS === 'web' ? ({ position: 'fixed', cursor: 'pointer' } as object) : null),
    zIndex: 3000,
    backgroundColor: semanticColors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  inner: { maxWidth: 520, alignItems: 'center' },
  title: {
    ...typeface('medium'),
    fontSize: 40,
    lineHeight: 48,
    letterSpacing: -0.6,
    color: semanticColors.textPrimary,
    textAlign: 'center',
  },
  body: {
    ...typeface('regular'),
    fontSize: 18,
    lineHeight: 26,
    color: semanticColors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    ...(Platform.OS === 'web' ? ({ textWrap: 'balance' } as object) : null),
  },
});
