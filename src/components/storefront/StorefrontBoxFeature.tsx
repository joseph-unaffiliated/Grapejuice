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

const INCLUSIONS: { title: string; note: string }[] = [
  { title: 'Handmade beeswax candle set', note: 'Box of 50' },
  { title: "Children's books", note: 'One for each kid' },
  { title: 'Wrapping paper', note: 'Gifts can come pre-wrapped' },
  { title: 'Latke and Sufganiot kits', note: 'Making food as an activity' },
  { title: 'Dreidel & gelt set', note: 'Instructions for how to play' },
  { title: 'Toys for the kids', note: 'Stuffies, lego, wood menorahs…' },
];

type Props = {
  onBuildBox: () => void;
};

export function StorefrontBoxFeature({ onBuildBox }: Props) {
  const { width } = useWindowDimensions();
  const stacked = width < 768;
  const boxPrice = formatCatalogDollars(LIST_BOX_PRICE_CENTS);

  return (
    <View style={styles.root}>
      <View style={[styles.inner, stacked && styles.innerStacked]}>
        <View style={[styles.mediaCol, stacked && styles.colStacked]}>
          <View style={styles.mediaWrap}>
            <StorefrontMediaPlaceholder
              slot={BOX_MEDIA}
              style={styles.media}
            />
            <View style={styles.priceOverlay} pointerEvents="none">
              <Text style={styles.price}>{boxPrice}</Text>
              <Text style={styles.priceNote}>Free shipping</Text>
            </View>
          </View>
        </View>

        <View style={[styles.copyCol, stacked && styles.colStacked]}>
          <Text style={styles.eyebrow}>The Hanukkah Box</Text>
          <Text style={styles.headline}>One box. Built around your life.</Text>
          <Text style={styles.body}>
            There’s no standard box. A short quiz tells us about your household —
            then we curate 8–12 pieces you can swap before lock.
          </Text>
          <Text style={styles.bodyEmphasis}>
            Get the box and unlock member prices on everything in the store —
            often deep discounts vs shopping à la carte.
          </Text>

          <Text style={styles.checklistLabel}>What might be inside</Text>
          <View style={styles.checklist}>
            {INCLUSIONS.map((item) => (
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
              onPress={onBuildBox}
              accessibilityRole="button"
              accessibilityLabel="Build your box"
            >
              <Text style={styles.ctaPrimaryText}>Build your box</Text>
            </TouchableOpacity>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.border,
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
    textShadowColor: 'rgba(0, 0, 0, 0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  priceNote: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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
  bodyEmphasis: {
    ...typeface('medium'),
    fontSize: 16,
    lineHeight: 24,
    color: semanticColors.logoDark,
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
});
