import React, { useEffect, useCallback, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Alert, Platform } from 'react-native';
import { ChildrenScreen, type ChildDraft } from '../screens/onboarding/ChildrenScreen';
import { ChildInterestsScreen } from '../screens/onboarding/ChildInterestsScreen';
import { FamiliaritySliderScreen } from '../screens/onboarding/FamiliaritySliderScreen';
import { HanukkahIntroScreen } from '../screens/onboarding/HanukkahIntroScreen';
import { HanukkahPracticesScreen } from '../screens/onboarding/HanukkahPracticesScreen';
import { BoxIntroScreen } from '../screens/onboarding/BoxIntroScreen';
import { BoxRevealScreen } from '../screens/onboarding/BoxRevealScreen';
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
import type { ChildInterestId } from '../constants/childInterests';
import { semanticColors } from '../constants/theme';
import type { OnboardingPreviewStep } from '../stores/devPreviewStore';
import { clearDevPreview } from './devPreview';
import { onboardingErrorMessage, resolveOnboardingStep, type OnboardingStep } from './onboardingSteps';

type Props = {
  onComplete?: () => void;
  revealOnly?: boolean;
  isGuest?: boolean;
  initialStep?: OnboardingPreviewStep;
};

function draftsToProfiles(drafts: ChildDraft[]): ChildProfile[] {
  return drafts.map((d, i) => ({
    id: `guest-${i}`,
    name: d.name || undefined,
    ageGroup: d.ageGroup,
    birthdate: d.birthdate,
  }));
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
  const [childDrafts, setChildDrafts] = useState<ChildDraft[]>(guestChildDrafts);
  const [childInterests, setChildInterests] = useState<ChildInterestId[]>(guestChildInterests);
  const [savedChildren, setSavedChildren] = useState<ChildProfile[]>(() =>
    guestChildDrafts.length ? draftsToProfiles(guestChildDrafts) : []
  );
  const [familiarity, setFamiliarity] = useState<FamiliarityLevel>(guestFamiliarityLevel);
  const [familiarityScore, setFamiliarityScore] = useState(guestFamiliarityScore);
  const [ravNotes, setRavNotes] = useState(guestRavNotes);
  const [lineItems, setLineItems] = useState<BoxLineItem[]>(guestLineItems);
  const [saving, setSaving] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [completingReveal, setCompletingReveal] = useState(false);
  const [loadingReveal, setLoadingReveal] = useState(revealOnly);

  const goToStep = useCallback(
    (next: OnboardingStep) => {
      setStep(next);
      setGuestOnboardingStep(next);
    },
    [setGuestOnboardingStep]
  );

  useEffect(() => {
    if (guestChildDrafts.length) setChildDrafts(guestChildDrafts);
    setChildInterests(guestChildInterests);
    setFamiliarity(guestFamiliarityLevel);
    setFamiliarityScore(guestFamiliarityScore);
    setRavNotes(guestRavNotes);
    if (guestLineItems.length) {
      setLineItems(guestLineItems);
      setSavedChildren(draftsToProfiles(guestChildDrafts));
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
            : buildDefaultLineItems(catalog, kids, (draft?.childInterests ?? []) as ChildInterestId[]);
        setSavedChildren(kids);
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
    interests: ChildInterestId[],
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
      const items = buildDefaultLineItems(catalog, profiles, interests);
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
        setSavedChildren(profiles);
        setFamiliarity(level);
        setFamiliarityScore(score);
        setLineItems(items);
        goToStep('building');
        return;
      }

      if (!user?.uid) {
        throw new Error('You must be signed in to save your box. Try signing in and building again.');
      }

      await refresh();
      const householdId = await ensureHouseholdId(user.uid, household?.id ?? profile?.householdId);
      const savedKids = await childrenService.replaceAll(
        user.uid,
        kids.map((c) => ({
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
      setSavedChildren(savedKids);
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

  const completeReveal = async () => {
    if (completingReveal) return;
    setCompletingReveal(true);
    try {
      if (guestMode) {
        completeGuestBoxReveal();
        clearDevPreview();
        onComplete?.();
        return;
      }
      if (!user?.uid) return;
      await usersService.upsert(user.uid, { boxRevealComplete: true, lockReminderEligible: true, lockReminderAttempts: 0 });
      await refresh();
      clearDevPreview();
      onComplete?.();
    } finally {
      setCompletingReveal(false);
    }
  };

  const goToReveal = useCallback(() => goToStep('reveal'), [goToStep]);

  const exitOnboarding = useCallback(async () => {
    clearDevPreview();
    if (guestMode) {
      exitGuestOnboarding();
      onComplete?.();
      return;
    }
    if (!user?.uid) return;
    await usersService.upsert(user.uid, {
      onboardingComplete: true,
      boxRevealComplete: true,
    });
    await refresh();
    onComplete?.();
  }, [exitGuestOnboarding, guestMode, onComplete, refresh, user?.uid]);

  const explore = saving ? undefined : () => void exitOnboarding();

  const wrap = (content: React.ReactNode) => (
    <View style={styles.shell}>
      <View style={styles.shellBody}>{content}</View>
    </View>
  );

  if (loadingReveal) {
    return wrap(
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={semanticColors.brand} />
      </View>
    );
  }

  switch (step) {
    case 'hanukkah-intro':
      return wrap(
        <HanukkahIntroScreen onContinue={() => goToStep('practices')} onExplore={explore} />
      );
    case 'practices':
      return wrap(
        <HanukkahPracticesScreen onContinue={() => goToStep('box-intro')} onExplore={explore} />
      );
    case 'box-intro':
      return wrap(<BoxIntroScreen onContinue={() => goToStep('children')} onExplore={explore} />);
    case 'children':
      return wrap(
        <ChildrenScreen
          onExplore={explore}
          onContinue={(kids) => {
            setChildDrafts(kids);
            setGuestChildDrafts(kids);
            goToStep('child-interests');
          }}
        />
      );
    case 'child-interests':
      return wrap(
        <ChildInterestsScreen
          initialSelected={childInterests}
          onExplore={explore}
          onContinue={(selected) => {
            setChildInterests(selected);
            setGuestChildInterests(selected);
            goToStep('familiarity');
          }}
        />
      );
    case 'familiarity':
      return wrap(
        <FamiliaritySliderScreen
          initialScore={familiarityScore || familiarityLevelToScore(familiarity)}
          onExplore={explore}
          onContinue={(level, score) => {
            setFamiliarity(level);
            setFamiliarityScore(score);
            setGuestFamiliarityScore(score);
            goToStep('rav-question');
          }}
        />
      );
    case 'rav-question':
      return wrap(
        <RavOpenQuestionScreen
          initialNotes={ravNotes}
          isAuthenticated={!guestMode}
          buildError={buildError}
          building={saving}
          onExplore={explore}
          onContinue={(notes) => {
            setRavNotes(notes);
            setGuestRavNotes(notes);
            void buildBox(familiarity, familiarityScore, childDrafts, childInterests, notes);
          }}
        />
      );
    case 'building':
      return wrap(<BuildingBoxScreen onComplete={goToReveal} />);
    case 'reveal':
      return wrap(
        <BoxRevealScreen
          children={savedChildren}
          familiarity={familiarity}
          lineItems={lineItems}
          onDone={completeReveal}
          completing={completingReveal}
        />
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: semanticColors.bgPrimary, minHeight: 0 },
  shellBody: { flex: 1, minHeight: 0 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: semanticColors.bgPrimary },
});
