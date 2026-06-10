import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import {
  HANUKKAH_PRACTICES,
  HANUKKAH_PRACTICES_INTRO,
  type HanukkahPractice,
} from '../../constants/hanukkahPractices';
import { semanticColors, spacing, typography, borderRadius, shadows, shadowsWeb } from '../../constants/theme';
import { useEffectiveWindowDimensions } from '../../hooks/useEffectiveWindowDimensions';
import { useWebLayout } from '../../hooks/useWebLayout';

const THUMB_SIZE = 72;
const GRID_GAP = spacing.sm;
const CARD_INNER_WIDTH = 2 * THUMB_SIZE + GRID_GAP;
const CARD_WIDTH = CARD_INNER_WIDTH + spacing.md * 2;

type Props = {
  layout?: 'carousel' | 'stack';
  showIntro?: boolean;
  sectionTitle?: string;
};

function PracticeThumbGrid({ items }: { items: string[] }) {
  const cells = [...items.slice(0, 4)];
  while (cells.length < 4) cells.push('');
  return (
    <View style={[styles.thumbGrid, { width: CARD_INNER_WIDTH }]}>
      {cells.map((label, i) => (
        <View key={i} style={styles.thumbItem}>
          <View style={[styles.thumbImage, { width: THUMB_SIZE, height: THUMB_SIZE }]} />
          {label ? (
            <Text style={styles.thumbLabel} numberOfLines={2}>
              {label}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function PracticeCard({ practice }: { practice: HanukkahPractice }) {
  const cardStyle = [
    styles.practiceCard,
    { width: CARD_WIDTH, minWidth: CARD_WIDTH },
    Platform.OS === 'web' ? { boxShadow: shadowsWeb.goldGlow } : shadows.goldGlow,
  ];
  return (
    <View style={cardStyle}>
      <Text style={styles.practiceTitle}>{practice.title}</Text>
      <Text style={styles.practiceTagline}>{practice.tagline}</Text>
      <PracticeThumbGrid items={practice.boxItems} />
    </View>
  );
}

function PracticeStackRow({ practice }: { practice: HanukkahPractice }) {
  return (
    <View style={styles.stackRow}>
      <Text style={styles.stackTitle}>{practice.title}</Text>
      <Text style={styles.stackTagline}>{practice.tagline}</Text>
      <Text style={styles.stackBody}>{practice.description}</Text>
      <Text style={styles.stackBoxLabel}>In your box</Text>
      {practice.boxItems.map((item) => (
        <Text key={item} style={styles.stackBoxItem}>
          · {item}
        </Text>
      ))}
    </View>
  );
}

export function HanukkahPracticesOverview({
  layout = 'carousel',
  showIntro = true,
  sectionTitle = 'Hanukkah at home',
}: Props) {
  const { width: screenWidth } = useEffectiveWindowDimensions();
  const { isDesktop, layoutWidth } = useWebLayout();
  const contentWidth = isDesktop ? layoutWidth : screenWidth;
  const carouselCardWidth = useMemo(
    () => Math.min(CARD_WIDTH, Math.floor(contentWidth * 0.82)),
    [contentWidth]
  );

  if (layout === 'stack') {
    return (
      <View style={styles.stackSection}>
        {showIntro ? (
          <>
            <Text style={styles.sectionTitle}>{sectionTitle}</Text>
            <Text style={styles.intro}>{HANUKKAH_PRACTICES_INTRO}</Text>
          </>
        ) : null}
        {HANUKKAH_PRACTICES.map((practice) => (
          <PracticeStackRow key={practice.id} practice={practice} />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.section}>
      {showIntro ? (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{sectionTitle}</Text>
          <Text style={styles.introShort}>{HANUKKAH_PRACTICES_INTRO}</Text>
        </View>
      ) : null}
      <View style={styles.horizontalScrollWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carouselRow}
        >
          {HANUKKAH_PRACTICES.map((practice) => (
            <View key={practice.id} style={{ width: carouselCardWidth, minWidth: carouselCardWidth }}>
              <PracticeCard practice={practice} />
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.md },
  sectionHeader: {
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.title,
    fontWeight: '400',
    color: semanticColors.textPrimary,
  },
  introShort: {
    fontSize: typography.md,
    color: semanticColors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  intro: {
    fontSize: typography.lg,
    color: semanticColors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  horizontalScrollWrap: {},
  carouselRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  practiceCard: {
    borderRadius: 16,
    padding: spacing.md,
    backgroundColor: semanticColors.bgPrimary,
  },
  practiceTitle: {
    fontSize: typography.lg,
    fontWeight: '600',
    color: semanticColors.textPrimary,
    marginBottom: 2,
  },
  practiceTagline: {
    fontSize: typography.sm,
    fontWeight: '200',
    color: semanticColors.textSecondary,
    marginBottom: spacing.sm,
  },
  thumbGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  thumbItem: {
    width: THUMB_SIZE,
  },
  thumbImage: {
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: borderRadius.sm,
  },
  thumbLabel: {
    fontSize: typography.xs,
    fontWeight: '200',
    color: semanticColors.textPrimary,
    marginTop: spacing.xs,
  },
  stackSection: {
    marginBottom: spacing.lg,
  },
  stackRow: {
    backgroundColor: semanticColors.accentCream,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  stackTitle: {
    fontSize: typography.xl,
    fontWeight: '700',
    color: semanticColors.textPrimary,
  },
  stackTagline: {
    fontSize: typography.sm,
    color: semanticColors.goldMuted,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  stackBody: {
    fontSize: typography.md,
    color: semanticColors.textSecondary,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  stackBoxLabel: {
    fontSize: typography.sm,
    fontWeight: '600',
    color: semanticColors.textPrimary,
    marginBottom: spacing.xs,
  },
  stackBoxItem: {
    fontSize: typography.sm,
    color: semanticColors.textSecondary,
    lineHeight: 18,
  },
});
