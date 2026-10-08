import React, { useEffect, useCallback, useState, useRef } from 'react';
import { View, StyleSheet, Alert, Platform } from 'react-native';
import type { ChildDraft } from '../components/family/familyDraft';
import { FamilyStepScreen } from '../screens/onboarding/FamilyStepScreen';
import { DetailsStepScreen } from '../screens/onboarding/DetailsStepScreen';
import { RevealEmailScreen } from '../screens/onboarding/RevealEmailScreen';
import { BuildingBoxScreen } from '../screens/onboarding/BuildingBoxScreen';
import { useAuthStore } from '../stores/authStore';
import { useGuestSessionStore, familiarityLevelToScore } from '../stores/guestSessionStore';
import { useSession } from '../hooks/useSession';
import { childrenService } from '../services/firestore/children';
import { usersService } from '../services/firestore/users';
import { householdsService } from '../services/firestore/households';
import { catalogService } from '../services/firestore/catalog';
import { boxDraftService } from '../services/firestore/boxDraft';
import { buildCuratedBox } from '../services/box/buildDefaultBox';
import { curateBox, applyCurateBoxResult } from '../services/rav/curateBox';
import { remapGuestChildIds } from '../services/guest/persistGuestToAccount';
import type { BoxLineItem, FamiliarityLevel, ChildProfile, LastBoxAnswers } from '../types/pilot';
import { saveLastBoxAnswers, seedOnboardingFromAccount } from '../services/box/lastBoxAnswers';
import { representativeAgeForBand, type IntakeAgeGroup } from '../services/box/boxRules';
import { semanticColors } from '../constants/theme';
import type { OnboardingPreviewStep } from '../stores/devPreviewStore';
import { useDevPreviewStore } from '../stores/devPreviewStore';
import { clearDevPreview } from './devPreview';
import { firstNameFromDisplayName } from '../utils/personName';
import {
  onboardingErrorMessage,
  resolveOnboardingStep,
  wizardNavStepId,
  wizardNavStepIndex,
  type OnboardingStep,
  type OnboardingWizardNavStepId,
} from './onboardingSteps';
import { OnboardingUnderStorefrontChromeContext } from '../components/onboarding/onboardingChromeContext';
import { OnboardingWizardNav } from '../components/onboarding/OnboardingWizardNav';
import {
  StorefrontChrome,
} from '../components/storefront/StorefrontChrome';
import type { StorefrontLeaveTarget } from '../components/storefront/storefrontLeaveContext';
import { queuePendingMainNav, type PendingMainNav } from './pendingMainNav';
import { consumeInboundBoxUrlPreserve } from './boxLink';
import {
  enterBoxBuilderStep,
  pushBoxBuilderStep,
  registerBoxBuilderHistory,
} from './webBrowserHistory';
import { DEFAULT_STOREFRONT_CATEGORY } from '../constants/storefrontCategories';
import { BrandLoadingMark } from '../components/brand/BrandLoadingMark';
import { trackBoxBuilt, trackBoxEmail } from '../services/analytics/metaServerEvents';
import { revealBoxWithEmail } from '../services/auth/loginLinks';
import { getVisitorId } from '../services/guest/visitorId';
import { retentionSuppress } from '../services/analytics/retention';

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

function flattenKidInterests(members: ChildDraft[]): string[] {
  const set = new Set<string>();
  for (const m of members) {
    if (m.role === 'adult') continue;
    for (const id of m.interests ?? []) set.add(id);
    for (const custom of m.customInterests ?? []) {
      const t = custom.trim();
      if (t) set.add(t);
    }
  }
  return [...set];
}

/** Wizard steps the browser can move between; building / reveal are transitional. */
function isHistoryStep(step: OnboardingStep): boolean {
  return step !== 'building' && step !== 'reveal' && wizardNavStepIndex(step) >= 0;
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
  const guestPracticeFrequencyScore = useGuestSessionStore((s) => s.practiceFrequencyScore);
  const setGuestPracticeFrequencyScore = useGuestSessionStore((s) => s.setPracticeFrequencyScore);
  const setGuestRavNotes = useGuestSessionStore((s) => s.setRavNotes);
  const setGuestLineItems = useGuestSessionStore((s) => s.setLineItems);
  const completeGuestOnboarding = useGuestSessionStore((s) => s.completeOnboarding);
  const completeGuestBoxReveal = useGuestSessionStore((s) => s.completeBoxReveal);
  const setGuestOnboardingStep = useGuestSessionStore((s) => s.setOnboardingStep);
  const markStepReached = useGuestSessionStore((s) => s.markStepReached);
  const exitGuestOnboarding = useGuestSessionStore((s) => s.exitOnboardingToExplore);
  const setGuestPendingAccountEmail = useGuestSessionStore((s) => s.setPendingAccountEmail);
  const signInWithToken = useAuthStore((s) => s.signInWithToken);
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
  /** Baseline persisted; Rav pass finished (or timed out). BuildingBoxScreen advances when true. */
  const [buildingReady, setBuildingReady] = useState(
    () => guestOnboardingComplete && guestLineItems.length > 0
  );
  /** New account from the email gate — sign in once the curated box is final. */
  const pendingAccountTokenRef = useRef<string | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [completingReveal, setCompletingReveal] = useState(false);
  const [loadingReveal, setLoadingReveal] = useState(revealOnly);
  const revealHandoffStarted = useRef(false);

  const goToStep = useCallback(
    (next: OnboardingStep) => {
      setStep(next);
      setGuestOnboardingStep(next);
      if (isHistoryStep(next)) pushBoxBuilderStep(next);
    },
    [setGuestOnboardingStep]
  );

  useEffect(() => {
    const idx = wizardNavStepIndex(step);
    if (idx >= 0) {
      setMaxWizardIndex((prev) => Math.max(prev, idx));
    }
  }, [step]);

  useEffect(() => {
    if (guestMode && !initialStep && !revealOnly) markStepReached(step);
  }, [step, guestMode, initialStep, revealOnly, markStepReached]);

  const stepRef = useRef(step);
  stepRef.current = step;
  const maxWizardIndexRef = useRef(maxWizardIndex);
  maxWizardIndexRef.current = maxWizardIndex;
  const leaveForHistoryRef = useRef<(target: PendingMainNav) => void>(() => {});

  useEffect(() => {
    if (isHistoryStep(stepRef.current)) enterBoxBuilderStep(stepRef.current);
    return registerBoxBuilderHistory({
      showStep: (raw) => {
        const next = raw as OnboardingStep;
        // Mid-build there is nothing to go back to; the build finishes on its own.
        if (!isHistoryStep(stepRef.current) || !isHistoryStep(next)) return;
        if (wizardNavStepIndex(next) > maxWizardIndexRef.current) return;
        setStep(next);
        setGuestOnboardingStep(next);
      },
      leave: (target) => leaveForHistoryRef.current(target),
    });
  }, [setGuestOnboardingStep]);

  const goToWizardNavStep = useCallback(
    (next: OnboardingWizardNavStepId) => {
      const idx = wizardNavStepIndex(next);
      if (idx < 0 || idx > maxWizardIndex) return;
      // Box Reveal hands off to My Box once the curated draft exists.
      if (next === 'reveal') {
        if (!lineItems.length && !revealOnly) return;
        // Guests see the box only after the email gate.
        goToStep(guestMode && !revealOnly ? 'email' : 'reveal');
        return;
      }
      goToStep(next);
    },
    [goToStep, maxWizardIndex, lineItems.length, revealOnly, guestMode]
  );

  // Signed-in restart with an empty local store: prefill from the account's last answers.
  const [seedVersion, setSeedVersion] = useState(0);
  const seedAttempted = useRef(false);
  useEffect(() => {
    if (seedAttempted.current || guestMode || revealOnly || !user?.uid || !profile) return;
    seedAttempted.current = true;
    if (useGuestSessionStore.getState().childDrafts.length) return;
    void seedOnboardingFromAccount(
      user.uid,
      profile,
      profile.displayName ?? user.displayName
    ).then((seeded) => {
      if (seeded) setSeedVersion((v) => v + 1);
    });
  }, [guestMode, revealOnly, user?.uid, user?.displayName, profile]);

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
    // Always clear the reveal loader when we are *not* in reveal-only mode.
    // Previously, flipping revealOnly true→false (mid build-box race) left
    // loadingReveal stuck true → infinite BrandLoadingMark until hard refresh.
    if (!revealOnly || guestMode) {
      setLoadingReveal(false);
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
            : buildCuratedBox(catalog, kids, {
                practice: profile?.familiarityLevel ?? draft?.familiarityLevel ?? 'moderate',
                childInterests: draft?.childInterests ?? [],
              }).lineItems;
        setFamiliarity(profile?.familiarityLevel ?? draft?.familiarityLevel ?? 'moderate');
        setLineItems(items);
      } catch (error) {
        if (!cancelled) {
          setBuildError(onboardingErrorMessage(error));
          goToStep('details');
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
    setBuildingReady(false);
    try {
      const catalog = await catalogService.getAll();
      if (!catalog.length) {
        throw new Error(
          'We could not load the product catalog. Check your connection and try again, or email contact@grapejuice.co.'
        );
      }
      const profiles = draftsToProfiles(kids);
      const adults = adultCountFromDrafts(kids);
      const curated = buildCuratedBox(catalog, profiles, {
        practice: level,
        adults,
        childInterests: interests,
      });
      let items = curated.lineItems;
      if (!items.length) {
        throw new Error('We could not build a default box from the catalog. Please try again later.');
      }

      setGuestChildDrafts(kids);
      setGuestChildInterests(interests);
      setGuestFamiliarityScore(score);
      setGuestRavNotes(notes);

      const runRavPass = async (baseline: BoxLineItem[], childProfiles: ChildProfile[]) => {
        const curateKids = childProfiles.map((c) => ({
          id: c.id,
          firstName: c.name,
          age:
            typeof c.plannerAge === 'number' && Number.isFinite(c.plannerAge)
              ? Math.max(0, Math.floor(c.plannerAge))
              : representativeAgeForBand(c.ageGroup as IntakeAgeGroup),
        }));
        const result = await curateBox({
          practiceLevel: level,
          practiceScore: score,
          kids: curateKids,
          adults,
          interests,
          notes,
          baseline,
          deviations: curated.deviations,
          catalog,
        });
        return applyCurateBoxResult(baseline, catalog, result, curated.deviations);
      };

      if (guestMode) {
        setGuestLineItems(items);
        completeGuestOnboarding();
        setFamiliarity(level);
        setFamiliarityScore(score);
        setLineItems(items);
        // Curation keeps running while the guest types their email.
        goToStep('email');
        trackBoxBuilt(items.length, useGuestSessionStore.getState().practiceFrequencyScore);
        // Fail-open Rav pass; the building screen after the email gate waits on it.
        try {
          items = await runRavPass(items, profiles);
          setGuestLineItems(items);
          setLineItems(items);
        } catch (err) {
          console.warn('[onboarding] curateBox failed (guest)', err);
        }
        setBuildingReady(true);
        return;
      }

      if (!user?.uid) {
        throw new Error('You must be signed in to save your box. Try signing in and building again.');
      }

      // Silent: keep the building splash up instead of flashing the boot spinner.
      await refresh({ silent: true });
      const householdId = await ensureHouseholdId(user.uid, household?.id ?? profile?.householdId);
      const savedKids = await childrenService.replaceAll(
        user.uid,
        kids
          .filter((c) => c.role !== 'adult')
          .map((c) => ({
            name: c.name || undefined,
            ageGroup: c.ageGroup,
            birthdate: c.birthdate,
            plannerAge: c.plannerAge,
          }))
      );
      let remappedItems = remapGuestChildIds(items, savedKids);
      // Remap deviation child ids to saved kids as well.
      const guestToSaved = new Map<string, string>();
      profiles.forEach((p, i) => {
        const saved = savedKids[i];
        if (saved) guestToSaved.set(p.id, saved.id);
      });
      const remappedDeviations = curated.deviations.map((d) => ({
        ...d,
        childId: d.childId ? guestToSaved.get(d.childId) ?? d.childId : d.childId,
        slotId:
          d.childId && guestToSaved.get(d.childId)
            ? d.slotId.replace(d.childId, guestToSaved.get(d.childId)!)
            : d.slotId,
      }));
      curated.deviations = remappedDeviations;

      await boxDraftService.save(householdId, user.uid, remappedItems, {
        familiarityLevel: level,
        childInterests: interests,
      });
      await usersService.upsert(user.uid, {
        familiarityLevel: level,
        ravNotes: notes || undefined,
        onboardingComplete: true,
        boxRevealComplete: false,
        lockReminderEligible: true,
        lockReminderAttempts: 0,
      });
      await saveLastBoxAnswers(user.uid, {
        childDrafts: kids as unknown as LastBoxAnswers['childDrafts'],
        childInterests: interests,
        familiarityScore: score,
        familiarityLevel: level,
        ravNotes: notes,
      });
      setFamiliarity(level);
      setLineItems(remappedItems);
      goToStep('building');
      trackBoxBuilt(remappedItems.length, useGuestSessionStore.getState().practiceFrequencyScore);

      try {
        remappedItems = await runRavPass(remappedItems, savedKids);
        await boxDraftService.save(householdId, user.uid, remappedItems, {
          familiarityLevel: level,
          childInterests: interests,
        });
        setLineItems(remappedItems);
      } catch (err) {
        console.warn('[onboarding] curateBox failed', err);
      }
      setBuildingReady(true);
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
      // Clear guest build intent so RootRoutes doesn't keep the onboarding gate.
      useGuestSessionStore.setState({ buildBoxPath: false });
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

  /**
   * After the build splash, open My Box — Box Reveal is no longer a separate screen.
   * A new account from the email gate signs in here so the merge saves the final curated box.
   */
  const goToReveal = useCallback(() => {
    const token = pendingAccountTokenRef.current;
    if (token && guestMode) {
      pendingAccountTokenRef.current = null;
      void signInWithToken(token).catch((err) => {
        console.warn('[onboarding] sign-in after email gate failed', err);
        void completeReveal();
      });
      return;
    }
    void completeReveal();
  }, [completeReveal, guestMode, signInWithToken]);

  const submitRevealEmail = useCallback(
    async (email: string) => {
      const meta = trackBoxEmail();
      retentionSuppress(email);
      const name = childDrafts.find((d) => d.role === 'adult')?.name.trim() || undefined;
      let result;
      try {
        result = await revealBoxWithEmail({ email, visitorId: getVisitorId(), name, meta });
      } catch (err) {
        const code = (err as { code?: string })?.code ?? '';
        if (code.endsWith('resource-exhausted')) {
          throw new Error('Too many tries. Please wait a few minutes and try again.');
        }
        if (code.endsWith('invalid-argument')) {
          throw new Error('Please enter a valid email address.');
        }
        throw new Error('Something went wrong. Please try again.');
      }
      if (result.status === 'created') {
        pendingAccountTokenRef.current = result.customToken;
        setGuestPendingAccountEmail('');
      } else {
        setGuestPendingAccountEmail(email);
      }
      goToStep('building');
    },
    [childDrafts, goToStep, setGuestPendingAccountEmail]
  );

  // Signed in with a persisted email step (e.g. signed in elsewhere): the gate no longer applies.
  useEffect(() => {
    if (step === 'email' && !guestMode) goToStep('reveal');
  }, [step, guestMode, goToStep]);

  // Resume / reveal-only / wizard jump: hand off to My Box once draft is ready.
  useEffect(() => {
    if (step !== 'reveal' || loadingReveal || completingReveal) return;
    void completeReveal();
  }, [step, loadingReveal, completingReveal, completeReveal]);

  const exitOnboarding = useCallback(async () => {
    clearDevPreview();
    // Leaving answers an inbound `/box` visit; don't hold that URL over the next screen.
    consumeInboundBoxUrlPreserve();
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
    // Silent: non-silent refresh flips sessionLoading → full-screen boot spinner.
    await refresh({ silent: true });
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
          // Guests reach the built box through the email gate.
          if (guestMode && lineItems.length > 0 && !revealOnly) {
            if (step !== 'building') goToStep('email');
            return;
          }
          // If the draft already exists, finish reveal and open My Box.
          if (lineItems.length > 0) {
            void completeReveal();
            return;
          }
          queuePendingMainNav({ screen: 'StorefrontHome' });
          break;
        case 'screen':
          queuePendingMainNav(target.nav);
          break;
        case 'service':
          // The box link opens this builder — already here.
          if (target.id === 'box') return;
          if (target.id === 'story') {
            queuePendingMainNav({ screen: 'StorefrontOurStory' });
          } else if (target.id === 'gift') {
            queuePendingMainNav({ screen: 'GiftLanding' });
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
    [completeReveal, exitOnboarding, lineItems.length, guestMode, revealOnly, step, goToStep]
  );

  leaveForHistoryRef.current = (target) => {
    queuePendingMainNav(target);
    void exitOnboarding();
  };

  const wrap = (content: React.ReactNode) => (
    <View style={styles.shell}>
      <View style={styles.shellBody}>{content}</View>
    </View>
  );

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
              <BrandLoadingMark />
            </View>
          )}
        </StorefrontChrome>
      </OnboardingUnderStorefrontChromeContext.Provider>
    );
  }

  let stepContent: React.ReactNode = null;

  switch (step) {
    case 'family':
      stepContent = (
        <FamilyStepScreen
          key={`family-${seedVersion}`}
          initialMembers={childDrafts.length ? childDrafts : undefined}
          defaultName={firstNameFromDisplayName(profile?.displayName ?? user?.displayName) || undefined}
          onContinue={(members) => {
            const interests = flattenKidInterests(members);
            setChildDrafts(members);
            setGuestChildDrafts(members);
            setChildInterests(interests);
            setGuestChildInterests(interests);
            goToStep('details');
          }}
        />
      );
      break;
    case 'details':
      // Signed in: swap straight to the loader so it rides the pane expansion
      // instead of leaving the form on screen through the whole catalog fetch.
      stepContent =
        saving && !guestMode ? (
          <BuildingBoxScreen onComplete={goToReveal} hold={buildingPreviewHold} ready={false} />
        ) : (
          <DetailsStepScreen
            key={`details-${seedVersion}`}
            initialScore={familiarityScore || familiarityLevelToScore(familiarity)}
            initialFrequency={guestPracticeFrequencyScore}
            initialNotes={ravNotes}
            isAuthenticated={!guestMode}
            buildError={buildError}
            building={saving}
            onContinue={({ level, score, frequency, notes }) => {
              setGuestPracticeFrequencyScore(frequency);
              setFamiliarity(level);
              setFamiliarityScore(score);
              setGuestFamiliarityScore(score);
              setRavNotes(notes);
              setGuestRavNotes(notes);
              void buildBox(level, score, childDrafts, childInterests, notes);
            }}
          />
        );
      break;
    case 'email':
      stepContent = <RevealEmailScreen onSubmit={submitRevealEmail} />;
      break;
    case 'building':
      stepContent = (
        <BuildingBoxScreen
          onComplete={goToReveal}
          hold={buildingPreviewHold}
          ready={buildingReady}
        />
      );
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
        {wrap(stepContent)}
      </StorefrontChrome>
    </OnboardingUnderStorefrontChromeContext.Provider>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: semanticColors.bgPrimary, minHeight: 0 },
  shellBody: { flex: 1, minHeight: 0 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: semanticColors.bgPrimary },
});
