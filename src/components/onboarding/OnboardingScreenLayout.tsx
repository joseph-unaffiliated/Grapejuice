import React, { type ReactNode } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWebLayout } from '../../hooks/useWebLayout';
import {
  semanticColors,
  spacing,
  typography,
  typeface,
  MOBILE_GUTTER,
} from '../../constants/theme';
import {
  OnboardingPrimaryButton,
  OnboardingSecondaryButton,
} from './OnboardingButtons';
import { OnboardingCornerLogo } from './OnboardingCornerLogo';
import { useOnboardingUnderStorefrontChrome } from './onboardingChromeContext';

/** Desktop column width and the gutter between the two columns. */
const DESKTOP_COLUMN_MAX_WIDTH = 440;
const DESKTOP_COLUMN_GAP = 80;
const DESKTOP_PAGE_PAD = spacing.xxl;
/** Room for card goldGlowSm so ScrollView overflowX doesn't clip side glow. */
const SIDE_GLOW_BLEED = 8;
/** Primary CTA inset from the page bottom on desktop. */
const DESKTOP_CTA_INSET = 24;
/** CTA column — wide enough for long labels, narrower than the copy. */
const ONBOARDING_CTA_MAX_WIDTH = 360;

type Props = {
  kicker?: string;
  title: string;
  children?: ReactNode;
  /**
   * Desktop: second column beside the header + `children`. Mobile/tablet: stacked
   * under `children` in the same column.
   */
  aside?: ReactNode;
  /** Desktop only: which side the `aside` column sits on. Default right. */
  asideSide?: 'left' | 'right';
  /** Desktop only: CTAs sit directly under `children` instead of pinned at the page bottom. */
  inlineFooter?: boolean;
  /** Desktop only: center the columns vertically when they fit; otherwise top-align and scroll. */
  centerVertically?: boolean;
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
};

/**
 * Mobile: single-column Figma shell (100:395) with bottom-pinned CTAs.
 * Desktop web: header + body on the left, `aside` on the right, centered on the
 * page as a pair; CTAs centered and pinned to the bottom of the page.
 */
export function OnboardingScreenLayout({
  kicker,
  title,
  children,
  aside,
  asideSide = 'right',
  inlineFooter = false,
  centerVertically = false,
  centerHeader = true,
  primaryLabel,
  onPrimary,
  primaryLoading,
  primaryDisabled,
  secondaryLabel,
  onSecondary,
  secondaryDisabled,
  hideFooter = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const { tier } = useWebLayout();
  const underStorefrontChrome = useOnboardingUnderStorefrontChrome();
  /** Two columns only at desktop (≥1024); tablet keeps the mobile single column. */
  const isDesktopWeb = Platform.OS === 'web' && tier === 'desktop-web';
  /** Desktop is left-aligned; mobile follows centerHeader. */
  const leftAlignHeader = isDesktopWeb || !centerHeader;

  const bottomPad = isDesktopWeb
    ? DESKTOP_CTA_INSET
    : Math.max(insets.bottom, spacing.xs) + spacing.sm;
  /** Room below the corner logo; under storefront chrome the header already brands. */
  const topPad = underStorefrontChrome
    ? isDesktopWeb
      ? spacing.lg
      : spacing.xxl
    : isDesktopWeb
      ? spacing.xxl + spacing.xl
      : Math.max(insets.top, spacing.sm) + spacing.sm + 30 + spacing.lg;

  const showFooter = !hideFooter && !!primaryLabel && !!onPrimary;
  const footerInline = isDesktopWeb && inlineFooter;

  const ctas = showFooter ? (
    <>
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
    </>
  ) : null;

  const footer = showFooter && !footerInline ? (
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
          { alignSelf: isDesktopWeb || !leftAlignHeader ? 'center' : 'flex-start' },
        ]}
      >
        {ctas}
      </View>
    </View>
  ) : null;

  const header = (
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
      <Text
        style={[styles.title, isDesktopWeb && styles.titleDesktop, !leftAlignHeader && styles.titleCentered]}
      >
        {title}
      </Text>
    </View>
  );

  const body = children ? (
    <View style={[styles.body, isDesktopWeb && styles.bodyDesktop]}>{children}</View>
  ) : null;

  const asideColumn = aside ? <View style={styles.column}>{aside}</View> : null;
  const content = isDesktopWeb ? (
    <View style={[styles.columns, aside ? styles.columnsTwo : styles.columnsOne]}>
      {asideSide === 'left' ? asideColumn : null}
      <View style={styles.column}>
        {header}
        {body}
        {footerInline && ctas ? <View style={styles.footerInline}>{ctas}</View> : null}
      </View>
      {asideSide === 'right' ? asideColumn : null}
    </View>
  ) : (
    <>
      {header}
      {body}
      {aside ? <View style={[styles.body, styles.asideMobile]}>{aside}</View> : null}
    </>
  );

  return (
    <View style={[styles.root, underStorefrontChrome && styles.rootUnderChrome]}>
      <OnboardingCornerLogo />
      <View
        style={[
          styles.copyPane,
          isDesktopWeb ? styles.copyPaneDesktop : styles.copyPaneMobile,
          { paddingBottom: hideFooter && !isDesktopWeb ? bottomPad : 0 },
        ]}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            isDesktopWeb && styles.scrollContentDesktop,
            isDesktopWeb && centerVertically && styles.scrollContentCentered,
            { paddingTop: topPad },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          directionalLockEnabled
          nestedScrollEnabled
        >
          {content}
        </ScrollView>

        {/* Pinned under the scrollport on every size. */}
        {footer}
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
    ...(Platform.OS === 'web'
      ? ({ height: '100%', maxHeight: '100vh' } as object)
      : null),
  },
  rootUnderChrome: {
    ...(Platform.OS === 'web'
      ? ({ height: '100%', maxHeight: '100%' } as object)
      : null),
  },
  copyPane: {
    flex: 1,
    width: '100%',
    backgroundColor: semanticColors.bgPrimary,
    minHeight: 0,
  },
  /** Single column — fills the viewport; CTAs pin below a flex scrollport. */
  copyPaneMobile: {
    maxWidth: 440,
    alignSelf: 'center',
    ...(Platform.OS === 'web'
      ? ({ height: '100%', maxHeight: '100%' } as object)
      : null),
  },
  copyPaneDesktop: {
    alignSelf: 'stretch',
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({ height: '100%', maxHeight: '100%' } as object)
      : null),
  },
  /** Fill space above the pinned CTAs so tall screens can scroll. */
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.md,
  },
  scrollContentDesktop: {
    paddingBottom: spacing.sm,
    paddingHorizontal: DESKTOP_PAGE_PAD + SIDE_GLOW_BLEED,
    alignItems: 'center',
  },
  /** flexGrow content: centers when short, falls back to top padding + scroll when tall. */
  scrollContentCentered: {
    justifyContent: 'center',
  },
  /** Desktop: the column pair (or single column) centered on the page. */
  columns: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: DESKTOP_COLUMN_GAP,
  },
  columnsTwo: {
    maxWidth: DESKTOP_COLUMN_MAX_WIDTH * 2 + DESKTOP_COLUMN_GAP,
  },
  columnsOne: {
    maxWidth: DESKTOP_COLUMN_MAX_WIDTH,
  },
  column: {
    flex: 1,
    minWidth: 0,
    maxWidth: DESKTOP_COLUMN_MAX_WIDTH,
  },
  header: {
    paddingHorizontal: MOBILE_GUTTER + 8,
    paddingBottom: spacing.md,
  },
  headerDesktop: {
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  headerCentered: {
    alignItems: 'center',
  },
  kicker: {
    ...typeface('regular'),
    fontSize: typography.md,
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
    fontSize: 28,
    color: '#000000',
    letterSpacing: -0.72,
    lineHeight: 34,
  },
  titleDesktop: {
    fontSize: 38,
    lineHeight: 44,
    letterSpacing: -0.95,
  },
  titleCentered: {
    textAlign: 'center',
  },
  body: {
    paddingHorizontal: MOBILE_GUTTER + 8,
    paddingTop: spacing.md,
  },
  bodyDesktop: {
    paddingHorizontal: 0,
    paddingTop: spacing.lg,
  },
  asideMobile: {
    paddingTop: spacing.sm,
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
    paddingHorizontal: DESKTOP_CTA_INSET,
    paddingTop: spacing.sm,
    flexShrink: 0,
    zIndex: 2,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0px -8px 24px rgba(255,255,255,0.92)',
        } as object)
      : null),
  },
  footerInline: {
    width: '100%',
    maxWidth: ONBOARDING_CTA_MAX_WIDTH,
    marginTop: spacing.xl,
    gap: 8,
  },
  footerCtaWrap: {
    width: '100%',
    maxWidth: ONBOARDING_CTA_MAX_WIDTH,
    gap: 8,
  },
  secondaryGap: {
    marginTop: 0,
  },
});

/** Shared onboarding body copy — slightly larger than home `typography.lg` for phone readability. */
export const onboardingBodyText = StyleSheet.create({
  text: {
    ...typeface('light'),
    fontSize: typography.titleLg,
    color: '#000000',
    letterSpacing: -0.26,
    lineHeight: 24,
  },
  lead: {
    ...typeface('light'),
    fontSize: typography.titleLg,
    color: '#000000',
    letterSpacing: -0.26,
    lineHeight: 24,
    marginBottom: spacing.sm,
  },
});
