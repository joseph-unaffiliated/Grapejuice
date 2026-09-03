import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useSession } from './useSession';
import { ordersService } from '../services/firestore/orders';
import { listMyGiftInvites } from '../services/gift/giftFlow';
import { giftInvitesService } from '../services/firestore/giftInvites';
import { giftInviteOrderTitle } from '../constants/giftCopy';
import type { GiftInvite, PilotOrder } from '../types/pilot';

export type UnifiedOrderKind = 'box' | 'gift' | 'ala_carte';

export type UnifiedOrder = {
  id: string;
  kind: UnifiedOrderKind;
  title: string;
  recipientLabel?: string;
  statusLabel: string;
  totalCents: number;
  createdAt: string;
  trackingNumber?: string | null;
  carrier?: string | null;
  pilotOrder?: PilotOrder;
  giftInvite?: GiftInvite;
};

function giftStatusLabel(invite: GiftInvite): string {
  const paid =
    invite.paymentStatus === 'paid' ||
    Boolean(invite.claimEmailSentAt) ||
    invite.status === 'claimed';
  if (!paid) return 'Payment pending';
  if (invite.status === 'claimed') return 'Claimed by recipient';
  return 'Sent · awaiting claim';
}

function giftTitle(invite: GiftInvite): string {
  return giftInviteOrderTitle(invite);
}

function toUnifiedFromPilot(order: PilotOrder): UnifiedOrder {
  return {
    id: order.id,
    kind: 'box',
    title: 'Hanukkah box',
    recipientLabel: order.shippingAddress?.name?.trim() || undefined,
    statusLabel: orderStatusLabel(order.status),
    totalCents: order.totalCents,
    createdAt: order.createdAt ?? new Date(0).toISOString(),
    trackingNumber: order.trackingNumber,
    carrier: order.carrier,
    pilotOrder: order,
  };
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
        errors.push(e instanceof Error ? e.message : 'Could not load box orders');
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

  const orders = useMemo(() => {
    const unified: UnifiedOrder[] = [
      ...pilotOrders.map(toUnifiedFromPilot),
      ...giftInvites.map(toUnifiedFromGift),
    ];
    unified.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return unified;
  }, [pilotOrders, giftInvites]);

  return { orders, pilotOrders, giftInvites, loading, loadError, refresh };
}
