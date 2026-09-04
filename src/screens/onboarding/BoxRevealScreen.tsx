import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  Animated,
  Easing,
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
import {
  OnboardingBuildLoader,
  BUILD_LOADER_REST_MESSAGE,
} from '../../components/onboarding/OnboardingBuildLoader';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import {
  groupLineItemsByDisplaySection,
  nonEmptyDisplaySectionIds,
  type BoxDisplaySectionId,
} from '../../constants/boxDisplaySections';
import { createBoxDetailStyles } from '../../components/box/boxDetailLayout';
import { useBoxDetailScroll } from '../../hooks/useBoxDetailScroll';
import { useThemeMode } from '../../context/ThemeContext';
import { useWebLayout } from '../../hooks/useWebLayout';
import { spacing, MOBILE_GUTTER } from '../../constants/theme';
import type { SemanticColors } from '../../constants/themeMode';
import { useOnboardingUnderStorefrontChrome } from '../../components/onboarding/onboardingChromeContext';

/** Matches HomeScreen desktop content top gap. */
const CONTENT_TOP_GAP_DESKTOP = 41;
const CONTENT_TOP_GAP = 24;

type Props = {
  children: ChildProfile[];
  familiarity: FamiliarityLevel;
  lineItems: BoxLineItem[];
  onDone: () => void | Promise<void>;
  completing?: boolean;
  /** Bottom CTA label — gift reveal uses "Back to My Gifts". */
  doneLabel?: string;
};

/** Cascade timing for the reveal — each block eases in shortly after the previous. */
const REVEAL_STAGGER_STEP_MS = 95;
const REVEAL_DURATION_MS = 430;
const REVEAL_LIFT_PX = 26;

/**
 * Fades a block in while lifting it up into place, delayed by its position in
 * the reveal so the box appears to assemble itself one row at a time. The step
 * is shorter than the duration, so entrances overlap — you clearly read them
 * arriving one after another rather than all at once.
 *
 * Once a block's entrance finishes we drop the transform entirely, which lets
 * children that rely on `position: sticky` (the section nav) work normally
 * again — a live transform on an ancestor breaks sticky.
 */
function RevealStagger({ index, children }: { index: number; children: React.ReactNode }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: REVEAL_DURATION_MS,
      delay: index * REVEAL_STAGGER_STEP_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    });
    anim.start(({ finished }) => {
      if (finished) setSettled(true);
    });
    return () => anim.stop();
  }, [index, progress]);

  const transform = settled
    ? undefined
    : [
        {
          translateY: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [REVEAL_LIFT_PX, 0],
          }),
        },
      ];

  return <Animated.View style={{ opacity: progress, transform }}>{children}</Animated.View>;
}

/** Figma 370:3514 — curated box reveal; desktop mirrors homepage centered content column. */
export function BoxRevealScreen({
  children,
  lineItems,
  onDone,
  completing,
  doneLabel = 'Review Box',
}: Props) {
  const { colors } = useThemeMode();
  const { isDesktop, layoutWidth } = useWebLayout();
  const underStorefrontChrome = useOnboardingUnderStorefrontChrome();
  const detailStyles = useMemo(
    () => createBoxDetailStyles(colors, { desktop: isDesktop }),
    [colors, isDesktop]
  );
  const styles = useMemo(() => createRevealStyles(colors, isDesktop), [colors, isDesktop]);

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

  const grouped = useMemo(
    () => groupLineItemsByDisplaySection(includedItems, catalog),
    [includedItems, catalog]
  );
  const visibleSectionIds = useMemo(
    () => nonEmptyDisplaySectionIds(grouped),
    [grouped],
  );
  const { scrollRef, contentRef, activeSection, registerSection, onSectionLayout, onScroll, scrollToSection, remeasureSections } =
    useBoxDetailScroll({ visibleSectionIds, contentReady: !loading });

  useEffect(() => {
    if (loading) return;
    const frame = requestAnimationFrame(() => remeasureSections());
    // Re-measure once the reveal cascade settles (blocks lift up during it).
    const settleMs =
      visibleSectionIds.length * REVEAL_STAGGER_STEP_MS + REVEAL_DURATION_MS + 60;
    const settleTimer = setTimeout(() => remeasureSections(), settleMs);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settleTimer);
    };
  }, [loading, remeasureSections, visibleSectionIds]);

  const renderSection = (sectionId: BoxDisplaySectionId, isLast = false) => {
    const items = grouped[sectionId];
    if (!items.length) return null;

    return (
      <BoxDetailSectionBlock
        key={sectionId}
        sectionId={sectionId}
        onLayout={onSectionLayout(sectionId)}
        onSectionRef={registerSection}
        isLast={isLast}
      >
        {items.map((li) => {
          const item = catalog.find((c) => c.id === li.itemId);
          const kid = children.find((c) => c.id === li.childId);
          return (
            <BoxItemRow
              key={li.slotId + li.itemId}
              li={li}
              item={item}
              meta={kid ? `Present for ${kid.name || 'your kid'}` : undefined}
              locked
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
    // Same grape + status line as the building splash so the hand-off shows no
    // shrink, no text swap, and no recenter shift.
    return (
      <View style={styles.centered}>
        <OnboardingBuildLoader message={BUILD_LOADER_REST_MESSAGE} />
      </View>
    );
  }

  // Running index drives the top-to-bottom cascade across every reveal block.
  let revealIndex = 0;
  const body = (
    <>
      <RevealStagger index={revealIndex++}>
        <BoxDetailToolbar
          lockAt={lockAt}
          now={now}
          startsOn={startsOn}
          estimatedDeliveryBy={estimatedDeliveryBy}
          align={isDesktop ? 'left' : 'center'}
        />
      </RevealStagger>
      {visibleSectionIds.length > 0 ? (
        // Lifts in like the rest; RevealStagger clears its transform once the
        // entrance settles so the nav's `position: sticky` works afterward.
        <RevealStagger index={revealIndex++}>
          <StickySectionNav
            activeSection={activeSection}
            onSelect={scrollToSection}
            sectionIds={visibleSectionIds}
          />
        </RevealStagger>
      ) : null}
      {visibleSectionIds.map((id, index) => (
        <RevealStagger key={id} index={revealIndex++}>
          {renderSection(id, index === visibleSectionIds.length - 1)}
        </RevealStagger>
      ))}
      <RevealStagger index={revealIndex++}>
        <BoxDetailReviewCta
          onPress={() => void onDone()}
          disabled={completing}
          loading={completing}
          label={doneLabel}
        />
      </RevealStagger>
    </>
  );

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={Platform.OS === 'web' || underStorefrontChrome ? [] : ['top']}
    >
      <WebContentPanel
        flush={isDesktop}
        gutter={false}
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
          {...(Platform.OS === 'web'
            ? ({ className: 'gj-box-scroll', testID: 'box-vertical-scroll' } as object)
            : null)}
        >
          <View
            ref={contentRef}
            collapsable={false}
            style={[
              styles.contentRoot,
              isDesktop && [styles.contentColumn, { maxWidth: layoutWidth }],
            ]}
          >
            {body}
          </View>
        </ScrollView>
      </WebContentPanel>
    </SafeAreaView>
  );
}

function createRevealStyles(colors: SemanticColors, isDesktop: boolean) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.bgPrimary, minHeight: 0 },
    panel: { flex: 1, width: '100%', minHeight: 0, overflow: 'visible' as const },
    root: { flex: 1, backgroundColor: colors.bgPrimary, width: '100%', minHeight: 0 },
    scrollContent: {
      paddingBottom: spacing.xxl,
      width: '100%',
    },
    scrollContentDesktop: {
      alignItems: 'stretch',
    },
    /** Top inset on this node (not ScrollView contentContainer) so scroll-to-section offsets match. */
    contentRoot: {
      width: '100%',
      paddingTop: isDesktop ? CONTENT_TOP_GAP_DESKTOP : CONTENT_TOP_GAP,
      paddingHorizontal: isDesktop ? 0 : spacing.md,
    },
    contentColumn: {
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
