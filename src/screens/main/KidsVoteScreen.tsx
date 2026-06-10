import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useBoxDraft } from '../../hooks/useBoxDraft';
import { catalogService } from '../../services/firestore/catalog';
import { inferPricingTier } from '../../services/box/pricing';
import { catalogSlotId, unitCentsForTier } from '../../services/box/buildDefaultBox';
import { defaultIsSurprise } from '../../constants/boxPracticeGroups';
import type { CatalogItem } from '../../types/pilot';
import type { MainStackParamList } from '../../navigation/types';
import { BoxItemImage } from '../../components/box/BoxItemImage';
import { semanticColors, spacing, typography, borderRadius } from '../../constants/theme';
import { ThemeProvider, useThemeMode } from '../../context/ThemeContext';

type Nav = StackNavigationProp<MainStackParamList>;

function KidsVoteContent() {
  const navigation = useNavigation<Nav>();
  const { colors } = useThemeMode();
  const { lineItems, children, persist, loading } = useBoxDraft();
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [votes, setVotes] = useState<Record<string, string>>({});

  useEffect(() => {
    catalogService.getAll().then(setCatalog);
  }, []);

  const perKidItems = lineItems.filter((li) => {
    const base = catalogSlotId(li.slotId);
    return base.startsWith('story') || base.startsWith('gift');
  });

  const optionsFor = async (li: typeof lineItems[0]) => {
    const current = catalog.find((c) => c.id === li.itemId);
    const slot = catalogSlotId(li.slotId);
    const ids = current?.swapOptions?.length ? current.swapOptions : [];
    const alts = ids.length
      ? await catalogService.getMany(ids)
      : catalog.filter((c) => c.slotId === slot && c.id !== li.itemId);
    return [current, ...alts.filter(Boolean)].filter(Boolean) as CatalogItem[];
  };

  const [optionMap, setOptionMap] = useState<Record<string, CatalogItem[]>>({});

  useEffect(() => {
    (async () => {
      const map: Record<string, CatalogItem[]> = {};
      for (const li of perKidItems) {
        map[li.slotId] = await optionsFor(li);
      }
      setOptionMap(map);
    })();
  }, [lineItems, catalog]);

  const castVote = (slotId: string, itemId: string) => {
    setVotes((v) => ({ ...v, [slotId]: itemId }));
  };

  const applyVotes = async () => {
    const next = lineItems.map((li) => {
      const pick = votes[li.slotId];
      if (!pick || pick === li.itemId) return li;
      const item = catalog.find((c) => c.id === pick);
      if (!item) return li;
      const tier = inferPricingTier(item);
      return {
        ...li,
        itemId: item.id,
        unitCents: unitCentsForTier(tier, item.dollarCostCents),
        label: item.name,
      };
    });
    await persist(next);
    navigation.goBack();
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bgPrimary }]}>
        <Text style={{ color: colors.textPrimary }}>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.root, { backgroundColor: colors.bgPrimary }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Kids&apos; corner</Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        Tap your favorites — a grown-up makes the final call at checkout.
      </Text>

      {perKidItems.map((li) => {
        const kid = children.find((c) => c.id === li.childId);
        const opts = optionMap[li.slotId] ?? [];
        const wrapped = li.isSurprise ?? defaultIsSurprise(li.slotId);
        return (
          <View key={li.slotId} style={[styles.card, { backgroundColor: colors.bgElevated }]}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
              {kid?.name ? `${kid.name}'s pick` : 'Your pick'}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
              {opts.map((opt) => {
                const selected = votes[li.slotId] === opt.id || (!votes[li.slotId] && opt.id === li.itemId);
                if (wrapped && opt.id !== li.itemId) {
                  return (
                    <View key={opt.id} style={[styles.wrapped, selected && styles.wrappedSelected]}>
                      <Text style={styles.wrappedEmoji}>🎁</Text>
                      <Text style={styles.wrappedText}>Surprise!</Text>
                    </View>
                  );
                }
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.option, selected && styles.optionSelected]}
                    onPress={() => castVote(li.slotId, opt.id)}
                  >
                    <BoxItemImage size={64} imageUrl={opt.imageUrl} itemId={opt.id} />
                    <Text style={[styles.optionName, { color: colors.textPrimary }]} numberOfLines={2}>
                      {opt.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        );
      })}

      <TouchableOpacity style={[styles.cta, { backgroundColor: colors.brand }]} onPress={() => void applyVotes()}>
        <Text style={[styles.ctaText, { color: colors.textInverse }]}>Send votes to parents</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
        <Text style={{ color: colors.textSecondary }}>Back to Account</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

export function KidsVoteScreen() {
  return (
    <ThemeProvider mode="kid">
      <KidsVoteContent />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 120 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '700' },
  sub: { fontSize: typography.md, marginTop: spacing.xs, marginBottom: spacing.lg, lineHeight: 20 },
  card: { borderRadius: borderRadius.xl, padding: spacing.md, marginBottom: spacing.md },
  cardTitle: { fontSize: typography.xl, fontWeight: '700', marginBottom: spacing.sm },
  row: { gap: spacing.sm },
  option: {
    width: 110,
    padding: spacing.sm,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionSelected: { borderColor: semanticColors.brand, backgroundColor: 'rgba(255,255,255,0.08)' },
  optionName: { fontSize: typography.sm, textAlign: 'center', marginTop: spacing.xs },
  wrapped: {
    width: 110,
    height: 110,
    borderRadius: borderRadius.lg,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrappedSelected: { borderWidth: 2, borderColor: semanticColors.brand },
  wrappedEmoji: { fontSize: 32 },
  wrappedText: { fontSize: typography.sm, color: semanticColors.textSecondary, marginTop: 4 },
  cta: { padding: spacing.md, borderRadius: borderRadius.md, alignItems: 'center', marginTop: spacing.lg },
  ctaText: { fontWeight: '700', fontSize: typography.lg },
  back: { alignItems: 'center', marginTop: spacing.lg, padding: spacing.md },
});
