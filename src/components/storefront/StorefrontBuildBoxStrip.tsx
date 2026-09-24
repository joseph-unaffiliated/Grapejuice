import React, { useId, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Platform,
  type ImageSourcePropType,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, {
  Defs,
  RadialGradient as SvgRadialGradient,
  Stop,
  Rect,
} from 'react-native-svg';
import {
  STOREFRONT_BOX_BUILD_STRIP_ALT,
  STOREFRONT_BOX_REVEAL_STRIP,
} from '../../constants/storefrontMedia';
import { icons } from '../../constants/icons';
import {
  borderRadius,
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
} from '../../constants/theme';
import { useLayoutBreakpoint } from '../../hooks/useLayoutBreakpoint';
import { DreidelIcon } from '../ui/DreidelIcon';
import { Icon } from '../ui/Icon';
import { StorefrontWebVideo } from './StorefrontWebVideo';

/**
 * Anti-vignette (same as StorefrontHero): darkest at center for copy,
 * gradual fade to clear edges so the reel stays visible.
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

/** How it Works / HANUKKAH_PRACTICES order — icons match practices accordion. */
export type BuildBoxInclusion = {
  practiceId: 'candles' | 'dreidel' | 'food' | 'story' | 'presents';
  lead: string;
  rest: string;
};

const PRACTICE_ICONS: Record<
  Exclude<BuildBoxInclusion['practiceId'], 'dreidel'>,
  (typeof icons)[keyof typeof icons]
> = {
  candles: icons.menorah,
  food: icons.utensils,
  story: icons.book,
  presents: icons.gift,
};

const INCLUDE_ICON_SIZE = 22;
const INCLUDE_ICON_COLOR = semanticColors.goldMuted;

function IncludePracticeIcon({ practiceId }: { practiceId: BuildBoxInclusion['practiceId'] }) {
  if (practiceId === 'dreidel') {
    return <DreidelIcon size={INCLUDE_ICON_SIZE} color={INCLUDE_ICON_COLOR} />;
  }
  return (
    <Icon
      icon={PRACTICE_ICONS[practiceId]}
      size={INCLUDE_ICON_SIZE}
      color={INCLUDE_ICON_COLOR}
    />
  );
}

function resolveAssetUri(src: string | number | ImageSourcePropType | null | undefined): string | null {
  if (src == null) return null;
  if (typeof src === 'string') return src;
  if (typeof src === 'number') {
    const resolved = Image.resolveAssetSource(src);
    return resolved?.uri ?? null;
  }
  if (typeof src === 'object' && 'uri' in src && typeof src.uri === 'string') {
    return src.uri;
  }
  return null;
}

function NativeHeroScrim({ width, height }: { width: number; height: number }) {
  const rawId = useId().replace(/:/g, '');
  const gradId = `buildBoxStripScrim-${rawId}`;
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
  onPress: () => void;
  headline?: string;
  body?: string;
  /** Intro line before the inclusions grid. Defaults with the acquisition copy. */
  includesLabel?: string;
  /**
   * Icon + bold-lead + rest lines. Defaults for acquisition; pass `[]` or omit with a
   * custom `body` from mode copy to skip the list.
   */
  inclusions?: BuildBoxInclusion[];
  ctaLabel?: string;
  /** Solid primary under the includes row. Defaults for acquisition only. */
  secondaryCtaLabel?: string;
  /**
   * Optional static strip image override (e.g. Passover placeholder).
   * When set, skips the default box-reveal reel.
   */
  backgroundSource?: number;
  /**
   * `home` — existing box-reveal reel (default).
   * `content` — alt build reel for Passover / Our Story / article footers / etc.
   */
  variant?: 'home' | 'content';
};

const DEFAULT_HEADLINE = 'start customizing your box';
const DEFAULT_BODY =
  'Bring the holidays to life with age-appropriate activities and books tailored uniquely for your family';
const DEFAULT_INCLUDES_LABEL = 'Each box includes:';
/** Five traditions L→R — same icons as How it Works practices accordion. */
const DEFAULT_INCLUSIONS: BuildBoxInclusion[] = [
  { practiceId: 'candles', lead: 'Candles', rest: 'for all 8 nights' },
  { practiceId: 'dreidel', lead: 'Dreidels and gelt', rest: 'enough for everyone' },
  { practiceId: 'food', lead: 'latkes and sufganiot', rest: 'in an easy mix' },
  { practiceId: 'story', lead: 'A book', rest: 'for each kid' },
  { practiceId: 'presents', lead: 'A wrapped present', rest: 'one per kid' },
];
const DEFAULT_CTA = 'Show me my box';
const DEFAULT_SECONDARY_CTA = 'Start customizing my box';

export function StorefrontBuildBoxStrip({
  onPress,
  headline = DEFAULT_HEADLINE,
  body = DEFAULT_BODY,
  includesLabel,
  inclusions,
  ctaLabel = DEFAULT_CTA,
  secondaryCtaLabel = DEFAULT_SECONDARY_CTA,
  backgroundSource,
  variant = 'home',
}: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const { isCompact } = useLayoutBreakpoint();
  const isWeb = Platform.OS === 'web';
  const mediaSlot =
    variant === 'content' ? STOREFRONT_BOX_BUILD_STRIP_ALT : STOREFRONT_BOX_REVEAL_STRIP;
  const useStaticOverride = backgroundSource != null;
  const videoUri =
    !useStaticOverride && isWeb ? resolveAssetUri(mediaSlot.src) : null;
  const playVideoOnWeb = Boolean(videoUri);
  const stillSource: ImageSourcePropType = useStaticOverride
    ? backgroundSource
    : (mediaSlot.poster as ImageSourcePropType);

  // Mode overrides pass a custom body → skip acquisition inclusions unless explicit.
  const showStructuredInclusions = body === DEFAULT_BODY;
  const inclusionItems =
    inclusions ?? (showStructuredInclusions ? DEFAULT_INCLUSIONS : []);
  const includesHeading =
    includesLabel ??
    (inclusionItems.length > 0 ? DEFAULT_INCLUDES_LABEL : undefined);
  const showIncludesSection = Boolean(includesHeading && inclusionItems.length > 0);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };

  return (
    <View style={styles.outer}>
      {/* Radius on the media card (inside gutter) so the reel corners clip cleanly. */}
      <View style={styles.card}>
        <View
          style={[styles.root, isCompact ? styles.rootCompact : styles.rootWide]}
          onLayout={onLayout}
        >
          {playVideoOnWeb ? (
            <StorefrontWebVideo src={videoUri!} poster={stillSource} />
          ) : (
            <Image source={stillSource} style={styles.bgImage} resizeMode="cover" />
          )}
          {isWeb ? (
            <View style={styles.scrim} pointerEvents="none" />
          ) : (
            <NativeHeroScrim width={size.w} height={size.h} />
          )}
          <View style={styles.inner}>
            <Text style={styles.headline}>{headline}</Text>
            <Text style={styles.body}>{body}</Text>
            <Pressable
              onPress={onPress}
              accessibilityRole="button"
              accessibilityLabel={ctaLabel}
              style={({ pressed }) => [
                styles.ctaGhost,
                pressed && styles.ctaPressed,
              ]}
            >
              <Text style={styles.ctaGhostText}>{ctaLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {showIncludesSection ? (
        <View style={styles.includesSection}>
          <Text style={styles.includesLabel}>{includesHeading}</Text>
          <View style={styles.inclusions}>
            {inclusionItems.map((item) => (
              <View key={item.practiceId} style={styles.inclusionItem}>
                <View style={styles.inclusionIcon}>
                  <IncludePracticeIcon practiceId={item.practiceId} />
                </View>
                <Text style={styles.inclusionLead}>{item.lead}</Text>
                <Text style={styles.inclusionRest}>{item.rest}</Text>
              </View>
            ))}
          </View>
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={secondaryCtaLabel}
            style={({ pressed }) => [
              styles.ctaPrimary,
              pressed && styles.ctaPressed,
            ]}
          >
            <Text style={styles.ctaPrimaryText}>{secondaryCtaLabel}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /** Match Ask Rav: maxWidth + gutter so the strip lines up with product grids. */
  outer: {
    maxWidth: 1024,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: MOBILE_GUTTER,
  },
  /** Same radius as Ask Rav outer — clips the video/still. */
  card: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  root: {
    paddingHorizontal: MOBILE_GUTTER,
    paddingVertical: spacing.xxl + spacing.sm,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#2a1c12',
  },
  /** Narrow layouts keep a compact plate; desktop ~1.4× the old 340. */
  rootCompact: {
    minHeight: 340,
  },
  rootWide: {
    minHeight: 480,
  },

  bgImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  /** Radial anti-vignette — dark at center, clear at edges (StorefrontHero). */
  scrim: {
    ...StyleSheet.absoluteFillObject,
    ...(Platform.OS === 'web'
      ? ({ backgroundImage: HERO_SCRIM_RADIAL_WEB } as object)
      : { backgroundColor: 'rgba(0, 0, 0, 0.12)' }),
  },
  inner: {
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    zIndex: 1,
  },
  /** Hero type treatment at Hero compact headline size (~40 / 48). */
  headline: {
    ...typeface('medium'),
    fontSize: 40,
    lineHeight: 48,
    letterSpacing: 0.6,
    color: semanticColors.textInverse,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
    ...(Platform.OS === 'web' ? ({ textWrap: 'balance' } as object) : null),
  },
  body: {
    ...typeface('regular'),
    fontSize: 14,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 480,
    marginTop: 0,
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
    ...(Platform.OS === 'web' ? ({ textWrap: 'balance' } as object) : null),
  },
  /** Ghost outline on video — same as Hero secondary. */
  ctaGhost: {
    marginTop: spacing.sm,
    alignSelf: 'center',
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
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
  /** White band under the video card — aligned to 1024 shell, not a nested card. */
  includesSection: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
    backgroundColor: semanticColors.bgPrimary,
  },
  includesLabel: {
    ...typeface('medium'),
    fontSize: 15,
    color: semanticColors.logoDark,
    textAlign: 'center',
  },
  inclusions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'flex-start',
    alignSelf: 'center',
    columnGap: spacing.md,
    rowGap: spacing.lg,
  },
  inclusionItem: {
    alignItems: 'center',
  },

  inclusionIcon: {
    height: INCLUDE_ICON_SIZE + 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  inclusionLead: {
    ...typeface('medium'),
    fontSize: 13,
    color: semanticColors.logoDark,
    textAlign: 'center',
    lineHeight: 18,
  },
  inclusionRest: {
    ...typeface('regular'),
    fontSize: 12,
    color: semanticColors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 1,
  },
  /** Solid primary on white — same as How it Works Continue (black + brand gold). */
  ctaPrimary: {
    marginTop: spacing.xl,
    alignSelf: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.brand,
  },
  ctaPrimaryText: {
    ...typeface('medium'),
    fontSize: 13,
    color: semanticColors.brand,
    textAlign: 'center',
  },
  ctaPressed: {
    opacity: 0.85,
  },
});
