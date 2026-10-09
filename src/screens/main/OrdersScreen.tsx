import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import {
  SystemChip,
  SystemPage,
  SystemTextAction,
  systemPageStyles as page,
} from '../../components/layout/SystemPage';
import { GuestAuthPrompt } from '../../components/auth/GuestAuthPrompt';
import { openOrderTracking } from '../../components/orders/OrderHistoryList';
import {
  OrderItemNameGrid,
  OrderItemPressable,
  OrderBoxCollage,
  OrderProductImage,
  orderItemName,
} from '../../components/orders/OrderPurchaseMedia';
import { useAuthStore } from '../../stores/authStore';
import { useSession } from '../../hooks/useSession';
import { giftInvitePaid, useUnifiedOrders, type UnifiedOrder } from '../../hooks/useUnifiedOrders';
import { useCatalog } from '../../hooks/useCatalog';
import { chargePilotBoxOrder } from '../../services/checkout/chargePilotBoxOrder';
import { cancelPilotBoxOrder } from '../../services/checkout/cancelPilotBoxOrder';
import { inferPricingTier } from '../../services/box/pricing';
import { formatDollars } from '../../services/box/buildDefaultBox';
import type { MainStackParamList } from '../../navigation/types';
import type { BoxLineItem, CatalogItem, GiftInvite } from '../../types/pilot';
import { spacing, typography, borderRadius, typeface, semanticColors } from '../../constants/theme';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { CheckoutCongratsOverlay } from './checkout/CheckoutCongratsOverlay';
import { restorePilotBoxOrder } from '../../services/checkout/restorePilotBoxOrder';
import { cancelPilotGift } from '../../services/gift/pendingGift';
import { useBoxLockPassed } from '../../hooks/useBoxLockDay';
import { clearBoxDraftCache } from '../../hooks/useBoxDraft';

type Nav = StackNavigationProp<MainStackParamList>;

function notify(title: string, body: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${body}`);
    return;
  }
  Alert.alert(title, body);
}

function formatOrderDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Gifts listed as "Payment pending". */
function isUnpaidGift(invite: GiftInvite): boolean {
  return !giftInvitePaid(invite) && invite.status !== 'cancelled';
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
  onRestore,
  restoring,
  onAddPayment,
  onCancelGift,
  cancellingGift,
}: {
  order: UnifiedOrder;
  catalog: CatalogItem[];
  styles: ReturnType<typeof createOrdersStyles>;
  onDevCharge?: () => void;
  charging?: boolean;
  onUpdatePayment?: () => void;
  onCancel?: () => void;
  cancelling?: boolean;
  /** Cancelled box that can be put back as it was. */
  onRestore?: () => void;
  restoring?: boolean;
  /** Unpaid gift: finish paying, or cancel it. */
  onAddPayment?: () => void;
  onCancelGift?: () => void;
  cancellingGift?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const pilot = order.pilotOrder;
  const gift = order.giftInvite;
  const isPurchaseOrder = order.kind === 'ala_carte';
  const { box, alaCarte } = pilot
    ? pilot.giftSurprise
      ? { box: [] as BoxLineItem[], alaCarte: [] as BoxLineItem[] }
      : isPurchaseOrder
      ? { box: [] as BoxLineItem[], alaCarte: pilot.lineItems }
      : partitionLineItems(pilot.lineItems, catalog)
    : { box: [], alaCarte: [] };
  const giftItems = gift?.lineItems ?? [];
  const visualItems = [...box, ...alaCarte, ...giftItems];
  const isDirectPurchase = pilot?.orderType === 'marketplace';
  const canCancelBox =
    order.kind === 'box' &&
    (pilot?.status === 'committed' || pilot?.status === 'pending') &&
    Boolean(onCancel);

  const severalDirect = isDirectPurchase && visualItems.length > 1;
  const orderDate = formatOrderDate(order.createdAt);
  const orderNumber = (pilot?.id ?? gift?.id ?? order.id).slice(0, 8).toUpperCase();
  const facts = [
    orderDate ? { label: 'Order date', value: orderDate } : null,
    orderNumber ? { label: 'Order #', value: orderNumber } : null,
    order.recipientLabel
      ? {
          label: order.kind === 'gift' ? 'Gifted to' : 'Ship to',
          value: order.recipientLabel,
        }
      : null,
  ].filter((fact): fact is { label: string; value: string } => fact != null);

  const actionStyle = styles.actionControl;
  const claimedOn = gift?.status === 'claimed' ? formatOrderDate(gift.claimedAt) : null;
  const orderDetails = (
    <>
      {gift?.message ? (
        <Text style={styles.giftMessage}>&ldquo;{gift.message}&rdquo;</Text>
      ) : null}
      {claimedOn ? <Text style={page.rowAside}>Claimed {claimedOn}</Text> : null}
      {pilot?.shippingAddress ? (
        <Text style={styles.address}>
          {pilot.shippingAddress.line1}
          {pilot.shippingAddress.line2 ? `, ${pilot.shippingAddress.line2}` : ''}
          {'\n'}
          {pilot.shippingAddress.city}, {pilot.shippingAddress.stateProvince}{' '}
          {pilot.shippingAddress.postalCode}
        </Text>
      ) : null}
      {!isDirectPurchase && visualItems.length > 0 ? (
        <TouchableOpacity
          style={styles.itemsToggle}
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
        >
          <Text style={page.link}>{expanded ? 'Hide items' : 'Show all items'}</Text>
        </TouchableOpacity>
      ) : null}
    </>
  );

  return (
    <View style={styles.orderCard}>
      {facts.length > 0 ? (
        <View style={styles.orderBar}>
          {facts.map((fact, index) => (
            <View key={fact.label} style={styles.orderBarFact}>
              {index > 0 ? <View style={styles.orderBarRule} /> : null}
              <Text style={styles.orderBarLabel}>{fact.label}</Text>
              <Text style={styles.orderBarValue}>{fact.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.purchaseBody}>
        <View style={styles.purchaseMain}>
          {severalDirect
            ? visualItems.map((li) => {
                const qty = Math.max(1, li.quantity ?? 1);
                return (
                  <View key={`${li.slotId}-${li.itemId}`} style={styles.purchaseRow}>
                    <OrderProductImage li={li} catalog={catalog} />
                    <OrderItemPressable
                      itemId={li.itemId}
                      accessibilityLabel={orderItemName(li, catalog)}
                      style={styles.productNameBeside}
                    >
                      <Text style={styles.productName}>
                        {orderItemName(li, catalog)}
                        {qty > 1 ? ` ×${qty}` : ''}
                      </Text>
                    </OrderItemPressable>
                  </View>
                );
              })
            : (
              <View style={styles.purchaseRow}>
                {isDirectPurchase && visualItems[0] ? (
                  <OrderProductImage li={visualItems[0]} catalog={catalog} />
                ) : visualItems.length > 0 ? (
                  <OrderBoxCollage items={visualItems} catalog={catalog} />
                ) : null}
                <View style={styles.orderTitleBlock}>
                  {isDirectPurchase && visualItems[0] ? (
                    <OrderItemPressable
                      itemId={visualItems[0].itemId}
                      accessibilityLabel={order.title}
                    >
                      <Text style={styles.productName}>{order.title}</Text>
                    </OrderItemPressable>
                  ) : (
                    <Text style={styles.productName}>{order.title}</Text>
                  )}
                  <Text style={styles.productPrice}>{formatDollars(order.totalCents)}</Text>
                  {orderDetails}
                </View>
              </View>
            )}

          {severalDirect ? (
            <>
              <Text style={styles.productPrice}>{formatDollars(order.totalCents)}</Text>
              {orderDetails}
            </>
          ) : null}
        </View>

        <View style={styles.purchaseActions}>
          <Text style={styles.statusAside}>{order.statusLabel}</Text>

          {onRestore ? (
            <GrapejuiceButton
              label="Restore Box"
              onPress={onRestore}
              loading={restoring}
              style={styles.asideButton}
              textStyle={styles.asideButtonText}
            />
          ) : null}

          {onAddPayment ? (
            <GrapejuiceButton
              label="Add Payment Info"
              onPress={onAddPayment}
              disabled={cancellingGift}
              style={styles.asideButton}
              textStyle={styles.asideButtonText}
            />
          ) : null}
          {onCancelGift ? (
            <SystemTextAction
              label={cancellingGift ? 'Cancelling…' : 'Cancel Gift'}
              tone="brand"
              onPress={onCancelGift}
              disabled={cancellingGift}
              style={actionStyle}
            />
          ) : null}

          {order.trackingNumber && pilot ? (
            <>
              <Text style={styles.trackingDetail}>
                {order.carrier ? `${order.carrier} · ${order.trackingNumber}` : order.trackingNumber}
              </Text>
              <SystemChip
                label="Track package"
                onPress={() => openOrderTracking(pilot)}
                style={actionStyle}
              />
            </>
          ) : pilot && (pilot.status === 'confirmed' || pilot.status === 'committed') ? (
            <Text style={styles.trackingDetail}>
              {isPurchaseOrder
                ? 'Tracking will appear when your order ships.'
                : 'Tracking will appear when your box ships.'}
            </Text>
          ) : null}

          {pilot?.chargeFailureMessage ? (
            <Text style={styles.trackingDetail}>
              Last charge attempt: {pilot.chargeFailureMessage}
            </Text>
          ) : null}

          {onUpdatePayment && pilot?.chargeFailureMessage ? (
            <SystemChip
              label="Update payment method"
              onPress={onUpdatePayment}
              accessibilityLabel="Update payment method"
              style={actionStyle}
            />
          ) : null}

          {canCancelBox ? (
            <SystemTextAction
              label={cancelling ? 'Cancelling…' : 'Cancel this box'}
              onPress={onCancel!}
              disabled={cancelling}
              accessibilityLabel="Cancel this box"
              style={actionStyle}
            />
          ) : null}

          {__DEV__ && pilot?.status === 'committed' && order.kind === 'box' && onDevCharge ? (
            <SystemChip
              label={charging ? 'Charging…' : 'Dev: charge now'}
              onPress={onDevCharge}
              disabled={charging}
              style={actionStyle}
            />
          ) : null}
        </View>
      </View>

      {expanded && !isDirectPurchase && visualItems.length > 0 ? (
        <OrderItemNameGrid items={visualItems} catalog={catalog} />
      ) : null}
    </View>
  );
}

function OrdersScreenBody() {
  const navigation = useNavigation<Nav>();
  const styles = useMemo(() => createOrdersStyles(), []);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { household, refresh: refreshSession } = useSession();
  const { items: catalog } = useCatalog();
  const { orders, loading, loadError, refresh } = useUnifiedOrders();
  const boxesLocked = useBoxLockPassed();
  const [chargingOrderId, setChargingOrderId] = useState<string | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [cancelConfirmOrderId, setCancelConfirmOrderId] = useState<string | null>(null);
  const [restoringOrderId, setRestoringOrderId] = useState<string | null>(null);
  /** Set once a box is restored: show Congratulations, then My Box. */
  const [restored, setRestored] = useState<{ lockAt: string | null } | null>(null);
  const [cancelGiftConfirmId, setCancelGiftConfirmId] = useState<string | null>(null);
  const [cancellingGiftId, setCancellingGiftId] = useState<string | null>(null);

  const hasActiveBox = orders.some(
    (o) =>
      o.kind === 'box' &&
      o.pilotOrder != null &&
      ['pending', 'committed', 'confirmed', 'shipped', 'delivered'].includes(o.pilotOrder.status)
  );

  const restoreBox = useCallback(
    (orderId: string) => {
      if (!household?.id || restoringOrderId) return;
      void (async () => {
        setRestoringOrderId(orderId);
        try {
          const result = await restorePilotBoxOrder(household.id, orderId);
          // The server reset the box draft to this order's items either way.
          clearBoxDraftCache();
          if (result.status === 'needs_checkout') {
            notify('Check out to restore your box', result.message);
            navigation.navigate('Checkout');
            return;
          }
          await refreshSession({ silent: true });
          setRestored({ lockAt: result.lockAt });
        } catch (e) {
          notify('Could not restore box', e instanceof Error ? e.message : 'Try again or contact support.');
          void refresh();
        } finally {
          setRestoringOrderId(null);
        }
      })();
    },
    [household?.id, restoringOrderId, navigation, refreshSession, refresh]
  );

  const confirmCancelGift = useCallback(() => {
    const giftInviteId = cancelGiftConfirmId;
    if (!giftInviteId || cancellingGiftId) return;
    setCancelGiftConfirmId(null);
    void (async () => {
      setCancellingGiftId(giftInviteId);
      try {
        await cancelPilotGift(giftInviteId);
        await refresh();
      } catch (e) {
        notify('Could not cancel gift', e instanceof Error ? e.message : 'Try again or contact support.');
      } finally {
        setCancellingGiftId(null);
      }
    })();
  }, [cancelGiftConfirmId, cancellingGiftId, refresh]);

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
      <WebContentPanel flush centerDesktop omitDesktopTopPadding style={styles.guestPanel}>
        <GuestAuthPrompt returnTo="Orders" />
      </WebContentPanel>
    );
  }

  if (restored) {
    return (
      <CheckoutCongratsOverlay lockAt={restored.lockAt} onDone={() => navigation.replace('MyBox')} />
    );
  }

  if (loading) {
    return (
      <SystemPage hub="orders" loading />
    );
  }

  return (
    <>
    <SystemPage hub="orders">
        {loadError ? (
          <View style={page.section}>
            <Text style={page.emptyText}>{loadError}</Text>
            <SystemChip label="Try again" onPress={() => void refresh()} />
          </View>
        ) : null}

        {orders.length === 0 ? (
          <Text style={page.emptyText}>
            No orders yet. Send a gift from Account, or commit your Hanukkah box from My Box.
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
                order.pilotOrder?.chargeFailureMessage &&
                (order.kind === 'box' || order.kind === 'ala_carte')
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
              onRestore={
                order.kind === 'box' &&
                order.pilotOrder?.status === 'cancelled' &&
                !hasActiveBox &&
                !boxesLocked
                  ? () => restoreBox(order.id)
                  : undefined
              }
              restoring={restoringOrderId === order.id}
              onAddPayment={
                order.giftInvite && isUnpaidGift(order.giftInvite)
                  ? () => navigation.navigate('GiftResumePayment', { giftInviteId: order.id })
                  : undefined
              }
              onCancelGift={
                order.giftInvite && isUnpaidGift(order.giftInvite)
                  ? () => setCancelGiftConfirmId(order.id)
                  : undefined
              }
              cancellingGift={cancellingGiftId === order.id}
            />
          ))
        )}

    </SystemPage>
      <ConfirmModal
        visible={cancelConfirmOrderId != null}
        busy={!!cancellingOrderId}
        title="Cancel this box?"
        body="Your commitment will be cancelled. Gift or platform credits applied to this order will be restored."
        keepLabel="Keep box"
        confirmLabel="Cancel box"
        onKeep={() => setCancelConfirmOrderId(null)}
        onConfirm={confirmCancel}
        styles={styles}
      />
      <ConfirmModal
        visible={cancelGiftConfirmId != null}
        busy={!!cancellingGiftId}
        title="Cancel this gift?"
        body="You haven't paid for this gift yet, so nothing will be charged and the recipient won't be emailed."
        keepLabel="Keep gift"
        confirmLabel="Cancel gift"
        onKeep={() => setCancelGiftConfirmId(null)}
        onConfirm={confirmCancelGift}
        styles={styles}
      />
    </>
  );
}

function ConfirmModal({
  visible,
  busy,
  title,
  body,
  keepLabel,
  confirmLabel,
  onKeep,
  onConfirm,
  styles,
}: {
  visible: boolean;
  busy: boolean;
  title: string;
  body: string;
  keepLabel: string;
  confirmLabel: string;
  onKeep: () => void;
  onConfirm: () => void;
  styles: ReturnType<typeof createOrdersStyles>;
}) {
  const dismiss = () => {
    if (!busy) onKeep();
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.modalBackdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
        <View style={styles.modalCard} accessibilityViewIsModal>
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalBody}>{body}</Text>
          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.modalKeepBtn}
              onPress={onKeep}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={keepLabel}
            >
              <Text style={styles.modalKeepText}>{keepLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalCancelConfirmBtn, busy && styles.devChargeBtnDisabled]}
              onPress={onConfirm}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
            >
              {busy ? (
                <BrandLoadingMark large={false} color={semanticColors.textInverse} />
              ) : (
                <Text style={styles.modalCancelConfirmText}>{confirmLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function OrdersScreen() {
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <OrdersScreenBody />
    </StorefrontChrome>
  );
}

function createOrdersStyles() {
  return StyleSheet.create({
    guestPanel: { flex: 1, width: '100%' },
    orderCard: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: semanticColors.border,
      paddingVertical: spacing.md,
      gap: spacing.md,
    },
    orderBar: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: semanticColors.logoDark,
      borderRadius: borderRadius.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    orderBarFact: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    orderBarRule: {
      width: StyleSheet.hairlineWidth,
      height: 14,
      backgroundColor: 'rgba(255,255,255,0.45)',
      marginRight: spacing.xs,
    },
    orderBarLabel: {
      ...typeface('medium'),
      fontSize: typography.lg,
      color: semanticColors.textInverse,
    },
    orderBarValue: {
      ...typeface('regular'),
      fontSize: typography.lg,
      color: semanticColors.textInverse,
    },
    purchaseBody: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
      gap: spacing.lg,
    },
    purchaseMain: { flex: 1, minWidth: 180, gap: spacing.sm },
    purchaseRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
    },
    purchaseActions: {
      marginLeft: 'auto',
      alignItems: 'flex-end',
      gap: spacing.xs,
      maxWidth: 220,
      flexShrink: 0,
    },
    actionControl: {
      marginTop: 0,
      alignSelf: 'flex-end',
      paddingHorizontal: spacing.sm,
    },
    asideButton: {
      width: 'auto',
      alignSelf: 'flex-end',
      minHeight: 0,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      marginTop: spacing.xs,
    },
    asideButtonText: {
      fontSize: typography.md,
    },
    productName: {
      ...typeface('medium'),
      fontSize: 18,
      lineHeight: 24,
      color: semanticColors.textPrimary,
    },
    productNameBeside: { flex: 1 },
    giftMessage: {
      ...typeface('regular'),
      fontSize: typography.sm,
      color: semanticColors.textSecondary,
      fontStyle: 'italic',
      lineHeight: 18,
    },
    productPrice: {
      ...typeface('medium'),
      fontSize: typography.xl,
      color: semanticColors.textPrimary,
    },
    orderTitleBlock: { flex: 1, gap: spacing.xs },
    address: {
      ...typeface('regular'),
      fontSize: typography.sm,
      color: semanticColors.textSecondary,
      lineHeight: 18,
    },
    itemsToggle: { alignSelf: 'flex-start' },
    trackingDetail: {
      ...typeface('regular'),
      fontSize: typography.sm,
      color: semanticColors.textSecondary,
      lineHeight: 18,
      textAlign: 'right',
    },
    statusAside: {
      ...typeface('medium'),
      fontSize: typography.lg,
      color: semanticColors.textPrimary,
      textAlign: 'right',
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
      backgroundColor: semanticColors.bgPrimary,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: semanticColors.border,
      padding: spacing.xl,
      zIndex: 1,
    },
    modalTitle: {
      fontSize: 26,
      ...typeface('bold'),
      color: semanticColors.textPrimary,
      marginBottom: spacing.sm,
    },
    modalBody: {
      ...typeface('regular'),
      fontSize: typography.lg,
      lineHeight: 22,
      color: semanticColors.textSecondary,
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
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
    },
    modalKeepText: {
      ...typeface('medium'),
      fontSize: typography.sm,
      color: semanticColors.textSecondary,
    },
    modalCancelConfirmBtn: {
      alignItems: 'center',
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.pill,
      borderWidth: 1,
      borderColor: semanticColors.brand,
    },
    modalCancelConfirmText: {
      ...typeface('medium'),
      fontSize: typography.sm,
      color: semanticColors.brand,
    },
    devChargeBtnDisabled: { opacity: 0.45 },
  });
}
