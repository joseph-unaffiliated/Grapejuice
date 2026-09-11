import { useSession } from './useSession';
import { resolvePreviewCanMutateBox } from './useUserStatePreview';
import { useUserStatePreviewStore } from '../stores/userStatePreviewStore';
import { usePilotOrders } from './usePilotOrders';
import { DEFAULT_BOX_PRICE_CENTS } from '../services/box/pricing';

export function usePaymentGate() {
  const { household } = useSession();
  const preview = useUserStatePreviewStore((s) => s.preview);
  const { openOrder, loading: ordersLoading, refresh: refreshOrders } = usePilotOrders(household?.id);

  const cardOnFile = !!household?.cardOnFileAt;
  const giftCreditCents = household?.giftCreditCents ?? 0;
  const platformCreditCents = household?.platformCreditCents ?? 0;
  const totalCreditCents = giftCreditCents + platformCreditCents;
  const realCanMutate =
    !!openOrder || cardOnFile || totalCreditCents >= DEFAULT_BOX_PRICE_CENTS;
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
