import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { WebPageContainer } from '../../components/ui/WebPageContainer';
import { HanukkahPracticesOverview } from '../../components/holiday/HanukkahPracticesOverview';
import { semanticColors, spacing, typography, borderRadius, shadowsWeb } from '../../constants/theme';

type Props = { onContinue: () => void };

export function HanukkahPracticesScreen({ onContinue }: Props) {
  return (
    <WebPageContainer style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>How Hanukkah works</Text>
        <Text style={styles.title}>Four practices at home</Text>
        <Text style={styles.lead}>
          You do not need to do everything Jewish families have ever done. These four are the core — and
          if you do them, you have celebrated Hanukkah.
        </Text>
        <HanukkahPracticesOverview layout="stack" showIntro={false} />
        <Text style={styles.footer}>
          Your curated box includes materials for each practice — matched to your kids and how involved
          you want to be.
        </Text>
        <TouchableOpacity
          style={[styles.button, Platform.OS === 'web' ? { boxShadow: shadowsWeb.goldGlow } : undefined]}
          onPress={onContinue}
        >
          <Text style={styles.buttonText}>See your box</Text>
        </TouchableOpacity>
      </ScrollView>
    </WebPageContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: semanticColors.bgPrimary },
  content: { padding: spacing.lg, paddingTop: spacing.xxxl, paddingBottom: spacing.xxl },
  kicker: {
    fontSize: typography.sm,
    color: semanticColors.goldMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: semanticColors.textPrimary,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  lead: {
    fontSize: typography.lg,
    lineHeight: 22,
    color: semanticColors.textSecondary,
    marginBottom: spacing.lg,
  },
  footer: {
    fontSize: typography.md,
    lineHeight: 18,
    color: semanticColors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  button: {
    backgroundColor: semanticColors.brand,
    borderRadius: borderRadius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonText: { fontSize: typography.xl, fontWeight: '600', color: semanticColors.textPrimary },
});
