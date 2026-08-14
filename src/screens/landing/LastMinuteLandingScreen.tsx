import React from 'react';
import { ModularLandingScreen } from './ModularLandingScreen';

/** Last-minute ready landing (`/last-minute`). */
export function LastMinuteLandingScreen() {
  return (
    <ModularLandingScreen
      audienceId="last_minute"
      ravSurface={{ id: 'landing-last-minute', label: 'Last-minute landing' }}
    />
  );
}
