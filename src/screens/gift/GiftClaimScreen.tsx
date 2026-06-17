import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuthStore } from '../../stores/authStore';
import { claimGiftInvite } from '../../services/gift/giftFlow';
import { formatDollars } from '../../services/box/buildDefaultBox';
import { useSession } from '../../hooks/useSession';
import { consumePersistedGiftClaimToken } from '../../navigation/giftClaimLink';
import type { MainStackParamList } from '../../navigation/types';
import { semanticColors, spacing, typography, borderRadius } from '../../constants/theme';

type Route = RouteProp<MainStackParamList, 'GiftClaim'>;

/** Recipient claim — magic link lands with ?token=… */
export function GiftClaimScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<Route>();
  const token = route.params?.token ?? consumePersistedGiftClaimToken() ?? '';
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { refresh } = useSession();
  const [claiming, setClaiming] = useState(false);

  const claim = async () => {
    if (!token) {
      Alert.alert('Invalid link', 'This gift link is missing a token. Ask the giver to resend.');
      return;
    }
    if (!isAuthenticated) {
      navigation.navigate('MainTabs', { screen: 'Account' });
      Alert.alert('Sign in required', 'Create an account or sign in, then open this link again.');
      return;
    }
    setClaiming(true);
    try {
      const result = await claimGiftInvite(token);
      await refresh();
      navigation.replace('GiftRecipientReveal', {
        giverName: result.giverName ?? 'Someone who loves you',
        message: result.message,
        giftCreditCents: result.giftCreditCents,
        hasGiverDraft: result.hasGiverDraft,
      });
    } catch (e) {
      Alert.alert('Could not claim gift', e instanceof Error ? e.message : 'Try again or contact support.');
    } finally {
      setClaiming(false);
    }
  };

  if (!token) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Gift link invalid</Text>
        <Text style={styles.body}>Ask whoever sent the gift to forward the email again.</Text>
      </View>
    );
  }

  return (
    <View style={styles.centered}>
      <Text style={styles.kicker}>You received a gift</Text>
      <Text style={styles.title}>Claim your Hanukkah box credit</Text>
      <Text style={styles.body}>
        Sign in with the recipient family account, then claim to add credit and see what they picked for you.
      </Text>
      <TouchableOpacity style={styles.cta} onPress={() => void claim()} disabled={claiming}>
        {claiming ? (
          <ActivityIndicator color={semanticColors.textInverse} />
        ) : (
          <Text style={styles.ctaText}>{isAuthenticated ? 'Claim gift' : 'Sign in to claim'}</Text>
        )}
      </TouchableOpacity>
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
  body: { fontSize: typography.lg, lineHeight: 22, color: semanticColors.textSecondary, textAlign: 'center', marginBottom: spacing.xl },
  cta: {
    backgroundColor: semanticColors.brand,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.pill,
    minWidth: 200,
    alignItems: 'center',
  },
  ctaText: { color: semanticColors.textInverse, fontWeight: '700', fontSize: typography.lg },
});
