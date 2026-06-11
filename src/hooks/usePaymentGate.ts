import { Alert } from 'react-native';
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
  const canMutateBox = cardOnFile || giftCreditCents >= DEFAULT_BOX_PRICE_CENTS;

  const guardMutation = (): boolean => {
    if (canMutateBox) return true;
    Alert.alert(
      'Add payment to customize',
      "Save a card to swap items and add extras. You won't be charged until your box ships.",
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Add payment', onPress: () => navigation.navigate('Checkout') },
      ]
    );
    return false;
  };

  return { canMutateBox, cardOnFile, giftCreditCents, guardMutation };
}
