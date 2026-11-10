import { useSession } from './useSession';
import { resolvePreviewCanMutateBox, resolvePreviewOpenOrder } from './useUserStatePreview';
import { useUserStatePreviewStore } from '../stores/userStatePreviewStore';
import { usePilotOrders } from './usePilotOrders';
import { DEFAULT_BOX_PRICE_CENTS } from '../services/box/pricing';

export function usePaymentGate() {
  const { household } = useSession();
  const preview = useUserStatePreviewStore((s) => s.preview);
  const { openOrder: realOpenOrder, loading: ordersLoading, refresh: refreshOrders } = usePilotOrders(
    household?.id
  );
  const openOrder = resolvePreviewOpenOrder(preview, realOpenOrder);

  // Prefer the stamp; also trust a stored default PM (admin dashboards already OR these).
  const cardOnFile = !!(household?.cardOnFileAt || household?.stripeDefaultPaymentMethodId);
  const giftCreditCents = household?.giftCreditCents ?? 0;
  const platformCreditCents = household?.platformCreditCents ?? 0;
  const totalCreditCents = giftCreditCents + platformCreditCents;
  // Live mutate uses the real order (not the locked-preview stand-in).
  const realCanMutate =
    !!realOpenOrder || cardOnFile || totalCreditCents >= DEFAULT_BOX_PRICE_CENTS;
  const canMutateBox = resolvePreviewCanMutateBox(preview, realCanMutate);

  /**
   * Never block add/swap with a browser confirm / Alert.
   * Once the guest timer is gone (signed in), customize freely;
   * card capture still happens at checkout / charge-at-lock.
   */
  const guardMutation = (): boolean => true;

  return {
    canMutateBox,
    cardOnFile,
    giftCreditCents,
    platformCreditCents,
    totalCreditCents,
    openOrder,
    ordersLoading,
    refreshOrders,
    guardMutation,
  };
}
