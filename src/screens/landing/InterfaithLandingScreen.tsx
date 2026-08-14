import React from 'react';
import { ModularLandingScreen } from './ModularLandingScreen';

/** Interfaith homes landing (`/interfaith`). */
export function InterfaithLandingScreen() {
  return (
    <ModularLandingScreen
      audienceId="interfaith"
      ravSurface={{ id: 'landing-interfaith', label: 'Interfaith landing' }}
    />
  );
}
