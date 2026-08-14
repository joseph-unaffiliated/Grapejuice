import React from 'react';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { MainStackParamList } from '../../navigation/types';
import { ModularLandingScreen } from './ModularLandingScreen';

type GiftLandingRoute = RouteProp<MainStackParamList, 'GiftLanding'>;

/** Modular gift campaign landing (`/gift`). */
export function GiftLandingScreen() {
  const route = useRoute<GiftLandingRoute>();
  const preferredGiftPath = route.params?.preferredGiftPath ?? null;

  return (
    <ModularLandingScreen
      audienceId="gift"
      preferredGiftPath={preferredGiftPath}
      ravSurface={{ id: 'landing-gift', label: 'Gift landing' }}
    />
  );
}
