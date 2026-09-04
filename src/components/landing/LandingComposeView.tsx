import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { StorefrontMediaPlaceholder } from '../storefront/StorefrontMediaPlaceholder';
import { StorefrontProductGrid } from '../storefront/StorefrontProductGrid';
import { StorefrontAskRavStrip } from '../storefront/StorefrontAskRavStrip';
import { openStorefrontRav } from '../storefront/storefrontRavContext';
import { LandingStoryBand } from './LandingStoryBand';
import { LandingCategoryRail } from './LandingCategoryRail';
import {
  DEFAULT_LANDING_CATEGORY_CARDS,
  resolveLandingProducts,
  type LandingAudienceConfig,
  type LandingCta,
  type LandingCtaAction,
  type LandingSection,
} from '../../constants/landingAudiences';
import {
  MOBILE_GUTTER,
  borderRadius,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';
import { useCatalog } from '../../hooks/useCatalog';
import type { CatalogItem } from '../../types/pilot';
import type { GiftPath } from '../../screens/gift/giftGiveTypes';

type Props = {
  config: LandingAudienceConfig;
  /** Force compact hero sizing (admin preview pane). */
  forceCompact?: boolean;
  preferredGiftPath?: GiftPath | null;
  onAction?: (action: LandingCtaAction) => void;
};

/**
 * Renders modular landing sections only (no storefront chrome / redirects).
 * Used by the live page and the CMS live preview pane.
 */
export function LandingComposeView({
  config,
  forceCompact = false,
  preferredGiftPath = null,
  onAction,
}: Props) {
  const { items, loading: catalogLoading } = useCatalog();
  const handleAction = onAction ?? (() => {});
  const sections = useMemo(
    () => applyGiftPathPreference(config.sections, preferredGiftPath),
    [config.sections, preferredGiftPath]
  );

  let storyIndex = 0;

  return (
    <View style={styles.root}>
      {sections.map((section, i) => {
        const key = `${section.type}-${i}`;
        switch (section.type) {
          case 'hero':
            return (
              <HeroSection
                key={key}
                section={section}
                compact={forceCompact}
                onAction={handleAction}
              />
            );
          case 'story': {
            const index = storyIndex++;
            return (
              <LandingStoryBand
                key={key}
                heading={section.heading}
                body={section.body}
                image={section.image}
                index={index}
                ctaLabel={section.cta?.label}
                onCta={section.cta ? () => handleAction(section.cta!.action) : undefined}
              />
            );
          }
          case 'categories':
            return (
              <LandingCategoryRail
                key={key}
                heading={section.heading}
                body={section.body}
                cards={section.cards ?? DEFAULT_LANDING_CATEGORY_CARDS}
              />
            );
          case 'products':
            return (
              <ProductsSection
                key={key}
                section={section}
                catalog={items}
                catalogLoading={catalogLoading}
              />
            );
          case 'cta_row':
            return <CtaRowSection key={key} ctas={section.ctas} onAction={handleAction} />;
          case 'ask_rav':
            return (
              <StorefrontAskRavStrip
                key={key}
                eyebrow={section.eyebrow}
                headline={section.headline}
                body={section.body}
                placeholder={section.placeholder}
                prompts={section.prompts}
                onSubmit={(message) => openStorefrontRav(message)}
              />
            );
          default:
            return null;
        }
      })}
    </View>
  );
}

function applyGiftPathPreference(
  sections: LandingSection[],
  preferredGiftPath: GiftPath | null
): LandingSection[] {
  if (preferredGiftPath !== 'credit_only') return sections;
  return sections.map((section) => {
    if (section.type !== 'hero' || section.ctas.length < 2) return section;
    const [a, b, ...rest] = section.ctas;
    return { ...section, ctas: [b, a, ...rest] };
  });
}

function HeroSection({
  section,
  compact,
  onAction,
}: {
  section: Extract<LandingSection, { type: 'hero' }>;
  compact: boolean;
  onAction: (action: LandingCtaAction) => void;
}) {
  return (
    <View style={[styles.hero, compact && styles.heroCompact]}>
      <StorefrontMediaPlaceholder slot={section.slot} quiet fill style={styles.heroMedia} />
      <View style={[styles.scrim, compact && styles.scrimCompact]} pointerEvents="none" />
      <View style={[styles.heroCopy, compact && styles.heroCopyCompact]}>
        <Text style={[styles.headline, compact && styles.headlineCompact]}>
          {section.slot.headline}
        </Text>
        {section.slot.body ? <Text style={styles.body}>{section.slot.body}</Text> : null}
        {section.ctas.length ? (
          <View style={styles.ctaRow}>
            {section.ctas.map((cta) => (
              <CtaButton key={cta.label} cta={cta} onAction={onAction} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ProductsSection({
  section,
  catalog,
  catalogLoading,
}: {
  section: Extract<LandingSection, { type: 'products' }>;
  catalog: CatalogItem[];
  catalogLoading: boolean;
}) {
  const limit = section.limit ?? 6;
  const featured = useMemo(
    () =>
      resolveLandingProducts(catalog, {
        productIds: section.productIds,
        category: section.category,
        limit,
      }),
    [catalog, section.productIds, section.category, limit]
  );
  const placeholderCount = Math.max(limit, 6);
  return (
    <View style={styles.productsBlock}>
      <View style={styles.productsIntro}>
        <Text style={styles.productsHeading}>{section.heading}</Text>
        {section.body ? <Text style={styles.productsBody}>{section.body}</Text> : null}
      </View>
      <StorefrontProductGrid
        items={featured}
        placeholderCount={catalogLoading || featured.length === 0 ? placeholderCount : 0}
      />
    </View>
  );
}

function CtaRowSection({
  ctas,
  onAction,
}: {
  ctas: LandingCta[];
  onAction: (action: LandingCtaAction) => void;
}) {
  return (
    <View style={[styles.section, styles.sectionLast]}>
      {ctas.map((cta) =>
        cta.style === 'escape' ? (
          <TouchableOpacity
            key={cta.label}
            onPress={() => onAction(cta.action)}
            accessibilityRole="link"
            accessibilityLabel={cta.label}
            style={styles.escape}
          >
            <Text style={styles.escapeText}>{cta.label}</Text>
          </TouchableOpacity>
        ) : (
          <CtaButton key={cta.label} cta={cta} onAction={onAction} stretch />
        )
      )}
    </View>
  );
}

function CtaButton({
  cta,
  onAction,
  stretch,
}: {
  cta: LandingCta;
  onAction: (action: LandingCtaAction) => void;
  stretch?: boolean;
}) {
  const style = cta.style ?? 'primary';
  const btnStyle =
    style === 'secondary'
      ? styles.ctaSecondary
      : style === 'secondaryLight'
        ? styles.ctaSecondaryLight
        : styles.ctaPrimary;
  const textStyle =
    style === 'secondary'
      ? styles.ctaSecondaryText
      : style === 'secondaryLight'
        ? styles.ctaSecondaryLightText
        : styles.ctaPrimaryText;
  return (
    <TouchableOpacity
      style={[styles.cta, btnStyle, stretch && styles.ctaStretch]}
      onPress={() => onAction(cta.action)}
      accessibilityRole="button"
      accessibilityLabel={cta.label}
    >
      <Text style={textStyle}>{cta.label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    backgroundColor: semanticColors.bgPrimary,
  },
  hero: {
    minHeight: 440,
    position: 'relative',
    justifyContent: 'flex-end',
    backgroundColor: semanticColors.accentCream,
    overflow: 'hidden',
  },
  heroCompact: { minHeight: 320 },
  heroMedia: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 0,
    borderWidth: 0,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '62%',
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage:
            'linear-gradient(to top, rgba(17, 2, 34, 0.72) 0%, rgba(17, 2, 34, 0.28) 55%, transparent 100%)',
        } as object)
      : { backgroundColor: 'rgba(17, 2, 34, 0.45)' }),
  },
  scrimCompact: {
    height: '76%',
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage:
            'linear-gradient(to top, rgba(17, 2, 34, 0.88) 0%, rgba(17, 2, 34, 0.55) 42%, rgba(17, 2, 34, 0.22) 72%, transparent 100%)',
        } as object)
      : { backgroundColor: 'rgba(17, 2, 34, 0.62)' }),
  },
  heroCopy: {
    paddingHorizontal: MOBILE_GUTTER,
    paddingBottom: spacing.xl,
    paddingTop: spacing.xl,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    zIndex: 1,
  },
  heroCopyCompact: {
    paddingBottom: spacing.lg,
  },
  headline: {
    ...typeface('light'),
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: 0.4,
    color: semanticColors.textInverse,
    textAlign: 'center',
  },
  headlineCompact: {
    fontSize: 28,
    lineHeight: 34,
  },
  body: {
    ...typeface('light'),
    fontSize: typography.lg,
    lineHeight: 24,
    color: semanticColors.textInverse,
    maxWidth: 520,
    opacity: 0.95,
    textAlign: 'center',
  },
  ctaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
    justifyContent: 'center',
  },
  cta: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaStretch: { alignSelf: 'center' },
  ctaPrimary: {
    backgroundColor: semanticColors.brand,
  },
  ctaPrimaryText: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
  },
  ctaSecondary: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.brand,
    backgroundColor: 'transparent',
  },
  ctaSecondaryText: {
    ...typeface('regular'),
    fontSize: typography.md,
    color: semanticColors.brand,
  },
  ctaSecondaryLight: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.logoDark,
    backgroundColor: 'transparent',
  },
  ctaSecondaryLightText: {
    ...typeface('regular'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
  },
  productsBlock: {
    paddingTop: spacing.xl,
    backgroundColor: semanticColors.bgPrimary,
  },
  productsIntro: {
    paddingHorizontal: MOBILE_GUTTER,
    marginBottom: spacing.md,
    gap: spacing.xs,
    maxWidth: 720,
    alignSelf: 'center',
    width: '100%',
    alignItems: 'center',
  },
  productsHeading: {
    ...typeface('medium'),
    fontSize: typography.xl,
    letterSpacing: -0.3,
    color: semanticColors.logoDark,
    textAlign: 'center',
  },
  productsBody: {
    ...typeface('light'),
    fontSize: typography.lg,
    lineHeight: 24,
    color: semanticColors.textSecondary,
    textAlign: 'center',
  },
  section: {
    paddingHorizontal: MOBILE_GUTTER,
    paddingTop: spacing.xl,
    maxWidth: 720,
    gap: spacing.xs,
    alignSelf: 'center',
    width: '100%',
    alignItems: 'center',
  },
  sectionLast: {
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  escape: {
    paddingVertical: spacing.xs,
  },
  escapeText: {
    ...typeface('regular'),
    fontSize: typography.md,
    color: semanticColors.textSecondary,
    textDecorationLine: 'underline',
  },
});
