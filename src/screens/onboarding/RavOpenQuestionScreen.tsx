import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Platform } from 'react-native';
import { WebPageContainer } from '../../components/ui/WebPageContainer';
import { semanticColors, spacing, typography, borderRadius, shadowsWeb } from '../../constants/theme';

type Props = {
  initialNotes?: string;
  isAuthenticated?: boolean;
  onContinue: (notes: string) => void;
};

export function RavOpenQuestionScreen({ initialNotes = '', isAuthenticated = false, onContinue }: Props) {
  const [notes, setNotes] = useState(initialNotes);

  return (
    <WebPageContainer authCard style={styles.wrapper}>
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>Before we build your box</Text>
        <Text style={styles.title}>Anything Rav should know?</Text>
        <Text style={styles.subtitle}>
          Worried about a picky eater? Never lit candles before? Tell us — or skip. We will use this to
          personalize your guide{isAuthenticated ? ' (Rav can reference it in chat)' : ''}.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="e.g. My kid is nervous about fire. We are vegetarian."
          placeholderTextColor={semanticColors.textTertiary}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[styles.cta, Platform.OS === 'web' ? { boxShadow: shadowsWeb.goldGlow } : undefined]}
          onPress={() => onContinue(notes.trim())}
        >
          <Text style={styles.ctaText}>{notes.trim() ? 'Build my box' : 'Skip — build my box'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </WebPageContainer>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  root: { flex: 1, backgroundColor: semanticColors.bgPrimary },
  content: { padding: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.xxl },
  kicker: { fontSize: typography.sm, color: semanticColors.goldMuted, fontWeight: '600', textTransform: 'uppercase' },
  title: { fontSize: 24, fontWeight: '700', marginTop: spacing.sm },
  subtitle: { fontSize: typography.lg, color: semanticColors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.lg, lineHeight: 22 },
  input: {
    borderWidth: 1,
    borderColor: semanticColors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 16,
    minHeight: 120,
    backgroundColor: semanticColors.bgElevated,
    color: semanticColors.textPrimary,
  },
  cta: {
    backgroundColor: semanticColors.brand,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  ctaText: { fontWeight: '700', color: semanticColors.textInverse },
});
