import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { BoxLineItem, FamiliarityLevel } from '../types/pilot';
import type { ChildDraft } from '../screens/onboarding/ChildrenScreen';

export function familiarityScoreToLevel(score: number): FamiliarityLevel {
  if (score <= 33) return 'minimal';
  if (score <= 66) return 'moderate';
  return 'all-in';
}

export function familiarityLevelToScore(level: FamiliarityLevel): number {
  if (level === 'minimal') return 15;
  if (level === 'moderate') return 50;
  return 85;
}

type GuestSessionState = {
  _hasHydrated: boolean;
  exploreStarted: boolean;
  /** True when guest chose "build your box" — routes through onboarding */
  buildBoxPath: boolean;
  childDrafts: ChildDraft[];
  familiarityScore: number;
  familiarityLevel: FamiliarityLevel;
  lineItems: BoxLineItem[];
  ravNotes: string;
  onboardingComplete: boolean;
  boxRevealComplete: boolean;
  hiddenHolidays: string[];
  interests: string[];
  interestEmail: string;
  guestRavPromptCount: number;
  startExplore: () => void;
  startBuildBox: () => void;
  setChildDrafts: (drafts: ChildDraft[]) => void;
  setFamiliarityScore: (score: number) => void;
  setRavNotes: (notes: string) => void;
  setLineItems: (items: BoxLineItem[]) => void;
  completeOnboarding: () => void;
  completeBoxReveal: () => void;
  toggleInterest: (interest: string) => void;
  setInterestEmail: (email: string) => void;
  toggleHiddenHoliday: (holidayId: string) => void;
  recordGuestRavPrompt: () => void;
  reset: () => void;
  setHasHydrated: (value: boolean) => void;
};

const initialState = {
  exploreStarted: false,
  buildBoxPath: false,
  childDrafts: [] as ChildDraft[],
  familiarityScore: 50,
  familiarityLevel: 'moderate' as FamiliarityLevel,
  lineItems: [] as BoxLineItem[],
  ravNotes: '',
  onboardingComplete: false,
  boxRevealComplete: false,
  hiddenHolidays: [] as string[],
  interests: [] as string[],
  interestEmail: '',
  guestRavPromptCount: 0,
};

export const useGuestSessionStore = create<GuestSessionState>()(
  persist(
    (set, get) => ({
      _hasHydrated: false,
      ...initialState,
      startExplore: () => set({ exploreStarted: true, buildBoxPath: false }),
      startBuildBox: () => set({ exploreStarted: true, buildBoxPath: true }),
      setChildDrafts: (childDrafts) => set({ childDrafts }),
      setFamiliarityScore: (score) => {
        const clamped = Math.max(0, Math.min(100, score));
        set({ familiarityScore: clamped, familiarityLevel: familiarityScoreToLevel(clamped) });
      },
      setRavNotes: (ravNotes) => set({ ravNotes }),
      setLineItems: (lineItems) => set({ lineItems }),
      completeOnboarding: () => set({ onboardingComplete: true }),
      completeBoxReveal: () => set({ boxRevealComplete: true }),
      toggleInterest: (interest) => {
        const current = get().interests;
        set({
          interests: current.includes(interest)
            ? current.filter((i) => i !== interest)
            : [...current, interest],
        });
      },
      setInterestEmail: (interestEmail) => set({ interestEmail: interestEmail.trim() }),
      toggleHiddenHoliday: (holidayId) => {
        const current = get().hiddenHolidays;
        set({
          hiddenHolidays: current.includes(holidayId)
            ? current.filter((id) => id !== holidayId)
            : [...current, holidayId],
        });
      },
      recordGuestRavPrompt: () => set((s) => ({ guestRavPromptCount: s.guestRavPromptCount + 1 })),
      reset: () => set({ ...initialState, _hasHydrated: true }),
      setHasHydrated: (value) => set({ _hasHydrated: value }),
    }),
    {
      name: 'grapejuice-guest-session',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        exploreStarted: state.exploreStarted,
        buildBoxPath: state.buildBoxPath,
        childDrafts: state.childDrafts,
        familiarityScore: state.familiarityScore,
        familiarityLevel: state.familiarityLevel,
        lineItems: state.lineItems,
        ravNotes: state.ravNotes,
        onboardingComplete: state.onboardingComplete,
        boxRevealComplete: state.boxRevealComplete,
        hiddenHolidays: state.hiddenHolidays,
        interests: state.interests,
        interestEmail: state.interestEmail,
        guestRavPromptCount: state.guestRavPromptCount,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
