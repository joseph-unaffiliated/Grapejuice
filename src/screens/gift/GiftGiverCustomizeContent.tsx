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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { MainStackParamList } from '../../navigation/types';
import { formatDollars } from '../../services/box/buildDefaultBox';
import { inferPricingTier } from '../../services/box/pricing';
import type { BoxLineItem, CatalogItem, ChildProfile } from '../../types/pilot';
import { BoxItemRow } from '../../components/box/BoxItemRow';
import { StickySectionNav } from '../../components/box/StickySectionNav';
import { BoxDetailToolbar } from '../../components/box/BoxDetailToolbar';
import { BoxDetailSectionBlock } from '../../components/box/BoxDetailSectionBlock';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import {
  groupLineItemsByDisplaySection,
  nonEmptyDisplaySectionIds,
  type BoxDisplaySectionId,
} from '../../constants/boxDisplaySections';
import { createBoxDetailStyles } from '../../components/box/boxDetailLayout';
import { useBoxDetailScroll } from '../../hooks/useBoxDetailScroll';
import { useThemeMode } from '../../context/ThemeContext';
import { semanticColors, spacing, typography, borderRadius } from '../../constants/theme';
import type { GiftGiveFormValues } from './giftGiveTypes';

type Props = {
  form: GiftGiveFormValues;
  catalog: CatalogItem[];
  lineItems: BoxLineItem[];
  kidProfiles: ChildProfile[];
  loading: boolean;
  submitting: boolean;
  applySwap: (slotId: string, item: CatalogItem) => void;
  swapOptionsFor: (li: BoxLineItem) => CatalogItem[];
  onPay: () => void;
  paymentSlot?: React.ReactNode;
};

export function GiftGiverCustomizeContent({
  form,
  catalog,
  lineItems,
  kidProfiles,
  loading,
  submitting,
  applySwap,
  swapOptionsFor,
  onPay,
  paymentSlot,
}: Props) {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const { colors } = useThemeMode();
  const detailStyles = useMemo(() => createBoxDetailStyles(colors), [colors]);
  const [catalogById, setCatalogById] = useState<Record<string, CatalogItem>>({});

  useEffect(() => {
    const map: Record<string, CatalogItem> = {};
    catalog.forEach((c) => {
      map[c.id] = c;
    });
    setCatalogById(map);
  }, [catalog]);

  const includedItems = useMemo(
    () =>
      lineItems.filter((li) => {
        const item = catalogById[li.itemId];
        if (!item) return true;
        const tier = inferPricingTier(item);
        return tier === 'included' || tier === 'perKid';
      }),
    [lineItems, catalogById]
  );

  const grouped = useMemo(() => groupLineItemsByDisplaySection(includedItems), [includedItems]);
  const visibleSectionIds = useMemo(
    () => nonEmptyDisplaySectionIds(grouped),
    [grouped],
  );
  const { scrollRef, contentRef, activeSection, registerSection, onSectionLayout, onScroll, scrollToSection } =
    useBoxDetailScroll({ visibleSectionIds });

  const renderSection = (sectionId: BoxDisplaySectionId) => {
    const items = grouped[sectionId];
    if (!items.length) return null;

    return (
      <BoxDetailSectionBlock
        key={sectionId}
        sectionId={sectionId}
        onLayout={onSectionLayout(sectionId)}
        onSectionRef={registerSection}
        itemCount={items.length}
      >
        {items.map((li) => {
          const item = catalogById[li.itemId];
          const kid = kidProfiles.find((c) => c.id === li.childId);
          return (
            <BoxItemRow
              key={li.slotId + li.itemId}
              variant="card"
              li={li}
              item={item}
              meta={kid ? `For kid ${kidProfiles.indexOf(kid) + 1}` : undefined}
              locked={false}
              swapOptions={swapOptionsFor(li)}
              onSwap={(nextItem) => applySwap(li.slotId, nextItem)}
              formatPrice={formatDollars}
            />
          );
        })}
      </BoxDetailSectionBlock>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (paymentSlot) {
    return (
      <SafeAreaView style={styles.safeArea} edges={[]}>
        <WebContentPanel gutter>
          <ScrollView contentContainerStyle={styles.webPaymentContent}>
            <BoxDetailToolbar
              lockAt={null}
              now={new Date()}
              title="Pick their box"
              onBack={() => navigation.goBack()}
              showCalendar={false}
            />
            {paymentSlot}
          </ScrollView>
        </WebContentPanel>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={Platform.OS === 'web' ? [] : ['top']}>
      <WebContentPanel gutter>
        <Text style={styles.lead}>
          {form.giverName.trim() || 'You'} are picking this box — the family will see your choices when they claim the
          gift.
        </Text>
        <ScrollView
          ref={scrollRef}
          style={styles.root}
          contentContainerStyle={detailStyles.scrollContent}
          onScroll={onScroll}
          scrollEventThrottle={16}
          {...(Platform.OS === 'web'
            ? ({ className: 'gj-box-scroll', testID: 'box-vertical-scroll' } as object)
            : null)}
        >
          <View ref={contentRef} collapsable={false}>
            <BoxDetailToolbar
              lockAt={null}
              now={new Date()}
              title="Pick their box"
              onBack={() => navigation.goBack()}
              showCalendar={false}
            />
            {visibleSectionIds.length > 0 ? (
              <StickySectionNav
                activeSection={activeSection}
                onSelect={scrollToSection}
                sectionIds={visibleSectionIds}
              />
            ) : null}
            {visibleSectionIds.map((id) => renderSection(id))}
            <TouchableOpacity style={styles.cta} onPress={onPay} disabled={submitting}>
              {submitting ? (
                <ActivityIndicator color={semanticColors.textInverse} />
              ) : (
                <Text style={styles.ctaText}>Continue to payment</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </WebContentPanel>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: semanticColors.bgPrimary },
  root: { flex: 1, backgroundColor: semanticColors.bgPrimary },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: semanticColors.bgPrimary },
  lead: {
    fontSize: typography.md,
    lineHeight: 20,
    color: semanticColors.textSecondary,
    marginBottom: spacing.md,
    paddingTop: spacing.md,
  },
  cta: {
    backgroundColor: semanticColors.brand,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.xxl,
  },
  ctaText: { color: semanticColors.textInverse, fontWeight: '700', fontSize: typography.lg },
  webPaymentContent: { paddingBottom: spacing.xxl },
});
