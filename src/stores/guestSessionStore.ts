import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { BoxLineItem, FamiliarityLevel } from '../types/pilot';
import type { ChildDraft } from '../screens/onboarding/ChildrenScreen';
import type { ChildInterestId } from '../constants/childInterests';

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

export type GuestOnboardingStep =
  | 'hanukkah-intro'
  | 'practices'
  | 'box-intro'
  | 'children'
  | 'child-interests'
  | 'familiarity'
  | 'rav-question'
  | 'building'
  | 'reveal';

type GuestSessionState = {
  _hasHydrated: boolean;
  exploreStarted: boolean;
  /** True when guest chose "build your box" — routes through onboarding */
  buildBoxPath: boolean;
  /** Last onboarding screen reached — resume after refresh */
  onboardingStep: GuestOnboardingStep | null;
  childDrafts: ChildDraft[];
  childInterests: ChildInterestId[];
  familiarityScore: number;
  familiarityLevel: FamiliarityLevel;
  lineItems: BoxLineItem[];
  /** Saved catalog favorites — Rav prioritizes these when building a box. */
  wishlistItemIds: string[];
  ravNotes: string;
  onboardingComplete: boolean;
  boxRevealComplete: boolean;
  /** After guest reveal, open My Box once in main app */
  openMyBoxAfterReveal: boolean;
  hiddenHolidays: string[];
  interests: string[];
  interestEmail: string;
  guestRavPromptCount: number;
  startExplore: () => void;
  startBuildBox: () => void;
  /** Leave onboarding and browse the app without finishing box setup. */
  exitOnboardingToExplore: () => void;
  setChildDrafts: (drafts: ChildDraft[]) => void;
  setChildInterests: (interests: ChildInterestId[]) => void;
  setFamiliarityScore: (score: number) => void;
  setRavNotes: (notes: string) => void;
  setLineItems: (items: BoxLineItem[]) => void;
  toggleWishlistItem: (itemId: string) => void;
  setOnboardingStep: (step: GuestOnboardingStep | null) => void;
  completeOnboarding: () => void;
  completeBoxReveal: () => void;
  consumeOpenMyBoxAfterReveal: () => void;
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
  onboardingStep: null as GuestOnboardingStep | null,
  childDrafts: [] as ChildDraft[],
  childInterests: [] as ChildInterestId[],
  familiarityScore: 50,
  familiarityLevel: 'moderate' as FamiliarityLevel,
  lineItems: [] as BoxLineItem[],
  wishlistItemIds: [] as string[],
  ravNotes: '',
  onboardingComplete: false,
  boxRevealComplete: false,
  openMyBoxAfterReveal: false,
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
      startExplore: () => set({ exploreStarted: true, buildBoxPath: false, onboardingStep: null }),
      startBuildBox: () => set({ exploreStarted: true, buildBoxPath: true }),
      exitOnboardingToExplore: () =>
        set({ exploreStarted: true, buildBoxPath: false, onboardingStep: null }),
      setChildDrafts: (childDrafts) => set({ childDrafts }),
      setChildInterests: (childInterests) => set({ childInterests }),
      setFamiliarityScore: (score) => {
        const clamped = Math.max(0, Math.min(100, score));
        set({ familiarityScore: clamped, familiarityLevel: familiarityScoreToLevel(clamped) });
      },
      setRavNotes: (ravNotes) => set({ ravNotes }),
      setLineItems: (lineItems) => set({ lineItems }),
      toggleWishlistItem: (itemId) => {
        const current = get().wishlistItemIds;
        set({
          wishlistItemIds: current.includes(itemId)
            ? current.filter((id) => id !== itemId)
            : [...current, itemId],
        });
      },
      setOnboardingStep: (onboardingStep) => set({ onboardingStep }),
      completeOnboarding: () => set({ onboardingComplete: true }),
      completeBoxReveal: () =>
        set({ boxRevealComplete: true, openMyBoxAfterReveal: true, onboardingStep: null }),
      consumeOpenMyBoxAfterReveal: () => set({ openMyBoxAfterReveal: false }),
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
        onboardingStep: state.onboardingStep,
        childDrafts: state.childDrafts,
        childInterests: state.childInterests,
        familiarityScore: state.familiarityScore,
        familiarityLevel: state.familiarityLevel,
        lineItems: state.lineItems,
        wishlistItemIds: state.wishlistItemIds,
        ravNotes: state.ravNotes,
        onboardingComplete: state.onboardingComplete,
        boxRevealComplete: state.boxRevealComplete,
        openMyBoxAfterReveal: state.openMyBoxAfterReveal,
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
