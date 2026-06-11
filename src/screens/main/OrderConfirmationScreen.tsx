import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSession } from '../../hooks/useSession';
import { ordersService } from '../../services/firestore/orders';
import { formatDollars } from '../../services/box/buildDefaultBox';
import type { PilotOrder } from '../../types/pilot';
import type { MainStackParamList } from '../../navigation/types';
import { semanticColors, spacing, typography, borderRadius } from '../../constants/theme';
import { useWebScreenFrame } from '../../constants/webLayout';

export function OrderConfirmationScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'OrderConfirmation'>>();
  const { household } = useSession();
  const webFrame = useWebScreenFrame();
  const [order, setOrder] = useState<PilotOrder | null>(null);

  useEffect(() => {
    if (!household?.id) return;
    const { orderId } = route.params;
    return ordersService.subscribe(household.id, orderId, setOrder);
  }, [household?.id, route.params.orderId]);

  const confirmed =
    order?.status === 'committed' ||
    order?.status === 'confirmed' ||
    order?.status === 'shipped' ||
    order?.status === 'delivered';
  const pending = order?.status === 'pending';
  const committed = order?.status === 'committed';

  return (
    <View style={[styles.root, webFrame]}>
      {order ? (
        <>
          {pending ? (
            <>
              <ActivityIndicator size="large" color={semanticColors.brand} style={styles.spinner} />
              <Text style={styles.title}>Confirming your order…</Text>
              <Text style={styles.subtitle}>
                This usually takes a few seconds. We&apos;ll email you when it&apos;s confirmed.
              </Text>
            </>
          ) : confirmed ? (
            <>
              <Text style={styles.emoji}>{committed ? '✓' : '✓'}</Text>
              <Text style={styles.title}>
                {committed ? 'Your box is committed.' : 'Your Hanukkah box is on its way.'}
              </Text>
              <Text style={styles.subtitle}>
                {committed
                  ? "You won't be charged until your box ships. Keep customizing until the lock date."
                  : "We'll send a tracking link when it ships."}
              </Text>
              {order.estimatedDelivery ? (
                <Text style={styles.delivery}>
                  Estimated delivery by {order.estimatedDelivery}
                </Text>
              ) : null}
              <View style={styles.previewBox}>
                <Text style={styles.previewTitle}>When it arrives</Text>
                <Text style={styles.body}>
                  Open candles, lyric sheet, and parent guide right away. Keep gelt and gifts in the
                  small hold-back set for night-of surprises.
                </Text>
                <Text style={styles.body}>
                  Keep hanukkiah, dreidels, and binders — use up candles, treats, and wrapping paper.
                  We&apos;ll send more next year.
                </Text>
              </View>
            </>
          ) : (
            <Text style={styles.title}>Order status: {order.status}</Text>
          )}
        </>
      ) : (
        <ActivityIndicator size="large" color={semanticColors.brand} />
      )}

      <TouchableOpacity
        style={styles.cta}
        onPress={() => navigation.navigate('MainTabs', { screen: 'Account' } as never)}
      >
        <Text style={styles.ctaText}>View in Account</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate('MainTabs')}>
        <Text style={styles.link}>Back to Home</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: semanticColors.bgPrimary,
    padding: spacing.lg,
    paddingTop: spacing.xxl * 2,
    alignItems: 'center',
  },
  spinner: { marginBottom: spacing.lg },
  emoji: {
    fontSize: 48,
    color: semanticColors.brand,
    marginBottom: spacing.md,
  },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center' },
  subtitle: {
    fontSize: typography.lg,
    color: semanticColors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  delivery: {
    fontSize: typography.lg,
    fontWeight: '600',
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  previewBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: semanticColors.accentCream,
    maxWidth: 360,
  },
  previewTitle: { fontWeight: '700', fontSize: typography.lg, marginBottom: spacing.xs, textAlign: 'center' },
  body: {
    fontSize: typography.md,
    color: semanticColors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  cta: {
    backgroundColor: semanticColors.brand,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    marginTop: spacing.xxl,
  },
  ctaText: { color: semanticColors.textInverse, fontWeight: '700', fontSize: typography.lg },
  link: { marginTop: spacing.lg, color: semanticColors.brand, fontWeight: '600' },
});
