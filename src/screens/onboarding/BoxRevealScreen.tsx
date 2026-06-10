import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ChildProfile, FamiliarityLevel } from '../../types/pilot';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import { catalogService } from '../../services/firestore/catalog';
import { inferPricingTier } from '../../services/box/pricing';
import { BoxItemImage } from '../../components/box/BoxItemImage';
import { semanticColors, spacing, typography, borderRadius, shadowsWeb, MOBILE_GUTTER } from '../../constants/theme';

const FAMILIARITY_LABEL: Record<FamiliarityLevel, string> = {
  minimal: 'keeping it simple',
  moderate: 'somewhere in the middle',
  'all-in': 'all in',
};

type Props = {
  children: ChildProfile[];
  familiarity: FamiliarityLevel;
  lineItems: BoxLineItem[];
  onDone: () => void | Promise<void>;
  completing?: boolean;
};

export function BoxRevealScreen({ children, familiarity, lineItems, onDone, completing }: Props) {
  const [phase, setPhase] = useState<'recap' | 'reveal' | 'done'>('recap');
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    catalogService.getAll().then(setCatalog);
  }, []);

  useEffect(() => {
    if (phase !== 'reveal') return;
    fade.setValue(0);
    slide.setValue(24);
    const useNative = Platform.OS !== 'web';
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 600, useNativeDriver: useNative }),
      Animated.timing(slide, { toValue: 0, duration: 600, useNativeDriver: useNative }),
    ]).start(({ finished }) => {
      if (finished) setPhase('done');
    });
  }, [phase, fade, slide]);

  const kidSummary =
    children.length === 0
      ? 'your household'
      : children.map((c) => `${c.name || 'Kid'} (${c.ageGroup})`).join(', ');

  const includedItems = lineItems.filter((li) => {
    const item = catalog.find((c) => c.id === li.itemId);
    if (!item) return true;
    const tier = inferPricingTier(item);
    return tier === 'included' || tier === 'perKid';
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.root}>
        {phase === 'recap' ? (
        <View style={styles.centerBlock}>
          <Text style={styles.eyebrow}>Curated for you</Text>
          <Text style={styles.title}>We built your Hanukkah box</Text>
          <Text style={styles.body}>
            Based on what you told us: {kidSummary}. You&apos;re {FAMILIARITY_LABEL[familiarity]} —
            so we picked items that match that energy.
          </Text>
          <TouchableOpacity
            style={[styles.button, Platform.OS === 'web' ? { boxShadow: shadowsWeb.goldGlow } : undefined]}
            onPress={() => setPhase('reveal')}
          >
            <Text style={styles.buttonText}>Reveal my box</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Animated.View
          style={[
            styles.revealBlock,
            { opacity: fade, transform: [{ translateY: slide }] },
          ]}
        >
          <Text style={styles.title}>Your Hanukkah box</Text>
          <Text style={styles.sub}>{includedItems.length} items inside</Text>
          <Text style={styles.hint}>You can swap kid picks and add extras from My Box on Home.</Text>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {includedItems.map((li) => {
              const item = catalog.find((c) => c.id === li.itemId);
              return (
                <View key={li.slotId + li.itemId} style={styles.row}>
                  <BoxItemImage size={56} imageUrl={item?.imageUrl} itemId={item?.id ?? li.itemId} />
                  <View style={styles.rowText}>
                    <Text style={styles.itemName}>{li.label ?? item?.name ?? li.itemId}</Text>
                    {li.childId ? (
                      <Text style={styles.itemMeta}>For {children.find((c) => c.id === li.childId)?.name ?? 'your kid'}</Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </ScrollView>
          {phase === 'done' ? (
            <TouchableOpacity
              style={[styles.button, completing && styles.buttonDisabled]}
              onPress={() => void onDone()}
              disabled={completing}
            >
              {completing ? (
                <ActivityIndicator color={semanticColors.textPrimary} />
              ) : (
                <Text style={styles.buttonText}>Go to Home</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </Animated.View>
      )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: semanticColors.bgPrimary },
  root: {
    flex: 1,
    backgroundColor: semanticColors.bgPrimary,
    paddingHorizontal: MOBILE_GUTTER,
    paddingTop: spacing.md,
  },
  centerBlock: { flex: 1, justifyContent: 'center' },
  revealBlock: { flex: 1 },
  eyebrow: { fontSize: typography.sm, color: semanticColors.goldMuted, fontWeight: '600', textTransform: 'uppercase' },
  title: { fontSize: 26, fontWeight: '700', color: semanticColors.textPrimary, marginTop: spacing.sm, marginBottom: spacing.md },
  sub: { fontSize: typography.md, color: semanticColors.textSecondary, marginBottom: spacing.xs },
  hint: { fontSize: typography.sm, color: semanticColors.goldMuted, marginBottom: spacing.lg, lineHeight: 18 },
  body: { fontSize: typography.lg, lineHeight: 22, color: semanticColors.textSecondary, marginBottom: spacing.xl },
  button: {
    backgroundColor: semanticColors.brand,
    borderRadius: borderRadius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  buttonText: { fontSize: typography.xl, fontWeight: '600', color: semanticColors.textPrimary },
  buttonDisabled: { opacity: 0.7 },
  list: { flex: 1 },
  listContent: { paddingBottom: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: semanticColors.accentCream,
  },
  rowText: { flex: 1 },
  itemName: { fontSize: typography.lg, fontWeight: '600', color: semanticColors.textPrimary },
  itemMeta: { fontSize: typography.sm, color: semanticColors.goldMuted, marginTop: 2 },
});
