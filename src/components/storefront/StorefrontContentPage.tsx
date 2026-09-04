import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import {
  StorefrontChrome,
  useStorefrontActions,
} from './StorefrontChrome';
import { StorefrontAskRavStrip } from './StorefrontAskRavStrip';
import { StorefrontBuildBoxStrip } from './StorefrontBuildBoxStrip';
import {
  borderRadius,
  LAYOUT,
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

export type StorefrontContentSection = {
  heading: string;
  body: string;
};

type Cta = {
  label: string;
  onPress: () => void;
};

type Props = {
  crumb: string;
  eyebrow?: string;
  title: string;
  lead: string;
  /** Placeholder sections — replace when real copy lands. */
  sections?: StorefrontContentSection[];
  primaryCta?: Cta;
  secondaryCta?: Cta;
};

/**
 * Marketplace content page shell — breadcrumb, type, CTAs matching aisle / box-feature UI.
 */
export function StorefrontContentPage({
  crumb,
  eyebrow,
  title,
  lead,
  sections = [],
  primaryCta,
  secondaryCta,
}: Props) {
  const { goHome, askRav, startBox } = useStorefrontActions();
  const { width } = useWindowDimensions();
  const isDesktop = width >= LAYOUT.BREAKPOINT_TABLET;

  return (
    <StorefrontChrome>
      <View style={styles.page}>
        {isDesktop ? (
          <View style={styles.breadcrumb}>
            <Text style={styles.crumbLink} onPress={goHome} accessibilityRole="link">
              Store
            </Text>
            <Text style={styles.crumbSep}> / </Text>
            <Text style={styles.crumbCurrent}>{crumb}</Text>
          </View>
        ) : null}

        <View style={styles.hero}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.lead}>{lead}</Text>

          {primaryCta || secondaryCta ? (
            <View style={styles.ctas}>
              {primaryCta ? (
                <TouchableOpacity
                  style={styles.ctaPrimary}
                  onPress={primaryCta.onPress}
                  accessibilityRole="button"
                  accessibilityLabel={primaryCta.label}
                >
                  <Text style={styles.ctaPrimaryText}>{primaryCta.label}</Text>
                </TouchableOpacity>
              ) : null}
              {secondaryCta ? (
                <TouchableOpacity
                  style={styles.ctaSecondary}
                  onPress={secondaryCta.onPress}
                  accessibilityRole="button"
                  accessibilityLabel={secondaryCta.label}
                >
                  <Text style={styles.ctaSecondaryText}>{secondaryCta.label}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>

        {sections.length > 0 ? (
          <View style={styles.sections}>
            {sections.map((section) => (
              <View key={section.heading} style={styles.section}>
                <Text style={styles.sectionHeading}>{section.heading}</Text>
                <Text style={styles.sectionBody}>{section.body}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.placeholderNote}>
          <Text style={styles.placeholderNoteText}>Content coming soon</Text>
        </View>

        <StorefrontAskRavStrip onSubmit={(message) => askRav(message)} />
        <StorefrontBuildBoxStrip onPress={startBox} />
      </View>
    </StorefrontChrome>
  );
}

const styles = StyleSheet.create({
  page: {},
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: MOBILE_GUTTER,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  crumbLink: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textSecondary,
    textDecorationLine: 'underline',
  },
  crumbSep: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textTertiary,
  },
  crumbCurrent: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
  },
  hero: {
    paddingHorizontal: MOBILE_GUTTER,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
    maxWidth: 720,
  },
  eyebrow: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.goldMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    ...typeface('medium'),
    fontSize: 32,
    lineHeight: 38,
    color: semanticColors.logoDark,
  },
  lead: {
    ...typeface('regular'),
    fontSize: 16,
    lineHeight: 24,
    color: semanticColors.textSecondary,
  },
  ctas: {
    gap: spacing.sm,
    marginTop: spacing.md,
    alignItems: 'flex-start',
  },
  ctaPrimary: {
    backgroundColor: semanticColors.brand,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  ctaPrimaryText: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
    letterSpacing: -0.2,
  },
  ctaSecondary: {
    backgroundColor: 'transparent',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: semanticColors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  ctaSecondaryText: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
  },
  sections: {
    paddingHorizontal: MOBILE_GUTTER,
    paddingBottom: spacing.xl,
    gap: spacing.xl,
    maxWidth: 720,
  },
  section: {
    gap: spacing.xs,
  },
  sectionHeading: {
    ...typeface('medium'),
    fontSize: 20,
    lineHeight: 26,
    color: semanticColors.logoDark,
    letterSpacing: -0.3,
  },
  sectionBody: {
    ...typeface('regular'),
    fontSize: 15,
    lineHeight: 22,
    color: semanticColors.textSecondary,
  },
  placeholderNote: {
    marginHorizontal: MOBILE_GUTTER,
    marginBottom: spacing.xxl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    backgroundColor: semanticColors.bgDark,
    borderRadius: borderRadius.md,
    maxWidth: 720,
  },
  placeholderNoteText: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.goldMuted,
    letterSpacing: -0.2,
  },
});
