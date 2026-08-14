import React from 'react';
import { ModularLandingScreen } from './ModularLandingScreen';

/** Cultural / “Jewish, your way” landing (`/your-way`). */
export function CulturalLandingScreen() {
  return (
    <ModularLandingScreen
      audienceId="cultural"
      ravSurface={{ id: 'landing-cultural', label: 'Cultural landing' }}
    />
  );
}
