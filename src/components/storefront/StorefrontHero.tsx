import React, { useId, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, {
  Defs,
  RadialGradient as SvgRadialGradient,
  Stop,
  Rect,
} from 'react-native-svg';
import { StorefrontMediaPlaceholder } from './StorefrontMediaPlaceholder';
import {
  boxJourneyCopy,
  boxJourneyStatusLine,
  type BoxJourneyDates,
} from './StorefrontHeroJourneyTimeline';
import type { StorefrontHomeMode } from '../../hooks/useStorefrontHomeMode';
import { useLayoutBreakpoint } from '../../hooks/useLayoutBreakpoint';
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

/**
 * Anti-vignette: darkest at center (copy/CTAs), super gradual fade to clear edges.
 */
const HERO_SCRIM_RADIAL_WEB =
  'radial-gradient(ellipse 72% 68% at center, rgba(0, 0, 0, 0.34) 0%, rgba(0, 0, 0, 0.22) 28%, rgba(0, 0, 0, 0.1) 52%, rgba(0, 0, 0, 0.03) 70%, transparent 82%)';

const NATIVE_HERO_SCRIM_STOPS = [
  { offset: '0', color: '#000000', opacity: '0.34' },
  { offset: '0.28', color: '#000000', opacity: '0.22' },
  { offset: '0.52', color: '#000000', opacity: '0.1' },
  { offset: '0.7', color: '#000000', opacity: '0.03' },
  { offset: '0.82', color: '#000000', opacity: '0' },
] as const;

function NativeHeroScrim({ width, height }: { width: number; height: number }) {
  const rawId = useId().replace(/:/g, '');
  const gradId = `storefrontHeroScrim-${rawId}`;
  if (width <= 0 || height <= 0) return null;

  const cx = width / 2;
  const cy = height / 2;
  const rx = width * 0.72;
  const ry = height * 0.68;

  return (
    <Svg
      width={width}
      height={height}
      style={StyleSheet.absoluteFillObject}
      pointerEvents="none"
    >
      <Defs>
        <SvgRadialGradient
          id={gradId}
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          gradientUnits="userSpaceOnUse"
        >
          {NATIVE_HERO_SCRIM_STOPS.map((stop) => (
            <Stop
              key={stop.offset}
              offset={stop.offset}
              stopColor={stop.color}
              stopOpacity={stop.opacity}
            />
          ))}
        </SvgRadialGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill={`url(#${gradId})`} />
    </Svg>
  );
}

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
  const { height, isCompact: compact } = useLayoutBreakpoint();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const hero = mode === 'passover' ? STOREFRONT_HERO_PASSOVER : STOREFRONT_HERO;
  const now = usePreviewNow();
  const duringHanukkah =
    journey != null && getHanukkahStatus(journey.startsOn, now).phase === 'during';
  const journeyMode = showJourney(mode) && Boolean(journey);
  /** Timeline lives above the hero; still skip gold subline when the rail would show. */
  const journeyRailActive = journeyMode && !duringHanukkah;
  const withCtas = showCtas(mode);
  /** Acquisition: Browse left (ghost), Build right (primary white). */
  const acquisitionCtas = mode === 'acquisition';
  /** Guest box: View your box (primary) + Browse the Collection (ghost). */
  const guestBoxCtas = mode === 'guest_box' && journeyMode;
  // Tall plate, but leave a peek of what’s below. When the journey banner sits
  // under the hero, reserve space so the timeline is on-screen at first paint.
  const chromeApprox = compact ? 168 : 200;
  const journeyBannerReserve = journeyRailActive ? 88 : 0;
  const belowPeek = compact ? 72 : 56;
  const heroHeight = Math.min(
    Math.max(
      height - chromeApprox - journeyBannerReserve - belowPeek,
      compact ? 400 : 480
    ),
    (compact ? 560 : 680) - journeyBannerReserve
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (w !== size.w || h !== size.h) setSize({ w, h });
  };

  const journeyHeadline = useMemo(
    () => (journey ? boxJourneyCopy(journey, now).headline : null),
    [journey, now]
  );
  const statusLine = useMemo(() => {
    // Journey banner embeds lock timing; skip the hard-to-read gold subline.
    if (journeyRailActive) return null;
    if (!journey || mode === 'acquisition' || mode === 'passover') return null;
    if (mode === 'guest_box' || mode === 'customize' || mode === 'needs_payment' || mode === 'locked') {
      return boxJourneyStatusLine(journey, mode, now);
    }
    return null;
  }, [journey, mode, now, journeyRailActive]);

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
    bodySecondary = null;
  } else if (journeyMode) {
    headline = journeyHeadline ?? 'Your Hanukkah box is underway';
    body = statusLine;
    bodySecondary = null;
    if (mode === 'guest_box') {
      primaryLabel = 'View your box';
      secondaryLabel = 'Browse the Collection';
    } else if (mode === 'customize') {
      primaryLabel = STOREFRONT_HERO.ctaLabel ?? 'Browse the Collection';
      secondaryLabel = 'Customize your Box';
    } else if (mode === 'needs_payment') {
      primaryLabel = 'Add payment to secure';
      secondaryLabel = 'View your box';
    }
  }

  const hasBody = Boolean(body || bodySecondary);
  const acquisitionHeadline = mode === 'acquisition';
  const headlineGap = acquisitionHeadline
    ? compact
      ? 18
      : 22
    : hasBody
      ? 4
      : compact
        ? 14
        : 20;
  const headlineWebFluid =
    acquisitionHeadline && Platform.OS === 'web'
      ? ({
          // Two-line break ("hanukkah / made easy") — tight pixel stack, roomy below.
          fontSize: 'clamp(2.75rem, 13vw, 3.75rem)',
          // Rem line-height ≈ 0.95× size (never unitless 0.95 — RN-web can treat that as px).
          lineHeight: 'clamp(2.6rem, 12.3vw, 3.55rem)',
          letterSpacing: '0.02em',
        } as object)
      : null;
  const headlineNativeFluid = acquisitionHeadline
    ? {
        fontSize: compact ? 44 : 60,
        lineHeight: compact ? 42 : 56,
        letterSpacing: 0.2,
      }
    : null;

  return (
    <View style={[styles.root, { height: heroHeight }]} onLayout={onLayout}>
      <StorefrontMediaPlaceholder
        slot={hero}
        quiet
        fill
        style={styles.media}
      />
      {Platform.OS === 'web' ? (
        <View style={styles.scrim} pointerEvents="none" />
      ) : (
        <NativeHeroScrim width={size.w} height={size.h} />
      )}
      <View
        style={[styles.overlay, compact && styles.overlayCompact]}
        pointerEvents="box-none"
      >
        <Text
          style={[
            styles.headline,
            compact && !acquisitionHeadline && styles.headlineCompact,
            headlineNativeFluid,
            headlineWebFluid,
            { marginBottom: headlineGap },
          ]}
        >
          {headline}
        </Text>
        {hasBody ? (
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

        {withCtas ? (
          <View style={[styles.ctas, compact && styles.ctasCompact]}>
            {acquisitionCtas ? (
              <>
                <TouchableOpacity
                  style={[styles.cta, styles.ctaGhost, compact && styles.ctaCompact]}
                  onPress={onPrimary}
                  accessibilityRole="button"
                  accessibilityLabel={primaryLabel}
                >
                  <Text style={styles.ctaGhostText}>{primaryLabel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.cta, styles.ctaPrimary, compact && styles.ctaCompact]}
                  onPress={onSecondary}
                  accessibilityRole="button"
                  accessibilityLabel={secondaryLabel}
                >
                  <Text style={styles.ctaPrimaryText}>{secondaryLabel}</Text>
                </TouchableOpacity>
              </>
            ) : guestBoxCtas ? (
              <>
                <TouchableOpacity
                  style={[styles.cta, styles.ctaPrimary, compact && styles.ctaCompact]}
                  onPress={onPrimary}
                  accessibilityRole="button"
                  accessibilityLabel={primaryLabel}
                >
                  <Text style={styles.ctaPrimaryText}>{primaryLabel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.cta, styles.ctaGhost, compact && styles.ctaCompact]}
                  onPress={onSecondary}
                  accessibilityRole="button"
                  accessibilityLabel={secondaryLabel}
                >
                  <Text style={styles.ctaGhostText}>{secondaryLabel}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.cta, styles.ctaPrimary, compact && styles.ctaCompact]}
                  onPress={onPrimary}
                  accessibilityRole="button"
                  accessibilityLabel={primaryLabel}
                >
                  <Text style={styles.ctaPrimaryText}>{primaryLabel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.cta, styles.ctaGhost, compact && styles.ctaCompact]}
                  onPress={onSecondary}
                  accessibilityRole="button"
                  accessibilityLabel={secondaryLabel}
                >
                  <Text style={styles.ctaGhostText}>{secondaryLabel}</Text>
                </TouchableOpacity>
              </>
            )}
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
  /** Radial anti-vignette — dark at center, clear at edges. */
  scrim: {
    ...StyleSheet.absoluteFillObject,
    ...(Platform.OS === 'web'
      ? ({ backgroundImage: HERO_SCRIM_RADIAL_WEB } as object)
      : { backgroundColor: 'rgba(0, 0, 0, 0.12)' }),
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    paddingHorizontal: MOBILE_GUTTER,
    paddingBottom: spacing.xxl,
    // Extra top padding so the headline-heavy stack sits slightly below true center.
    paddingTop: spacing.xxl + 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayCompact: {
    paddingBottom: spacing.lg,
    paddingTop: spacing.lg + 20,
  },
  headline: {
    ...typeface('medium'),
    fontSize: 52,
    lineHeight: 62,
    letterSpacing: 0.2,
    color: semanticColors.textInverse,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  headlineCompact: {
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -0.15,
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
    opacity: 1,
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
    marginTop: spacing.sm,
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
  /** Primary — solid white, dark text. */
  ctaPrimary: {
    backgroundColor: 'rgba(255,255,255,0.98)',
  },
  ctaPrimaryText: {
    ...typeface('medium'),
    fontSize: 12,
    color: semanticColors.logoDark,
    textAlign: 'center',
  },
  /** Dual-CTA secondary — ghost outline on video. */
  ctaGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  ctaGhostText: {
    ...typeface('medium'),
    fontSize: 12,
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
