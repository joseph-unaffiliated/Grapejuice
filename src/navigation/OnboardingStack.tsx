import React, { useEffect, useCallback, useState, useRef } from 'react';
import { View, StyleSheet, Alert, Platform } from 'react-native';
import type { ChildDraft } from '../components/family/familyDraft';
import { FamilyStepScreen } from '../screens/onboarding/FamilyStepScreen';
import { DetailsStepScreen } from '../screens/onboarding/DetailsStepScreen';
import { RevealEmailScreen } from '../screens/onboarding/RevealEmailScreen';
import { BuildingBoxScreen } from '../screens/onboarding/BuildingBoxScreen';
import { useAuthStore } from '../stores/authStore';
import { useGuestSessionStore, familiarityLevelToScore, familiarityScoreToLevel } from '../stores/guestSessionStore';
import { useSession } from '../hooks/useSession';
import { childrenService } from '../services/firestore/children';
import { usersService } from '../services/firestore/users';
import { householdsService } from '../services/firestore/households';
import { catalogService, peekCatalogItems } from '../services/firestore/catalog';
import {
  readBoxBuildResume,
  writeBoxBuildResume,
  clearBoxBuildResume,
  type BoxBuildResume,
} from '../services/box/boxBuildResume';
import { boxDraftService } from '../services/firestore/boxDraft';
import { buildCuratedBox } from '../services/box/buildDefaultBox';
import { applyDietNotes } from '../services/box/dietNotes';
import { foldItemIntoCuratedBox } from '../services/box/foldItemIntoCuratedBox';
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
  ONBOARDING_WIZARD_NAV_STEPS,
} from './onboardingSteps';
import { OnboardingUnderStorefrontChromeContext } from '../components/onboarding/onboardingChromeContext';
import { OnboardingWizardNav } from '../components/onboarding/OnboardingWizardNav';
import { TaskHeader } from '../components/mobile/TaskHeader';
import { useMobileLayout } from '../hooks/useMobileLayout';
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
import { queueWelcomeAccountToast } from '../services/auth/welcomeAccountToast';
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
  // React state lags the profile write. Re-read so we don't create a second,
  // empty household and then open My Box against the wrong one.
  let id = householdId || (await usersService.get(uid))?.householdId || readBoxBuildResume()?.householdId || null;
  if (id) {
    const existing = await householdsService.get(id);
    if (existing) {
      if (!existing.memberIds.includes(uid)) {
        await householdsService.addMember(id, uid);
      }
      return id;
    }
  }
  const created = await householdsService.createForOwner(uid);
  await usersService.upsert(uid, { householdId: created.id });
  return created.id;
}

async function loadBuildCatalog() {
  const cached = peekCatalogItems();
  if (cached?.length) return cached;
  return catalogService.getAll();
}

/** Survives an OnboardingStack remount; the custom token never goes to disk. */
let pendingRevealToken: string | null = null;
let pendingRevealSignIn: Promise<void> | null = null;

function restoreResumeIntoGuest(): BoxBuildResume | null {
  const resume = readBoxBuildResume();
  if (!resume) return null;
  const guest = useGuestSessionStore.getState();
  const empty = guest.childDrafts.length === 0 && guest.lineItems.length === 0;
  if (empty && (resume.childDrafts.length > 0 || resume.lineItems.length > 0)) {
    useGuestSessionStore.setState({
      childDrafts: resume.childDrafts,
      childInterests: resume.childInterests,
      familiarityScore: resume.familiarityScore,
      familiarityLevel: familiarityScoreToLevel(resume.familiarityScore),
      practiceFrequencyScore: resume.practiceFrequencyScore,
      ravNotes: resume.ravNotes,
      lineItems: resume.lineItems,
      onboardingStep: resume.step,
      onboardingComplete: resume.lineItems.length > 0,
      buildBoxPath: true,
      boxRevealComplete: false,
      exploreStarted: true,
    });
  }
  return resume;
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
  const persistedOnboardingStep = useGuestSessionStore((s) => s.onboardingStep);
  const setGuestChildDrafts = useGuestSessionStore((s) => s.setChildDrafts);
  const setGuestChildInterests = useGuestSessionStore((s) => s.setChildInterests);
  const setGuestFamiliarityScore = useGuestSessionStore((s) => s.setFamiliarityScore);
  const guestPracticeFrequencyScore = useGuestSessionStore((s) => s.practiceFrequencyScore);
  const setGuestPracticeFrequencyScore = useGuestSessionStore((s) => s.setPracticeFrequencyScore);
  const setGuestRavNotes = useGuestSessionStore((s) => s.setRavNotes);
  const setGuestLineItems = useGuestSessionStore((s) => s.setLineItems);
  const completeGuestOnboarding = useGuestSessionStore((s) => s.completeOnboarding);
  const markGuestBoxBuilt = useGuestSessionStore((s) => s.markBoxBuilt);
  const completeGuestBoxReveal = useGuestSessionStore((s) => s.completeBoxReveal);
  const setGuestOnboardingStep = useGuestSessionStore((s) => s.setOnboardingStep);
  const markStepReached = useGuestSessionStore((s) => s.markStepReached);
  const exitGuestOnboarding = useGuestSessionStore((s) => s.exitOnboardingToExplore);
  const setGuestPendingAccountEmail = useGuestSessionStore((s) => s.setPendingAccountEmail);
  const signInWithToken = useAuthStore((s) => s.signInWithToken);
  const { household, profile, refresh } = useSession();
  const guestMode = isGuest || !isAuthenticated;

  const [step, setStep] = useState<OnboardingStep>(() => {
    const resume = restoreResumeIntoGuest();
    const guest = useGuestSessionStore.getState();
    return resolveOnboardingStep({
      revealOnly,
      previewStep: initialStep,
      persistedStep: guest.onboardingStep ?? persistedOnboardingStep,
      onboardingComplete: guest.onboardingComplete,
      lineItemsCount: guest.lineItems.length,
      boxRevealComplete: guest.boxRevealComplete,
      resumeBuilding: !!resume && (resume.handingOff || resume.step === 'building' || resume.step === 'reveal'),
    });
  });
  const [maxWizardIndex, setMaxWizardIndex] = useState(0);
  const mobileLayout = useMobileLayout();
  const [childDrafts, setChildDrafts] = useState<ChildDraft[]>(() => useGuestSessionStore.getState().childDrafts);
  const [childInterests, setChildInterests] = useState<string[]>(guestChildInterests);
  const [familiarity, setFamiliarity] = useState<FamiliarityLevel>(guestFamiliarityLevel);
  const [familiarityScore, setFamiliarityScore] = useState(guestFamiliarityScore);
  const [ravNotes, setRavNotes] = useState(guestRavNotes);
  const [lineItems, setLineItems] = useState<BoxLineItem[]>(() => useGuestSessionStore.getState().lineItems);
  const [saving, setSaving] = useState(false);
  /** Local box exists and the account save has finished. The loader advances when true. */
  const [buildingReady, setBuildingReady] = useState(() => {
    const guest = useGuestSessionStore.getState();
    return (guest.onboardingComplete && guest.lineItems.length > 0) || (readBoxBuildResume()?.lineItems.length ?? 0) > 0;
  });
  const [buildError, setBuildError] = useState<string | null>(null);
  const [handoffNotice, setHandoffNotice] = useState<string | null>(null);
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [loadingReveal, setLoadingReveal] = useState(revealOnly);
  const revealHandoffStarted = useRef(false);
  const householdIdRef = useRef<string | null>(readBoxBuildResume()?.householdId ?? null);
  const saveRef = useRef<Promise<void> | null>(null);
  const lastBuildRef = useRef<{
    level: FamiliarityLevel;
    score: number;
    kids: ChildDraft[];
    interests: string[];
    notes: string;
  } | null>(null);

  const rememberAnswers = useCallback((nextStep: OnboardingStep) => {
    const guest = useGuestSessionStore.getState();
    const prev = readBoxBuildResume();
    const stayHandingOff =
      prev?.handingOff === true && (nextStep === 'building' || nextStep === 'reveal');
    writeBoxBuildResume({
      step: nextStep,
      childDrafts: guest.childDrafts.length ? guest.childDrafts : prev?.childDrafts ?? [],
      childInterests: guest.childInterests.length ? guest.childInterests : prev?.childInterests ?? [],
      familiarityScore: guest.familiarityScore || prev?.familiarityScore || 50,
      practiceFrequencyScore: guest.practiceFrequencyScore || prev?.practiceFrequencyScore || 50,
      ravNotes: guest.ravNotes || prev?.ravNotes || '',
      lineItems: guest.lineItems.length ? guest.lineItems : prev?.lineItems ?? [],
      handingOff: stayHandingOff,
      householdId: householdIdRef.current ?? prev?.householdId ?? null,
      savedAt: Date.now(),
    });
  }, []);

  const markHandoff = useCallback(() => {
    const guest = useGuestSessionStore.getState();
    const prev = readBoxBuildResume();
    writeBoxBuildResume({
      step: 'building',
      childDrafts: guest.childDrafts.length ? guest.childDrafts : prev?.childDrafts ?? [],
      childInterests: guest.childInterests.length ? guest.childInterests : prev?.childInterests ?? [],
      familiarityScore: guest.familiarityScore || prev?.familiarityScore || 50,
      practiceFrequencyScore: guest.practiceFrequencyScore || prev?.practiceFrequencyScore || 50,
      ravNotes: guest.ravNotes || prev?.ravNotes || '',
      lineItems: guest.lineItems.length ? guest.lineItems : prev?.lineItems ?? [],
      handingOff: true,
      householdId: householdIdRef.current ?? prev?.householdId ?? null,
      savedAt: Date.now(),
    });
  }, []);

  const goToStep = useCallback(
    (next: OnboardingStep) => {
      setStep(next);
      setGuestOnboardingStep(next);
      rememberAnswers(next);
      if (isHistoryStep(next)) pushBoxBuilderStep(next);
    },
    [rememberAnswers, setGuestOnboardingStep]
  );

  useEffect(() => {
    if (!peekCatalogItems()?.length) void catalogService.getAll().catch(() => undefined);
  }, []);

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
                notes: profile?.ravNotes,
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
    lastBuildRef.current = { level, score, kids, interests, notes };
    setBuildError(null);
    setHandoffNotice(null);
    setSaving(true);
    setBuildingReady(false);
    const onLoader = !guestMode;
    if (onLoader) goToStep('building');
    try {
      const catalog = await loadBuildCatalog();
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
        notes,
      });
      const pickedId = useGuestSessionStore.getState().pendingBoxItemId;
      let items = applyDietNotes(foldItemIntoCuratedBox(curated.lineItems, catalog, pickedId), notes);
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
        return applyDietNotes(applyCurateBoxResult(baseline, catalog, result, curated.deviations), notes);
      };

      const publishCurated = (next: BoxLineItem[]) => {
        const folded = foldItemIntoCuratedBox(next, catalog, pickedId);
        setGuestLineItems(folded);
        markGuestBoxBuilt();
        setLineItems(folded);
        const prev = readBoxBuildResume();
        if (prev) writeBoxBuildResume({ ...prev, lineItems: folded, savedAt: Date.now() });
        const hid = householdIdRef.current || readBoxBuildResume()?.householdId;
        const uid = useAuthStore.getState().user?.uid;
        if (hid && uid) {
          void boxDraftService
            .save(hid, uid, folded, { familiarityLevel: level, childInterests: interests, source: 'default-build' })
            .catch((err) => console.warn('[onboarding] rav draft save failed', err));
        }
      };

      if (guestMode) {
        setGuestLineItems(items);
        markGuestBoxBuilt();
        completeGuestOnboarding();
        setFamiliarity(level);
        setFamiliarityScore(score);
        setLineItems(items);
        // The email screen covers Rav. The loader after it only waits a short splash.
        setBuildingReady(true);
        goToStep('email');
        trackBoxBuilt(
          items.length,
          useGuestSessionStore.getState().practiceFrequencyScore,
          useGuestSessionStore.getState().familiarityScore
        );
        void runRavPass(items, profiles).then(publishCurated).catch((err) => {
          console.warn('[onboarding] curateBox failed (guest)', err);
        });
        return;
      }

      if (!user?.uid) {
        throw new Error('You must be signed in to save your box. Try signing in and building again.');
      }

      const householdId = await ensureHouseholdId(user.uid, household?.id ?? profile?.householdId);
      householdIdRef.current = householdId;
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
      const guestToSaved = new Map<string, string>();
      profiles.forEach((p, i) => {
        const saved = savedKids[i];
        if (saved) guestToSaved.set(p.id, saved.id);
      });
      curated.deviations = curated.deviations.map((d) => ({
        ...d,
        childId: d.childId ? guestToSaved.get(d.childId) ?? d.childId : d.childId,
        slotId:
          d.childId && guestToSaved.get(d.childId)
            ? d.slotId.replace(d.childId, guestToSaved.get(d.childId)!)
            : d.slotId,
      }));

      setFamiliarity(level);
      setLineItems(remappedItems);
      setGuestLineItems(remappedItems);
      trackBoxBuilt(
        remappedItems.length,
        useGuestSessionStore.getState().practiceFrequencyScore,
        useGuestSessionStore.getState().familiarityScore
      );
      // Both flags together. Writing boxRevealComplete false here is what bounced
      // a slow reveal back into the questionnaire.
      await saveLastBoxAnswers(user.uid, {
        childDrafts: kids as unknown as LastBoxAnswers['childDrafts'],
        childInterests: interests,
        familiarityScore: score,
        familiarityLevel: level,
        ravNotes: notes,
      });
      const save = Promise.all([
        boxDraftService.save(householdId, user.uid, remappedItems, {
          familiarityLevel: level,
          childInterests: interests,
          source: 'default-build',
        }),
        usersService.upsert(user.uid, {
          familiarityLevel: level,
          ravNotes: notes || undefined,
          onboardingComplete: true,
          boxRevealComplete: true,
          lockReminderEligible: true,
          lockReminderAttempts: 0,
        }),
      ]).then(() => undefined);
      saveRef.current = save;
      void runRavPass(remappedItems, savedKids).then(publishCurated).catch((err) => {
        console.warn('[onboarding] curateBox failed', err);
      });
      await save;
      rememberAnswers('building');
      setBuildingReady(true);
    } catch (error) {
      const message = onboardingErrorMessage(error);
      setBuildError(message);
      setHandoffNotice(message);
      console.error('[onboarding] buildBox failed:', error);
      if (!onLoader) {
        if (Platform.OS === 'web') {
          window.alert?.(message);
        } else {
          Alert.alert('Could not build your box', message);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const completeReveal = useCallback(async () => {
      queuePendingMainNav({ screen: 'MyBox' });
      const authed = useAuthStore.getState();
      if (!authed.isAuthenticated || !authed.user?.uid) {
        completeGuestBoxReveal();
        clearBoxBuildResume();
        clearDevPreview();
        onComplete?.();
        return;
      }
      await usersService.upsert(authed.user.uid, {
        onboardingComplete: true,
        boxRevealComplete: true,
        lockReminderEligible: true,
        lockReminderAttempts: 0,
      });
      markHandoff();
      useGuestSessionStore.setState({ buildBoxPath: false });
      // Silent: a full refresh flips sessionLoading and remounts Main (boot
      // spinner), which consumes pending MyBox nav then lands on StorefrontHome.
      try {
        await Promise.race([
          refresh({ silent: true }),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
        ]);
      } catch (err) {
        console.warn('[onboarding] reveal refresh timed out', err);
      }
      clearDevPreview();
      onComplete?.();
  }, [completeGuestBoxReveal, markHandoff, onComplete, refresh]);

  /**
   * After the short splash, open My Box. A new account from the email gate signs
   * in here; the guest box stays put until that save lands.
   */
  const goToReveal = useCallback(() => {
    if (revealHandoffStarted.current) return;
    revealHandoffStarted.current = true;
    setHandoffNotice(null);
    setHandoffBusy(true);
    const slow = setTimeout(() => {
      setHandoffNotice('This is taking a moment. Your answers are saved on this device.');
    }, 12000);
    void (async () => {
      try {
        if (saveRef.current) await saveRef.current;
        // The box is already complete on this device. Do not hold the reveal behind
        // account creation + the guest-to-account Firestore merge (several serial
        // reads/writes on a cold mobile connection can take 30s+). Open My Box now
        // from the guest draft; authStore keeps that draft until the background
        // merge finishes, and RootNavigator clears this resume marker afterward.
        if (pendingRevealSignIn || pendingRevealToken) {
          markHandoff();
          queuePendingMainNav({ screen: 'MyBox' });
          completeGuestBoxReveal();
          clearDevPreview();
          onComplete?.();

          if (!pendingRevealSignIn && pendingRevealToken) {
            const token = pendingRevealToken;
            pendingRevealToken = null;
            const signingIn = signInWithToken(token);
            pendingRevealSignIn = signingIn;
            void signingIn
              .catch((err) => console.warn('[onboarding] sign-in after email gate failed', err))
              .finally(() => {
                if (pendingRevealSignIn === signingIn) pendingRevealSignIn = null;
              });
          }
          setHandoffNotice(null);
          return;
        }
        const stillGuest = !useAuthStore.getState().isAuthenticated;
        if (!stillGuest) {
          markHandoff();
        }
        await completeReveal();
        setHandoffNotice(null);
      } catch (err) {
        revealHandoffStarted.current = false;
        pendingRevealSignIn = null;
        const prev = readBoxBuildResume();
        if (prev?.handingOff) {
          writeBoxBuildResume({ ...prev, handingOff: false, step: 'building' });
        }
        const message = err instanceof Error && err.message && err.message !== 'timeout'
          ? err.message
          : 'Something got stuck opening your box. Your answers are still here.';
        setHandoffNotice(message);
        console.warn('[onboarding] reveal handoff failed', err);
      } finally {
        clearTimeout(slow);
        setHandoffBusy(false);
      }
    })();
  }, [completeReveal, markHandoff, signInWithToken]);

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
        pendingRevealToken = result.customToken;
        setGuestPendingAccountEmail('');
        queueWelcomeAccountToast(email);
        // Preserve the guest draft, but defer the slow account merge until the
        // short build splash hands off to My Box.
        markHandoff();
      } else {
        setGuestPendingAccountEmail(email);
      }
      goToStep('building');
    },
    [childDrafts, goToStep, markHandoff, setGuestPendingAccountEmail]
  );

  // Signed in with a persisted email step (e.g. signed in elsewhere): the gate no longer applies.
  useEffect(() => {
    if (step !== 'email' || guestMode) return;
    if (lineItems.length || useGuestSessionStore.getState().lineItems.length) {
      setBuildingReady(true);
      goToStep('building');
      return;
    }
    goToStep('reveal');
  }, [step, guestMode, goToStep, lineItems.length]);

  // Resume / reveal-only / wizard jump: hand off to My Box once. Failures stay
  // on the loader; this must not re-enter and loop.
  const revealKickRef = useRef(false);
  useEffect(() => {
    if (step !== 'reveal' || loadingReveal || revealKickRef.current) return;
    revealKickRef.current = true;
    goToReveal();
  }, [step, loadingReveal, goToReveal]);

  // Remount mid-reveal: the new loader would otherwise wait out another splash.
  useEffect(() => {
    if (step !== 'building' || handoffNotice) return;
    if (!readBoxBuildResume()?.handingOff || !buildingReady) return;
    goToReveal();
  }, [step, buildingReady, handoffNotice, goToReveal]);

  const retryRef = useRef<() => void>(() => {});
  retryRef.current = () => {
    revealHandoffStarted.current = false;
    pendingRevealSignIn = null;
    setHandoffNotice(null);
    if (!buildingReady && lastBuildRef.current) {
      const last = lastBuildRef.current;
      void buildBox(last.level, last.score, last.kids, last.interests, last.notes);
      return;
    }
    goToReveal();
  };

  const exitOnboarding = useCallback(async () => {
    clearBoxBuildResume();
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
          <BuildingBoxScreen
            onComplete={goToReveal}
            hold={buildingPreviewHold}
            ready={buildingReady}
            notice={handoffNotice}
            onRetry={handoffBusy ? undefined : () => retryRef.current()}
          />
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
          notice={handoffNotice}
          onRetry={handoffBusy ? undefined : () => retryRef.current()}
        />
      );
      break;
    case 'reveal':
      stepContent = handoffNotice ? (
        <BuildingBoxScreen
          onComplete={goToReveal}
          ready={false}
          notice={handoffNotice}
          onRetry={handoffBusy ? undefined : () => retryRef.current()}
        />
      ) : (
        <View style={styles.loading} accessibilityLabel="Opening your box">
          <BrandLoadingMark />
        </View>
      );
      break;
    default:
      return null;
  }

  if (mobileLayout) {
    // Phone: the task header (back, Build your box, step count, progress) instead of the browsing chrome.
    const idx = step === 'email' || step === 'building' || step === 'reveal' ? 2 : Math.max(0, wizardNavStepIndex(step));
    const labels = ['Family', 'About you', 'Your box'];
    const back =
      idx === 0
        ? { label: 'Cancel', onPress: () => leaveToStorefront({ type: 'home' }) }
        : { label: 'Back', onPress: () => goToWizardNavStep(ONBOARDING_WIZARD_NAV_STEPS[idx - 1]!.id) };
    return (
      <OnboardingUnderStorefrontChromeContext.Provider value={true}>
        <StorefrontChrome bodyMode="fill" onLeave={leaveToStorefront} hideServicesNav hideSearchAndRav fillChromeHidden>
          <View style={{ flex: 1, backgroundColor: '#fff' }}>
            <TaskHeader back={back} title="Build your box" right={`Step ${idx + 1} of ${labels.length}`} steps={labels} on={idx} />
            {wrap(stepContent)}
          </View>
        </StorefrontChrome>
      </OnboardingUnderStorefrontChromeContext.Provider>
    );
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
