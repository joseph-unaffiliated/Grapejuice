import { useBoxEditingLocked } from './useUserStatePreview';
import { usePaymentGate } from './usePaymentGate';

/** Seasonal lock, or this household's own box already frozen. */
export function useLiveBoxLocked(lockAt: string | null): boolean {
  const { openOrder } = usePaymentGate();
  return useBoxEditingLocked(lockAt, openOrder);
}
