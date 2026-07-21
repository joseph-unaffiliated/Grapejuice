import { create } from 'zustand';
import type { AuthStackParamList, MainStackParamList, MainTabsParamList } from '../navigation/types';

export type DevPreviewGate = 'auth' | 'onboarding' | 'main';

export type OnboardingPreviewStep =
  | 'hanukkah-intro'
  | 'practices'
  | 'box-intro'
  | 'children'
  | 'child-interests'
  | 'familiarity'
  | 'rav-question'
  | 'building'
  | 'reveal';

type PendingMainNav = {
  screen: keyof MainStackParamList;
  params?: MainStackParamList[keyof MainStackParamList];
  tab?: keyof MainTabsParamList;
  tabParams?: MainTabsParamList[keyof MainTabsParamList];
};

type DevPreviewState = {
  enabled: boolean;
  previewKey: string | null;
  forceGate: DevPreviewGate | null;
  authInitialRoute: keyof AuthStackParamList | null;
  onboardingInitialStep: OnboardingPreviewStep | null;
  /** `?preview=onboarding-building&hold=1` — stay on building screen for design tweaks. */
  onboardingBuildingHold: boolean;
  pendingMainNav: PendingMainNav | null;
  reset: () => void;
  applyPreview: (key: string) => void;
  consumePendingMainNav: () => PendingMainNav | null;
};

const initial = {
  enabled: false,
  previewKey: null as string | null,
  forceGate: null as DevPreviewGate | null,
  authInitialRoute: null as keyof AuthStackParamList | null,
  onboardingInitialStep: null as OnboardingPreviewStep | null,
  onboardingBuildingHold: false,
  pendingMainNav: null as PendingMainNav | null,
};

export const useDevPreviewStore = create<DevPreviewState>((set, get) => ({
  ...initial,
  reset: () => set(initial),
  consumePendingMainNav: () => {
    const nav = get().pendingMainNav;
    if (nav) set({ pendingMainNav: null });
    return nav;
  },
  applyPreview: (key) => {
    set({ ...initial, enabled: true, previewKey: key });
  },
}));
