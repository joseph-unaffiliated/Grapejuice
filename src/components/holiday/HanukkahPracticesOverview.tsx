import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  TouchableOpacity,
  Animated,
  Easing,
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
const ACCORDION_MS = 260;
/** Matches goldGlowSm blur (8px) so ScrollView overflowX doesn't clip the side glow. */
const STACK_SHADOW_BLEED = 8;
/** Accordion body always animates against this ceiling — keep in sync with maxHeight below. */
const STACK_BODY_MAX_HEIGHT = 280;
/** stackHeader paddingVertical sm×2 + title (typography.xl). */
const STACK_ROW_HEADER_HEIGHT = spacing.sm * 2 + typography.xl;

const PRACTICE_ICONS: Record<string, (typeof icons)[keyof typeof icons]> = {
  candles: icons.menorah,
  latkes: icons.utensils,
  story: icons.book,
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

/** Mouse clicks should not move focus — avoids the browser focus-ring flash on press. */
const WEB_SUPPRESS_MOUSE_FOCUS =
  Platform.OS === 'web'
    ? ({
        onMouseDown: (e: { preventDefault(): void }) => e.preventDefault(),
      } as object)
    : {};

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

function PracticeAccordionRow({
  practice,
  expanded,
  onToggle,
}: {
  practice: HanukkahPractice;
  expanded: boolean;
  onToggle: () => void;
}) {
  const chevron = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const bodyProgress = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const [bodyMounted, setBodyMounted] = useState(expanded);
  useEffect(() => {
    Animated.timing(chevron, {
      toValue: expanded ? 1 : 0,
      duration: ACCORDION_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [chevron, expanded]);

  useEffect(() => {
    if (expanded) setBodyMounted(true);

    const anim = Animated.timing(bodyProgress, {
      toValue: expanded ? 1 : 0,
      duration: ACCORDION_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    });

    anim.start(({ finished }) => {
      if (finished && !expanded) setBodyMounted(false);
    });

    return () => anim.stop();
  }, [bodyProgress, expanded]);

  const chevronRotate = chevron.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    // Glow on the outer wrap — stackRow keeps overflow:hidden for the accordion clip.
    <View style={[styles.stackRowOuter, goldGlowStyle]}>
      <View style={styles.stackRow}>
        <TouchableOpacity
          onPress={onToggle}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={practice.title}
          style={styles.stackHeader}
          {...WEB_SUPPRESS_MOUSE_FOCUS}
        >
          <View style={styles.stackTitleRow}>
            <PracticeRowIcon practiceId={practice.id} />
            <Text style={styles.stackTitle}>{practice.title}</Text>
          </View>
          <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
            <Icon icon={icons.chevronDown} size={10} color={semanticColors.goldMuted} />
          </Animated.View>
        </TouchableOpacity>

        {bodyMounted ? (
          <Animated.View
            style={[
              styles.stackBodyWrap,
              {
                opacity: bodyProgress,
                maxHeight: bodyProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, STACK_BODY_MAX_HEIGHT],
                }),
              },
            ]}
          >
            <Text style={styles.stackTagline}>{practice.tagline}</Text>
            <Text style={styles.stackBody}>{practice.description}</Text>
            <Text style={styles.stackBoxLabel}>In your box</Text>
            {practice.boxItems.map((item) => (
              <Text key={item} style={styles.stackBoxItem}>
                · {item}
              </Text>
            ))}
          </Animated.View>
        ) : null}
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
  const [openPracticeId, setOpenPracticeId] = useState<string>(HANUKKAH_PRACTICES[0]?.id ?? 'candles');

  if (layout === 'stack') {
    const practiceCount = HANUKKAH_PRACTICES.length;
    // Desktop only: reserve N headers + one body so onboarding chrome doesn't shift.
    // Mobile lets the list size naturally — the shell scrolls behind sticky CTAs.
    const stackListHeight = isDesktop
      ? practiceCount * STACK_ROW_HEADER_HEIGHT +
        Math.max(0, practiceCount - 1) * GRID_GAP +
        STACK_BODY_MAX_HEIGHT +
        STACK_SHADOW_BLEED * 2
      : undefined;

    return (
      <View style={styles.stackSection}>
        {showIntro ? (
          <>
            <Text style={styles.sectionTitle}>{sectionTitle}</Text>
            <Text style={styles.intro}>{HANUKKAH_PRACTICES_INTRO}</Text>
          </>
        ) : null}
        <View style={[styles.stackList, stackListHeight != null ? { height: stackListHeight } : null]}>
          {HANUKKAH_PRACTICES.map((practice) => (
            <PracticeAccordionRow
              key={practice.id}
              practice={practice}
              expanded={openPracticeId === practice.id}
              onToggle={() => {
                if (practice.id !== openPracticeId) setOpenPracticeId(practice.id);
              }}
            />
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
    // Inset so goldGlowSm clears ScrollView overflowX / vertical overflow clip.
    paddingHorizontal: STACK_SHADOW_BLEED,
    paddingVertical: STACK_SHADOW_BLEED,
    marginVertical: -STACK_SHADOW_BLEED,
    overflow: 'visible' as const,
  },
  stackRowOuter: {
    borderRadius: borderRadius.xl,
    overflow: 'visible' as const,
  },
  stackRow: {
    borderRadius: borderRadius.xl,
    backgroundColor: semanticColors.bgPrimary,
    overflow: 'hidden',
  },
  stackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
    ...(Platform.OS === 'web'
      ? ({ outlineStyle: 'none', outlineWidth: 0, boxShadow: 'none' } as object)
      : {}),
  },
  stackTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
  },
  stackTitle: {
    flex: 1,
    fontSize: typography.xl,
    fontWeight: '400',
    color: '#000000',
  },
  stackBodyWrap: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    overflow: 'hidden',
  },
  stackTagline: {
    fontSize: typography.sm,
    fontWeight: '200',
    color: semanticColors.goldMuted,
    marginBottom: spacing.sm,
  },
  stackBody: {
    fontSize: typography.sm,
    fontWeight: '200',
    color: '#000000',
    lineHeight: 16.5,
    marginBottom: spacing.sm,
  },
  stackBoxLabel: {
    fontSize: typography.sm,
    fontWeight: '400',
    color: semanticColors.goldMuted,
    marginBottom: spacing.xs,
  },
  stackBoxItem: {
    fontSize: typography.sm,
    fontWeight: '200',
    color: '#000000',
    lineHeight: 16.5,
  },
});
