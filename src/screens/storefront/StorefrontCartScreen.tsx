import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import {
  StorefrontChrome,
  useStorefrontActions,
} from '../../components/storefront/StorefrontChrome';
import { CartQtyStepper } from '../../components/storefront/CartQtyStepper';
import { BoxItemImage } from '../../components/box/BoxItemImage';
import { Icon } from '../../components/ui/Icon';
import { icons } from '../../constants/icons';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { useCatalogAvailabilityMap } from '../../hooks/useCatalogAvailabilityMap';
import {
  marketplaceCartCount,
  useMarketplaceCartStore,
} from '../../stores/marketplaceCartStore';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import {
  availabilityAllowsDirectPurchase,
  availabilityRemaining,
} from '../../services/catalog/availability';
import type { MainStackParamList } from '../../navigation/types';
import type { BoxLineItem } from '../../types/pilot';
import {
  borderRadius,
  LAYOUT,
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

const THUMB = 72;

/**
 * Marketplace cart — independent of Hanukkah box drafts.
 * Empty until the shopper explicitly adds products from the PDP.
 */
export function StorefrontCartScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= LAYOUT.BREAKPOINT_TABLET;
  const { goHome, goCategory, startBox } = useStorefrontActions();
  const lineItems = useMarketplaceCartStore((s) => s.items);
  const changeQuantity = useMarketplaceCartStore((s) => s.changeQuantity);
  const setQuantity = useMarketplaceCartStore((s) => s.setQuantity);
  const removeItem = useMarketplaceCartStore((s) => s.removeItem);
  const {
    items: catalog,
    byId: availabilityById,
    loading: catalogLoading,
  } = useCatalogAvailabilityMap();

  const catalogById = useMemo(() => {
    const map = new Map(catalog.map((c) => [c.id, c]));
    return map;
  }, [catalog]);

  const lineIssues = useMemo(() => {
    const issues: Record<
      string,
      { kind: 'unavailable' | 'over_qty'; message: string; maxQty?: number }
    > = {};
    for (const li of lineItems) {
      const avail = availabilityById[li.itemId];
      const label = li.label || catalogById.get(li.itemId)?.name || li.itemId;
      const qty = Math.max(1, li.quantity || 1);
      if (!avail || !availabilityAllowsDirectPurchase(avail)) {
        issues[li.itemId] = {
          kind: 'unavailable',
          message:
            avail?.status === 'sold_out'
              ? `${label} is sold out — remove it to continue.`
              : `${label} is only available in a box — remove it to continue.`,
        };
        continue;
      }
      const remaining = availabilityRemaining(avail);
      if (remaining != null && qty > remaining) {
        issues[li.itemId] = {
          kind: 'over_qty',
          message: `Only ${remaining} left — lower quantity to continue.`,
          maxQty: remaining,
        };
      }
    }
    return issues;
  }, [lineItems, availabilityById, catalogById]);

  const hasCartIssues = Object.keys(lineIssues).length > 0;

  // Clamp over-qty lines once availability is known.
  useEffect(() => {
    for (const li of lineItems) {
      const issue = lineIssues[li.itemId];
      if (
        issue?.kind === 'over_qty' &&
        issue.maxQty != null &&
        issue.maxQty > 0 &&
        Math.max(1, li.quantity || 1) > issue.maxQty
      ) {
        setQuantity(li.itemId, issue.maxQty);
      }
    }
  }, [lineItems, lineIssues, setQuantity]);

  const subtotalCents = useMemo(
    () =>
      lineItems
        .filter((li) => !lineIssues[li.itemId] || lineIssues[li.itemId].kind === 'over_qty')
        .reduce((sum, li) => sum + li.unitCents * Math.max(1, li.quantity || 1), 0),
    [lineItems, lineIssues]
  );

  const openProduct = (li: BoxLineItem) => {
    navigation.navigate('CatalogProduct', { slug: li.itemId });
  };

  if (catalogLoading) {
    return (
      <StorefrontChrome>
        <View style={[styles.centered, { minHeight: Math.round(height * 0.65) }]}>
          <BrandLoadingMark />
        </View>
      </StorefrontChrome>
    );
  }

  const empty = lineItems.length === 0;
  const count = marketplaceCartCount(lineItems);

  return (
    <StorefrontChrome>
      <View style={styles.page}>
        {isDesktop ? (
          <View style={styles.breadcrumb}>
            <Text style={styles.crumbLink} onPress={goHome} accessibilityRole="link">
              Store
            </Text>
            <Text style={styles.crumbSep}> / </Text>
            <Text style={styles.crumbCurrent}>Cart</Text>
          </View>
        ) : null}

        {empty ? (
          <View style={styles.empty} accessibilityRole="summary">
            <View style={styles.iconWrap}>
              <Icon icon={icons.cart} size={28} color={semanticColors.logoDark} />
            </View>
            <Text style={styles.title}>Your cart is empty</Text>
            <Text style={styles.body}>
              You haven’t added anything yet. Browse the marketplace, or start a Hanukkah box and
              we’ll fill it with a curated set for your household.
            </Text>

            <View style={styles.ctas}>
              <TouchableOpacity
                style={styles.ctaPrimary}
                onPress={() => goCategory('collection')}
                accessibilityRole="button"
                accessibilityLabel="Shop the collection"
              >
                <Text style={styles.ctaPrimaryText}>Shop the collection</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ctaSecondary}
                onPress={startBox}
                accessibilityRole="button"
                accessibilityLabel="Build a Hanukkah box"
              >
                <Text style={styles.ctaSecondaryText}>Build a Hanukkah box</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.filled}>
            <Text style={styles.filledTitle}>Cart ({count})</Text>

            <View style={styles.list}>
              {lineItems.map((li) => {
                const catalogItem = catalogById.get(li.itemId);
                const label = li.label || catalogItem?.name || li.itemId;
                const qty = Math.max(1, li.quantity || 1);
                const lineTotal = li.unitCents * qty;
                const issue = lineIssues[li.itemId];
                const remaining = availabilityRemaining(availabilityById[li.itemId]);
                return (
                  <View key={`${li.slotId}-${li.itemId}`} style={styles.row}>
                    <TouchableOpacity
                      style={styles.rowMain}
                      onPress={() => openProduct(li)}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                    >
                      <BoxItemImage
                        size={THUMB}
                        itemId={li.itemId}
                        imageUrl={catalogItem?.imageUrl}
                        style={styles.thumb}
                      />
                      <View style={styles.rowCopy}>
                        <Text style={styles.rowName} numberOfLines={2}>
                          {label}
                        </Text>
                        <Text style={styles.rowPrice}>
                          {lineTotal > 0 ? formatCatalogDollars(lineTotal) : '—'}
                        </Text>
                        {issue ? (
                          <Text style={styles.rowIssue}>{issue.message}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                    {issue?.kind === 'unavailable' ? (
                      <TouchableOpacity
                        style={styles.removeBtn}
                        onPress={() => removeItem(li.itemId)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${label}`}
                      >
                        <Text style={styles.removeBtnText}>Remove</Text>
                      </TouchableOpacity>
                    ) : (
                      <CartQtyStepper
                        quantity={qty}
                        label={label}
                        maxQuantity={remaining ?? undefined}
                        onChange={(delta) => changeQuantity(li.itemId, delta)}
                      />
                    )}
                  </View>
                );
              })}
            </View>

            <View style={styles.summary}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>
                {subtotalCents > 0 ? formatCatalogDollars(subtotalCents) : '—'}
              </Text>
            </View>

            {hasCartIssues ? (
              <Text style={styles.cartIssueBanner}>
                Fix or remove unavailable items before checkout.
              </Text>
            ) : null}

            <View style={styles.ctas}>
              <TouchableOpacity
                style={[styles.ctaPrimary, hasCartIssues && styles.ctaDisabled]}
                onPress={() => navigation.navigate('MarketplaceCheckout')}
                disabled={hasCartIssues}
                accessibilityRole="button"
                accessibilityLabel="Checkout"
              >
                <Text style={styles.ctaPrimaryText}>Checkout</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ctaSecondary}
                onPress={() => goCategory('collection')}
                accessibilityRole="button"
                accessibilityLabel="Continue shopping"
              >
                <Text style={styles.ctaSecondaryText}>Continue shopping</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ctaTertiary}
                onPress={startBox}
                accessibilityRole="button"
                accessibilityLabel="Build a Hanukkah box"
              >
                <Text style={styles.ctaTertiaryText}>Build a Hanukkah box</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </StorefrontChrome>
  );
}

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: MOBILE_GUTTER,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  centered: {
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breadcrumb: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  crumbLink: {
    ...typeface('regular'),
    fontSize: typography.md,
    color: semanticColors.goldMuted,
  },
  crumbSep: {
    ...typeface('regular'),
    fontSize: typography.md,
    color: semanticColors.goldMuted,
  },
  crumbCurrent: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
  },
  empty: {
    alignItems: 'center',
    alignSelf: 'center',
    maxWidth: 440,
    width: '100%',
    paddingVertical: spacing.xxl,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: semanticColors.bgDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...typeface('medium'),
    fontSize: 28,
    letterSpacing: -0.6,
    color: semanticColors.logoDark,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  body: {
    ...typeface('regular'),
    fontSize: typography.lg,
    lineHeight: 24,
    color: semanticColors.goldMuted,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  filled: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 560,
  },
  filledTitle: {
    ...typeface('medium'),
    fontSize: 28,
    letterSpacing: -0.6,
    color: semanticColors.logoDark,
    marginBottom: spacing.lg,
  },
  list: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.border,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minWidth: 0,
  },
  thumb: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: semanticColors.bgDark,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowName: {
    ...typeface('medium'),
    fontSize: typography.lg,
    color: semanticColors.logoDark,
    letterSpacing: -0.2,
  },
  rowPrice: {
    ...typeface('regular'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
    marginTop: 2,
  },
  rowIssue: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.secondary,
    marginTop: 4,
    lineHeight: 18,
  },
  removeBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  removeBtnText: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.secondary,
    textDecorationLine: 'underline',
  },
  cartIssueBanner: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.secondary,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
    paddingTop: spacing.sm,
  },
  summaryLabel: {
    ...typeface('medium'),
    fontSize: typography.lg,
    color: semanticColors.logoDark,
  },
  summaryValue: {
    ...typeface('medium'),
    fontSize: typography.lg,
    color: semanticColors.logoDark,
  },
  ctas: {
    width: '100%',
    gap: spacing.sm,
  },
  ctaPrimary: {
    backgroundColor: semanticColors.logoDark,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  ctaDisabled: {
    opacity: 0.45,
  },
  ctaPrimaryText: {
    ...typeface('medium'),
    fontSize: typography.lg,
    color: '#FFFFFF',
  },
  ctaSecondary: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.border,
  },
  ctaSecondaryText: {
    ...typeface('medium'),
    fontSize: typography.lg,
    color: semanticColors.logoDark,
  },
  ctaTertiary: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  ctaTertiaryText: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.goldMuted,
  },
});
