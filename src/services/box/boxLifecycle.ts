import type { BoxLifecycleStatus, DeliveryTimelineStep, PilotOrder } from '../../types/pilot';

type Input = {
  itemCount: number;
  hasOrder: boolean;
  primaryOrder: PilotOrder | null;
};

export function deriveBoxLifecycle({ itemCount, hasOrder, primaryOrder }: Input): BoxLifecycleStatus {
  if (primaryOrder?.status === 'delivered') return 'delivered';
  if (primaryOrder?.status === 'shipped') {
    return primaryOrder.trackingNumber ? 'in_transit' : 'shipped';
  }
  if (hasOrder && primaryOrder?.status === 'confirmed') return 'ordered';
  if (itemCount > 0) return 'customizing';
  return 'not_started';
}

export function buildDeliveryTimeline(
  lifecycle: BoxLifecycleStatus,
  order: PilotOrder | null,
  estimatedDelivery?: string | null
): DeliveryTimelineStep[] {
  const shipped = lifecycle === 'shipped' || lifecycle === 'in_transit' || lifecycle === 'delivered';
  const delivered = lifecycle === 'delivered';
  const ordered = lifecycle === 'ordered' || shipped || delivered;

  const trackingDetail =
    order?.trackingNumber && order?.carrier
      ? `${order.carrier} · ${order.trackingNumber}`
      : order?.trackingNumber
        ? order.trackingNumber
        : undefined;

  return [
    {
      id: 'confirmed',
      label: 'Order confirmed',
      detail: order?.confirmedAt ? 'We received your order' : undefined,
      completed: ordered,
      active: lifecycle === 'ordered',
    },
    {
      id: 'preparing',
      label: 'Preparing your box',
      detail: 'Curating items for your family',
      completed: shipped || delivered,
      active: lifecycle === 'ordered',
    },
    {
      id: 'shipped',
      label: 'Shipped',
      detail: trackingDetail ?? (shipped ? 'On the way to you' : undefined),
      completed: shipped || delivered,
      active: lifecycle === 'shipped' || lifecycle === 'in_transit',
    },
    {
      id: 'delivery',
      label: 'Out for delivery',
      detail: estimatedDelivery ? `Expected by ${estimatedDelivery}` : undefined,
      completed: delivered,
      active: lifecycle === 'in_transit',
    },
    {
      id: 'delivered',
      label: 'Delivered',
      detail: delivered ? 'Your box has arrived' : undefined,
      completed: delivered,
      active: delivered,
    },
  ];
}

export function heroTitleForLifecycle(lifecycle: BoxLifecycleStatus): string {
  switch (lifecycle) {
    case 'customizing':
      return 'Refine your Hanukkah box';
    case 'ordered':
    case 'shipped':
    case 'in_transit':
      return 'Your Hanukkah box is on its way';
    case 'delivered':
      return 'Your Hanukkah box has arrived';
    default:
      return 'Start your Hanukkah Box';
  }
}
