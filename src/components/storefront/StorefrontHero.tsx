import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { StorefrontMediaPlaceholder } from './StorefrontMediaPlaceholder';
import {
  StorefrontHeroJourneyTimeline,
  boxJourneyCopy,
  boxJourneyStatusLine,
  type BoxJourneyDates,
} from './StorefrontHeroJourneyTimeline';
import type { StorefrontHomeMode } from '../../hooks/useStorefrontHomeMode';
import { usePreviewNow } from '../../hooks/useUserStatePreview';
import { getHanukkahStatus } from '../../services/hanukkah/dates';
import { STOREFRONT_HERO, STOREFRONT_HERO_PASSOVER } from '../../constants/storefrontMedia';
import {
  borderRadius,
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
} from '../../constants/theme';

type Props = {
  mode: StorefrontHomeMode;
  /** Journey dates for any non-acquisition mode that shows the timeline. */
  journey?: BoxJourneyDates | null;
  onPrimary: () => void;
  onSecondary: () => void;
};

function showJourney(mode: StorefrontHomeMode): boolean {
  return (
    mode !== 'acquisition' &&
    mode !== 'passover' &&
    mode !== 'gift_credit_incomplete' &&
    mode !== 'gift_customize_incomplete' &&
    mode !== 'gift_sent'
  );
}

function showCtas(mode: StorefrontHomeMode): boolean {
  return mode !== 'locked';
}

export function StorefrontHero({
  mode,
  journey = null,
  onPrimary,
  onSecondary,
}: Props) {
  const { height, width } = useWindowDimensions();
  const compact = width < 768;
  const hero = mode === 'passover' ? STOREFRONT_HERO_PASSOVER : STOREFRONT_HERO;
  const now = usePreviewNow();
  const duringHanukkah =
    journey != null && getHanukkahStatus(journey.startsOn, now).phase === 'during';
  const journeyMode = showJourney(mode) && Boolean(journey);
  const showTimeline = journeyMode && !duringHanukkah;
  const withCtas = showCtas(mode);
  const heroHeight = Math.min(
    Math.max(
      height *
        (compact
          ? showTimeline
            ? withCtas
              ? 0.58
              : 0.52
            : 0.48
          : showTimeline
            ? withCtas
              ? 0.62
              : 0.55
            : 0.55),
      compact ? (showTimeline ? 400 : 320) : showTimeline ? 440 : 360
    ),
    showTimeline ? 640 : 560
  );

  const journeyHeadline = useMemo(
    () => (journey ? boxJourneyCopy(journey, now).headline : null),
    [journey, now]
  );
  const statusLine = useMemo(() => {
    if (!journey || mode === 'acquisition' || mode === 'passover' || duringHanukkah) return null;
    if (mode === 'guest_box' || mode === 'customize' || mode === 'needs_payment' || mode === 'locked') {
      return boxJourneyStatusLine(journey, mode, now);
    }
    return null;
  }, [journey, mode, now, duringHanukkah]);

  let headline = hero.headline;
  let body: string | null | undefined = hero.body;
  let bodySecondary: string | null | undefined = hero.bodySecondary;
  let primaryLabel = hero.ctaLabel ?? 'Browse the Collection';
  let secondaryLabel = 'Build your Box (starting at $80)';

  if (mode === 'passover') {
    headline = hero.headline ?? 'Passover 2027 is next';
    body = hero.body;
    bodySecondary = hero.bodySecondary;
    primaryLabel = hero.ctaLabel ?? 'Explore Passover 2027';
    secondaryLabel = 'Browse the Collection';
  } else if (mode === 'gift_credit_incomplete') {
    headline = 'Finish sending your gift';
    body = 'You started gift credit for someone else. Continue to payment whenever you’re ready — they can use it in the store or toward a Hanukkah box. Or send a different gift.';
    bodySecondary = null;
    primaryLabel = 'Continue to payment';
    secondaryLabel = 'Send a different gift';
  } else if (mode === 'gift_customize_incomplete') {
    headline = 'Finish your gift box';
    body = 'You were customizing a gift. Pick up where you left off, then pay when you’re ready.';
    bodySecondary = null;
    primaryLabel = 'Continue customizing';
    secondaryLabel = 'Send a different gift';
  } else if (mode === 'gift_sent') {
    headline = 'Your gift is on its way';
    body = 'The family got an email to claim it. Send another gift, or build a Hanukkah box for your own household.';
    bodySecondary = null;
    primaryLabel = 'Send another gift';
    secondaryLabel = 'Build your own box';
  } else if (mode === 'acquisition') {
    // defaults above
  } else if (journeyMode) {
    headline = journeyHeadline ?? 'Your Hanukkah box is underway';
    body = statusLine;
    bodySecondary = null;
    if (mode === 'guest_box') {
      primaryLabel = 'Create an account';
      secondaryLabel = 'View your box';
    } else if (mode === 'customize') {
      primaryLabel = STOREFRONT_HERO.ctaLabel ?? 'Browse the Collection';
      secondaryLabel = 'Customize your Box';
    } else if (mode === 'needs_payment') {
      primaryLabel = 'Add payment to secure';
      secondaryLabel = 'View your box';
    }
  }

  return (
    <View style={[styles.root, { height: heroHeight }]}>
      <StorefrontMediaPlaceholder
        slot={hero}
        quiet
        fill
        style={styles.media}
      />
      {/* Bottom scrim — heavier on mobile so white type stays readable */}
      <View style={[styles.scrim, compact && styles.scrimCompact]} pointerEvents="none" />
      <View
        style={[styles.overlay, compact && styles.overlayCompact]}
        pointerEvents="box-none"
      >
        <Text style={[styles.headline, compact && styles.headlineCompact]}>{headline}</Text>
        {body || bodySecondary ? (
          <View style={[styles.bodyBlock, compact && styles.bodyBlockCompact]}>
            {body ? (
              <Text
                style={[
                  styles.body,
                  compact && styles.bodyCompact,
                  journeyMode && styles.bodyJourney,
                ]}
              >
                {body}
              </Text>
            ) : null}
            {bodySecondary ? (
              <Text style={[styles.bodySecondary, compact && styles.bodySecondaryCompact]}>
                {bodySecondary}
              </Text>
            ) : null}
          </View>
        ) : null}

        {journey && showTimeline ? (
          <StorefrontHeroJourneyTimeline journey={journey} compact={compact} />
        ) : null}

        {withCtas ? (
          <View style={[styles.ctas, compact && styles.ctasCompact]}>
            <TouchableOpacity
              style={[styles.cta, styles.ctaPrimary, compact && styles.ctaCompact]}
              onPress={onPrimary}
              accessibilityRole="button"
              accessibilityLabel={primaryLabel}
            >
              <Text style={styles.ctaPrimaryText}>{primaryLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cta, styles.ctaSecondary, compact && styles.ctaCompact]}
              onPress={onSecondary}
              accessibilityRole="button"
              accessibilityLabel={secondaryLabel}
            >
              <Text style={styles.ctaSecondaryText}>{secondaryLabel}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    position: 'relative',
    backgroundColor: semanticColors.accentCream,
    overflow: 'hidden',
  },
  media: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 0,
    borderWidth: 0,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '58%',
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage:
            'linear-gradient(to top, rgba(17, 2, 34, 0.72) 0%, rgba(17, 2, 34, 0.28) 55%, transparent 100%)',
        } as object)
      : { backgroundColor: 'rgba(17, 2, 34, 0.4)' }),
  },
  scrimCompact: {
    height: '72%',
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage:
            'linear-gradient(to top, rgba(17, 2, 34, 0.88) 0%, rgba(17, 2, 34, 0.55) 42%, rgba(17, 2, 34, 0.22) 72%, transparent 100%)',
        } as object)
      : { backgroundColor: 'rgba(17, 2, 34, 0.62)' }),
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    paddingHorizontal: MOBILE_GUTTER,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  overlayCompact: {
    paddingBottom: spacing.lg,
    paddingTop: spacing.lg,
  },
  headline: {
    ...typeface('light'),
    fontSize: 44,
    lineHeight: 54,
    letterSpacing: 0.6,
    color: semanticColors.textInverse,
    textAlign: 'center',
    marginBottom: spacing.sm,
    textShadowColor: 'rgba(17, 2, 34, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  headlineCompact: {
    fontSize: 34,
    lineHeight: 42,
  },
  bodyBlock: {
    alignItems: 'center',
    maxWidth: 480,
    marginBottom: spacing.lg,
    gap: 2,
  },
  bodyBlockCompact: {
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  body: {
    ...typeface('regular'),
    fontSize: 16,
    color: semanticColors.textInverse,
    textAlign: 'center',
    lineHeight: 24,
    opacity: 0.95,
    textShadowColor: 'rgba(17, 2, 34, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
    ...(Platform.OS === 'web' ? ({ textWrap: 'balance' } as object) : null),
  },
  bodyJourney: {
    color: semanticColors.brand,
    opacity: 1,
  },
  bodyCompact: {
    fontSize: 14,
    lineHeight: 20,
  },
  bodySecondary: {
    ...typeface('regular'),
    fontSize: 12,
    color: semanticColors.textInverse,
    textAlign: 'center',
    lineHeight: 16,
    opacity: 0.68,
    textShadowColor: 'rgba(17, 2, 34, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  bodySecondaryCompact: {
    fontSize: 11,
    lineHeight: 15,
  },
  ctas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
    width: '100%',
  },
  ctasCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
    maxWidth: 280,
    alignSelf: 'center',
  },
  /** Shared height; width stays content-sized so labels aren’t clipped. */
  cta: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaCompact: {
    width: '100%',
  },
  ctaPrimary: {
    backgroundColor: semanticColors.logoDark,
  },
  ctaPrimaryText: {
    ...typeface('medium'),
    fontSize: 12,
    color: semanticColors.textInverse,
    textAlign: 'center',
  },
  ctaSecondary: {
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  ctaSecondaryText: {
    ...typeface('medium'),
    fontSize: 12,
    color: semanticColors.logoDark,
    textAlign: 'center',
  },
});
