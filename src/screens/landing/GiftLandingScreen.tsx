import { useEffect } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { MainStackParamList } from '../../navigation/types';

type GiftLandingRoute = RouteProp<MainStackParamList, 'GiftLanding'>;

/** `/gift` forwards straight to the gift form (`/gift/give`); `?path=` still preselects. */
export function GiftLandingScreen() {
  const route = useRoute<GiftLandingRoute>();
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const preferredGiftPath = route.params?.preferredGiftPath;

  useEffect(() => {
    navigation.replace('GiftGive', preferredGiftPath ? { initialGiftPath: preferredGiftPath } : undefined);
  }, [navigation, preferredGiftPath]);

  return null;
}
