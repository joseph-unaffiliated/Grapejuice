import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { WebPageContainer } from '../../components/ui/WebPageContainer';
import { semanticColors, spacing, typography, borderRadius, shadowsWeb } from '../../constants/theme';
import { Platform } from 'react-native';

type Props = { onContinue: () => void };

export function HanukkahIntroScreen({ onContinue }: Props) {
  return (
    <WebPageContainer style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>Hanukkah 2026</Text>
        <Text style={styles.title}>Eight nights. Your pace.</Text>
        <Text style={styles.body}>
          Hanukkah is a week of light at home — candles, food, games, small rituals. No Hebrew required.
          No prior experience required. Just show up when you can.
        </Text>
        <Text style={styles.body}>
          Grapejuice sends a curated box with what you actually need to celebrate — not decorations that
          sit in a drawer until next year.
        </Text>
        <TouchableOpacity
          style={[styles.button, Platform.OS === 'web' ? { boxShadow: shadowsWeb.goldGlow } : undefined]}
          onPress={onContinue}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </ScrollView>
    </WebPageContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: semanticColors.bgPrimary },
  content: { padding: spacing.lg, paddingTop: spacing.xxxl, paddingBottom: spacing.xxl },
  kicker: { fontSize: typography.sm, color: semanticColors.goldMuted, fontWeight: '600', textTransform: 'uppercase' },
  title: { fontSize: 28, fontWeight: '700', color: semanticColors.textPrimary, marginTop: spacing.sm, marginBottom: spacing.lg },
  body: { fontSize: typography.lg, lineHeight: 22, color: semanticColors.textSecondary, marginBottom: spacing.md },
  button: {
    marginTop: spacing.xl,
    backgroundColor: semanticColors.brand,
    borderRadius: borderRadius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonText: { fontSize: typography.xl, fontWeight: '600', color: semanticColors.textPrimary },
});
