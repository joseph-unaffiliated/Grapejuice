import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  Modal,
  Pressable,
  ActivityIndicator,
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
import { cancelPilotBoxOrder } from '../../services/checkout/cancelPilotBoxOrder';
import { formatDollars } from '../../services/box/buildDefaultBox';
import { inferPricingTier } from '../../services/box/pricing';
import { formatThreadListDate } from '../../services/hanukkah/dates';
import type { MainStackParamList } from '../../navigation/types';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import { spacing, typography, borderRadius, typeface } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

type Nav = StackNavigationProp<MainStackParamList>;

function notify(title: string, body: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${body}`);
    return;
  }
  Alert.alert(title, body);
}

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
  onUpdatePayment,
  onCancel,
  cancelling,
}: {
  order: UnifiedOrder;
  catalog: CatalogItem[];
  styles: ReturnType<typeof createOrdersStyles>;
  onDevCharge?: () => void;
  charging?: boolean;
  onUpdatePayment?: () => void;
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const pilot = order.pilotOrder;
  const gift = order.giftInvite;
  const isPurchaseOrder = order.kind === 'ala_carte';
  const { box, alaCarte } = pilot
    ? isPurchaseOrder
      ? { box: [] as BoxLineItem[], alaCarte: pilot.lineItems }
      : partitionLineItems(pilot.lineItems, catalog)
    : { box: [], alaCarte: [] };
  const giftItems = gift?.lineItems ?? [];
  const itemCount = box.length + alaCarte.length + giftItems.length;
  const hasItems = itemCount > 0;
  const canCancelBox =
    order.kind === 'box' &&
    (pilot?.status === 'committed' || pilot?.status === 'pending') &&
    Boolean(onCancel);

  return (
    <View style={styles.orderCard}>
      <View style={styles.orderHeader}>
        <View style={styles.orderTitleBlock}>
          <Text style={styles.orderKind}>
            {order.kind === 'gift' ? 'Gift' : order.kind === 'box' ? 'Box' : 'Purchase'}
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
              sectionTitle={isPurchaseOrder ? 'Items' : 'À la carte add-ons'}
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
        <View style={styles.trackingBlock}>
          <Text style={styles.trackingDetail}>
            {order.carrier ? `${order.carrier} · ${order.trackingNumber}` : order.trackingNumber}
          </Text>
          <TouchableOpacity
            style={styles.trackBtn}
            onPress={() => openOrderTracking(pilot)}
            accessibilityRole="button"
            accessibilityLabel="Track package"
          >
            <Text style={styles.trackBtnText}>Track package</Text>
          </TouchableOpacity>
        </View>
      ) : pilot && (pilot.status === 'confirmed' || pilot.status === 'committed') ? (
        <Text style={styles.hint}>
          {isPurchaseOrder
            ? 'Tracking will appear when your order ships.'
            : 'Tracking will appear when your box ships.'}
        </Text>
      ) : null}

      {pilot?.chargeFailureMessage ? (
        <View style={styles.chargeFailBlock}>
          <Text style={styles.chargeError}>
            Last charge attempt: {pilot.chargeFailureMessage}
          </Text>
          {onUpdatePayment ? (
            <TouchableOpacity
              style={styles.trackBtn}
              onPress={onUpdatePayment}
              accessibilityRole="button"
              accessibilityLabel="Update payment method"
            >
              <Text style={styles.trackBtnText}>Update payment method</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {canCancelBox ? (
        <TouchableOpacity
          style={[styles.cancelBtn, cancelling && styles.devChargeBtnDisabled]}
          disabled={cancelling}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel this box"
        >
          <Text style={styles.cancelBtnText}>
            {cancelling ? 'Cancelling…' : 'Cancel this box'}
          </Text>
        </TouchableOpacity>
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
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [cancelConfirmOrderId, setCancelConfirmOrderId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const requestCancel = useCallback(
    (orderId: string) => {
      if (!household?.id || cancellingOrderId) return;
      setCancelConfirmOrderId(orderId);
    },
    [household?.id, cancellingOrderId]
  );

  const confirmCancel = useCallback(() => {
    const orderId = cancelConfirmOrderId;
    if (!household?.id || !orderId || cancellingOrderId) return;
    setCancelConfirmOrderId(null);
    void (async () => {
      setCancellingOrderId(orderId);
      try {
        await cancelPilotBoxOrder(household.id, orderId);
        await refresh();
      } catch (e) {
        notify(
          'Could not cancel',
          e instanceof Error ? e.message : 'Try again or contact support.'
        );
      } finally {
        setCancellingOrderId(null);
      }
    })();
  }, [cancelConfirmOrderId, household?.id, cancellingOrderId, refresh]);

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
        notify('Dev charge', detail);
      } catch (e) {
        notify('Dev charge failed', e instanceof Error ? e.message : 'Try again.');
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
              onUpdatePayment={
                order.kind === 'box' && order.pilotOrder?.chargeFailureMessage
                  ? () => navigation.navigate('UpdatePayment')
                  : undefined
              }
              onCancel={
                order.kind === 'box' &&
                (order.pilotOrder?.status === 'committed' ||
                  order.pilotOrder?.status === 'pending')
                  ? () => requestCancel(order.id)
                  : undefined
              }
              cancelling={cancellingOrderId === order.id}
            />
          ))
        )}
      </ScrollView>

      <Modal
        visible={cancelConfirmOrderId != null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!cancellingOrderId) setCancelConfirmOrderId(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!cancellingOrderId) setCancelConfirmOrderId(null);
            }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          />
          <View style={styles.modalCard} accessibilityViewIsModal>
            <Text style={styles.modalTitle}>Cancel this box?</Text>
            <Text style={styles.modalBody}>
              Your commitment will be cancelled. Gift or platform credits applied to this order will
              be restored.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalKeepBtn}
                onPress={() => setCancelConfirmOrderId(null)}
                disabled={!!cancellingOrderId}
                accessibilityRole="button"
                accessibilityLabel="Keep box"
              >
                <Text style={styles.modalKeepText}>Keep box</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalCancelConfirmBtn, !!cancellingOrderId && styles.devChargeBtnDisabled]}
                onPress={confirmCancel}
                disabled={!!cancellingOrderId}
                accessibilityRole="button"
                accessibilityLabel="Cancel box"
              >
                {cancellingOrderId ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text style={styles.modalCancelConfirmText}>Cancel box</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    trackingBlock: { marginTop: spacing.sm, gap: spacing.sm },
    trackingDetail: { fontSize: typography.sm, color: colors.textSecondary },
    trackBtn: {
      alignSelf: 'flex-start',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: borderRadius.md,
      backgroundColor: colors.logoDark,
    },
    trackBtnText: {
      fontSize: typography.sm,
      fontWeight: '700',
      color: colors.textInverse,
    },
    hint: { marginTop: spacing.sm, fontSize: typography.sm, color: colors.textTertiary },
    chargeError: {
      fontSize: typography.sm,
      color: colors.textSecondary,
      fontStyle: 'italic',
    },
    chargeFailBlock: {
      marginTop: spacing.sm,
      gap: spacing.sm,
    },
    cancelBtn: {
      marginTop: spacing.md,
      alignSelf: 'flex-start',
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
    },
    cancelBtnText: {
      fontSize: typography.sm,
      fontWeight: '600',
      color: colors.textSecondary,
      textDecorationLine: 'underline',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(47, 36, 18, 0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    modalCard: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.bgPrimary,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.xl,
      zIndex: 1,
    },
    modalTitle: {
      fontSize: 22,
      ...typeface('bold'),
      color: colors.textPrimary,
      marginBottom: spacing.sm,
    },
    modalBody: {
      fontSize: typography.md,
      lineHeight: 22,
      color: colors.textSecondary,
      ...typeface('regular'),
      marginBottom: spacing.lg,
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: spacing.sm,
      flexWrap: 'wrap',
    },
    modalKeepBtn: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    modalKeepText: {
      fontSize: typography.md,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    modalCancelConfirmBtn: {
      minWidth: 120,
      alignItems: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: borderRadius.md,
      backgroundColor: colors.logoDark,
    },
    modalCancelConfirmText: {
      fontSize: typography.md,
      fontWeight: '700',
      color: colors.textInverse,
    },
    devChargeBtn: {
      marginTop: spacing.md,
      alignSelf: 'flex-start',
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.brand,
      backgroundColor: colors.accentCream,
    },
    devChargeBtnDisabled: { opacity: 0.45 },
    devChargeBtnText: { color: colors.brand, fontWeight: '700', fontSize: typography.sm },
  });
}
