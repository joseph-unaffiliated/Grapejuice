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
import { icons } from '../../constants/icons';
import { DreidelIcon } from '../ui/DreidelIcon';
import { Icon } from '../ui/Icon';
import { semanticColors, spacing, typography, borderRadius, shadows, shadowsWeb } from '../../constants/theme';
import { useEffectiveWindowDimensions } from '../../hooks/useEffectiveWindowDimensions';
import { useWebLayout } from '../../hooks/useWebLayout';

const THUMB_SIZE = 72;
const GRID_GAP = spacing.sm;
const CARD_INNER_WIDTH = 2 * THUMB_SIZE + GRID_GAP;
const CARD_WIDTH = CARD_INNER_WIDTH + spacing.md * 2;

const PRACTICE_ICONS: Record<string, (typeof icons)[keyof typeof icons]> = {
  candles: icons.menorah,
  food: icons.utensils,
  story: icons.book,
  presents: icons.gift,
};

function PracticeRowIcon({ practiceId }: { practiceId: string }) {
  const color = semanticColors.goldMuted;
  const size = 14;
  if (practiceId === 'dreidel') {
    return <DreidelIcon size={size} color={color} />;
  }
  return <Icon icon={PRACTICE_ICONS[practiceId] ?? icons.star} size={size} color={color} />;
}

const goldGlowStyle =
  Platform.OS === 'web' ? ({ boxShadow: shadowsWeb.goldGlowSm } as object) : shadows.goldGlow;

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
  return (
    <View style={[styles.practiceCard, { width: CARD_WIDTH, minWidth: CARD_WIDTH }, goldGlowStyle]}>
      <Text style={styles.practiceTitle}>{practice.title}</Text>
      <Text style={styles.practiceTagline}>{practice.tagline}</Text>
      <PracticeThumbGrid items={practice.boxItems} />
    </View>
  );
}

function PracticeStackRow({ practice }: { practice: HanukkahPractice }) {
  return (
    <View style={[styles.stackRowOuter, goldGlowStyle]}>
      <View style={styles.stackRow}>
        <View style={styles.stackTitleRow}>
          <PracticeRowIcon practiceId={practice.id} />
          <Text style={styles.stackTitle}>{practice.title}</Text>
        </View>
        <Text style={styles.stackBody}>{practice.description}</Text>
      </View>
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
        <View style={styles.stackList}>
          {HANUKKAH_PRACTICES.map((practice) => (
            <PracticeStackRow key={practice.id} practice={practice} />
          ))}
        </View>
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
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  stackList: {
    gap: GRID_GAP,
  },
  stackRowOuter: {
    borderRadius: borderRadius.xl,
    overflow: 'visible' as const,
  },
  stackRow: {
    borderRadius: borderRadius.xl,
    backgroundColor: semanticColors.bgPrimary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  stackTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stackTitle: {
    flex: 1,
    fontSize: typography.xl,
    fontWeight: '400',
    color: '#000000',
  },
  stackBody: {
    fontSize: typography.sm,
    fontWeight: '200',
    color: '#000000',
    lineHeight: 16.5,
    paddingLeft: 14 + spacing.sm,
  },
});
