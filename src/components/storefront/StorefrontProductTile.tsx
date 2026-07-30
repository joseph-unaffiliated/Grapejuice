import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BoxItemImage } from '../box/BoxItemImage';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import {
  formatSubscriberOfferLine,
  resolveCatalogDisplayPrices,
} from '../../services/box/pricing';
import type { CatalogItem } from '../../types/pilot';
import {
  borderRadius,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';
import {
  WelcomeSubscriberBadge,
  isWelcomeMenorah,
} from './WelcomeSubscriberBadge';

type Props = {
  item: CatalogItem;
  width: number;
  wishlisted: boolean;
  onPress: () => void;
  onToggleWishlist: () => void;
};

export function StorefrontProductTile({
  item,
  width,
  wishlisted,
  onPress,
  onToggleWishlist,
}: Props) {
  const imageSize = Math.max(120, width);
  const { memberCents, nonMemberCents } = resolveCatalogDisplayPrices(item);
  const showMember =
    memberCents > 0 && nonMemberCents > 0 && memberCents < nonMemberCents;
  const defaultPrice =
    nonMemberCents > 0
      ? formatCatalogDollars(nonMemberCents)
      : memberCents > 0
        ? formatCatalogDollars(memberCents)
        : formatCatalogDollars(item.dollarCostCents);
  const showWelcomeBadge = isWelcomeMenorah(item);

  return (
    <View style={[styles.root, { width }]}>
      <View style={[styles.imageWrap, { width, height: imageSize }]}>
        <TouchableOpacity
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={item.name}
          activeOpacity={0.85}
        >
          <BoxItemImage
            size={imageSize}
            itemId={item.id}
            imageUrl={item.imageUrl}
            style={styles.image}
          />
        </TouchableOpacity>
        {showWelcomeBadge ? (
          <View style={styles.welcomeBadge}>
            <WelcomeSubscriberBadge compact />
          </View>
        ) : null}
        <TouchableOpacity
          style={styles.heart}
          onPress={onToggleWishlist}
          accessibilityRole="button"
          accessibilityLabel={
            wishlisted ? `Remove ${item.name} from wishlist` : `Save ${item.name} to wishlist`
          }
          hitSlop={10}
        >
          <Icon
            icon={wishlisted ? icons.heart : icons.heartOutline}
            size={16}
            color={wishlisted ? semanticColors.secondary : semanticColors.logoDark}
          />
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={onPress} accessibilityRole="button">
        <Text style={styles.name} numberOfLines={2}>
          {item.name}
        </Text>
        {showMember ? (
          <View style={styles.priceRow}>
            <Text style={styles.price}>{defaultPrice}</Text>
            <Text style={styles.memberPrice}>
              {formatSubscriberOfferLine(
                formatCatalogDollars(memberCents),
                nonMemberCents,
                memberCents
              )}
            </Text>
          </View>
        ) : (
          <Text style={styles.price}>{defaultPrice}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginBottom: spacing.md,
  },
  imageWrap: {
    position: 'relative',
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: semanticColors.accentCream,
  },
  image: {
    borderRadius: borderRadius.md,
  },
  welcomeBadge: {
    position: 'absolute',
    left: spacing.xs,
    bottom: spacing.xs,
    zIndex: 2,
  },
  heart: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  name: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textPrimary,
    marginBottom: 4,
  },
  priceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: 8,
  },
  price: {
    ...typeface('medium'),
    fontSize: 18,
    color: semanticColors.logoDark,
  },
  memberPrice: {
    ...typeface('regular'),
    fontSize: 11,
    color: semanticColors.goldMuted,
    flexShrink: 1,
  },
});
