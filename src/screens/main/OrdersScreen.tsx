import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { GuestAuthPrompt } from '../../components/auth/GuestAuthPrompt';
import { openOrderTracking } from '../../components/orders/OrderHistoryList';
import { OrderItemsBreakdown } from '../../components/orders/OrderItemsBreakdown';
import { useAuthStore } from '../../stores/authStore';
import { useSession } from '../../hooks/useSession';
import { useUnifiedOrders, type UnifiedOrder } from '../../hooks/useUnifiedOrders';
import { useCatalog } from '../../hooks/useCatalog';
import { useWebLayout } from '../../hooks/useWebLayout';
import { chargePilotBoxOrder } from '../../services/checkout/chargePilotBoxOrder';
import { formatDollars } from '../../services/box/buildDefaultBox';
import { inferPricingTier } from '../../services/box/pricing';
import { formatThreadListDate } from '../../services/hanukkah/dates';
import type { MainStackParamList } from '../../navigation/types';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import { spacing, typography, borderRadius } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

type Nav = StackNavigationProp<MainStackParamList>;

function formatPurchaseDate(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '—';
  return formatThreadListDate(new Date(ms));
}

function partitionLineItems(lineItems: BoxLineItem[], catalog: CatalogItem[]) {
  const box: BoxLineItem[] = [];
  const alaCarte: BoxLineItem[] = [];
  for (const li of lineItems) {
    const cat = catalog.find((c) => c.id === li.itemId);
    if (cat && inferPricingTier(cat) === 'alaCarte') {
      alaCarte.push(li);
    } else {
      box.push(li);
    }
  }
  return { box, alaCarte };
}

function OrderCard({
  order,
  catalog,
  styles,
  onDevCharge,
  charging,
}: {
  order: UnifiedOrder;
  catalog: CatalogItem[];
  styles: ReturnType<typeof createOrdersStyles>;
  onDevCharge?: () => void;
  charging?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const pilot = order.pilotOrder;
  const gift = order.giftInvite;
  const { box, alaCarte } = pilot
    ? partitionLineItems(pilot.lineItems, catalog)
    : { box: [], alaCarte: [] };
  const giftItems = gift?.lineItems ?? [];
  const itemCount = box.length + alaCarte.length + giftItems.length;
  const hasItems = itemCount > 0;

  return (
    <View style={styles.orderCard}>
      <View style={styles.orderHeader}>
        <View style={styles.orderTitleBlock}>
          <Text style={styles.orderKind}>
            {order.kind === 'gift' ? 'Gift' : order.kind === 'box' ? 'Box' : 'À la carte'}
          </Text>
          <Text style={styles.orderTitle}>{order.title}</Text>
        </View>
        <Text style={styles.orderStatus}>{order.statusLabel}</Text>
      </View>

      <Text style={styles.orderMeta}>Purchased {formatPurchaseDate(order.createdAt)}</Text>
      <Text style={styles.orderTotal}>{formatDollars(order.totalCents)}</Text>

      {order.recipientLabel ? (
        <Text style={styles.recipient}>
          {order.kind === 'gift' ? 'Gifted to' : 'Ship to'}: {order.recipientLabel}
        </Text>
      ) : null}

      {gift?.message ? (
        <Text style={styles.giftMessage}>&ldquo;{gift.message}&rdquo;</Text>
      ) : null}

      {gift?.status === 'claimed' && gift.claimedAt ? (
        <Text style={styles.orderMeta}>Claimed {formatPurchaseDate(gift.claimedAt)}</Text>
      ) : null}

      {hasItems ? (
        <TouchableOpacity
          style={styles.itemsToggle}
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
        >
          <Text style={styles.itemsToggleText}>
            {expanded ? 'Hide items' : `View items (${itemCount})`}
          </Text>
        </TouchableOpacity>
      ) : null}

      {expanded && pilot?.shippingAddress ? (
        <Text style={styles.address}>
          {pilot.shippingAddress.line1}
          {pilot.shippingAddress.line2 ? `, ${pilot.shippingAddress.line2}` : ''}
          {'\n'}
          {pilot.shippingAddress.city}, {pilot.shippingAddress.stateProvince}{' '}
          {pilot.shippingAddress.postalCode}
        </Text>
      ) : null}

      {expanded && (box.length > 0 || alaCarte.length > 0 || giftItems.length > 0) ? (
        <View style={styles.itemsExpanded}>
          {box.length > 0 ? (
            <OrderItemsBreakdown lineItems={box} catalog={catalog} variant="box" />
          ) : null}
          {alaCarte.length > 0 ? (
            <OrderItemsBreakdown
              lineItems={alaCarte}
              catalog={catalog}
              variant="flat"
              sectionTitle="À la carte add-ons"
              showPrice
            />
          ) : null}
          {giftItems.length > 0 ? (
            <View style={styles.giftCurationBlock}>
              <Text style={styles.giftCurationHeading}>Gift box curation</Text>
              <OrderItemsBreakdown lineItems={giftItems} catalog={catalog} variant="box" />
            </View>
          ) : null}
        </View>
      ) : null}

      {order.trackingNumber && pilot ? (
        <TouchableOpacity onPress={() => openOrderTracking(pilot)} accessibilityRole="link">
          <Text style={styles.trackLink}>
            Track package — {order.carrier ?? 'carrier'} {order.trackingNumber}
          </Text>
        </TouchableOpacity>
      ) : pilot && (pilot.status === 'confirmed' || pilot.status === 'committed') ? (
        <Text style={styles.hint}>Tracking will appear when your box ships.</Text>
      ) : null}

      {pilot?.chargeFailureMessage ? (
        <Text style={styles.chargeError}>Last charge attempt: {pilot.chargeFailureMessage}</Text>
      ) : null}

      {__DEV__ && pilot?.status === 'committed' && order.kind === 'box' && onDevCharge ? (
        <TouchableOpacity
          style={[styles.devChargeBtn, charging && styles.devChargeBtnDisabled]}
          disabled={charging}
          onPress={onDevCharge}
          accessibilityRole="button"
        >
          <Text style={styles.devChargeBtnText}>
            {charging ? 'Charging…' : 'Dev: charge now'}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function OrdersScreenBody() {
  const navigation = useNavigation<Nav>();
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const styles = useMemo(() => createOrdersStyles(colors, isDesktop), [colors, isDesktop]);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { household } = useSession();
  const { items: catalog } = useCatalog();
  const { orders, loading, loadError, refresh } = useUnifiedOrders();
  const [chargingOrderId, setChargingOrderId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const performDevCharge = useCallback(
    async (orderId: string) => {
      if (!household?.id || chargingOrderId) return;
      setChargingOrderId(orderId);
      try {
        const result = await chargePilotBoxOrder(household.id, orderId, { force: true });
        await refresh();
        const detail =
          result.outcome === 'charged'
            ? `Charged ${formatDollars(result.totalCents)}.`
            : result.outcome === 'confirmed_zero'
              ? 'Confirmed with $0 due (credit covered).'
              : result.outcome === 'skipped'
                ? `Skipped: ${result.reason}`
                : `Failed: ${result.message}`;
        Alert.alert('Dev charge', detail);
      } catch (e) {
        Alert.alert('Dev charge failed', e instanceof Error ? e.message : 'Try again.');
      } finally {
        setChargingOrderId(null);
      }
    },
    [household?.id, chargingOrderId, refresh]
  );

  if (!isAuthenticated) {
    return (
      <WebContentPanel flush={isDesktop} centerDesktop={isDesktop} omitDesktopTopPadding={isDesktop}>
        <GuestAuthPrompt returnTo="Orders" />
      </WebContentPanel>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <BrandLoadingMark color={colors.brand} />
      </View>
    );
  }

  return (
    <WebContentPanel flush={isDesktop} centerDesktop={isDesktop} omitDesktopTopPadding={isDesktop}>
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
          <Text style={styles.backLink}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Orders</Text>
        <Text style={styles.subtitle}>
          Status and summaries for gift boxes you&apos;ve sent, your household box, and à la carte
          add-ons. Tracking appears when a package ships.
        </Text>

        {loadError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{loadError}</Text>
            <TouchableOpacity onPress={() => void refresh()} accessibilityRole="button">
              <Text style={styles.errorRetry}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {orders.length === 0 ? (
          <Text style={styles.empty}>
            {loading
              ? 'Loading orders…'
              : 'No orders yet. Send a gift from Account, or commit your Hanukkah box from My Box.'}
          </Text>
        ) : (
          orders.map((order) => (
            <OrderCard
              key={`${order.kind}-${order.id}`}
              order={order}
              catalog={catalog}
              styles={styles}
              onDevCharge={
                order.kind === 'box' && order.pilotOrder?.status === 'committed'
                  ? () => void performDevCharge(order.id)
                  : undefined
              }
              charging={chargingOrderId === order.id}
            />
          ))
        )}
      </ScrollView>
    </WebContentPanel>
  );
}

export function OrdersScreen() {
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <OrdersScreenBody />
    </StorefrontChrome>
  );
}

function createOrdersStyles(colors: SemanticColors, isDesktop: boolean) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bgPrimary },
    content: {
      padding: spacing.lg,
      paddingBottom: 120,
      maxWidth: isDesktop ? 640 : undefined,
      width: '100%',
      alignSelf: isDesktop ? 'center' : undefined,
    },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 240 },
    backRow: { marginBottom: spacing.sm },
    backLink: { color: colors.brand, fontWeight: '600', fontSize: typography.md },
    title: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
    subtitle: {
      fontSize: typography.md,
      color: colors.textSecondary,
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
    },
    empty: { fontSize: typography.md, color: colors.textTertiary, marginTop: spacing.md },
    errorBanner: {
      marginTop: spacing.md,
      marginBottom: spacing.md,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.accentCream,
    },
    errorText: { fontSize: typography.sm, color: colors.textSecondary },
    errorRetry: {
      marginTop: spacing.sm,
      fontSize: typography.sm,
      color: colors.brand,
      fontWeight: '600',
    },
    orderCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
      backgroundColor: colors.bgPrimary,
    },
    orderHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    orderTitleBlock: { flex: 1 },
    orderKind: {
      fontSize: typography.xs,
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.textTertiary,
    },
    orderTitle: { fontSize: typography.lg, fontWeight: '700', color: colors.textPrimary, marginTop: 2 },
    orderStatus: { fontSize: typography.sm, fontWeight: '600', color: colors.brand, flexShrink: 0 },
    orderMeta: { fontSize: typography.sm, color: colors.textTertiary, marginTop: spacing.xs },
    orderTotal: {
      fontSize: typography.xl,
      fontWeight: '700',
      color: colors.textPrimary,
      marginTop: spacing.sm,
    },
    recipient: { fontSize: typography.md, color: colors.textSecondary, marginTop: spacing.sm },
    giftMessage: {
      fontSize: typography.md,
      color: colors.textSecondary,
      fontStyle: 'italic',
      marginTop: spacing.xs,
    },
    address: { fontSize: typography.sm, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 20 },
    itemsToggle: { marginTop: spacing.md },
    itemsToggleText: { fontSize: typography.sm, color: colors.brand, fontWeight: '600' },
    itemsExpanded: { marginTop: spacing.md, gap: spacing.md },
    giftCurationBlock: { gap: spacing.sm },
    giftCurationHeading: {
      fontSize: typography.sm,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    trackLink: { marginTop: spacing.sm, color: colors.brand, fontWeight: '600' },
    hint: { marginTop: spacing.sm, fontSize: typography.sm, color: colors.textTertiary },
    chargeError: {
      marginTop: spacing.sm,
      fontSize: typography.sm,
      color: colors.textSecondary,
      fontStyle: 'italic',
    },
    devChargeBtn: {
      marginTop: spacing.md,
      alignSelf: 'flex-start',
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.pill,
      borderWidth: 1,
      borderColor: colors.brand,
      backgroundColor: colors.accentCream,
    },
    devChargeBtnDisabled: { opacity: 0.45 },
    devChargeBtnText: { color: colors.brand, fontWeight: '700', fontSize: typography.sm },
  });
}
