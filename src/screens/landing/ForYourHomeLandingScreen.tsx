import React from 'react';
import { ModularLandingScreen } from './ModularLandingScreen';

/** For your home landing (`/for-your-home`). */
export function ForYourHomeLandingScreen() {
  return (
    <ModularLandingScreen
      audienceId="for_your_home"
      ravSurface={{ id: 'landing-for-your-home', label: 'For your home landing' }}
    />
  );
}
