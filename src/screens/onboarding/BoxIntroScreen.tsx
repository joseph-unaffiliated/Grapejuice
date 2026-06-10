import React from 'react';
import { Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { WebPageContainer } from '../../components/ui/WebPageContainer';
import { semanticColors, spacing, typography, borderRadius, shadowsWeb } from '../../constants/theme';

type Props = { onContinue: () => void };

export function BoxIntroScreen({ onContinue }: Props) {
  return (
    <WebPageContainer style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Built for your family</Text>
        <Text style={styles.body}>
          We curate candles, gelt, a treat path (latkes or sufganiyot), a printed guide for each night,
          and a story or activity for every kid — sized to their age.
        </Text>
        <Text style={styles.body}>
          Most of it is included. Swap kid picks if something does not fit. Add extras only if you want them.
        </Text>
        <Text style={styles.body}>Tell us about your kids next — we will build yours.</Text>
        <TouchableOpacity
          style={[styles.button, Platform.OS === 'web' ? { boxShadow: shadowsWeb.goldGlow } : undefined]}
          onPress={onContinue}
        >
          <Text style={styles.buttonText}>Set up my family</Text>
        </TouchableOpacity>
      </ScrollView>
    </WebPageContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: semanticColors.bgPrimary },
  content: { padding: spacing.lg, paddingTop: spacing.xxxl, paddingBottom: spacing.xxl },
  title: { fontSize: 28, fontWeight: '700', color: semanticColors.textPrimary, marginBottom: spacing.lg },
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
