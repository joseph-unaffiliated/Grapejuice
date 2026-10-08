import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { BoxLineItem, FamiliarityLevel } from '../types/pilot';
import type { ChildDraft } from '../components/family/familyDraft';
import { remapLegacyCatalogIds, retireLegacyBoxLines } from '../services/box/legacyCatalogIds';

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
  | 'family'
  | 'details'
  | 'email'
  | 'building'
  | 'reveal'
  /** Legacy ids — persisted sessions resolve them to `family` / `details`. */
  | 'hanukkah-intro'
  | 'practices'
  | 'box-intro'
  | 'children'
  | 'child-interests'
  | 'familiarity'
  | 'rav-question';

type GuestSessionState = {
  _hasHydrated: boolean;
  exploreStarted: boolean;
  /** True when guest chose "build your box" — routes through onboarding */
  buildBoxPath: boolean;
  /** Last onboarding screen reached — resume after refresh */
  onboardingStep: GuestOnboardingStep | null;
  childDrafts: ChildDraft[];
  childInterests: string[];
  familiarityScore: number;
  familiarityLevel: FamiliarityLevel;
  /** 0–100: "Almost never" to "Every day" for Jewish practice in general. */
  practiceFrequencyScore: number;
  lineItems: BoxLineItem[];
  /** Saved catalog favorites — Rav prioritizes these when building a box. */
  wishlistItemIds: string[];
  ravNotes: string;
  /** Catalog item ids marked “to be wrapped” on My Box. */
  wrapSelectedItemIds: string[];
  onboardingComplete: boolean;
  boxRevealComplete: boolean;
  /** After guest reveal, open My Box once in main app */
  openMyBoxAfterReveal: boolean;
  hiddenHolidays: string[];
  interests: string[];
  interestEmail: string;
  /** Email that already has an account — we emailed a login link to save this box. */
  pendingAccountEmail: string;
  guestRavPromptCount: number;
  startExplore: () => void;
  startBuildBox: () => void;
  /** Leave onboarding and browse the app without finishing box setup. */
  exitOnboardingToExplore: () => void;
  setChildDrafts: (drafts: ChildDraft[]) => void;
  setChildInterests: (interests: string[]) => void;
  setFamiliarityScore: (score: number) => void;
  setPracticeFrequencyScore: (score: number) => void;
  setRavNotes: (notes: string) => void;
  setLineItems: (items: BoxLineItem[]) => void;
  setWrapSelectedItemIds: (ids: string[]) => void;
  toggleWishlistItem: (itemId: string) => void;
  setOnboardingStep: (step: GuestOnboardingStep | null) => void;
  completeOnboarding: () => void;
  completeBoxReveal: () => void;
  consumeOpenMyBoxAfterReveal: () => void;
  toggleInterest: (interest: string) => void;
  setInterestEmail: (email: string) => void;
  setPendingAccountEmail: (email: string) => void;
  toggleHiddenHoliday: (holidayId: string) => void;
  recordGuestRavPrompt: () => void;
  /** Clear curated box + completion flags so onboarding can run again. */
  resetBox: () => void;
  reset: () => void;
  setHasHydrated: (value: boolean) => void;
};

const initialState = {
  exploreStarted: true,
  buildBoxPath: false,
  onboardingStep: null as GuestOnboardingStep | null,
  childDrafts: [] as ChildDraft[],
  childInterests: [] as string[],
  familiarityScore: 50,
  familiarityLevel: 'moderate' as FamiliarityLevel,
  practiceFrequencyScore: 50,
  lineItems: [] as BoxLineItem[],
  wrapSelectedItemIds: [] as string[],
  wishlistItemIds: [] as string[],
  ravNotes: '',
  onboardingComplete: false,
  boxRevealComplete: false,
  openMyBoxAfterReveal: false,
  hiddenHolidays: [] as string[],
  interests: [] as string[],
  interestEmail: '',
  pendingAccountEmail: '',
  guestRavPromptCount: 0,
};

export const useGuestSessionStore = create<GuestSessionState>()(
  persist(
    (set, get) => ({
      // Web: don't block RootNavigator on AsyncStorage rehydration — storefront
      // defaults (exploreStarted: true) are safe for first paint; persist still
      // merges afterward. Native keeps the gate until rehydrate completes.
      _hasHydrated: typeof window !== 'undefined',
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
      setPracticeFrequencyScore: (score) =>
        set({ practiceFrequencyScore: Math.max(0, Math.min(100, score)) }),
      setRavNotes: (ravNotes) => set({ ravNotes }),
      setLineItems: (lineItems) => set({ lineItems }),
      setWrapSelectedItemIds: (wrapSelectedItemIds) => set({ wrapSelectedItemIds }),
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
        set({
          boxRevealComplete: true,
          openMyBoxAfterReveal: true,
          onboardingStep: null,
          buildBoxPath: false,
        }),
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
      setPendingAccountEmail: (pendingAccountEmail) =>
        set({ pendingAccountEmail: pendingAccountEmail.trim() }),
      toggleHiddenHoliday: (holidayId) => {
        const current = get().hiddenHolidays;
        set({
          hiddenHolidays: current.includes(holidayId)
            ? current.filter((id) => id !== holidayId)
            : [...current, holidayId],
        });
      },
      recordGuestRavPrompt: () => set((s) => ({ guestRavPromptCount: s.guestRavPromptCount + 1 })),
      resetBox: () =>
        set({
          lineItems: [],
          wrapSelectedItemIds: [],
          onboardingComplete: false,
          boxRevealComplete: false,
          openMyBoxAfterReveal: false,
          onboardingStep: null,
          buildBoxPath: false,
          exploreStarted: true,
        }),
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
        practiceFrequencyScore: state.practiceFrequencyScore,
        lineItems: state.lineItems,
        wrapSelectedItemIds: state.wrapSelectedItemIds,
        wishlistItemIds: state.wishlistItemIds,
        ravNotes: state.ravNotes,
        onboardingComplete: state.onboardingComplete,
        boxRevealComplete: state.boxRevealComplete,
        openMyBoxAfterReveal: state.openMyBoxAfterReveal,
        hiddenHolidays: state.hiddenHolidays,
        interests: state.interests,
        interestEmail: state.interestEmail,
        pendingAccountEmail: state.pendingAccountEmail,
        guestRavPromptCount: state.guestRavPromptCount,
      }),
      onRehydrateStorage: () => (state) => {
        // Storefront is the default surface — never re-open the Welcome gateway.
        if (state && !state.exploreStarted) {
          state.exploreStarted = true;
        }
        if (state) {
          const retired = retireLegacyBoxLines(state.lineItems ?? []);
          if (retired.dirty) state.setLineItems(retired.lineItems);
          const wish = remapLegacyCatalogIds(state.wishlistItemIds ?? []);
          if (wish !== state.wishlistItemIds) useGuestSessionStore.setState({ wishlistItemIds: wish });
          const wrap = remapLegacyCatalogIds(state.wrapSelectedItemIds ?? []);
          if (wrap !== state.wrapSelectedItemIds) state.setWrapSelectedItemIds(wrap);
        }
        state?.setHasHydrated(true);
      },
    }
  )
);
