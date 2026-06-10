import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { guideContentService, type GuideNight } from '../../services/firestore/guideContent';
import { useThemeMode } from '../../context/ThemeContext';
import { useWebScreenFrame } from '../../constants/webLayout';
import { spacing, typography, borderRadius } from '../../constants/theme';
import type { MainStackParamList } from '../../navigation/types';

function NightCard({
  night,
  expanded,
  onToggle,
}: {
  night: GuideNight;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { colors } = useThemeMode();

  return (
    <TouchableOpacity
      style={[styles.nightCard, { borderColor: colors.border, backgroundColor: expanded ? colors.brandLight : colors.bgPrimary }]}
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
            <Text style={[styles.meta, { color: colors.textTertiary, fontStyle: 'italic' }]}>{night.storySnippet}</Text>
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

export function GuideScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const { colors } = useThemeMode();
  const webFrame = useWebScreenFrame();
  const [nights, setNights] = useState<GuideNight[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedNight, setExpandedNight] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await guideContentService.listNights();
    setNights(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, webFrame]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityRole="button">
          <Text style={[styles.backText, { color: colors.textSecondary }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Hanukkah guide</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Eight nights of ideas — tap a night to expand.
        </Text>
        {nights.map((night) => (
          <NightCard
            key={night.night}
            night={night}
            expanded={expandedNight === night.night}
            onToggle={() => setExpandedNight((prev) => (prev === night.night ? null : night.night))}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingTop: spacing.md, paddingBottom: 120 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backBtn: { alignSelf: 'flex-start', paddingVertical: spacing.xs, marginBottom: spacing.sm },
  backText: { fontSize: typography.lg, fontWeight: '500' },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: typography.lg, marginTop: spacing.xs, marginBottom: spacing.lg },
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
