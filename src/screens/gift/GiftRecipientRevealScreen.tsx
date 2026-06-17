/** Figma rGzXYb1rNVxqGHz81835Jn — frame 17: recipient reveal after claim. */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSession } from '../../hooks/useSession';
import { useBoxDraft } from '../../hooks/useBoxDraft';
import { useAuthStore } from '../../stores/authStore';
import { boxDraftService } from '../../services/firestore/boxDraft';
import { BoxRevealScreen } from '../onboarding/BoxRevealScreen';
import type { MainStackParamList } from '../../navigation/types';
import { semanticColors, spacing, typography, borderRadius } from '../../constants/theme';

type Route = RouteProp<MainStackParamList, 'GiftRecipientReveal'>;

export function GiftRecipientRevealScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<Route>();
  const { giverName, message, giftCreditCents, hasGiverDraft } = route.params;
  const user = useAuthStore((s) => s.user);
  const { household } = useSession();
  const { lineItems, children, loading, refresh } = useBoxDraft();
  const [phase, setPhase] = useState<'intro' | 'reveal' | 'fork'>('intro');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={semanticColors.brand} />
      </View>
    );
  }

  if (!hasGiverDraft) {
    return (
      <View style={styles.centered}>
        <Text style={styles.kicker}>A gift from {giverName}</Text>
        <Text style={styles.title}>Your gift credit is ready</Text>
        {message ? <Text style={styles.message}>&ldquo;{message}&rdquo;</Text> : null}
        <Text style={styles.body}>
          ${(giftCreditCents / 100).toFixed(0)} is on your account. Open My Box to build and customize your Hanukkah box.
        </Text>
        <TouchableOpacity style={styles.cta} onPress={() => navigation.replace('MyBox')}>
          <Text style={styles.ctaText}>Open My Box</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'intro') {
    return (
      <View style={styles.centered}>
        <Text style={styles.kicker}>A gift from {giverName}</Text>
        <Text style={styles.title}>Your Hanukkah box is ready</Text>
        {message ? <Text style={styles.message}>&ldquo;{message}&rdquo;</Text> : null}
        <Text style={styles.body}>
          {giftCreditCents > 0
            ? `$${(giftCreditCents / 100).toFixed(0)} credit is on your account.`
            : 'Your gift credit is ready.'}{' '}
          Tap below to see what they picked.
        </Text>
        <TouchableOpacity style={styles.cta} onPress={() => setPhase('reveal')}>
          <Text style={styles.ctaText}>Reveal my box</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'reveal') {
    return (
      <BoxRevealScreen
        children={children}
        familiarity="moderate"
        lineItems={lineItems}
        onDone={() => setPhase('fork')}
      />
    );
  }

  const chooseCustomize = () => {
    navigation.replace('MyBox');
  };

  const chooseSurprise = async () => {
    if (!household?.id || !user?.uid) {
      navigation.replace('MyBox');
      return;
    }
    setSaving(true);
    try {
      const next = lineItems.map((li) => {
        if (li.slotId.startsWith('story') || li.slotId.startsWith('gift')) {
          return { ...li, isSurprise: true };
        }
        return li;
      });
      await boxDraftService.save(household.id, user.uid, next);
      await refresh();
      navigation.replace('MyBox');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.centered}>
      <Text style={styles.title}>How do you want to receive it?</Text>
      <Text style={styles.body}>
        Keep sections sealed as a surprise until your box arrives, or customize swaps until the lock date.
      </Text>
      <TouchableOpacity style={styles.cta} onPress={() => void chooseSurprise()} disabled={saving}>
        {saving ? (
          <ActivityIndicator color={semanticColors.textInverse} />
        ) : (
          <Text style={styles.ctaText}>Keep surprise</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryCta} onPress={chooseCustomize} disabled={saving}>
        <Text style={styles.secondaryCtaText}>Customize my box</Text>
      </TouchableOpacity>
      <Text style={styles.stubNote}>Sealed sections are a pilot preview — fulfillment may ship open.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: semanticColors.bgPrimary,
    padding: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kicker: { fontSize: typography.sm, color: semanticColors.goldMuted, fontWeight: '600', textTransform: 'uppercase' },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.md },
  message: {
    fontSize: typography.lg,
    fontStyle: 'italic',
    color: semanticColors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
    lineHeight: 24,
  },
  body: { fontSize: typography.lg, lineHeight: 22, color: semanticColors.textSecondary, textAlign: 'center', marginBottom: spacing.xl },
  cta: {
    backgroundColor: semanticColors.brand,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.pill,
    minWidth: 220,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  ctaText: { color: semanticColors.textInverse, fontWeight: '700', fontSize: typography.lg },
  secondaryCta: {
    borderWidth: 1,
    borderColor: semanticColors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.pill,
    minWidth: 220,
    alignItems: 'center',
  },
  secondaryCtaText: { color: semanticColors.brand, fontWeight: '700', fontSize: typography.lg },
  stubNote: { fontSize: typography.sm, color: semanticColors.textTertiary, textAlign: 'center', marginTop: spacing.lg },
});
