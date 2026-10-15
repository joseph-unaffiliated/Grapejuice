import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useSession } from './useSession';
import { ordersService } from '../services/firestore/orders';
import { listMyGiftInvites } from '../services/gift/giftFlow';
import { giftInvitesService } from '../services/firestore/giftInvites';
import { giftInviteOrderTitle } from '../constants/giftCopy';
import { checkoutTotalsAfterCredit } from '../services/box/pricing';
import type { GiftInvite, PilotOrder } from '../types/pilot';

export type UnifiedOrderKind = 'box' | 'gift' | 'ala_carte';

export type UnifiedOrder = {
  id: string;
  kind: UnifiedOrderKind;
  title: string;
  recipientLabel?: string;
  statusLabel: string;
  totalCents: number;
  /** Open box: credit lock will apply (already taken off `totalCents`). */
  creditCents?: number;
  createdAt: string;
  trackingNumber?: string | null;
  carrier?: string | null;
  pilotOrder?: PilotOrder;
  giftInvite?: GiftInvite;
};

export function giftInvitePaid(invite: GiftInvite): boolean {
  return (
    invite.paymentStatus === 'paid' ||
    Boolean(invite.claimEmailSentAt) ||
    invite.status === 'claimed'
  );
}

function giftStatusLabel(invite: GiftInvite): string {
  const paid = giftInvitePaid(invite);
  if (!paid && invite.status === 'cancelled') return 'Cancelled';
  if (!paid) return 'Payment pending';
  if (invite.status === 'claimed') return 'Claimed by recipient';
  return 'Sent · awaiting claim';
}

function giftTitle(invite: GiftInvite): string {
  return giftInviteOrderTitle(invite);
}

function marketplaceTitle(order: PilotOrder): string {
  const labels = (order.lineItems ?? [])
    .map((li) => {
      const qty = Math.max(1, Math.floor(Number(li.quantity) || 1));
      const name = String(li.label ?? li.itemId ?? '').trim();
      if (!name) return '';
      return qty > 1 ? `${qty}× ${name}` : name;
    })
    .filter(Boolean);
  if (labels.length === 0) return 'Purchase';
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} + ${labels[1]}`;
  return `${labels[0]} + ${labels.length - 1} more`;
}

function toUnifiedFromPilot(order: PilotOrder): UnifiedOrder {
  const isMarketplace = order.orderType === 'marketplace';
  const isReceivedGift = order.orderType === 'received_gift' || Boolean(order.giftInviteId);
  const kind: UnifiedOrderKind = isMarketplace || isReceivedGift ? 'ala_carte' : 'box';
  const title = isMarketplace
    ? marketplaceTitle(order)
    : isReceivedGift
      ? 'Gift you received'
      : 'Hanukkah box';

  return {
    id: order.id,
    kind,
    title,
    recipientLabel: order.shippingAddress?.name?.trim() || undefined,
    statusLabel: orderStatusLabel(order.status),
    totalCents: order.totalCents,
    createdAt: order.createdAt ?? new Date(0).toISOString(),
    trackingNumber: order.trackingNumber,
    carrier: order.carrier,
    pilotOrder: order,
  };
}

type CreditSplit = { gift: number; platform: number };

/** What lock will charge an open box: checkout's reserved credit plus the balance (settleLockCredit). */
function withLockCredit(u: UnifiedOrder, order: PilotOrder, balance: CreditSplit): UnifiedOrder {
  if (typeof order.subtotalCents !== 'number') return u;
  const t = checkoutTotalsAfterCredit({
    merchandiseCents: order.subtotalCents + (order.shippingCents ?? 0),
    giftCreditCents: (order.giftCreditAppliedCents ?? 0) + balance.gift,
    platformCreditCents: (order.platformCreditAppliedCents ?? 0) + balance.platform,
    discountCents: order.discountCents,
  });
  return { ...u, totalCents: t.totalCents, creditCents: t.creditApplied };
}

function toUnifiedFromGift(invite: GiftInvite): UnifiedOrder {
  return {
    id: invite.id,
    kind: 'gift',
    title: giftTitle(invite),
    recipientLabel: invite.recipientEmail,
    statusLabel: giftStatusLabel(invite),
    totalCents: invite.creditCents,
    createdAt: invite.createdAt,
    giftInvite: invite,
  };
}

function orderStatusLabel(status: PilotOrder['status']): string {
  switch (status) {
    case 'pending':
      return 'Processing payment';
    case 'committed':
      return 'Committed — charged at lock';
    case 'confirmed':
      return 'Confirmed';
    case 'shipped':
      return 'Shipped';
    case 'delivered':
      return 'Delivered';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

export function useUnifiedOrders() {
  const user = useAuthStore((s) => s.user);
  const { household } = useSession();
  const [pilotOrders, setPilotOrders] = useState<PilotOrder[]>([]);
  const [giftInvites, setGiftInvites] = useState<GiftInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.uid) {
      setPilotOrders([]);
      setGiftInvites([]);
      setLoadError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    const errors: string[] = [];

    let orders: PilotOrder[] = [];
    if (household?.id) {
      try {
        orders = await ordersService.listForHousehold(household.id);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : 'Could not load orders');
      }
    }

    let gifts: GiftInvite[] = [];
    try {
      gifts = await listMyGiftInvites();
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'Could not load gift orders');
      try {
        gifts = await giftInvitesService.listForGiver(user.uid);
      } catch (fallbackErr) {
        if (__DEV__) {
          console.warn('[orders] gift fallback failed', fallbackErr);
        }
      }
    }

    setPilotOrders(orders);
    setGiftInvites(gifts);
    setLoadError(errors.length ? errors.join(' · ') : null);
    setLoading(false);
  }, [household?.id, user?.uid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const giftBalance = household?.giftCreditCents ?? 0;
  const platformBalance = household?.platformCreditCents ?? 0;
  const orders = useMemo(() => {
    let balance: CreditSplit = { gift: giftBalance, platform: platformBalance };
    const unified: UnifiedOrder[] = [
      // A gift box shipped from the giver's household is already listed as their gift.
      ...pilotOrders
        .filter((o) => !o.autoShipForGiver)
        .map((o) => {
          const u = toUnifiedFromPilot(o);
          if (u.kind !== 'box' || (o.status !== 'committed' && o.status !== 'pending')) return u;
          const projected = withLockCredit(u, o, balance);
          balance = { gift: 0, platform: 0 };
          return projected;
        }),
      ...giftInvites.map(toUnifiedFromGift),
    ];
    unified.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return unified;
  }, [pilotOrders, giftInvites, giftBalance, platformBalance]);

  return { orders, pilotOrders, giftInvites, loading, loadError, refresh };
}
