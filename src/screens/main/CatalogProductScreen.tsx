import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useBoxDraft } from '../../hooks/useBoxDraft';
import { usePaymentGate } from '../../hooks/usePaymentGate';
import { useCatalog } from '../../hooks/useCatalog';
import { useSession } from '../../hooks/useSession';
import { useWebLayout } from '../../hooks/useWebLayout';
import { getHanukkahConfig, isBoxLocked } from '../../services/firestore/config';
import { ordersService } from '../../services/firestore/orders';
import { inferPricingTier, unitCentsForTier } from '../../services/box/pricing';
import { ProductImageGallery } from '../../components/catalog/ProductImageGallery';
import { ProductPricingBlock } from '../../components/catalog/ProductPricingBlock';
import type { MainStackParamList } from '../../navigation/types';
import type { BoxLineItem } from '../../types/pilot';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { spacing, typography } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';

type DetailRow = { label: string; value: string };

function detailRowsFromItem(item: {
  dimensions?: string;
  materials?: string;
  whatsIncluded?: string;
  careNotes?: string;
}): DetailRow[] {
  const rows: DetailRow[] = [];
  if (item.dimensions?.trim()) rows.push({ label: 'Dimensions', value: item.dimensions.trim() });
  if (item.materials?.trim()) rows.push({ label: 'Materials', value: item.materials.trim() });
  if (item.whatsIncluded?.trim()) {
    rows.push({ label: 'What’s included', value: item.whatsIncluded.trim() });
  }
  if (item.careNotes?.trim()) rows.push({ label: 'Care', value: item.careNotes.trim() });
  return rows;
}

function hasActiveHanukkahBoxOrder(
  orders: { status: string }[]
): boolean {
  return orders.some(
    (o) =>
      o.status === 'committed' ||
      o.status === 'confirmed' ||
      o.status === 'shipped' ||
      o.status === 'delivered'
  );
}

export function CatalogProductScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'CatalogProduct'>>();
  const { itemId } = route.params;
  const { colors } = useThemeMode();
  const { isDesktop, widePanelMaxWidth } = useWebLayout();
  const { household } = useSession();
  const { lineItems, loading: draftLoading, persist: saveDraft } = useBoxDraft();
  const { guardMutation } = usePaymentGate();
  const { items: catalog, loading: catalogLoading } = useCatalog();
  const item = useMemo(
    () => catalog.find((c) => c.id === itemId) ?? null,
    [catalog, itemId]
  );
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(false);
  const [hasHanukkahBox, setHasHanukkahBox] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingConfig(true);
    getHanukkahConfig().then((config) => {
      if (cancelled) return;
      setLocked(isBoxLocked(config.lockAt));
      setLoadingConfig(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!household?.id) {
      setHasHanukkahBox(false);
      return;
    }
    ordersService.listForHousehold(household.id).then((orders) => {
      if (cancelled) return;
      setHasHanukkahBox(hasActiveHanukkahBoxOrder(orders));
    });
    return () => {
      cancelled = true;
    };
  }, [household?.id]);

  const loading = catalogLoading || loadingConfig;
  const inBox = useMemo(() => lineItems.some((li) => li.itemId === itemId), [lineItems, itemId]);
  const tier = item ? inferPricingTier(item) : 'included';
  const unitCents = item ? unitCentsForTier(tier, item.dollarCostCents) : 0;
  const isPaid = unitCents > 0;
  const details = useMemo(() => (item ? detailRowsFromItem(item) : []), [item]);

  const persist = async (next: BoxLineItem[]) => {
    setSaving(true);
    try {
      await saveDraft(next);
    } finally {
      setSaving(false);
    }
  };

  const addToBox = async () => {
    if (!item || locked || inBox) return;
    if (isPaid && !guardMutation()) return;
    await persist([
      ...lineItems,
      {
        slotId: item.slotId,
        itemId: item.id,
        quantity: 1,
        unitCents,
        label: item.name,
      },
    ]);
    navigation.goBack();
  };

  const removeFromBox = async () => {
    if (locked) return;
    await persist(lineItems.filter((li) => li.itemId !== itemId));
    navigation.goBack();
  };

  const pageBg = colors.bgPrimary;

  if (loading || draftLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: pageBg }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={[styles.centered, { backgroundColor: pageBg }]}>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.md }}>
          Product not found.
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: colors.textPrimary, fontWeight: '500', letterSpacing: 0.3 }}>
            Go back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const buyColumn = (
    <View style={[styles.buy, isDesktop && styles.buyDesktop]}>
      <Text style={[styles.name, { color: colors.textPrimary }]}>{item.name}</Text>
      {item.description ? (
        <Text style={[styles.desc, { color: colors.textSecondary }]}>{item.description}</Text>
      ) : null}

      <View style={[styles.priceRule, { borderTopColor: colors.border }]}>
        <ProductPricingBlock
          item={item}
          hasHanukkahBox={hasHanukkahBox}
          onWhatsInTheBox={() => navigation.navigate('MyBox')}
        />
      </View>

      {isPaid ? (
        <Text style={[styles.chargeNote, { color: colors.textTertiary }]}>
          Added to your box — charged when it ships.
        </Text>
      ) : null}

      <TouchableOpacity
        style={[
          styles.cta,
          { backgroundColor: colors.textPrimary },
          (locked || saving) && styles.ctaDisabled,
        ]}
        onPress={inBox ? removeFromBox : addToBox}
        disabled={locked || saving}
        accessibilityRole="button"
      >
        {saving ? (
          <ActivityIndicator color={colors.bgPrimary} />
        ) : (
          <Text style={[styles.ctaText, { color: colors.bgPrimary }]}>
            {inBox ? 'Remove from box' : 'Add to box'}
          </Text>
        )}
      </TouchableOpacity>

      {details.length > 0 ? (
        <View style={[styles.details, { borderTopColor: colors.border }]}>
          <Text style={[styles.detailsHeading, { color: colors.textPrimary }]}>Details</Text>
          {details.map((row) => (
            <View key={row.label} style={[styles.detailRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.detailLabel, { color: colors.textTertiary }]}>{row.label}</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{row.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );

  return (
    <WebContentPanel wide>
      <ScrollView
        style={[styles.root, { backgroundColor: pageBg }]}
        contentContainerStyle={[
          styles.content,
          isDesktop && { maxWidth: widePanelMaxWidth, alignSelf: 'center', width: '100%' },
        ]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
          <Text style={[styles.backLink, { color: colors.textPrimary }]}>Back</Text>
        </TouchableOpacity>

        <View style={[styles.split, isDesktop && styles.splitDesktop]}>
          <View style={[styles.galleryCol, isDesktop && styles.galleryColDesktop]}>
            <ProductImageGallery
              itemId={item.id}
              imageUrl={item.imageUrl}
              imageUrls={item.imageUrls}
            />
          </View>
          {buyColumn}
        </View>
      </ScrollView>
    </WebContentPanel>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 140,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  backRow: { marginBottom: spacing.lg },
  backLink: {
    fontSize: typography.sm,
    fontWeight: '500',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  split: {
    flexDirection: 'column',
    gap: spacing.xxl,
  },
  splitDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xxl,
  },
  galleryCol: {
    width: '100%',
  },
  galleryColDesktop: {
    flex: 0.55,
    maxWidth: '55%',
  },
  buy: {
    width: '100%',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  buyDesktop: {
    flex: 0.45,
    maxWidth: '42%',
    paddingTop: spacing.md,
  },
  name: {
    fontSize: 28,
    fontWeight: '400',
    letterSpacing: 0.2,
    lineHeight: 34,
    textAlign: 'left',
  },
  desc: {
    fontSize: typography.md,
    lineHeight: 22,
    letterSpacing: 0.15,
    textAlign: 'left',
    maxWidth: 440,
  },
  priceRule: {
    marginTop: spacing.sm,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    width: '100%',
  },
  chargeNote: {
    fontSize: typography.sm,
    letterSpacing: 0.2,
  },
  cta: {
    paddingVertical: 16,
    paddingHorizontal: spacing.xl,
    borderRadius: 0,
    marginTop: spacing.md,
    minWidth: 200,
    alignItems: 'center',
    alignSelf: 'stretch',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  ctaDisabled: { opacity: 0.55 },
  ctaText: {
    fontWeight: '500',
    fontSize: typography.sm,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  details: {
    marginTop: spacing.xl,
    paddingTop: spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    width: '100%',
    gap: 0,
  },
  detailsHeading: {
    fontSize: typography.sm,
    fontWeight: '500',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  detailRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  detailValue: {
    fontSize: typography.md,
    lineHeight: 22,
    letterSpacing: 0.15,
    fontWeight: '400',
  },
});
