import React from 'react';
import { ModularLandingScreen } from './ModularLandingScreen';

/** Convenience / easy delivery landing (`/convenience`). */
export function ConvenienceLandingScreen() {
  return (
    <ModularLandingScreen
      audienceId="convenience"
      ravSurface={{ id: 'landing-convenience', label: 'Convenience landing' }}
    />
  );
}
