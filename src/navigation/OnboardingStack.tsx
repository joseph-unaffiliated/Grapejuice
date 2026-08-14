import React, { useEffect, useCallback, useState, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, Alert, Platform } from 'react-native';
import { type ChildDraft } from '../screens/onboarding/ChildrenScreen';
import { WhatWeDoScreen } from '../screens/onboarding/WhatWeDoScreen';
import { HanukkahIntroScreen } from '../screens/onboarding/HanukkahIntroScreen';
import { BoxIntroScreen } from '../screens/onboarding/BoxIntroScreen';
import { RavOpenQuestionScreen } from '../screens/onboarding/RavOpenQuestionScreen';
import { BuildingBoxScreen } from '../screens/onboarding/BuildingBoxScreen';
import { useAuthStore } from '../stores/authStore';
import { useGuestSessionStore, familiarityLevelToScore } from '../stores/guestSessionStore';
import { useSession } from '../hooks/useSession';
import { childrenService } from '../services/firestore/children';
import { usersService } from '../services/firestore/users';
import { householdsService } from '../services/firestore/households';
import { catalogService } from '../services/firestore/catalog';
import { boxDraftService } from '../services/firestore/boxDraft';
import { buildDefaultLineItems } from '../services/box/buildDefaultBox';
import type { BoxLineItem, FamiliarityLevel, ChildProfile } from '../types/pilot';
import { semanticColors } from '../constants/theme';
import type { OnboardingPreviewStep } from '../stores/devPreviewStore';
import { useDevPreviewStore } from '../stores/devPreviewStore';
import { clearDevPreview } from './devPreview';
import {
  onboardingErrorMessage,
  resolveOnboardingStep,
  wizardNavStepId,
  wizardNavStepIndex,
  type OnboardingStep,
  type OnboardingWizardNavStepId,
} from './onboardingSteps';
import { OnboardingMediaHost } from '../components/onboarding/OnboardingMediaHost';
import { OnboardingUnderStorefrontChromeContext } from '../components/onboarding/onboardingChromeContext';
import { OnboardingWizardNav } from '../components/onboarding/OnboardingWizardNav';
import {
  StorefrontChrome,
} from '../components/storefront/StorefrontChrome';
import type { StorefrontLeaveTarget } from '../components/storefront/storefrontLeaveContext';
import { queuePendingMainNav } from './pendingMainNav';
import { DEFAULT_STOREFRONT_CATEGORY } from '../constants/storefrontCategories';
import { BrandLoadingMark } from '../components/brand/BrandLoadingMark';

type Props = {
  onComplete?: () => void;
  revealOnly?: boolean;
  isGuest?: boolean;
  initialStep?: OnboardingPreviewStep;
};

function draftsToProfiles(drafts: ChildDraft[]): ChildProfile[] {
  return drafts
    .filter((d) => d.role !== 'adult')
    .map((d, i) => ({
      id: `guest-${i}`,
      name: d.name || undefined,
      ageGroup: d.ageGroup,
      birthdate: d.birthdate,
      plannerAge: d.plannerAge,
    }));
}

function adultCountFromDrafts(drafts: ChildDraft[]): number | undefined {
  const n = drafts.filter((d) => d.role === 'adult').length;
  return n > 0 ? n : undefined;
}

async function ensureHouseholdId(uid: string, householdId: string | null | undefined): Promise<string> {
  if (householdId) {
    const existing = await householdsService.get(householdId);
    if (existing && !existing.memberIds.includes(uid)) {
      await householdsService.addMember(householdId, uid);
    }
    return householdId;
  }
  const created = await householdsService.createForOwner(uid);
  await usersService.upsert(uid, { householdId: created.id });
  return created.id;
}

export function OnboardingStack({
  onComplete,
  revealOnly = false,
  isGuest = false,
  initialStep,
}: Props) {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const guestChildDrafts = useGuestSessionStore((s) => s.childDrafts);
  const guestChildInterests = useGuestSessionStore((s) => s.childInterests);
  const guestFamiliarityLevel = useGuestSessionStore((s) => s.familiarityLevel);
  const guestFamiliarityScore = useGuestSessionStore((s) => s.familiarityScore);
  const guestRavNotes = useGuestSessionStore((s) => s.ravNotes);
  const guestLineItems = useGuestSessionStore((s) => s.lineItems);
  const guestOnboardingComplete = useGuestSessionStore((s) => s.onboardingComplete);
  const guestBoxRevealComplete = useGuestSessionStore((s) => s.boxRevealComplete);
  const persistedOnboardingStep = useGuestSessionStore((s) => s.onboardingStep);
  const setGuestChildDrafts = useGuestSessionStore((s) => s.setChildDrafts);
  const setGuestChildInterests = useGuestSessionStore((s) => s.setChildInterests);
  const setGuestFamiliarityScore = useGuestSessionStore((s) => s.setFamiliarityScore);
  const setGuestRavNotes = useGuestSessionStore((s) => s.setRavNotes);
  const setGuestLineItems = useGuestSessionStore((s) => s.setLineItems);
  const completeGuestOnboarding = useGuestSessionStore((s) => s.completeOnboarding);
  const completeGuestBoxReveal = useGuestSessionStore((s) => s.completeBoxReveal);
  const setGuestOnboardingStep = useGuestSessionStore((s) => s.setOnboardingStep);
  const exitGuestOnboarding = useGuestSessionStore((s) => s.exitOnboardingToExplore);
  const { household, profile, refresh } = useSession();
  const guestMode = isGuest || !isAuthenticated;

  const [step, setStep] = useState<OnboardingStep>(() =>
    resolveOnboardingStep({
      revealOnly,
      previewStep: initialStep,
      persistedStep: persistedOnboardingStep,
      onboardingComplete: guestOnboardingComplete,
      lineItemsCount: guestLineItems.length,
      boxRevealComplete: guestBoxRevealComplete,
    })
  );
  const [maxWizardIndex, setMaxWizardIndex] = useState(0);
  const [childDrafts, setChildDrafts] = useState<ChildDraft[]>(guestChildDrafts);
  const [childInterests, setChildInterests] = useState<string[]>(guestChildInterests);
  const [familiarity, setFamiliarity] = useState<FamiliarityLevel>(guestFamiliarityLevel);
  const [familiarityScore, setFamiliarityScore] = useState(guestFamiliarityScore);
  const [ravNotes, setRavNotes] = useState(guestRavNotes);
  const [lineItems, setLineItems] = useState<BoxLineItem[]>(guestLineItems);
  const [saving, setSaving] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [completingReveal, setCompletingReveal] = useState(false);
  const [loadingReveal, setLoadingReveal] = useState(revealOnly);
  const revealHandoffStarted = useRef(false);

  const goToStep = useCallback(
    (next: OnboardingStep) => {
      setStep(next);
      setGuestOnboardingStep(next);
    },
    [setGuestOnboardingStep]
  );

  useEffect(() => {
    const idx = wizardNavStepIndex(step);
    if (idx >= 0) {
      setMaxWizardIndex((prev) => Math.max(prev, idx));
    }
  }, [step]);

  const goToWizardNavStep = useCallback(
    (next: OnboardingWizardNavStepId) => {
      const idx = wizardNavStepIndex(next);
      if (idx < 0 || idx > maxWizardIndex) return;
      // Box Reveal hands off to My Box once the curated draft exists.
      if (next === 'reveal') {
        if (!lineItems.length && !revealOnly) return;
        goToStep('reveal');
        return;
      }
      goToStep(next);
    },
    [goToStep, maxWizardIndex, lineItems.length, revealOnly]
  );

  useEffect(() => {
    if (guestChildDrafts.length) setChildDrafts(guestChildDrafts);
    setChildInterests(guestChildInterests);
    setFamiliarity(guestFamiliarityLevel);
    setFamiliarityScore(guestFamiliarityScore);
    setRavNotes(guestRavNotes);
    if (guestLineItems.length) {
      setLineItems(guestLineItems);
    }
  }, [
    guestChildDrafts,
    guestChildInterests,
    guestFamiliarityLevel,
    guestFamiliarityScore,
    guestRavNotes,
    guestLineItems,
  ]);

  useEffect(() => {
    if (!revealOnly || guestMode) {
      if (guestMode && guestLineItems.length) {
        setLoadingReveal(false);
      }
      return;
    }
    if (!user?.uid || !household?.id) return;
    let cancelled = false;
    (async () => {
      setLoadingReveal(true);
      try {
        const [kids, draft, catalog] = await Promise.all([
          childrenService.list(user.uid),
          boxDraftService.get(household.id),
          catalogService.getAll(),
        ]);
        if (cancelled) return;
        const items =
          draft?.lineItems?.length
            ? draft.lineItems
            : buildDefaultLineItems(catalog, kids, draft?.childInterests ?? []);
        setFamiliarity(profile?.familiarityLevel ?? draft?.familiarityLevel ?? 'moderate');
        setLineItems(items);
      } catch (error) {
        if (!cancelled) {
          setBuildError(onboardingErrorMessage(error));
          goToStep('rav-question');
        }
      } finally {
        if (!cancelled) setLoadingReveal(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    revealOnly,
    guestMode,
    user?.uid,
    household?.id,
    profile?.familiarityLevel,
    guestLineItems.length,
    goToStep,
  ]);

  const buildBox = async (
    level: FamiliarityLevel,
    score: number,
    kids: ChildDraft[],
    interests: string[],
    notes: string
  ) => {
    setBuildError(null);
    setSaving(true);
    try {
      const catalog = await catalogService.getAll();
      if (!catalog.length) {
        throw new Error(
          'We could not load the product catalog. Check your connection and try again, or email contact@grapejuice.co.'
        );
      }
      const profiles = draftsToProfiles(kids);
      const items = buildDefaultLineItems(catalog, profiles, interests, adultCountFromDrafts(kids));
      if (!items.length) {
        throw new Error('We could not build a default box from the catalog. Please try again later.');
      }

      setGuestChildDrafts(kids);
      setGuestChildInterests(interests);
      setGuestFamiliarityScore(score);
      setGuestRavNotes(notes);

      if (guestMode) {
        setGuestLineItems(items);
        completeGuestOnboarding();
        setFamiliarity(level);
        setFamiliarityScore(score);
        setLineItems(items);
        goToStep('building');
        return;
      }

      if (!user?.uid) {
        throw new Error('You must be signed in to save your box. Try signing in and building again.');
      }

      // Silent: keep the building splash up instead of flashing the boot spinner.
      await refresh({ silent: true });
      const householdId = await ensureHouseholdId(user.uid, household?.id ?? profile?.householdId);
      await childrenService.replaceAll(
        user.uid,
        kids
          .filter((c) => c.role !== 'adult')
          .map((c) => ({
            name: c.name || undefined,
            ageGroup: c.ageGroup,
            birthdate: c.birthdate,
          }))
      );
      await boxDraftService.save(householdId, user.uid, items, {
        familiarityLevel: level,
        childInterests: interests,
      });
      await usersService.upsert(user.uid, {
        familiarityLevel: level,
        onboardingComplete: true,
        boxRevealComplete: false,
        lockReminderEligible: true,
        lockReminderAttempts: 0,
      });
      setFamiliarity(level);
      setLineItems(items);
      goToStep('building');
    } catch (error) {
      const message = onboardingErrorMessage(error);
      setBuildError(message);
      console.error('[onboarding] buildBox failed:', error);
      if (Platform.OS === 'web') {
        window.alert?.(message);
      } else {
        Alert.alert('Could not build your box', message);
      }
    } finally {
      setSaving(false);
    }
  };

  const completeReveal = useCallback(async () => {
    if (revealHandoffStarted.current) return;
    revealHandoffStarted.current = true;
    setCompletingReveal(true);
    try {
      // Destination is the live My Box screen (not the legacy reveal UI).
      queuePendingMainNav({ screen: 'MyBox' });
      if (guestMode) {
        completeGuestBoxReveal();
        clearDevPreview();
        onComplete?.();
        return;
      }
      if (!user?.uid) {
        revealHandoffStarted.current = false;
        return;
      }
      await usersService.upsert(user.uid, { boxRevealComplete: true, lockReminderEligible: true, lockReminderAttempts: 0 });
      // Silent: a full refresh flips sessionLoading and remounts Main (boot
      // spinner), which consumes pending MyBox nav then lands on StorefrontHome.
      await refresh({ silent: true });
      clearDevPreview();
      onComplete?.();
    } catch {
      revealHandoffStarted.current = false;
    } finally {
      setCompletingReveal(false);
    }
  }, [completeGuestBoxReveal, guestMode, onComplete, refresh, user?.uid]);

  /** After the build splash, open My Box — Box Reveal is no longer a separate screen. */
  const goToReveal = useCallback(() => {
    void completeReveal();
  }, [completeReveal]);

  // Resume / reveal-only / wizard jump: hand off to My Box once draft is ready.
  useEffect(() => {
    if (step !== 'reveal' || loadingReveal || completingReveal) return;
    void completeReveal();
  }, [step, loadingReveal, completingReveal, completeReveal]);

  const exitOnboarding = useCallback(async () => {
    clearDevPreview();
    if (guestMode) {
      exitGuestOnboarding();
      onComplete?.();
      return;
    }
    if (!user?.uid) return;
    // Explore without building: leave the box unrevealed so storefront stays
    // in acquisition / “no box” chrome. Gate uses exploreStarted to reach Main.
    await usersService.upsert(user.uid, {
      onboardingComplete: true,
      boxRevealComplete: false,
    });
    useGuestSessionStore.getState().exitOnboardingToExplore();
    await refresh();
    onComplete?.();
  }, [exitGuestOnboarding, guestMode, onComplete, refresh, user?.uid]);

  const buildingPreviewHold = useDevPreviewStore((s) => s.onboardingBuildingHold);

  const leaveToStorefront = useCallback(
    (target: StorefrontLeaveTarget) => {
      switch (target.type) {
        case 'home':
          queuePendingMainNav({ screen: 'StorefrontHome' });
          break;
        case 'category':
          queuePendingMainNav({
            screen: 'StorefrontCategory',
            params: {
              category: target.slug || DEFAULT_STOREFRONT_CATEGORY,
              ...(target.q ? { q: target.q } : {}),
            },
          });
          break;
        case 'myBox':
          // If the draft already exists, finish reveal and open My Box.
          if (lineItems.length > 0) {
            void completeReveal();
            return;
          }
          queuePendingMainNav({ screen: 'StorefrontHome' });
          break;
        case 'service':
          if (target.id === 'story') {
            queuePendingMainNav({ screen: 'StorefrontOurStory' });
          } else if (target.id === 'passover') {
            queuePendingMainNav({ screen: 'StorefrontPassover' });
          } else if (target.id === 'shop') {
            queuePendingMainNav({
              screen: 'StorefrontCategory',
              params: { category: 'collection' },
            });
          } else {
            queuePendingMainNav({ screen: 'StorefrontHome' });
          }
          break;
        default:
          queuePendingMainNav({ screen: 'StorefrontHome' });
          break;
      }
      void exitOnboarding();
    },
    [completeReveal, exitOnboarding, lineItems.length]
  );

  const wrap = (
    content: React.ReactNode,
    options?: { persistMedia?: boolean; buildingPhase?: boolean; buildingLoader?: boolean }
  ) => (
    <View style={styles.shell}>
      <View style={styles.shellBody}>
        {options?.persistMedia ? (
          <OnboardingMediaHost
            buildingPhase={options.buildingPhase}
            buildingLoader={options.buildingLoader}
          >
            {content}
          </OnboardingMediaHost>
        ) : (
          content
        )}
      </View>
    </View>
  );

  const persistMediaSteps: OnboardingStep[] = [
    'hanukkah-intro',
    'practices',
    'box-intro',
    'children',
    'child-interests',
    'familiarity',
    'rav-question',
    'building',
  ];

  const wizardServicesSlot = (
    <OnboardingWizardNav
      activeStep={wizardNavStepId(step)}
      maxReachedIndex={maxWizardIndex}
      onPress={goToWizardNavStep}
    />
  );

  if (loadingReveal) {
    return (
      <OnboardingUnderStorefrontChromeContext.Provider value={true}>
        <StorefrontChrome
          bodyMode="fill"
          onLeave={leaveToStorefront}
          servicesSlot={wizardServicesSlot}
        >
          {wrap(
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={semanticColors.brand} />
            </View>
          )}
        </StorefrontChrome>
      </OnboardingUnderStorefrontChromeContext.Provider>
    );
  }

  let stepContent: React.ReactNode = null;

  switch (step) {
    case 'hanukkah-intro':
    case 'practices':
      stepContent = <HanukkahIntroScreen onContinue={() => goToStep('box-intro')} />;
      break;
    case 'box-intro':
    case 'children':
      stepContent = (
        <BoxIntroScreen
          initialChildren={childDrafts.length ? childDrafts : undefined}
          defaultName={profile?.displayName ?? user?.displayName ?? 'Joseph'}
          onContinue={(kids) => {
            setChildDrafts(kids);
            setGuestChildDrafts(kids);
            goToStep('child-interests');
          }}
        />
      );
      break;
    case 'child-interests':
    case 'familiarity':
      stepContent = (
        <WhatWeDoScreen
          family={childDrafts}
          initialScore={familiarityScore || familiarityLevelToScore(familiarity)}
          onContinue={({ level, score, children: nextKids, interests }) => {
            setFamiliarity(level);
            setFamiliarityScore(score);
            setGuestFamiliarityScore(score);
            setChildDrafts(nextKids);
            setGuestChildDrafts(nextKids);
            setChildInterests(interests);
            setGuestChildInterests(interests);
            goToStep('rav-question');
          }}
        />
      );
      break;
    case 'rav-question':
      // On build, swap straight to the loader so it rides the pane expansion
      // instead of leaving the form on screen through the whole catalog fetch.
      stepContent = saving ? (
        <BuildingBoxScreen onComplete={goToReveal} hold={buildingPreviewHold} ready={false} />
      ) : (
        <RavOpenQuestionScreen
          initialNotes={ravNotes}
          isAuthenticated={!guestMode}
          buildError={buildError}
          building={saving}
          onContinue={(notes) => {
            setRavNotes(notes);
            setGuestRavNotes(notes);
            void buildBox(familiarity, familiarityScore, childDrafts, childInterests, notes);
          }}
        />
      );
      break;
    case 'building':
      stepContent = <BuildingBoxScreen onComplete={goToReveal} hold={buildingPreviewHold} ready />;
      break;
    case 'reveal':
      stepContent = (
        <View style={styles.loading} accessibilityLabel="Opening your box">
          <BrandLoadingMark />
        </View>
      );
      break;
    default:
      return null;
  }

  return (
    <OnboardingUnderStorefrontChromeContext.Provider value={true}>
      <StorefrontChrome
        bodyMode="fill"
        onLeave={leaveToStorefront}
        servicesSlot={wizardServicesSlot}
      >
        {wrap(stepContent, {
          persistMedia: persistMediaSteps.includes(step),
          buildingPhase: step === 'building' || saving,
          buildingLoader: step === 'building',
        })}
      </StorefrontChrome>
    </OnboardingUnderStorefrontChromeContext.Provider>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: semanticColors.bgPrimary, minHeight: 0 },
  shellBody: { flex: 1, minHeight: 0 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: semanticColors.bgPrimary },
});
