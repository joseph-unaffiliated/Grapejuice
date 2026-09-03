import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { StorefrontMediaPlaceholder } from './StorefrontMediaPlaceholder';
import type { StorefrontMediaSlot } from '../../constants/storefrontMedia';
import type { StorefrontHomeMode } from '../../hooks/useStorefrontHomeMode';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import { LIST_BOX_PRICE_CENTS } from '../../services/box/pricing';
import {
  borderRadius,
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

const BOX_MEDIA: StorefrontMediaSlot = {
  id: 'box-feature',
  kind: 'image',
  aspect: '4/5',
  label: 'The Grapejuice Hanukkah Box',
  src: require('../../../assets/storefront/box-feature-gift-stack.webp'),
};

/** Placeholder Passover visual until seasonal art ships. */
const PASSOVER_MEDIA: StorefrontMediaSlot = {
  id: 'box-feature-passover',
  kind: 'image',
  aspect: '4/5',
  label: 'Passover 2027',
  src: require('../../../assets/storefront/setthetablev1.webp'),
};

const INCLUSIONS: { title: string; note: string }[] = [
  { title: 'Handmade beeswax candle set', note: 'Box of 50' },
  { title: "Children's books", note: 'One for each kid' },
  { title: 'Wrapping paper', note: 'Gifts can come pre-wrapped' },
  { title: 'Latke and Sufganiot kits', note: 'Making food as an activity' },
  { title: 'Dreidel & gelt set', note: 'Instructions for how to play' },
  { title: 'Toys for the kids', note: 'Stuffies, lego, wood menorahs…' },
];

const PASSOVER_POINTS: { title: string; note: string }[] = [
  { title: 'Seder essentials', note: 'Placeholder — kit details TBD' },
  { title: 'Table & host pieces', note: 'Placeholder — curated for the meal' },
  { title: 'Kids & activities', note: 'Placeholder — keep little hands busy' },
  { title: 'Carry-forward from Hanukkah', note: 'Placeholder — member timing' },
];

type Copy = {
  eyebrow: string;
  headline: string;
  body: string;
  checklistLabel: string;
  checklist: { title: string; note: string }[];
  primaryLabel: string;
  secondaryLabel: string | null;
  showPrice: boolean;
  media: StorefrontMediaSlot;
};

function copyForMode(mode: StorefrontHomeMode, boxPrice: string): Copy {
  switch (mode) {
    case 'guest_box':
      return {
        eyebrow: 'Your Hanukkah Box',
        headline: 'Your box is started. Save it with an account.',
        body: 'Create an account so we can hold your curation, swaps, and lock date — and you can pick up right where you left off.',
        checklistLabel: 'What might be inside',
        checklist: INCLUSIONS,
        primaryLabel: 'Create an account',
        secondaryLabel: null,
        showPrice: true,
        media: BOX_MEDIA,
      };
    case 'customize':
      return {
        eyebrow: 'Your Hanukkah Box',
        headline: 'Customize before lock.',
        body: 'Your box is secured. Swap pieces, add extras, and fine-tune the mix anytime before the lock date.',
        checklistLabel: 'What might be inside',
        checklist: INCLUSIONS,
        primaryLabel: 'Customize your box',
        secondaryLabel: null,
        showPrice: false,
        media: BOX_MEDIA,
      };
    case 'needs_payment':
      return {
        eyebrow: 'Your Hanukkah Box',
        headline: 'Add payment to secure your box.',
        body: 'You can browse swap options now. Save a card to lock in your picks — you won’t be charged until your box ships.',
        checklistLabel: 'What might be inside',
        checklist: INCLUSIONS,
        primaryLabel: 'Add payment to secure',
        secondaryLabel: null,
        showPrice: true,
        media: BOX_MEDIA,
      };
    case 'gift_credit_incomplete':
      return {
        eyebrow: 'Gift credit',
        headline: 'Finish sending your gift credit.',
        body: 'You started gift credit for someone else. Continue to payment — they claim by email and can shop à la carte or put it toward a Hanukkah box.',
        checklistLabel: 'What they can open',
        checklist: INCLUSIONS,
        primaryLabel: 'Continue to payment',
        secondaryLabel: null,
        showPrice: true,
        media: BOX_MEDIA,
      };
    case 'gift_customize_incomplete':
      return {
        eyebrow: 'Gift box',
        headline: 'Secure your gift when you’re ready.',
        body: 'Keep customizing the curated gift box you’re sending, then pay. The family claims it by email.',
        checklistLabel: 'What might be inside',
        checklist: INCLUSIONS,
        primaryLabel: 'Continue customizing',
        secondaryLabel: null,
        showPrice: true,
        media: BOX_MEDIA,
      };
    case 'gift_sent':
      return {
        eyebrow: 'Gift sent',
        headline: 'Your gift is with the family now.',
        body: 'They’ll get an email to claim. Send another gift anytime, or start a Hanukkah box for your own household.',
        checklistLabel: 'What might be inside',
        checklist: INCLUSIONS,
        primaryLabel: 'Send another gift',
        secondaryLabel: null,
        showPrice: false,
        media: BOX_MEDIA,
      };
    case 'locked':
    case 'passover':
      return {
        eyebrow: 'Next season',
        headline: 'Passover 2027 is on the way.',
        body:
          mode === 'locked'
            ? 'Your Hanukkah box is locked and on its way. While you wait, explore early interest for Passover 2027 — dates and offers coming soon.'
            : 'Hanukkah 2026 is complete. Explore early interest for Passover 2027 — dates, kits, and offers coming soon.',
        checklistLabel: 'What’s coming',
        checklist: PASSOVER_POINTS,
        primaryLabel: 'Explore Passover 2027',
        secondaryLabel: null,
        showPrice: false,
        media: PASSOVER_MEDIA,
      };
    default:
      return {
        eyebrow: 'The Hanukkah Box',
        headline: 'One box. Built around your life.',
        body: 'There’s no standard box. A short quiz tells us about your household — then we curate 8–12 pieces you can swap before lock.',
        checklistLabel: 'What might be inside',
        checklist: INCLUSIONS,
        primaryLabel: `Build your box (${boxPrice})`,
        secondaryLabel: 'See if I’m eligible for a discounted rate',
        showPrice: true,
        media: BOX_MEDIA,
      };
  }
}

type Props = {
  mode: StorefrontHomeMode;
  onPrimary: () => void;
  onEligibility: () => void;
};

export function StorefrontBoxFeature({ mode, onPrimary, onEligibility }: Props) {
  const { width } = useWindowDimensions();
  const stacked = width < 768;
  const boxPrice = formatCatalogDollars(LIST_BOX_PRICE_CENTS);
  const copy = copyForMode(mode, boxPrice);

  return (
    <View style={styles.root}>
      <View style={[styles.inner, stacked && styles.innerStacked]}>
        <View style={[styles.mediaCol, stacked && styles.colStacked]}>
          <View style={styles.mediaWrap}>
            <StorefrontMediaPlaceholder slot={copy.media} style={styles.media} />
            {copy.showPrice ? (
              <View style={styles.priceOverlay} pointerEvents="none">
                <Text style={styles.price}>{boxPrice}</Text>
                <Text style={styles.priceNote}>Free shipping</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={[styles.copyCol, stacked && styles.colStacked]}>
          <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
          <Text style={styles.headline}>{copy.headline}</Text>
          <Text style={styles.body}>{copy.body}</Text>

          <Text style={styles.checklistLabel}>{copy.checklistLabel}</Text>
          <View style={styles.checklist}>
            {copy.checklist.map((item) => (
              <View key={item.title} style={styles.checkItem}>
                <Text style={styles.checkMark} accessibilityElementsHidden>
                  ✓
                </Text>
                <View style={styles.checkCopy}>
                  <Text style={styles.checkTitle}>{item.title}</Text>
                  <Text style={styles.checkNote}>{item.note}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.ctas}>
            <TouchableOpacity
              style={styles.ctaPrimary}
              onPress={onPrimary}
              accessibilityRole="button"
              accessibilityLabel={copy.primaryLabel}
            >
              <Text style={styles.ctaPrimaryText}>{copy.primaryLabel}</Text>
            </TouchableOpacity>
            {copy.secondaryLabel ? (
              <TouchableOpacity
                style={styles.ctaSecondary}
                onPress={onEligibility}
                accessibilityRole="button"
                accessibilityLabel={copy.secondaryLabel}
              >
                <Text style={styles.ctaSecondaryText}>{copy.secondaryLabel}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: MOBILE_GUTTER,
    paddingVertical: spacing.xxl,
    backgroundColor: semanticColors.bgPrimary,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.xl,
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center',
  },
  innerStacked: {
    flexDirection: 'column',
  },
  mediaCol: {
    flex: 1,
    minWidth: 260,
  },
  copyCol: {
    flex: 1,
    minWidth: 260,
    gap: spacing.sm,
    justifyContent: 'center',
  },
  colStacked: {
    width: '100%',
    flex: undefined,
  },
  mediaWrap: {
    position: 'relative',
    width: '100%',
  },
  media: {
    width: '100%',
    aspectRatio: 4 / 5,
    maxHeight: 640,
    borderWidth: 0,
  },
  priceOverlay: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    gap: 2,
  },
  price: {
    ...typeface('medium'),
    fontSize: 40,
    lineHeight: 44,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 12,
  },
  priceNote: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  eyebrow: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.goldMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headline: {
    ...typeface('medium'),
    fontSize: 32,
    lineHeight: 38,
    color: semanticColors.logoDark,
    marginBottom: spacing.xs,
  },
  body: {
    ...typeface('regular'),
    fontSize: 16,
    lineHeight: 24,
    color: semanticColors.textSecondary,
  },
  checklistLabel: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  checklist: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    width: '47%',
    minWidth: 140,
    flexGrow: 1,
  },
  checkMark: {
    ...typeface('medium'),
    fontSize: 12,
    color: semanticColors.goldMuted,
    marginTop: 2,
  },
  checkCopy: {
    flex: 1,
    gap: 1,
  },
  checkTitle: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
  },
  checkNote: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textTertiary,
  },
  ctas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  ctaPrimary: {
    backgroundColor: semanticColors.brand,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  ctaPrimaryText: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
  },
  ctaSecondary: {
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: semanticColors.border,
  },
  ctaSecondaryText: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
  },
});
