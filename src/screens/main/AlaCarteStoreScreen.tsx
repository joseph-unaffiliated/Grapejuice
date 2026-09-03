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
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useBoxDraft } from '../../hooks/useBoxDraft';
import { useCatalog } from '../../hooks/useCatalog';
import { getHanukkahConfig, isBoxLocked } from '../../services/firestore/config';
import { formatDollars } from '../../services/box/buildDefaultBox';
import { inferPricingTier, unitCentsForTier } from '../../services/box/pricing';
import { BoxItemImage } from '../../components/box/BoxItemImage';
import type { MainStackParamList } from '../../navigation/types';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { semanticColors, spacing, typography, borderRadius, shadowsWeb } from '../../constants/theme';

export function AlaCarteStoreScreen() {
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <AlaCarteStoreBody />
    </StorefrontChrome>
  );
}

function AlaCarteStoreBody() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const { lineItems, loading: draftLoading, persist: saveDraft } = useBoxDraft();
  const { items: catalog, loading: catalogLoading } = useCatalog();
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(false);

  const storeItems = useMemo(
    () => catalog.filter((item) => inferPricingTier(item) === 'alaCarte'),
    [catalog]
  );

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

  const isInBox = (itemId: string) => lineItems.some((li) => li.itemId === itemId);

  const persist = async (next: BoxLineItem[]) => {
    setSaving(true);
    try {
      await saveDraft(next);
    } finally {
      setSaving(false);
    }
  };

  const addItem = async (item: CatalogItem) => {
    if (locked || isInBox(item.id)) return;
    const tier = inferPricingTier(item);
    const next: BoxLineItem[] = [
      ...lineItems,
      {
        slotId: item.slotId,
        itemId: item.id,
        quantity: 1,
        unitCents: unitCentsForTier(tier, item.dollarCostCents),
        label: item.name,
      },
    ];
    await persist(next);
  };

  const removeItem = async (itemId: string) => {
    if (locked) return;
    await persist(lineItems.filter((li) => li.itemId !== itemId));
  };

  if (loading || draftLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={semanticColors.brand} />
      </View>
    );
  }

  return (
    <WebContentPanel wide>
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
        <Text style={styles.backLink}>← Back to My Box</Text>
      </TouchableOpacity>

      <Text style={styles.title}>À la carte</Text>
      <Text style={styles.subtitle}>Add a keepsake hanukkiah or dreidel to your shipment.</Text>

      {storeItems.map((item) => {
        const added = isInBox(item.id);
        const cardStyle = [
          styles.card,
          Platform.OS === 'web' ? { boxShadow: shadowsWeb.sm } : undefined,
        ];
        return (
          <View key={item.id} style={cardStyle}>
            <BoxItemImage size={80} imageUrl={item.imageUrl} itemId={item.id} />
            <View style={styles.cardBody}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemDesc}>{item.description}</Text>
              <Text style={styles.itemPrice}>{formatDollars(item.dollarCostCents)}</Text>
              <TouchableOpacity
                style={[styles.cta, added && styles.ctaAdded, (locked || saving) && styles.ctaDisabled]}
                onPress={() => (added ? removeItem(item.id) : addItem(item))}
                disabled={locked || saving}
              >
                <Text style={[styles.ctaText, added && styles.ctaTextAdded]}>
                  {added ? 'Remove from box' : 'Add to box'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}

      {storeItems.length === 0 ? (
        <Text style={styles.empty}>No à la carte items available yet.</Text>
      ) : null}
      </ScrollView>
    </WebContentPanel>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semanticColors.bgPrimary },
  content: { paddingBottom: 120 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backRow: { marginBottom: spacing.md },
  backLink: { color: semanticColors.brand, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: spacing.xs },
  subtitle: { fontSize: typography.md, color: semanticColors.textSecondary, marginBottom: spacing.lg },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: semanticColors.accentCream,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardBody: { flex: 1 },
  itemName: { fontSize: typography.lg, fontWeight: '600' },
  itemDesc: { fontSize: typography.md, color: semanticColors.textSecondary, marginTop: 4 },
  itemPrice: { fontSize: typography.lg, fontWeight: '700', marginTop: spacing.sm },
  cta: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: semanticColors.brand,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.pill,
  },
  ctaAdded: { backgroundColor: semanticColors.bgPrimary, borderWidth: 1, borderColor: semanticColors.border },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { fontWeight: '600', color: semanticColors.textPrimary },
  ctaTextAdded: { color: semanticColors.textSecondary },
  empty: { color: semanticColors.textTertiary, textAlign: 'center', marginTop: spacing.xl },
});
