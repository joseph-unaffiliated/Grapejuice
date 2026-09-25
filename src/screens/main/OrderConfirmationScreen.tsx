import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSession } from '../../hooks/useSession';
import { ordersService } from '../../services/firestore/orders';
import type { PilotOrder } from '../../types/pilot';
import type { MainStackParamList } from '../../navigation/types';
import { semanticColors, spacing, typography, borderRadius } from '../../constants/theme';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { useAuthStore } from '../../stores/authStore';
import { retentionTrackOrder } from '../../services/analytics/retention';

export function OrderConfirmationScreen() {
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <OrderConfirmationBody />
    </StorefrontChrome>
  );
}

function OrderConfirmationBody() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'OrderConfirmation'>>();
  const { household, profile } = useSession();
  const authEmail = useAuthStore((s) => s.user?.email ?? null);
  const [order, setOrder] = useState<PilotOrder | null>(null);
  const trackedOrderId = React.useRef<string | null>(null);

  useEffect(() => {
    if (!household?.id) return;
    const { orderId } = route.params;
    return ordersService.subscribe(household.id, orderId, setOrder);
  }, [household?.id, route.params.orderId]);

  useEffect(() => {
    if (!order) return;
    const confirmed =
      order.status === 'committed' ||
      order.status === 'confirmed' ||
      order.status === 'shipped' ||
      order.status === 'delivered';
    if (!confirmed) return;
    if (trackedOrderId.current === order.id) return;
    const email =
      profile?.email?.trim() ||
      authEmail?.trim() ||
      '';
    if (!email) return;
    trackedOrderId.current = order.id;
    retentionTrackOrder({
      orderNumber: order.id,
      orderAmountDollars: Math.max(0, (order.totalCents ?? 0) / 100),
      orderEmail: email,
    });
  }, [order, profile?.email, authEmail]);

  const confirmed =
    order?.status === 'committed' ||
    order?.status === 'confirmed' ||
    order?.status === 'shipped' ||
    order?.status === 'delivered';
  const pending = order?.status === 'pending';
  const committed = order?.status === 'committed';
  const isMarketplace = order?.orderType === 'marketplace';
  const isReceivedGift =
    order?.orderType === 'received_gift' || Boolean(order?.giftInviteId);
  const itemCount =
    order?.lineItems?.reduce((sum, li) => sum + Math.max(1, li.quantity ?? 1), 0) ?? 0;

  let title = 'Order confirmed';
  let subtitle = "We'll email you with updates.";
  let showBoxPreview = false;

  if (pending) {
    title = 'Confirming your order…';
    subtitle = "This usually takes a few seconds. We'll email you when it's confirmed.";
  } else if (isMarketplace && confirmed) {
    title = 'Your purchase is confirmed.';
    subtitle = "We'll send a tracking link when it ships.";
  } else if (isReceivedGift && confirmed) {
    title = 'Your gift order is confirmed.';
    subtitle = "We'll send a tracking link when it ships.";
  } else if (confirmed) {
    title = committed ? 'Your box is committed.' : 'Your Hanukkah box is on its way.';
    subtitle = committed
      ? "You won't be charged until the customization lock date. Keep swapping until then."
      : "We'll send a tracking link when it ships.";
    showBoxPreview = !committed;
  }

  return (
    <WebContentPanel flush centerDesktop style={styles.panel}>
      <View style={styles.root}>
        {order ? (
          <>
            {pending ? (
              <>
                <ActivityIndicator size="large" color={semanticColors.brand} style={styles.spinner} />
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.subtitle}>{subtitle}</Text>
              </>
            ) : confirmed ? (
              <>
                <Text style={styles.emoji}>✓</Text>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.subtitle}>{subtitle}</Text>
                {order.estimatedDelivery ? (
                  <Text style={styles.delivery}>
                    Estimated delivery by {order.estimatedDelivery}
                  </Text>
                ) : null}
                {isMarketplace && order.lineItems?.length ? (
                  <View style={styles.previewBox}>
                    <Text style={styles.previewTitle}>
                      {itemCount === 1 ? 'Your item' : 'Your items'}
                    </Text>
                    {order.lineItems.map((li) => (
                      <Text key={li.slotId ?? li.itemId} style={styles.body}>
                        {(li.quantity ?? 1) > 1 ? `${li.quantity}× ` : ''}
                        {li.label ?? li.itemId}
                      </Text>
                    ))}
                  </View>
                ) : null}
                {showBoxPreview ? (
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
                ) : null}
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
          onPress={() => navigation.navigate(isReceivedGift ? 'MyGifts' : 'Orders')}
        >
          <Text style={styles.ctaText}>
            {isReceivedGift ? 'View in Gifts' : 'View in Orders'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('StorefrontHome')}>
          <Text style={styles.link}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </WebContentPanel>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    backgroundColor: semanticColors.bgPrimary,
  },
  root: {
    flex: 1,
    backgroundColor: semanticColors.bgPrimary,
    padding: spacing.lg,
    paddingTop: spacing.xl,
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
    width: '100%',
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
