import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { GuideNight } from '../../services/firestore/guideContent';
import { useThemeMode } from '../../context/ThemeContext';
import { spacing, typography, borderRadius } from '../../constants/theme';

type Props = {
  night: GuideNight;
  expanded: boolean;
  onToggle: () => void;
};

export function NightCard({ night, expanded, onToggle }: Props) {
  const { colors } = useThemeMode();

  return (
    <TouchableOpacity
      style={[
        styles.nightCard,
        {
          borderColor: colors.border,
          backgroundColor: expanded ? colors.brandLight : colors.bgPrimary,
        },
      ]}
      onPress={onToggle}
      activeOpacity={0.8}
    >
      <View style={styles.nightHeader}>
        <Text style={[styles.nightTitle, { color: colors.textPrimary }]}>{night.title}</Text>
        <Text style={[styles.chevron, { color: colors.textTertiary }]}>{expanded ? '−' : '+'}</Text>
      </View>
      {expanded ? (
        <View style={styles.nightBody}>
          {night.suggestion ? (
            <Text style={[styles.suggestion, { color: colors.textSecondary }]}>{night.suggestion}</Text>
          ) : null}
          {night.songTitle ? (
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              Song: <Text style={{ fontWeight: '600' }}>{night.songTitle}</Text>
            </Text>
          ) : null}
          {night.storySnippet ? (
            <Text style={[styles.meta, { color: colors.textTertiary, fontStyle: 'italic' }]}>
              {night.storySnippet}
            </Text>
          ) : null}
        </View>
      ) : night.suggestion ? (
        <Text style={[styles.preview, { color: colors.textTertiary }]} numberOfLines={2}>
          {night.suggestion}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  nightCard: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  nightHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nightTitle: { fontSize: typography.xl, fontWeight: '700' },
  chevron: { fontSize: 20, fontWeight: '300' },
  preview: { fontSize: typography.md, marginTop: spacing.xs },
  nightBody: { marginTop: spacing.sm },
  suggestion: { fontSize: typography.lg, lineHeight: 20 },
  meta: { fontSize: typography.md, marginTop: spacing.sm },
});
