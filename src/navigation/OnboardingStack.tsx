import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { ChildrenScreen, type ChildDraft } from '../screens/onboarding/ChildrenScreen';
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
import { catalogService } from '../services/firestore/catalog';
import { boxDraftService } from '../services/firestore/boxDraft';
import { buildDefaultLineItems } from '../services/box/buildDefaultBox';
import type { BoxLineItem, FamiliarityLevel, ChildProfile } from '../types/pilot';
import { semanticColors } from '../constants/theme';

type Step =
  | 'hanukkah-intro'
  | 'practices'
  | 'box-intro'
  | 'children'
  | 'familiarity'
  | 'rav-question'
  | 'building'
  | 'reveal';

type Props = {
  onComplete?: () => void;
  revealOnly?: boolean;
  isGuest?: boolean;
};

function draftsToProfiles(drafts: ChildDraft[]): ChildProfile[] {
  return drafts.map((d, i) => ({
    id: `guest-${i}`,
    name: d.name || undefined,
    ageGroup: d.ageGroup,
    birthdate: d.birthdate,
  }));
}

export function OnboardingStack({ onComplete, revealOnly = false, isGuest = false }: Props) {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const guestStore = useGuestSessionStore();
  const { household, profile, refresh } = useSession();
  const guestMode = isGuest || !isAuthenticated;

  const [step, setStep] = useState<Step>(revealOnly ? 'reveal' : 'hanukkah-intro');
  const [childDrafts, setChildDrafts] = useState<ChildDraft[]>([]);
  const [savedChildren, setSavedChildren] = useState<ChildProfile[]>([]);
  const [familiarity, setFamiliarity] = useState<FamiliarityLevel>('moderate');
  const [familiarityScore, setFamiliarityScore] = useState(50);
  const [ravNotes, setRavNotes] = useState('');
  const [lineItems, setLineItems] = useState<BoxLineItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [completingReveal, setCompletingReveal] = useState(false);
  const [loadingReveal, setLoadingReveal] = useState(revealOnly);

  useEffect(() => {
    if (guestMode && !revealOnly) {
      if (guestStore.childDrafts.length) setChildDrafts(guestStore.childDrafts);
      setFamiliarity(guestStore.familiarityLevel);
      setFamiliarityScore(guestStore.familiarityScore);
      setRavNotes(guestStore.ravNotes);
      if (guestStore.lineItems.length) setLineItems(guestStore.lineItems);
    }
  }, [guestMode, revealOnly, guestStore.childDrafts, guestStore.familiarityLevel, guestStore.familiarityScore, guestStore.ravNotes, guestStore.lineItems]);

  useEffect(() => {
    if (!revealOnly || guestMode) {
      if (guestMode && guestStore.lineItems.length) {
        setSavedChildren(draftsToProfiles(guestStore.childDrafts));
        setFamiliarity(guestStore.familiarityLevel);
        setLineItems(guestStore.lineItems);
        setLoadingReveal(false);
      }
      return;
    }
    if (!user?.uid || !household?.id) return;
    let cancelled = false;
    (async () => {
      setLoadingReveal(true);
      const [kids, draft, catalog] = await Promise.all([
        childrenService.list(user.uid),
        boxDraftService.get(household.id),
        catalogService.getAll(),
      ]);
      if (cancelled) return;
      const items =
        draft?.lineItems?.length ? draft.lineItems : buildDefaultLineItems(catalog, kids);
      setSavedChildren(kids);
      setFamiliarity(profile?.familiarityLevel ?? draft?.familiarityLevel ?? 'moderate');
      setLineItems(items);
      setLoadingReveal(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [revealOnly, guestMode, user?.uid, household?.id, profile?.familiarityLevel, guestStore.childDrafts, guestStore.familiarityLevel, guestStore.lineItems]);

  const buildBox = async (level: FamiliarityLevel, score: number, kids: ChildDraft[], notes: string) => {
    setSaving(true);
    try {
      const catalog = await catalogService.getAll();
      const profiles = draftsToProfiles(kids);
      const items = buildDefaultLineItems(catalog, profiles);

      if (guestMode) {
        guestStore.setChildDrafts(kids);
        guestStore.setFamiliarityScore(score);
        guestStore.setRavNotes(notes);
        guestStore.setLineItems(items);
        guestStore.completeOnboarding();
        setSavedChildren(profiles);
        setFamiliarity(level);
        setFamiliarityScore(score);
        setLineItems(items);
        setStep('building');
        return;
      }

      if (!user?.uid || !household?.id) return;
      const savedKids = await childrenService.replaceAll(
        user.uid,
        kids.map((c) => ({
          name: c.name || undefined,
          ageGroup: c.ageGroup,
          birthdate: c.birthdate,
        }))
      );
      await boxDraftService.save(household.id, user.uid, items, { familiarityLevel: level });
      await usersService.upsert(user.uid, {
        familiarityLevel: level,
        onboardingComplete: true,
        boxRevealComplete: false,
      });
      setSavedChildren(savedKids);
      setFamiliarity(level);
      setLineItems(items);
      setStep('building');
    } finally {
      setSaving(false);
    }
  };

  const completeReveal = async () => {
    if (completingReveal) return;
    setCompletingReveal(true);
    try {
      if (guestMode) {
        guestStore.completeBoxReveal();
        onComplete?.();
        return;
      }
      if (!user?.uid) return;
      await usersService.upsert(user.uid, { boxRevealComplete: true });
      await refresh();
      onComplete?.();
    } finally {
      setCompletingReveal(false);
    }
  };

  if (saving || loadingReveal) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={semanticColors.brand} />
      </View>
    );
  }

  switch (step) {
    case 'hanukkah-intro':
      return <HanukkahIntroScreen onContinue={() => setStep('practices')} />;
    case 'practices':
      return <HanukkahPracticesScreen onContinue={() => setStep('box-intro')} />;
    case 'box-intro':
      return <BoxIntroScreen onContinue={() => setStep('children')} />;
    case 'children':
      return (
        <ChildrenScreen
          onContinue={(kids) => {
            setChildDrafts(kids);
            setStep('familiarity');
          }}
        />
      );
    case 'familiarity':
      return (
        <FamiliaritySliderScreen
          initialScore={familiarityScore || familiarityLevelToScore(familiarity)}
          onContinue={(level, score) => {
            setFamiliarity(level);
            setFamiliarityScore(score);
            setStep('rav-question');
          }}
        />
      );
    case 'rav-question':
      return (
        <RavOpenQuestionScreen
          initialNotes={ravNotes}
          isAuthenticated={!guestMode}
          onContinue={(notes) => {
            setRavNotes(notes);
            void buildBox(familiarity, familiarityScore, childDrafts, notes);
          }}
        />
      );
    case 'building':
      return <BuildingBoxScreen onComplete={() => setStep('reveal')} />;
    case 'reveal':
      return (
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
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: semanticColors.bgPrimary },
});
