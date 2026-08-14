import React from 'react';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { MainStackParamList } from '../../navigation/types';
import { ModularLandingScreen } from './ModularLandingScreen';

type Route = RouteProp<MainStackParamList, 'DynamicLanding'>;

/**
 * CMS + seed campaign landing resolved by id (non-gift).
 * Web deep links land here via LandingLinkEffect.
 */
export function DynamicLandingScreen() {
  const route = useRoute<Route>();
  const landingId = route.params?.landingId?.trim() || '';

  if (!landingId) return null;

  return (
    <ModularLandingScreen
      audienceId={landingId}
      ravSurface={{ id: `landing-${landingId}`, label: `Landing · ${landingId}` }}
    />
  );
}
