import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ChildProfile, FamiliarityLevel } from '../../types/pilot';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import { catalogService } from '../../services/firestore/catalog';
import { getHanukkahConfig } from '../../services/firestore/config';
import { formatDollars } from '../../services/box/buildDefaultBox';
import { inferPricingTier } from '../../services/box/pricing';
import { BoxItemRow } from '../../components/box/BoxItemRow';
import { StickySectionNav } from '../../components/box/StickySectionNav';
import { BoxDetailToolbar } from '../../components/box/BoxDetailToolbar';
import { BoxDetailSectionBlock } from '../../components/box/BoxDetailSectionBlock';
import { BoxDetailReviewCta } from '../../components/box/BoxDetailReviewCta';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import {
  BOX_DISPLAY_SECTIONS,
  groupLineItemsByDisplaySection,
  type BoxDisplaySectionId,
} from '../../constants/boxDisplaySections';
import { createBoxDetailStyles } from '../../components/box/boxDetailLayout';
import { useBoxDetailScroll } from '../../hooks/useBoxDetailScroll';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

type Props = {
  children: ChildProfile[];
  familiarity: FamiliarityLevel;
  lineItems: BoxLineItem[];
  onDone: () => void | Promise<void>;
  completing?: boolean;
};

/** Figma 370:3514 — curated box reveal with section tabs and item cards. */
export function BoxRevealScreen({ children, lineItems, onDone, completing }: Props) {
  const { colors } = useThemeMode();
  const detailStyles = useMemo(() => createBoxDetailStyles(colors), [colors]);
  const styles = useMemo(() => createRevealStyles(colors), [colors]);
  const { scrollRef, activeSection, onSectionLayout, onScroll, scrollToSection } = useBoxDetailScroll();

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lockAt, setLockAt] = useState<string | null>(null);
  const [startsOn, setStartsOn] = useState<string | null>(null);
  const [estimatedDeliveryBy, setEstimatedDeliveryBy] = useState<string | null>(null);
  const [now] = useState(() => new Date());

  useEffect(() => {
    Promise.all([catalogService.getAll(), getHanukkahConfig()]).then(([items, config]) => {
      setCatalog(items);
      setLockAt(config.lockAt);
      setStartsOn(config.startsOn);
      setEstimatedDeliveryBy(config.estimatedDeliveryBy);
      setLoading(false);
    });
  }, []);

  const includedItems = useMemo(
    () =>
      lineItems.filter((li) => {
        const item = catalog.find((c) => c.id === li.itemId);
        if (!item) return true;
        const tier = inferPricingTier(item);
        return tier === 'included' || tier === 'perKid';
      }),
    [lineItems, catalog]
  );

  const grouped = useMemo(() => groupLineItemsByDisplaySection(includedItems), [includedItems]);

  const renderSection = (sectionId: BoxDisplaySectionId) => {
    const items = grouped[sectionId];
    if (!items.length) return null;

    return (
      <BoxDetailSectionBlock
        key={sectionId}
        sectionId={sectionId}
        onLayout={onSectionLayout(sectionId)}
      >
        {items.map((li) => {
          const item = catalog.find((c) => c.id === li.itemId);
          const kid = children.find((c) => c.id === li.childId);
          return (
            <BoxItemRow
              key={li.slotId + li.itemId}
              variant="card"
              li={li}
              item={item}
              meta={kid ? `For ${kid.name || 'your kid'}` : undefined}
              locked
              previewChips
              swapOptions={[]}
              onSwap={() => {}}
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

  return (
    <SafeAreaView style={styles.safeArea} edges={Platform.OS === 'web' ? [] : ['top']}>
      <WebContentPanel gutter>
        <ScrollView
          ref={scrollRef}
          style={styles.root}
          contentContainerStyle={detailStyles.scrollContent}
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          <BoxDetailToolbar
            lockAt={lockAt}
            now={now}
            startsOn={startsOn}
            estimatedDeliveryBy={estimatedDeliveryBy}
          />
          <StickySectionNav activeSection={activeSection} onSelect={scrollToSection} />
          {BOX_DISPLAY_SECTIONS.map((s) => renderSection(s.id))}
          <BoxDetailReviewCta
            onPress={() => void onDone()}
            disabled={completing}
            loading={completing}
          />
        </ScrollView>
      </WebContentPanel>
    </SafeAreaView>
  );
}

function createRevealStyles(colors: SemanticColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.bgPrimary },
    root: { flex: 1, backgroundColor: colors.bgPrimary },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgPrimary },
  });
}
