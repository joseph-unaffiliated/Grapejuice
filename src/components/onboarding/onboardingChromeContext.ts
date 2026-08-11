import { createContext, useContext } from 'react';

/** True when onboarding/reveal sits under StorefrontChrome (hide duplicate corner mark). */
export const OnboardingUnderStorefrontChromeContext = createContext(false);

export function useOnboardingUnderStorefrontChrome(): boolean {
  return useContext(OnboardingUnderStorefrontChromeContext);
}
