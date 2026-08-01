import { Alert, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSession } from './useSession';
import { DEFAULT_BOX_PRICE_CENTS } from '../services/box/pricing';
import type { MainStackParamList } from '../navigation/types';

export function usePaymentGate() {
  const { household } = useSession();
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();

  const cardOnFile = !!household?.cardOnFileAt;
  const giftCreditCents = household?.giftCreditCents ?? 0;
  const platformCreditCents = household?.platformCreditCents ?? 0;
  const totalCreditCents = giftCreditCents + platformCreditCents;
  const canMutateBox = cardOnFile || totalCreditCents >= DEFAULT_BOX_PRICE_CENTS;

  const guardMutation = (): boolean => {
    if (canMutateBox) return true;
    const title = 'Add payment to customize';
    const body =
      "Save a card to swap items and add extras. You won't be charged until your box ships.";
    // RN Alert is unreliable on web — use confirm so the gate isn't silent.
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`${title}\n\n${body}`)) {
        navigation.navigate('Checkout');
      }
      return false;
    }
    Alert.alert(title, body, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Add payment', onPress: () => navigation.navigate('Checkout') },
    ]);
    return false;
  };

  return { canMutateBox, cardOnFile, giftCreditCents, platformCreditCents, totalCreditCents, guardMutation };
}
