import React, { type ReactNode } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  Image,
  type ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWebLayout } from '../../hooks/useWebLayout';
import {
  semanticColors,
  spacing,
  typography,
  typeface,
  MOBILE_GUTTER,
  colors,
} from '../../constants/theme';
import { HOME_HOLIDAY_THUMBS } from '../../constants/homeImages';
import { GrapejuiceBrandMark } from '../brand/GrapejuiceBrandMark';
import {
  OnboardingPrimaryButton,
  OnboardingSecondaryButton,
} from './OnboardingButtons';

/** Soft warm tan field — cream → beige → muted gold (platform warm palette). */
const TAN_MEDIA_GRADIENT = `linear-gradient(135deg, ${colors.warm[50]} 0%, ${colors.warm[100]} 52%, ${colors.warm[200]} 100%)`;

/** Gentle white seam from copy pane into the tan media pane. */
const COPY_INTO_MEDIA_FADE =
  'linear-gradient(90deg, #FFFFFF 0%, rgba(255,255,255,0.88) 18%, rgba(255,255,255,0.35) 42%, rgba(255,255,255,0) 68%)';

type Props = {
  kicker?: string;
  title: string;
  children?: ReactNode;
  /** When false, title/kicker sit above scrollable body without centering. Default true for intro-style screens. Desktop always left-aligns. */
  centerHeader?: boolean;
  primaryLabel?: string;
  onPrimary?: () => void;
  primaryLoading?: boolean;
  primaryDisabled?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryDisabled?: boolean;
  /** Skip footer (e.g. building screen). */
  hideFooter?: boolean;
  /** Desktop right-pane image. Defaults to Hanukkah holiday art. */
  mediaSource?: ImageSourcePropType;
  /** Hide the desktop media pane (forms that need full width). */
  hideMedia?: boolean;
};

/**
 * Mobile: single-column Figma shell (100:395) with bottom-pinned CTAs.
 * Desktop web: two-pane — left copy packed with CTAs, right soft tan media + fade from copy.
 */
export function OnboardingScreenLayout({
  kicker,
  title,
  children,
  centerHeader = true,
  primaryLabel,
  onPrimary,
  primaryLoading,
  primaryDisabled,
  secondaryLabel,
  onSecondary,
  secondaryDisabled,
  hideFooter = false,
  mediaSource = HOME_HOLIDAY_THUMBS.hanukkah,
  hideMedia = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const { tier } = useWebLayout();
  /** Two-pane only at desktop (≥1024); tablet keeps the mobile single column. */
  const isDesktopWeb = Platform.OS === 'web' && tier === 'desktop-web';
  const showMedia = isDesktopWeb && !hideMedia;
  const leftAlignHeader = isDesktopWeb || !centerHeader;

  const bottomPad = Math.max(insets.bottom, spacing.sm) + (Platform.OS === 'web' ? (isDesktopWeb ? 64 : 40) : 16);
  /** Room below the corner logo; title stays top-anchored on desktop (not vertically centered). */
  const topPad = isDesktopWeb
    ? spacing.xxl + spacing.xl
    : Platform.OS === 'web'
      ? 40
      : Math.max(insets.top, 24) + 40;
  const logoTop = Platform.OS === 'web' ? spacing.lg : Math.max(insets.top, spacing.sm) + spacing.sm;
  const logoLeft = Platform.OS === 'web' ? spacing.lg : MOBILE_GUTTER;

  const showFooter = !hideFooter && !!primaryLabel && !!onPrimary;

  const footer = showFooter ? (
    <View
      style={[
        styles.footer,
        isDesktopWeb ? styles.footerDesktop : null,
        { paddingBottom: bottomPad },
      ]}
    >
      <OnboardingPrimaryButton
        label={primaryLabel!}
        onPress={onPrimary!}
        loading={primaryLoading}
        disabled={primaryDisabled}
      />
      {secondaryLabel && onSecondary ? (
        <OnboardingSecondaryButton
          label={secondaryLabel}
          onPress={onSecondary}
          disabled={secondaryDisabled}
          style={styles.secondaryGap}
        />
      ) : null}
    </View>
  ) : null;

  const copyPane = (
    <View
      style={[
        styles.copyPane,
        isDesktopWeb && styles.copyPaneDesktop,
        { paddingTop: topPad, paddingBottom: hideFooter && !isDesktopWeb ? bottomPad : 0 },
      ]}
    >
      <ScrollView
        style={isDesktopWeb ? styles.scrollDesktop : styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          isDesktopWeb && styles.scrollContentDesktop,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, !leftAlignHeader && styles.headerCentered]}>
          {kicker ? (
            <Text style={[styles.kicker, leftAlignHeader && styles.kickerLeft]}>{kicker}</Text>
          ) : null}
          <Text style={[styles.title, !leftAlignHeader && styles.titleCentered]}>{title}</Text>
        </View>
        {children ? <View style={styles.body}>{children}</View> : null}
      </ScrollView>

      {/* Desktop: CTAs anchored to the bottom of the pane (space-between with top copy). */}
      {footer}
    </View>
  );

  const logo = (
    <View style={[styles.logoCorner, { top: logoTop, left: logoLeft }]} pointerEvents="none">
      <GrapejuiceBrandMark markOnly align="left" decorative />
    </View>
  );

  if (!showMedia) {
    return (
      <View style={styles.root}>
        {logo}
        {copyPane}
      </View>
    );
  }

  return (
    <View style={[styles.root, styles.rootDesktop]}>
      {logo}
      {copyPane}
      <View style={styles.mediaPane} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View
          style={[
            StyleSheet.absoluteFillObject,
            Platform.OS === 'web'
              ? ({ backgroundImage: TAN_MEDIA_GRADIENT } as object)
              : { backgroundColor: colors.warm[100] },
          ]}
        />
        <Image source={mediaSource} style={styles.mediaImage} resizeMode="cover" />
        <View
          style={[
            StyleSheet.absoluteFillObject,
            Platform.OS === 'web' ? ({ backgroundImage: COPY_INTO_MEDIA_FADE } as object) : null,
          ]}
          pointerEvents="none"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: semanticColors.bgPrimary,
    width: '100%',
    minHeight: 0,
  },
  rootDesktop: {
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({ height: '100%', maxHeight: '100vh' } as object)
      : null),
  },
  logoCorner: {
    position: 'absolute',
    zIndex: 5,
  },
  copyPane: {
    flex: 1,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    backgroundColor: semanticColors.bgPrimary,
    minHeight: 0,
  },
  copyPaneDesktop: {
    maxWidth: 480,
    width: '42%',
    minWidth: 360,
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: 'stretch',
    zIndex: 2,
    justifyContent: 'space-between',
    minHeight: 0,
    overflow: 'hidden',
  },
  scroll: { flex: 1, minHeight: 0 },
  scrollDesktop: {
    flex: 1,
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.md,
  },
  scrollContentDesktop: {
    flexGrow: 0,
    paddingBottom: spacing.md,
  },
  header: {
    paddingHorizontal: MOBILE_GUTTER + 8,
    paddingBottom: 8,
  },
  headerCentered: {
    alignItems: 'center',
  },
  kicker: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.goldMuted,
    letterSpacing: -0.33,
    marginBottom: 2,
    textAlign: 'center',
  },
  kickerLeft: {
    textAlign: 'left',
    alignSelf: 'stretch',
  },
  title: {
    ...typeface('regular'),
    fontSize: 24,
    color: '#000000',
    letterSpacing: -0.72,
    lineHeight: 31,
  },
  titleCentered: {
    textAlign: 'center',
  },
  body: {
    paddingHorizontal: MOBILE_GUTTER + 8,
    paddingTop: spacing.sm,
  },
  footer: {
    paddingHorizontal: MOBILE_GUTTER + 8,
    paddingTop: spacing.sm,
    gap: 8,
    backgroundColor: semanticColors.bgPrimary,
  },
  footerDesktop: {
    paddingTop: spacing.lg,
    flexShrink: 0,
  },
  secondaryGap: {
    marginTop: 0,
  },
  mediaPane: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    alignSelf: 'stretch',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: colors.warm[100],
  },
  mediaImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    opacity: 0.28,
  },
});

/** Shared onboarding body copy — matches home body (`typography.lg`). */
export const onboardingBodyText = StyleSheet.create({
  text: {
    ...typeface('light'),
    fontSize: typography.lg,
    color: '#000000',
    letterSpacing: -0.26,
    lineHeight: 20,
  },
  lead: {
    ...typeface('light'),
    fontSize: typography.lg,
    color: '#000000',
    letterSpacing: -0.26,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
});
