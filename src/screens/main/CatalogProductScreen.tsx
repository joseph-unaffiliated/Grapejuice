import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { catalogService } from '../../services/firestore/catalog';
import { getHanukkahConfig, isBoxLocked } from '../../services/firestore/config';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import { inferPricingTier, unitCentsForTier } from '../../services/box/pricing';
import { BoxItemImage } from '../../components/box/BoxItemImage';
import type { MainStackParamList } from '../../navigation/types';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { semanticColors, spacing, typography, borderRadius, shadowsWeb } from '../../constants/theme';

export function CatalogProductScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'CatalogProduct'>>();
  const { itemId } = route.params;
  const { lineItems, loading: draftLoading, persist: saveDraft } = useBoxDraft();
  const { guardMutation } = usePaymentGate();
  const [item, setItem] = useState<CatalogItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [catalog, config] = await Promise.all([catalogService.getAll(), getHanukkahConfig()]);
    setItem(catalog.find((c) => c.id === itemId) ?? null);
    setLocked(isBoxLocked(config.lockAt));
    setLoading(false);
  }, [itemId]);

  useEffect(() => {
    load();
  }, [load]);

  const inBox = useMemo(() => lineItems.some((li) => li.itemId === itemId), [lineItems, itemId]);
  const tier = item ? inferPricingTier(item) : 'included';
  const unitCents = item ? unitCentsForTier(tier, item.dollarCostCents) : 0;
  const isPaid = unitCents > 0;

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
      <View style={styles.centered}>
        <ActivityIndicator color={semanticColors.brand} />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Product not found.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <WebContentPanel wide>
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
          <Text style={styles.backLink}>← Back</Text>
        </TouchableOpacity>
        <View style={[styles.card, Platform.OS === 'web' ? { boxShadow: shadowsWeb.sm } : undefined]}>
          <BoxItemImage size={200} imageUrl={item.imageUrl} itemId={item.id} style={styles.image} />
          <Text style={styles.name}>{item.name}</Text>
          {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
          <Text style={styles.price}>
            {unitCents > 0 ? formatCatalogDollars(unitCents) : 'Included in box'}
          </Text>
          {isPaid ? (
            <Text style={styles.chargeNote}>Added to your box — charged when it ships.</Text>
          ) : null}
          <TouchableOpacity
            style={[styles.cta, (locked || saving) && styles.ctaDisabled]}
            onPress={inBox ? removeFromBox : addToBox}
            disabled={locked || saving}
          >
            {saving ? (
              <ActivityIndicator color={semanticColors.textInverse} />
            ) : (
              <Text style={styles.ctaText}>{inBox ? 'Remove from box' : 'Add to box'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </WebContentPanel>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semanticColors.bgPrimary },
  content: { padding: spacing.lg, paddingBottom: 120 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  backRow: { marginBottom: spacing.md },
  backLink: { color: semanticColors.brand, fontWeight: '600' },
  card: {
    backgroundColor: semanticColors.bgPrimary,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  image: { borderRadius: borderRadius.md, backgroundColor: 'rgba(0,0,0,0.05)' },
  name: { fontSize: typography.xl, fontWeight: '700', textAlign: 'center' },
  desc: { fontSize: typography.md, color: semanticColors.textSecondary, textAlign: 'center', lineHeight: 20 },
  price: { fontSize: typography.xl, fontWeight: '600', marginTop: spacing.sm },
  chargeNote: { fontSize: typography.sm, color: semanticColors.textTertiary, textAlign: 'center' },
  cta: {
    backgroundColor: semanticColors.brand,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    marginTop: spacing.lg,
    minWidth: 200,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: semanticColors.textInverse, fontWeight: '700', fontSize: typography.lg },
  emptyText: { color: semanticColors.textSecondary, marginBottom: spacing.md },
});
