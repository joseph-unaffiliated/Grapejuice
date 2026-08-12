import React, { type ReactNode } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
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
} from '../../constants/theme';
import { HOME_HOLIDAY_THUMBS } from '../../constants/homeImages';
import {
  OnboardingPrimaryButton,
  OnboardingSecondaryButton,
} from './OnboardingButtons';
import { OnboardingMediaPane } from './OnboardingMediaPane';
import { OnboardingCornerLogo } from './OnboardingCornerLogo';
import { useOnboardingMediaHost } from './onboardingMediaHostContext';
import { useOnboardingUnderStorefrontChrome } from './onboardingChromeContext';

/** Desktop two-pane — equal columns with comfortable copy inset and CTA spacing. */
const DESKTOP_PANE_SHARE = '50%';
const DESKTOP_COPY_HORIZONTAL_PAD = spacing.xxl + spacing.lg;
/** Room for card goldGlowSm so ScrollView overflowX doesn't clip side glow. */
const SIDE_GLOW_BLEED = 8;
/** Outer pane pad — glow bleed lives on scroll content instead. */
const DESKTOP_COPY_PAD = DESKTOP_COPY_HORIZONTAL_PAD - SIDE_GLOW_BLEED;
/** Primary CTA inset from the left pane edges (L / R / bottom). */
const DESKTOP_CTA_INSET = 24;
const DESKTOP_COPY_FOOTER_GAP = spacing.xxxl + spacing.lg;
/** Matches primary + secondary CTAs + desktop bottom inset when footer is hidden. */
const DESKTOP_FOOTER_RESERVE =
  DESKTOP_COPY_FOOTER_GAP + 48 + spacing.sm + 8 + 40 + spacing.lg + DESKTOP_CTA_INSET;
/** CTA column — wide enough for long labels, narrower than the copy pane. */
const ONBOARDING_CTA_MAX_WIDTH = 360;

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
  /** Center body content in the scrollport (e.g. building spinner). */
  centerBody?: boolean;
  /** Keep desktop footer gap when hideFooter (avoids CTA → loader jump). */
  reserveFooterSpace?: boolean;
};

/**
 * Mobile: single-column Figma shell (100:395) with bottom-pinned CTAs.
 * Desktop web: two-pane — left copy, right holiday photo with indigo scrim + gold wash.
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
  centerBody = false,
  reserveFooterSpace = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const { tier } = useWebLayout();
  const mediaProvidedByParent = useOnboardingMediaHost();
  const underStorefrontChrome = useOnboardingUnderStorefrontChrome();
  /** Two-pane only at desktop (≥1024); tablet keeps the mobile single column. */
  const isDesktopWeb = Platform.OS === 'web' && tier === 'desktop-web';
  const showMedia = isDesktopWeb && !hideMedia && !mediaProvidedByParent;
  /** Desktop is left-aligned; mobile follows centerHeader. */
  const leftAlignHeader = isDesktopWeb || !centerHeader;

  const bottomPad = isDesktopWeb
    ? DESKTOP_CTA_INSET
    : Math.max(insets.bottom, spacing.sm) + (Platform.OS === 'web' ? 40 : 16);
  /** Room below the corner logo; under storefront chrome the header already brands. */
  const topPad = underStorefrontChrome
    ? isDesktopWeb
      ? spacing.xl
      : spacing.lg
    : isDesktopWeb
      ? spacing.xxl + spacing.xl
      : Math.max(insets.top, spacing.sm) + spacing.sm + 30 + spacing.lg;

  const showFooter = !hideFooter && !!primaryLabel && !!onPrimary;
  /** Hosted desktop renders the logo on the media host (viewport-pinned). */
  const showCornerLogo = !mediaProvidedByParent;

  const footer = showFooter ? (
    <View
      style={[
        styles.footer,
        isDesktopWeb ? styles.footerDesktop : styles.footerMobile,
        { paddingBottom: bottomPad },
      ]}
    >
      <View
        style={[
          styles.footerCtaWrap,
          isDesktopWeb ? styles.footerCtaWrapDesktop : null,
          { alignSelf: leftAlignHeader ? 'flex-start' : 'center' },
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
    </View>
  ) : null;

  const copyPane = (
    <View
      style={[
        isDesktopWeb && mediaProvidedByParent ? styles.copyPaneInHost : styles.copyPane,
        isDesktopWeb
          ? mediaProvidedByParent
            ? styles.copyPaneDesktopHosted
            : styles.copyPaneDesktop
          : [
              styles.copyPaneMobile,
              underStorefrontChrome && styles.copyPaneMobileUnderChrome,
            ],
        isDesktopWeb && { paddingHorizontal: DESKTOP_COPY_PAD },
        { paddingBottom: hideFooter && !isDesktopWeb ? bottomPad : 0 },
      ]}
    >
      <ScrollView
        style={isDesktopWeb ? styles.scrollDesktop : styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          isDesktopWeb && styles.scrollContentDesktop,
          centerBody && styles.scrollContentCentered,
          { paddingTop: topPad },
          isDesktopWeb && styles.scrollContentGlowBleed,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.header,
            !leftAlignHeader && styles.headerCentered,
            isDesktopWeb && styles.headerDesktop,
          ]}
        >
          {kicker ? (
            <Text style={[styles.kicker, leftAlignHeader && styles.kickerLeft]}>{kicker}</Text>
          ) : null}
          <Text style={[styles.title, !leftAlignHeader && styles.titleCentered]}>{title}</Text>
        </View>
        {children ? (
          <View
            style={[
              styles.body,
              isDesktopWeb && styles.bodyDesktop,
              centerBody && styles.bodyCentered,
            ]}
          >
            {children}
          </View>
        ) : null}
      </ScrollView>

      {/* Mobile: pinned under the scrollport. Desktop: deliberate gap, then CTAs. */}
      {footer}
      {hideFooter && reserveFooterSpace && isDesktopWeb ? (
        <View style={styles.footerReserve} accessibilityElementsHidden />
      ) : null}
    </View>
  );

  if (mediaProvidedByParent) {
    return (
      <View style={styles.rootHosted}>
        {copyPane}
      </View>
    );
  }

  if (!showMedia) {
    return (
      <View style={[styles.root, underStorefrontChrome && styles.rootUnderChrome]}>
        {showCornerLogo ? <OnboardingCornerLogo /> : null}
        {copyPane}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.root,
        styles.rootDesktop,
        underStorefrontChrome && styles.rootUnderChrome,
      ]}
    >
      {copyPane}
      <OnboardingMediaPane source={mediaSource} />
      {showCornerLogo ? <OnboardingCornerLogo /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: semanticColors.bgPrimary,
    width: '100%',
    minHeight: 0,
    ...(Platform.OS === 'web'
      ? ({ height: '100%', maxHeight: '100vh' } as object)
      : null),
  },
  rootUnderChrome: {
    ...(Platform.OS === 'web'
      ? ({ height: '100%', maxHeight: '100%' } as object)
      : null),
  },
  rootDesktop: {
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({ height: '100%', maxHeight: '100vh' } as object)
      : null),
  },
  /** Left pane only — media is rendered by `OnboardingMediaHost`. */
  rootHosted: {
    width: '100%',
    flex: 1,
    minHeight: 0,
    position: 'relative',
    ...(Platform.OS === 'web'
      ? ({ height: '100%', maxHeight: '100%', alignSelf: 'stretch' } as object)
      : null),
  },
  copyPane: {
    flex: 1,
    width: '100%',
    backgroundColor: semanticColors.bgPrimary,
    minHeight: 0,
  },
  /** In media host the parent is a column — do not inherit row-axis flex:1 (fills height). */
  copyPaneInHost: {
    width: '100%',
    flex: 1,
    backgroundColor: semanticColors.bgPrimary,
    minWidth: 0,
    minHeight: 0,
  },
  /** Single column — fills the viewport; CTAs pin below a flex scrollport. */
  copyPaneMobile: {
    maxWidth: 440,
    alignSelf: 'center',
    ...(Platform.OS === 'web'
      ? ({ height: '100%', maxHeight: '100vh' } as object)
      : null),
  },
  copyPaneMobileUnderChrome: {
    ...(Platform.OS === 'web'
      ? ({ height: '100%', maxHeight: '100%' } as object)
      : null),
  },
  copyPaneDesktop: {
    flex: 1,
    flexBasis: DESKTOP_PANE_SHARE,
    width: DESKTOP_PANE_SHARE,
    maxWidth: DESKTOP_PANE_SHARE,
    minWidth: 0,
    alignSelf: 'center',
    position: 'relative',
    zIndex: 4,
    justifyContent: 'flex-start',
    minHeight: 0,
    overflow: 'hidden',
    backgroundColor: semanticColors.bgPrimary,
    ...(Platform.OS === 'web'
      ? ({ maxHeight: '100vh' } as object)
      : { maxHeight: '100%' }),
  },
  copyPaneDesktopHosted: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    flex: 1,
    alignSelf: 'stretch',
    position: 'relative',
    zIndex: 4,
    justifyContent: 'flex-start',
    minHeight: 0,
    overflow: 'hidden',
    backgroundColor: semanticColors.bgPrimary,
    ...(Platform.OS === 'web'
      ? ({ maxHeight: '100%' } as object)
      : { maxHeight: '100%' }),
  },
  /** Mobile: fill space above sticky CTAs so tall screens (practices) can scroll. */
  scroll: { flex: 1, minHeight: 0 },
  /** Desktop: grow so the primary CTA can pin to the bottom of the pane. */
  scrollDesktop: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.md,
  },
  scrollContentDesktop: {
    flexGrow: 1,
    paddingBottom: spacing.lg,
  },
  /** Keeps card side-glow inside the scroll content box (not clipped by overflowX). */
  scrollContentGlowBleed: {
    paddingHorizontal: SIDE_GLOW_BLEED,
  },
  scrollContentCentered: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  header: {
    paddingHorizontal: MOBILE_GUTTER + 8,
    paddingBottom: 8,
  },
  headerDesktop: {
    paddingHorizontal: 0,
  },
  headerCentered: {
    alignItems: 'center',
  },
  kicker: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.goldMuted,
    letterSpacing: -0.33,
    marginBottom: spacing.sm,
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
  bodyDesktop: {
    paddingHorizontal: 0,
    paddingTop: spacing.sm,
    maxWidth: 440,
  },
  bodyCentered: {
    width: '100%',
    maxWidth: '100%',
    alignItems: 'center',
    alignSelf: 'center',
  },
  footer: {
    paddingHorizontal: MOBILE_GUTTER + 8,
    paddingTop: spacing.sm,
    gap: 8,
    backgroundColor: semanticColors.bgPrimary,
  },
  footerMobile: {
    flexShrink: 0,
    zIndex: 2,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0px -8px 24px rgba(255,255,255,0.92)',
        } as object)
      : null),
  },
  footerDesktop: {
    // Break out of the wider copy pad, then re-inset so L/R/bottom are 24px from the pane.
    marginHorizontal: -DESKTOP_COPY_PAD,
    paddingHorizontal: DESKTOP_CTA_INSET,
    paddingTop: 0,
    marginTop: 'auto',
    flexShrink: 0,
  },
  footerReserve: {
    height: DESKTOP_FOOTER_RESERVE,
    flexShrink: 0,
    marginHorizontal: -DESKTOP_COPY_PAD,
  },
  footerCtaWrap: {
    width: '100%',
    maxWidth: ONBOARDING_CTA_MAX_WIDTH,
    gap: 8,
  },
  /** Span the full CTA inset width (pane − 24px × 2). */
  footerCtaWrapDesktop: {
    maxWidth: '100%',
  },
  secondaryGap: {
    marginTop: 0,
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
