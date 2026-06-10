import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActiveProfile } from '../../context/ActiveProfileContext';
import { useThemeMode } from '../../context/ThemeContext';
import { useBoxDraft } from '../../hooks/useBoxDraft';
import { getHanukkahConfig } from '../../services/firestore/config';
import { formatHanukkahWelcomeSubtext } from '../../services/hanukkah/dates';
import { HANUKKAH_TIMELINE_2026 } from '../../constants/hanukkahTimeline';
import { useHolidayPhase } from '../../hooks/useHolidayPhase';
import { HomeHeroCard } from '../../components/home/HomeHeroCard';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import type { MainTabsParamList, MainStackParamList } from '../../navigation/types';
import { spacing, typography, borderRadius, MOBILE_GUTTER, tabBarTotalHeight } from '../../constants/theme';
import { isVotablePerKidSlot, isWrappableSlot } from '../../services/box/slotVotes';
import { defaultIsSurprise } from '../../constants/boxPracticeGroups';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabsParamList, 'Home'>,
  StackNavigationProp<MainStackParamList>
>;

const CONTENT_TOP_GAP = 24;
const SCROLL_GAP = 24;

export function KidHomeScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { activeChild } = useActiveProfile();
  const { colors } = useThemeMode();
  const { lineItems } = useBoxDraft();
  const [startsOn, setStartsOn] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    getHanukkahConfig().then((c) => setStartsOn(c.startsOn ?? null));
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const name = activeChild?.name?.trim() || 'friend';
  const { phase, hanukkah } = useHolidayPhase(startsOn, false, [], now);
  const heroSubtitle = formatHanukkahWelcomeSubtext(startsOn, now);

  const votableCount = useMemo(() => {
    if (!activeChild?.id) return 0;
    return lineItems.filter((li) => {
      if (li.childId !== activeChild.id) return false;
      if (!isVotablePerKidSlot(li.slotId)) return false;
      const wrapped =
        isWrappableSlot(li.slotId) && !!(li.isSurprise ?? defaultIsSurprise(li.slotId));
      return !wrapped;
    }).length;
  }, [lineItems, activeChild?.id]);

  const scrollBottomPad = tabBarTotalHeight(Math.max(insets.bottom, 0)) + spacing.lg;

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.bgPrimary }]}>
      <WebContentPanel flush style={styles.panel}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.content, { paddingBottom: scrollBottomPad }]}
          showsVerticalScrollIndicator={false}
        >
          <HomeHeroCard
            title={`Hi, ${name}!`}
            subtitle={heroSubtitle}
            compact={votableCount > 0}
            onPress={() => navigation.navigate('Box')}
          />

          {phase === 'during' ? (
            <TouchableOpacity
              style={[
                styles.phaseCard,
                { backgroundColor: colors.bgElevated, borderColor: colors.goldMuted },
              ]}
              onPress={() => navigation.navigate('KidGuide')}
              activeOpacity={0.85}
            >
              <Text style={[styles.phaseTitle, { color: colors.textPrimary }]}>
                Night {hanukkah.night} of 8
              </Text>
              {HANUKKAH_TIMELINE_2026.filter((n) => n.night === hanukkah.night).map((n) => (
                <View key={n.night}>
                  <Text style={[styles.phaseBody, { color: colors.textSecondary }]}>
                    {n.title} — {n.prompt}
                  </Text>
                </View>
              ))}
              <Text style={[styles.phaseLink, { color: colors.brand }]}>Open tonight&apos;s guide →</Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.section}>
            <View style={[styles.sectionHeader, styles.gutterPad]}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>My picks</Text>
            </View>

            {votableCount === 0 ? (
              <View
                style={[
                  styles.emptyCard,
                  styles.gutterPad,
                  { backgroundColor: colors.bgElevated, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Nothing to vote on yet</Text>
                <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
                  Ask a grown-up to add your stories and gifts — or check back when your box is ready.
                </Text>
              </View>
            ) : (
              <View style={styles.gutterPad}>
                <TouchableOpacity
                  style={[
                    styles.myPicksCard,
                    Platform.OS === 'web'
                      ? ({ boxShadow: '0px 0px 12px rgba(216, 201, 144, 0.50)' } as object)
                      : undefined,
                    { backgroundColor: colors.bgElevated },
                  ]}
                  onPress={() => navigation.navigate('Box')}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.myPicksTitle, { color: colors.textPrimary }]}>Vote on your picks</Text>
                  <Text style={[styles.myPicksSub, { color: colors.textSecondary }]}>
                    {votableCount} stor{votableCount === 1 ? 'y' : 'ies'} & gift{votableCount === 1 ? '' : 's'} waiting
                    for your 👍
                  </Text>
                  <Text style={[styles.myPicksLink, { color: colors.brand }]}>Open My picks →</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </WebContentPanel>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, overflow: 'visible' as const },
  panel: { overflow: 'visible' as const },
  scrollView: { flex: 1, overflow: 'visible' as const },
  content: {
    gap: SCROLL_GAP,
    paddingTop: CONTENT_TOP_GAP,
    overflow: 'visible' as const,
  },
  gutterPad: { paddingHorizontal: MOBILE_GUTTER },
  phaseCard: {
    marginHorizontal: MOBILE_GUTTER,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  phaseTitle: { fontSize: typography.xl, fontWeight: '600' },
  phaseBody: { fontSize: typography.md, marginTop: spacing.xs, lineHeight: 20 },
  phaseLink: { fontSize: typography.sm, marginTop: spacing.sm, fontWeight: '600' },
  section: { gap: spacing.md },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: typography.lg,
    fontWeight: '400',
    letterSpacing: -0.26,
  },
  myPicksCard: {
    borderRadius: 16,
    padding: spacing.md,
    minHeight: 120,
  },
  myPicksTitle: { fontSize: typography.lg, fontWeight: '400', letterSpacing: -0.26 },
  myPicksSub: { fontSize: typography.sm, fontWeight: '200', marginTop: 4 },
  myPicksLink: { fontSize: typography.sm, fontWeight: '600', marginTop: spacing.sm },
  emptyCard: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
  },
  emptyTitle: { fontSize: typography.xl, fontWeight: '700' },
  emptyBody: { fontSize: typography.md, marginTop: spacing.sm, lineHeight: 20 },
});
