import { createContext, useContext } from 'react';

type OnboardingMediaHostContextValue = {
  hosted: boolean;
  buildingTransition: boolean;
};

const defaultContext: OnboardingMediaHostContextValue = {
  hosted: false,
  buildingTransition: false,
};

export const OnboardingMediaHostContext = createContext(defaultContext);

export function useOnboardingMediaHost(): boolean {
  return useContext(OnboardingMediaHostContext).hosted;
}

export function useOnboardingBuildingTransition(): boolean {
  return useContext(OnboardingMediaHostContext).buildingTransition;
}
