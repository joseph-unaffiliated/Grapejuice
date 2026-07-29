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
import { useWebLayout } from '../../hooks/useWebLayout';
import { getHanukkahConfig, isBoxLocked } from '../../services/firestore/config';
import { inferPricingTier, unitCentsForTier } from '../../services/box/pricing';
import { ProductImageGallery } from '../../components/catalog/ProductImageGallery';
import { ProductPricingBlock } from '../../components/catalog/ProductPricingBlock';
import type { MainStackParamList } from '../../navigation/types';
import type { BoxLineItem } from '../../types/pilot';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { spacing, typography, borderRadius } from '../../constants/theme';
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

export function CatalogProductScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'CatalogProduct'>>();
  const { itemId } = route.params;
  const { colors } = useThemeMode();
  const { isDesktop, widePanelMaxWidth } = useWebLayout();
  const { lineItems, loading: draftLoading, persist: saveDraft } = useBoxDraft();
  const { guardMutation, canMutateBox } = usePaymentGate();
  const { items: catalog, loading: catalogLoading } = useCatalog();
  const item = useMemo(
    () => catalog.find((c) => c.id === itemId) ?? null,
    [catalog, itemId]
  );
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(false);

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

  if (loading || draftLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bgElevated }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bgElevated }]}>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.md }}>
          Product not found.
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: colors.brand, fontWeight: '600' }}>Go back</Text>
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

      <ProductPricingBlock
        item={item}
        onBoxPath={canMutateBox}
        onWhatsInTheBox={() => navigation.navigate('MyBox')}
      />

      {isPaid ? (
        <Text style={[styles.chargeNote, { color: colors.textTertiary }]}>
          Added to your box — charged when it ships.
        </Text>
      ) : null}

      <TouchableOpacity
        style={[
          styles.cta,
          { backgroundColor: colors.brand },
          (locked || saving) && styles.ctaDisabled,
        ]}
        onPress={inBox ? removeFromBox : addToBox}
        disabled={locked || saving}
        accessibilityRole="button"
      >
        {saving ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <Text style={[styles.ctaText, { color: colors.textInverse }]}>
            {inBox ? 'Remove from box' : 'Add to box'}
          </Text>
        )}
      </TouchableOpacity>

      {details.length > 0 ? (
        <View style={styles.details}>
          <Text style={[styles.detailsHeading, { color: colors.textPrimary }]}>Details</Text>
          {details.map((row) => (
            <View key={row.label} style={[styles.detailRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{row.label}</Text>
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
        style={[styles.root, { backgroundColor: colors.bgElevated }]}
        contentContainerStyle={[
          styles.content,
          isDesktop && { maxWidth: widePanelMaxWidth, alignSelf: 'center', width: '100%' },
        ]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
          <Text style={{ color: colors.brand, fontWeight: '600' }}>← Back</Text>
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
    padding: spacing.lg,
    paddingBottom: 120,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  backRow: { marginBottom: spacing.md },
  split: {
    flexDirection: 'column',
    gap: spacing.xl,
  },
  splitDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xl,
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
    maxWidth: '45%',
    paddingTop: spacing.sm,
  },
  name: {
    fontSize: typography.titleLg + 6,
    fontWeight: '700',
    letterSpacing: -0.4,
    textAlign: 'left',
  },
  desc: {
    fontSize: typography.md,
    lineHeight: 22,
    textAlign: 'left',
  },
  chargeNote: {
    fontSize: typography.sm,
  },
  cta: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
    minWidth: 200,
    alignItems: 'center',
    alignSelf: 'stretch',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { fontWeight: '700', fontSize: typography.lg },
  details: {
    marginTop: spacing.lg,
    width: '100%',
    gap: spacing.sm,
  },
  detailsHeading: {
    fontSize: typography.lg,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  detailRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  detailLabel: {
    fontSize: typography.sm,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  detailValue: {
    fontSize: typography.md,
    lineHeight: 22,
  },
});
