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
  Path,
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
import { Crossfade } from '../ui/Crossfade';

/** Display size for the journey countdown menorah above the headline (viewBox 248×131). */
const HERO_MENORAH_ICON_WIDTH = 40;
const HERO_MENORAH_ICON_HEIGHT = Math.round((HERO_MENORAH_ICON_WIDTH * 131) / 248);

const HERO_MENORAH_PATH =
  'M131.53 33.4347C131.53 36.0457 134.004 37.9582 136.397 36.914C146.615 32.4556 154.072 22.8503 155.49 11.3737C155.761 9.18121 157.526 7.38281 159.735 7.38281H167.735C169.944 7.38281 171.752 9.17856 171.572 11.3803C169.853 32.3149 154.758 49.4594 134.85 54.2508C132.95 54.7082 131.53 56.3592 131.53 58.314V59.5658C131.53 61.9949 133.684 63.873 136.055 63.3446C160.436 57.9117 178.964 36.9534 180.727 11.3831C180.879 9.17923 182.655 7.38281 184.864 7.38281H192.864C195.073 7.38281 196.875 9.17729 196.757 11.3832C194.888 46.1431 168.813 74.47 135.088 79.8098C133.071 80.1291 131.53 81.8315 131.53 83.8736V85.0573C131.53 87.4179 133.568 89.2733 135.902 88.9221C174.289 83.1463 204.009 50.9114 205.897 11.3817C206.002 9.17508 207.783 7.38281 209.992 7.38281H217.992C220.201 7.38281 222 9.17836 221.912 11.3857C219.968 59.9964 182.783 99.5368 135.207 105.159C133.137 105.403 131.53 107.13 131.53 109.215V110.375C131.53 112.7 133.51 114.541 135.82 114.278C188.152 108.327 229.093 64.8341 231.049 11.3875C231.129 9.17984 232.913 7.38281 235.122 7.38281H243.122C245.331 7.38281 247.128 9.18285 247.058 11.3909C244.942 77.7935 190.446 130.974 123.53 130.975C56.6133 130.975 2.1176 77.7936 0.001997 11.3909C-0.068351 9.18285 1.7291 7.38281 3.93824 7.38281H11.9382C14.1474 7.38281 15.9306 9.17984 16.0114 11.3875C17.9671 64.8344 58.9076 108.328 111.24 114.278C113.55 114.541 115.53 112.7 115.53 110.375V109.215C115.53 107.13 113.923 105.403 111.853 105.159C64.2765 99.5373 27.0898 59.9968 25.1461 11.3857C25.0578 9.17836 26.857 7.38281 29.0662 7.38281H37.0662C39.2753 7.38281 41.0561 9.17508 41.1614 11.3817C43.0489 50.9118 72.7706 83.1468 111.158 88.9221C113.492 89.2733 115.53 87.418 115.53 85.0574V83.8737C115.53 81.8315 113.989 80.1292 111.972 79.8098C78.2466 74.4706 52.171 46.1436 50.3023 11.3832C50.1837 9.17729 51.9859 7.38281 54.1951 7.38281H62.1951C64.4042 7.38281 66.1806 9.17923 66.3325 11.3831C68.0948 36.9539 86.624 57.9124 111.005 63.3448C113.376 63.873 115.53 61.995 115.53 59.5659V58.3151C115.53 56.3602 114.11 54.7093 112.21 54.2519C92.3014 49.4609 77.205 32.3155 75.4864 11.3803C75.3056 9.17856 77.1139 7.38281 79.323 7.38281H87.323C89.5321 7.38281 91.2969 9.18121 91.5679 11.3737C92.9865 22.851 100.444 32.4571 110.663 36.9153C113.056 37.9594 115.53 36.0469 115.53 33.4359V4C115.53 1.79086 117.321 0 119.53 0H127.53C129.739 0 131.53 1.79086 131.53 4V33.4347Z';

function HeroMenorahIcon({
  width,
  height,
  compact,
}: {
  width: number;
  height: number;
  compact?: boolean;
}) {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 248 131"
      style={[styles.menorahIcon, compact && styles.menorahIconCompact]}
      accessible={false}
      importantForAccessibility="no"
    >
      <Path d={HERO_MENORAH_PATH} fill="#FFFFFF" />
    </Svg>
  );
}
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
      style={[StyleSheet.absoluteFillObject, { mixBlendMode: 'multiply' } as object]}
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
  /** Needs payment: View your box (ghost left), Tell us where to send (filled right). */
  const needsPaymentCtas = mode === 'needs_payment' && journeyMode;
  // Tall plate, leave a peek of what’s below. Do NOT shrink this when the
  // journey banner mounts — that post-config resize was a visible jump.
  // The banner sits under the hero without changing the hero plate height.
  const chromeApprox = compact ? 176 : 220;
  const belowPeek = compact ? 84 : 72;
  const heroHeight = Math.min(
    Math.max(height - chromeApprox - belowPeek, compact ? 380 : 440),
    compact ? 520 : 620
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (w !== size.w || h !== size.h) setSize({ w, h });
  };

  const journeyHeadline = useMemo(
    () => (journey ? boxJourneyCopy(journey, now).headline : null),
    [journey, now]
  );
  const customizeDaysLine = useMemo(() => {
    if (!journey || !journeyMode) return null;
    const { lockDays } = boxJourneyCopy(journey, now);
    if (lockDays == null) return null;
    if (lockDays === 0) return 'Last day to customize your box';
    return `${lockDays} more day${lockDays === 1 ? '' : 's'} to customize your box`;
  }, [journey, journeyMode, now]);
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
    // Prefer the soft white customize-days line (matches acquisition body);
    // fall back to mode-specific status when the rail isn’t showing.
    body = customizeDaysLine ?? statusLine;
    bodySecondary = null;
    if (mode === 'guest_box') {
      primaryLabel = 'View your box';
      secondaryLabel = 'Browse the Collection';
    } else if (mode === 'customize') {
      primaryLabel = STOREFRONT_HERO.ctaLabel ?? 'Browse the Collection';
      secondaryLabel = 'Customize your Box';
    } else if (mode === 'needs_payment') {
      primaryLabel = 'Tell us where to send your box';
      secondaryLabel = 'View your box';
    }
  }

  const hasBody = Boolean(body || bodySecondary);
  const acquisitionHeadline = mode === 'acquisition';
  /** Journey countdown + acquisition share identical two-line hero type. */
  const stackedHeadline = acquisitionHeadline || journeyMode;
  const headlineGap = stackedHeadline
    ? compact
      ? 14
      : 18
    : hasBody
      ? 4
      : compact
        ? 14
        : 20;

  return (
    <View style={[styles.root, { height: heroHeight }]} onLayout={onLayout}>
      <StorefrontMediaPlaceholder
        slot={hero}
        quiet
        fill
        videoLoad="eager"
        style={styles.media}
      />
      <View
        style={[styles.overlay, compact && styles.overlayCompact]}
        pointerEvents="box-none"
      >
        <Crossfade
          contentKey={`${mode}|${headline}|${primaryLabel}|${secondaryLabel}|${body ?? ''}`}
          style={styles.crossfade}
        >
          {mode !== 'passover' ? (
            <HeroMenorahIcon
              width={HERO_MENORAH_ICON_WIDTH}
              height={HERO_MENORAH_ICON_HEIGHT}
              compact={compact}
            />
          ) : null}
          <Text
            style={[
              styles.headline,
              stackedHeadline
                ? [styles.headlineStacked, compact && styles.headlineStackedCompact]
                : compact && styles.headlineCompact,
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
                    // Soft white like acquisition — never the gold journey rail subline.
                    !customizeDaysLine && journeyMode && styles.bodyJourney,
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
              ) : needsPaymentCtas ? (
                <>
                  <TouchableOpacity
                    style={[styles.cta, styles.ctaGhost, compact && styles.ctaCompact]}
                    onPress={onSecondary}
                    accessibilityRole="button"
                    accessibilityLabel={secondaryLabel}
                  >
                    <Text style={styles.ctaGhostText}>{secondaryLabel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.cta, styles.ctaPrimary, compact && styles.ctaCompact]}
                    onPress={onPrimary}
                    accessibilityRole="button"
                    accessibilityLabel={primaryLabel}
                  >
                    <Text style={styles.ctaPrimaryText}>{primaryLabel}</Text>
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
        </Crossfade>
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
      ? ({
          backgroundImage: HERO_SCRIM_RADIAL_WEB,
          mixBlendMode: 'multiply',
        } as object)
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
    paddingTop: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayCompact: {
    paddingBottom: spacing.lg,
    paddingTop: spacing.lg,
  },
  crossfade: {
    width: '100%',
    alignItems: 'center',
  },
  menorahIcon: {
    marginBottom: 64,
  },
  menorahIconCompact: {
    marginBottom: 40,
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
  /** Shared by “hanukkah made easy” and “71 days / until hanukkah”. */
  headlineStacked: {
    fontSize: 60,
    lineHeight: 56,
    letterSpacing: 0.2,
    ...(Platform.OS === 'web'
      ? ({
          fontSize: 'clamp(2.75rem, 13vw, 3.75rem)',
          // Rem line-height ≈ 0.95× size (never unitless 0.95 — RN-web can treat that as px).
          lineHeight: 'clamp(2.6rem, 12.3vw, 3.55rem)',
          letterSpacing: '0.02em',
        } as object)
      : null),
  },
  headlineStackedCompact: {
    fontSize: 44,
    lineHeight: 42,
    ...(Platform.OS === 'web'
      ? ({
          fontSize: 'clamp(2.75rem, 13vw, 3.75rem)',
          lineHeight: 'clamp(2.6rem, 12.3vw, 3.55rem)',
          letterSpacing: '0.02em',
        } as object)
      : null),
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
