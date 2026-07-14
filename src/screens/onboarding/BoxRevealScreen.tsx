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
import { useWebLayout } from '../../hooks/useWebLayout';
import { spacing, MOBILE_GUTTER } from '../../constants/theme';
import type { SemanticColors } from '../../constants/themeMode';

/** Matches HomeScreen desktop content top gap. */
const CONTENT_TOP_GAP_DESKTOP = 41;
const CONTENT_TOP_GAP = 24;

type Props = {
  children: ChildProfile[];
  familiarity: FamiliarityLevel;
  lineItems: BoxLineItem[];
  onDone: () => void | Promise<void>;
  completing?: boolean;
};

/** Figma 370:3514 — curated box reveal; desktop mirrors homepage centered content column. */
export function BoxRevealScreen({ children, lineItems, onDone, completing }: Props) {
  const { colors } = useThemeMode();
  const { isDesktop, layoutWidth } = useWebLayout();
  const detailStyles = useMemo(
    () => createBoxDetailStyles(colors, { desktop: isDesktop }),
    [colors, isDesktop]
  );
  const styles = useMemo(() => createRevealStyles(colors, isDesktop), [colors, isDesktop]);
  const { scrollRef, activeSection, registerSection, onSectionLayout, onScroll, scrollToSection } =
    useBoxDetailScroll();

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
        onSectionRef={registerSection}
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

  const body = (
    <>
      <BoxDetailToolbar
        lockAt={lockAt}
        now={now}
        startsOn={startsOn}
        estimatedDeliveryBy={estimatedDeliveryBy}
        align={isDesktop ? 'left' : 'center'}
      />
      <StickySectionNav activeSection={activeSection} onSelect={scrollToSection} />
      {BOX_DISPLAY_SECTIONS.map((s) => renderSection(s.id))}
      <BoxDetailReviewCta
        onPress={() => void onDone()}
        disabled={completing}
        loading={completing}
      />
    </>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={Platform.OS === 'web' ? [] : ['top']}>
      <WebContentPanel
        flush={isDesktop}
        gutter={!isDesktop}
        centerDesktop={isDesktop}
        omitDesktopTopPadding={isDesktop}
        style={styles.panel}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.root}
          contentContainerStyle={[
            detailStyles.scrollContent,
            styles.scrollContent,
            isDesktop && styles.scrollContentDesktop,
          ]}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          {isDesktop ? (
            <View style={[styles.contentColumn, { maxWidth: layoutWidth }]}>{body}</View>
          ) : (
            body
          )}
        </ScrollView>
      </WebContentPanel>
    </SafeAreaView>
  );
}

function createRevealStyles(colors: SemanticColors, isDesktop: boolean) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.bgPrimary, minHeight: 0 },
    panel: { overflow: 'visible' as const },
    root: { flex: 1, backgroundColor: colors.bgPrimary, width: '100%' },
    scrollContent: {
      paddingTop: isDesktop ? CONTENT_TOP_GAP_DESKTOP : CONTENT_TOP_GAP,
      paddingBottom: spacing.xxl,
      width: '100%',
    },
    scrollContentDesktop: {
      alignItems: 'stretch',
    },
    contentColumn: {
      width: '100%',
      alignSelf: 'center',
      paddingHorizontal: MOBILE_GUTTER,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgPrimary,
    },
  });
}
