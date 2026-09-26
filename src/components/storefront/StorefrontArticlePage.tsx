import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Platform,
  useWindowDimensions,
  type ImageSourcePropType,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type ScrollView,
} from 'react-native';
import {
  StorefrontChrome,
  useStorefrontActions,
} from './StorefrontChrome';
import { StorefrontAskRavStrip } from './StorefrontAskRavStrip';
import { StorefrontBuildBoxStrip } from './StorefrontBuildBoxStrip';
import { GrapejuiceBrandMark } from '../brand/GrapejuiceBrandMark';
import { StorefrontCategoryRail } from './StorefrontCategoryRail';
import { StorefrontPaperCardShell } from './StorefrontPaperCardShell';
import { HorizontalDragScrollView } from '../home/HorizontalDragScrollView';
import { HORIZONTAL_RAIL_DRAGGING_CLASS } from '../../hooks/useDragToScrollWeb';
import { STOREFRONT_HOME_AISLE_CARDS } from '../../constants/landingAudiences';
import {
  borderRadius,
  LAYOUT,
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';
import { preventWidow } from '../../utils/typography';

const COLUMN_MAX = 720;

export type StorefrontArticleCta = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

export type StorefrontArticleStepItem = {
  title: string;
  /** Optional; omitted on paper How-it-works (number + title only). */
  body?: string;
};

/** Plain run, or a weighted span (e.g. semibold transition mid-prose). */
export type StorefrontArticleProseWeight = 'regular' | 'semibold' | 'bold';

export type StorefrontArticleProseLine =
  | string
  | { body: string; weight?: StorefrontArticleProseWeight };

/**
 * One paragraph: a plain/weighted line, or inline runs (weighted spans stay
 * in the same paragraph). Top-level body arrays stack as separate paragraphs.
 */
export type StorefrontArticleProseParagraph =
  | StorefrontArticleProseLine
  | readonly StorefrontArticleProseLine[];

/** Title may include ˘italicˇ markers (rendered as italic spans). */
export type StorefrontArticleBeliefItem = {
  title: string;
  body: string;
};

export type StorefrontArticleBeliefSection = {
  heading: string;
  intro?: string;
  /** Flat items under this section (e.g. It's a Practice). */
  items?: StorefrontArticleBeliefItem[];
  /** Nested groups (e.g. It's Personal / It's Practical under The Philosophy). */
  groups?: { heading: string; items: StorefrontArticleBeliefItem[] }[];
};

export type StorefrontArticleBlock =
  | {
      type: 'prose';
      heading?: string;
      /**
       * Single string = one paragraph. Array = stacked paragraphs. Nested
       * arrays are inline weighted runs within one paragraph.
       */
      body: string | readonly StorefrontArticleProseParagraph[];
      /** Decorative square thumbs rendered under the heading (before body). */
      thumbs?: readonly ImageSourcePropType[];
      /**
       * Hairline rule after this block (before the next). Same hairline + equal
       * vertical padding as `showHeroDivider`.
       */
      showDividerAfter?: boolean;
      /** Override default article column max width (e.g. 480 for Our Story prose). */
      maxWidth?: number;
      /** Match hero `title` type (32 / medium) instead of blockHeading 22. */
      headingVariant?: 'title';
      /** Extra space above this block (e.g. after a denser section). */
      paddingTop?: number;
      /** Extra space below this block. */
      paddingBottom?: number;
    }
  | {
      type: 'steps';
      heading?: string;
      items: StorefrontArticleStepItem[];
      /** Wrap in cold-press paper mid-band (Ask Rav / Our Story shell). */
      paper?: boolean;
    }
  | {
      type: 'beliefs';
      heading?: string;
      /** Flat list (How-to songs, etc.). Prefer `sections` for hierarchical beliefs. */
      items?: StorefrontArticleBeliefItem[];
      /** Hierarchical beliefs: section → optional groups → items. */
      sections?: StorefrontArticleBeliefSection[];
      /** Wrap in cold-press paper mid-band (Passover / Ask Rav / B'Mitzvah shell). */
      paper?: boolean;
    }
  | { type: 'missions'; heading?: string; items: { num: string; title: string; body: string }[] }
  | { type: 'visualPlaceholder'; label: string; aspectRatio?: number }
  | {
      type: 'band';
      heading: string;
      /** When set, used instead of `heading` on compact viewports (forced line breaks). */
      headingMobile?: string;
      body: string;
      cta?: StorefrontArticleCta;
      /** Outline button under the primary `cta` (e.g. Our Story give band). */
      secondaryCta?: StorefrontArticleCta;
      /** Cold-press paper shell (same as What we believe). */
      paper?: boolean;
    }
  | { type: 'linkList'; heading?: string; items: { label: string; detail?: string; onPress: () => void }[] }
  | {
      type: 'roadmap';
      heading?: string;
      groups: {
        tag?: string;
        items: {
          when: string;
          what: string;
          note?: string;
          cta?: StorefrontArticleCta;
          /** Outline = ink stroke; primary = solid gold for the current/actionable holiday. */
          ctaVariant?: 'primary' | 'outline';
        }[];
      }[];
    }
  | {
      /** Centered section head + single CTA (e.g. external learn-more under roadmap). */
      type: 'cta';
      heading: string;
      cta: StorefrontArticleCta;
      /** Outline = ink stroke (default); primary = solid gold. */
      ctaVariant?: 'primary' | 'outline';
    };

/** Flat paragraph, or a titled segment (heading uses blockHeading / How-it-works styles). */
export type StorefrontArticleLeadSegment =
  | string
  | { heading?: string; body: string };

type Props = {
  eyebrow?: string;
  title: string;
  /**
   * Lead copy: a single string (split on newlines), a string[], or structured
   * segments with optional headings (e.g. “What comes in the Passover box?” before a paragraph).
   */
  lead: string | readonly StorefrontArticleLeadSegment[];
  /**
   * Optional max width for the hero lead stack (centered). When omitted, lead
   * fills the article column like the title. Passover uses a tighter measure.
   */
  leadMaxWidth?: number;
  primaryCta?: StorefrontArticleCta;
  secondaryCta?: StorefrontArticleCta;
  /**
   * Primary hero CTA scale:
   * - `default` — typography.md + sm/lg padding
   * - `medium` — ~18px label + slightly roomier padding (Passover)
   * - `large` — blockHeading type (22 / medium / -0.3) with roomier padding
   *   and extra space before the first content block
   */
  primaryCtaSize?: 'default' | 'medium' | 'large';
  blocks: StorefrontArticleBlock[];
  /**
   * Hairline rule between hero (eyebrow / title / lead / CTAs) and the first
   * content block. Matches storefront muted border hairlines.
   */
  showHeroDivider?: boolean;
  /** Show Ask Rav + Build Box strips (default true). */
  showFooterStrips?: boolean;
  /** Override Build Box strip headline (defaults to acquisition copy). */
  buildBoxHeadline?: string;
  /**
   * Optional mid-band rendered after page blocks and immediately before
   * Build Box / Ask Rav / aisle (e.g. B'Mitzvah on Passover).
   */
  beforeFooterStrips?: React.ReactNode;
};

function normalizeLead(lead: string | readonly StorefrontArticleLeadSegment[]): {
  heading?: string;
  body: string;
}[] {
  if (typeof lead === 'string') {
    return lead
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((body) => ({ body }));
  }
  return lead
    .map((seg) => {
      if (typeof seg === 'string') {
        const body = seg.trim();
        return body ? { body } : null;
      }
      const body = seg.body.trim();
      if (!body) return null;
      const heading = seg.heading?.trim();
      return heading ? { heading, body } : { body };
    })
    .filter((s): s is { heading?: string; body: string } => s != null);
}

function ArticleHairlineDivider() {
  return (
    <View style={styles.heroDividerWrap} accessibilityElementsHidden>
      <View style={styles.heroDivider} />
    </View>
  );
}

function normalizeProseLine(
  line: StorefrontArticleProseLine,
): { body: string; weight: StorefrontArticleProseWeight } | null {
      if (typeof line === 'string') {
        const text = line.trim();
    return text ? { body: text, weight: 'regular' } : null;
      }
      const text = line.body.trim();
      if (!text) return null;
      return { body: text, weight: line.weight ?? 'regular' };
}

/** Top-level items become paragraphs; nested arrays stay as inline runs. */
function normalizeProseParagraphs(
  body: string | readonly StorefrontArticleProseParagraph[],
): { body: string; weight: StorefrontArticleProseWeight }[][] {
  const paragraphs = typeof body === 'string' ? [body] : body;
  return paragraphs
    .map((paragraph) => {
      const lines = Array.isArray(paragraph) ? paragraph : [paragraph];
      return lines
        .map((line) => normalizeProseLine(line as StorefrontArticleProseLine))
        .filter(
          (line): line is { body: string; weight: StorefrontArticleProseWeight } => line != null,
        );
    })
    .filter((lines) => lines.length > 0);
}

function proseWeightStyle(weight: StorefrontArticleProseWeight) {
  if (weight === 'semibold') return styles.blockBodySemibold;
  if (weight === 'bold') return styles.blockBodyBold;
  return null;
}

/** Parse ˘textˇ markers into italic/plain runs. */
function parseBeliefTitleRuns(title: string): { text: string; italic: boolean }[] {
  const runs: { text: string; italic: boolean }[] = [];
  const re = /˘([^ˇ]*)ˇ/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(title)) != null) {
    if (match.index > last) {
      runs.push({ text: title.slice(last, match.index), italic: false });
    }
    if (match[1]) {
      runs.push({ text: match[1], italic: true });
    }
    last = match.index + match[0].length;
  }
  if (last < title.length) {
    runs.push({ text: title.slice(last), italic: false });
  }
  return runs.length > 0 ? runs : [{ text: title, italic: false }];
}

function BeliefTitle({
  title,
  style,
}: {
  title: string;
  style?: object | object[] | null;
}) {
  const runs = parseBeliefTitleRuns(title);
  if (runs.length === 1 && !runs[0].italic) {
    return <Text style={[styles.beliefTitle, style]}>{runs[0].text}</Text>;
  }
  return (
    <Text style={[styles.beliefTitle, style]}>
      {runs.map((run, index) => (
        <Text key={index} style={run.italic ? styles.beliefTitleItalic : undefined}>
          {run.text}
        </Text>
      ))}
    </Text>
  );
}

type BeliefDeckCard = {
  sectionHeading: string;
  title: string;
  body: string;
};

function flattenBeliefCards(sections: StorefrontArticleBeliefSection[]): BeliefDeckCard[] {
  const out: BeliefDeckCard[] = [];
  for (const section of sections) {
    for (const item of section.items ?? []) {
      out.push({
        sectionHeading: section.heading,
        title: item.title,
        body: item.body,
      });
    }
    for (const group of section.groups ?? []) {
      for (const item of group.items) {
        out.push({
          sectionHeading: group.heading,
          title: item.title,
          body: item.body,
        });
      }
    }
  }
  return out;
}

/**
 * Our Story “What we believe”: TOC + horizontal card rail.
 * Cards fade toward the edges so the rail softens instead of hard-clipping.
 */
function BeliefsDeck({ sections }: { sections: StorefrontArticleBeliefSection[] }) {
  const { width: windowWidth } = useWindowDimensions();
  const columns = windowWidth >= LAYOUT.BREAKPOINT_TABLET;
  const cards = useMemo(() => flattenBeliefCards(sections), [sections]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [deckWidth, setDeckWidth] = useState(0);
  const [scrollX, setScrollX] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const syncingRef = useRef(false);
  /** Bumps to abort an in-flight web drift when the user grabs the rail again. */
  const driftTokenRef = useRef(0);
  const driftRafRef = useRef(0);
  const driftTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelDrift = useCallback(() => {
    driftTokenRef.current += 1;
    if (driftRafRef.current) {
      cancelAnimationFrame(driftRafRef.current);
      driftRafRef.current = 0;
    }
    if (driftTimeoutRef.current != null) {
      clearTimeout(driftTimeoutRef.current);
      driftTimeoutRef.current = null;
    }
    syncingRef.current = false;
  }, []);

  // Paper shell: outer MOBILE_GUTTER + root pad (xl on mobile, gutter on tablet+).
  // Mobile bleeds past the watercolor to the screen edge; tablet+ stops at the paper.
  const paperRootPad = columns ? MOBILE_GUTTER : spacing.xl;
  const carouselBleed = columns ? paperRootPad : MOBILE_GUTTER + paperRootPad;

  // Mobile: wider cards (~82% of the full-bleed rail). Tablet+: keep the mid-band measure.
  const cardWidth = columns
    ? Math.max(240, Math.min(deckWidth > 0 ? deckWidth * 0.62 : 280, 320))
    : Math.max(260, Math.min((deckWidth > 0 ? deckWidth : windowWidth) * 0.82, 340));
  const cardHeight = Math.round(cardWidth * 1.35);
  const cardGap = spacing.md;
  const snapInterval = cardWidth + cardGap;
  const sidePad = Math.max(0, (deckWidth - cardWidth) / 2);

  const opacityForIndex = useCallback(
    (index: number) => {
      // Mobile full-bleed rail: every card stays fully opaque.
      if (!columns) return 1;
      if (deckWidth <= 0 || snapInterval <= 0) return index === 0 ? 1 : 0.55;
      const cardCenter = sidePad + index * snapInterval + cardWidth / 2;
      const viewCenter = scrollX + deckWidth / 2;
      const dist = Math.abs(cardCenter - viewCenter);
      // Solid at center; neighbors ~halfway between full and the old near-invisible fade.
      const fadeStart = cardWidth * 0.4;
      const neighborDist = snapInterval;
      if (dist <= fadeStart) return 1;
      if (dist <= neighborDist) {
        const t = (dist - fadeStart) / (neighborDist - fadeStart);
        return 1 - t * 0.45; // → ~0.55 at the neighbor
      }
      const fadeEnd = snapInterval * 2.1;
      if (dist >= fadeEnd) return 0.22;
      const t = (dist - neighborDist) / (fadeEnd - neighborDist);
      return 0.55 - t * 0.33;
    },
    [cardWidth, columns, deckWidth, scrollX, sidePad, snapInterval],
  );

  const scrollToIndex = useCallback(
    (index: number, animated = true) => {
      const clamped = Math.max(0, Math.min(cards.length - 1, index));
      const targetX = clamped * snapInterval;
      setActiveIndex(clamped);
      cancelDrift();
      const token = driftTokenRef.current;
      syncingRef.current = true;

      const finish = () => {
        if (token !== driftTokenRef.current) return;
        setScrollX(targetX);
        syncingRef.current = false;
        driftRafRef.current = 0;
        driftTimeoutRef.current = null;
      };

      if (!animated) {
        scrollRef.current?.scrollTo({ x: targetX, animated: false });
        finish();
        return;
      }

      // Web: ease the snap ourselves — RN scrollTo({ animated }) feels abrupt.
      if (Platform.OS === 'web') {
        const node = scrollRef.current as ScrollView & {
          getScrollableNode?: () => HTMLElement;
        } | null;
        const el =
          node && typeof node.getScrollableNode === 'function'
            ? node.getScrollableNode()
            : (node as unknown as HTMLElement | null);
        if (el && typeof el.scrollLeft === 'number') {
          const startX = el.scrollLeft;
          const delta = targetX - startX;
          if (Math.abs(delta) < 1.5) {
            finish();
            return;
          }
          const duration = Math.min(2000, Math.max(1200, Math.abs(delta) * 2.1));
          const startTime = performance.now();
          // Slow drift — soft at both ends, no rush.
          const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
          const step = (now: number) => {
            if (token !== driftTokenRef.current) return;
            const t = Math.min(1, (now - startTime) / duration);
            el.scrollLeft = startX + delta * easeInOutSine(t);
            setScrollX(el.scrollLeft);
            if (t < 1) {
              driftRafRef.current = requestAnimationFrame(step);
            } else {
              el.scrollLeft = targetX;
              finish();
            }
          };
          driftRafRef.current = requestAnimationFrame(step);
          return;
        }
      }

      scrollRef.current?.scrollTo({ x: targetX, animated: true });
      driftTimeoutRef.current = setTimeout(finish, 1600);
    },
    [cancelDrift, cards.length, snapInterval],
  );

  const settleToNearest = useCallback(
    (x: number) => {
      if (syncingRef.current || snapInterval <= 0 || cards.length === 0) return;
      const next = Math.round(x / snapInterval);
      const clamped = Math.max(0, Math.min(cards.length - 1, next));
      const targetX = clamped * snapInterval;
      if (Math.abs(x - targetX) > 1.5 || clamped !== activeIndex) {
        scrollToIndex(clamped, true);
      }
    },
    [activeIndex, cards.length, scrollToIndex, snapInterval],
  );

  const onDeckScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      setScrollX(x);
      if (syncingRef.current || snapInterval <= 0) return;
      const next = Math.round(x / snapInterval);
      const clamped = Math.max(0, Math.min(cards.length - 1, next));
      if (clamped !== activeIndex) setActiveIndex(clamped);
    },
    [activeIndex, cards.length, snapInterval],
  );

  // Snap after the user lets go — never interrupt an active drag/scroll.
  // Pressing again cancels any in-flight drift so it can’t fight the new gesture.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = scrollRef.current as ScrollView & {
      getScrollableNode?: () => HTMLElement;
    } | null;
    const el =
      node && typeof node.getScrollableNode === 'function'
        ? node.getScrollableNode()
        : (node as unknown as HTMLElement | null);
    if (!el || typeof el.addEventListener !== 'function') return;

    let timer = 0;

    const scheduleSettle = (delay: number) => {
      if (syncingRef.current) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (syncingRef.current) return;
        if (el.classList.contains(HORIZONTAL_RAIL_DRAGGING_CLASS)) return;
        settleToNearest(el.scrollLeft);
      }, delay);
    };

    const onScroll = () => {
      if (syncingRef.current) return;
      // Still dragging with the mouse — wait for release.
      if (el.classList.contains(HORIZONTAL_RAIL_DRAGGING_CLASS)) {
        window.clearTimeout(timer);
        return;
      }
      // Trackpad/wheel coast: start the drift shortly after motion eases,
      // without stealing the gesture mid-flick.
      scheduleSettle(55);
    };

    const onPointerReleased = () => {
      // Begin the soft drift as soon as the gesture ends.
      scheduleSettle(0);
    };

    const onPointerEngaged = () => {
      window.clearTimeout(timer);
      cancelDrift();
    };

    const onWheel = () => {
      window.clearTimeout(timer);
      cancelDrift();
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('pointerdown', onPointerEngaged, { capture: true });
    el.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('mouseup', onPointerReleased);
    el.addEventListener('touchend', onPointerReleased, { passive: true });
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('pointerdown', onPointerEngaged, true);
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('mouseup', onPointerReleased);
      el.removeEventListener('touchend', onPointerReleased);
    };
  }, [cancelDrift, settleToNearest, deckWidth, snapInterval]);
  return (
    <View style={styles.beliefsDeck}>
      <View
        style={[styles.beliefsTocFlat, columns ? styles.beliefsTocFlatColumns : null]}
        accessibilityRole="summary"
        accessibilityLabel="Table of contents for nine belief cards"
      >
        {(columns
          ? [cards.slice(0, 3), cards.slice(3, 6), cards.slice(6, 9)]
          : [cards]
        ).map((col, colIndex) => (
          <View
            key={`toc-col-${colIndex}`}
            style={
              columns
                ? [
                    styles.beliefsTocFlatCol,
                    colIndex === 0
                      ? styles.beliefsTocFlatColLeft
                      : colIndex === 1
                        ? styles.beliefsTocFlatColCenter
                        : styles.beliefsTocFlatColRight,
                  ]
                : styles.beliefsTocFlat
            }
          >
            <View style={columns ? styles.beliefsTocFlatColInner : undefined}>
              {col.map((card, rowIndex) => {
                const index = columns ? colIndex * 3 + rowIndex : rowIndex;
                const active = index === activeIndex;
                return (
                  <Pressable
                    key={`${card.sectionHeading}-${card.title}`}
                    onPress={() => scrollToIndex(index)}
                    accessibilityRole="button"
                    accessibilityLabel={`${card.title}, card ${index + 1} of ${cards.length}`}
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.beliefsTocRow,
                      columns ? styles.beliefsTocRowInColumn : null,
                    ]}
                  >
                    <BeliefTitle
                      title={card.title}
                      style={[
                        styles.beliefsTocTitle,
                        columns ? styles.beliefsTocTitleInColumn : null,
                        active ? styles.beliefsTocTitleActive : null,
                      ]}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </View>

      <View
        style={[
          styles.beliefsCarouselWrap,
          columns ? styles.beliefsCarouselWrapMasked : styles.beliefsCarouselWrapOpen,
          columns
            ? { marginHorizontal: -carouselBleed }
            : { width: windowWidth, marginLeft: -carouselBleed },
        ]}
        onLayout={(e: LayoutChangeEvent) => {
          const w = e.nativeEvent.layout.width;
          if (w > 0) setDeckWidth((prev) => (Math.abs(prev - w) > 1 ? w : prev));
        }}
      >
        <HorizontalDragScrollView
          ref={scrollRef}
          horizontal
          decelerationRate="fast"
          snapToInterval={snapInterval}
          snapToAlignment="start"
          disableIntervalMomentum
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onDeckScroll}
          onScrollEndDrag={(e) => settleToNearest(e.nativeEvent.contentOffset.x)}
          onMomentumScrollEnd={(e) => settleToNearest(e.nativeEvent.contentOffset.x)}
          style={styles.beliefsCarouselScroll}
          contentContainerStyle={[
            styles.beliefsCarouselContent,
            { paddingHorizontal: sidePad, paddingVertical: 16, gap: cardGap },
          ]}
          accessibilityLabel="Belief cards, swipe to browse"
        >
          {cards.map((card, index) => (
            <Pressable
              key={`${card.sectionHeading}-${card.title}`}
              onPress={() => {
                if (index !== activeIndex) scrollToIndex(index);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${card.title}. ${card.body}`}
              accessibilityState={{ selected: index === activeIndex }}
              style={[
                styles.beliefCard,
                {
                  width: cardWidth,
                  height: cardHeight,
                  opacity: opacityForIndex(index),
                },
                Platform.OS === 'web' && index !== activeIndex
                  ? ({ cursor: 'pointer' } as object)
                  : null,
              ]}
            >
              <BeliefTitle title={card.title} style={styles.beliefCardTitle} />
              <Text style={styles.beliefCardBody}>{preventWidow(card.body)}</Text>
            </Pressable>
          ))}
        </HorizontalDragScrollView>
      </View>

      <View style={styles.beliefsDots} accessibilityElementsHidden>
        {cards.map((card, index) => (
          <Pressable
            key={`dot-${card.title}`}
            onPress={() => scrollToIndex(index)}
            hitSlop={8}
            style={[styles.beliefsDot, index === activeIndex ? styles.beliefsDotActive : null]}
          />
        ))}
      </View>
    </View>
  );
}

function BeliefHoverItem({
  item,
  inColumn,
  isLast,
}: {
  item: StorefrontArticleBeliefItem;
  inColumn?: boolean;
  isLast?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      accessibilityRole="text"
      accessibilityLabel={`${item.title}. ${item.body}`}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      // Touch: tap to peek (web relies on hover only).
      onPress={Platform.OS === 'web' ? undefined : () => setHovered((v) => !v)}
      style={[
        styles.beliefRow,
        inColumn ? styles.beliefRowInColumn : null,
        isLast ? styles.beliefRowLast : null,
        hovered ? styles.beliefRowHovered : null,
        Platform.OS === 'web' ? ({ cursor: 'help' } as object) : null,
      ]}
    >
      <BeliefTitle title={item.title} />
      {hovered ? (
        <View style={styles.beliefTooltip} pointerEvents="none">
          <Text style={styles.beliefTooltipText}>{item.body}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function BeliefItemsList({
  items,
  onPaper,
  inColumn,
  tooltips,
}: {
  items: StorefrontArticleBeliefItem[];
  onPaper?: boolean;
  /** Column layout: spacing only, no hairline rules between items. */
  inColumn?: boolean;
  /** Hover/tap tooltips instead of always-visible bodies. */
  tooltips?: boolean;
}) {
  return (
    <View style={onPaper || inColumn ? styles.beliefsOnPaperList : undefined}>
      {items.map((item, itemIndex) => {
        const isLast = itemIndex === items.length - 1;
        if (tooltips) {
          return (
            <BeliefHoverItem
              key={`${item.title}-${itemIndex}`}
              item={item}
              inColumn={inColumn}
              isLast={isLast}
            />
          );
        }
        return (
          <View
            key={`${item.title}-${itemIndex}`}
            style={[
              styles.beliefRow,
              inColumn ? styles.beliefRowInColumn : null,
              isLast ? styles.beliefRowLast : null,
            ]}
          >
            <BeliefTitle title={item.title} />
            <Text style={styles.blockBody}>{preventWidow(item.body)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function BeliefsContent({
  items,
  sections,
  onPaper,
}: {
  items?: StorefrontArticleBeliefItem[];
  sections?: StorefrontArticleBeliefSection[];
  onPaper?: boolean;
}) {
  const { width: windowWidth } = useWindowDimensions();

  // Our Story paper band: TOC + swipeable 9-card deck.
  if (onPaper && sections && sections.length > 0) {
    return <BeliefsDeck sections={sections} />;
  }

  const columns = Boolean(
    sections &&
      sections.length >= 2 &&
      sections.length <= 3 &&
      windowWidth >= LAYOUT.BREAKPOINT_TABLET
  );
  /** Hover tooltips for hierarchical beliefs (non-paper); flat lists stay open. */
  const tooltips = Boolean(sections && sections.length > 0);

  if (sections && sections.length > 0) {
    return (
      <View style={[styles.beliefsSections, columns ? styles.beliefsSectionsColumns : null]}>
        {sections.map((section, sectionIndex) => (
          <View
            key={section.heading}
            style={[
              styles.beliefSection,
              columns ? styles.beliefSectionColumn : null,
              !columns && sectionIndex === sections.length - 1 ? styles.beliefSectionLast : null,
            ]}
          >
            <Text
              style={[
                styles.beliefSectionHeading,
                !columns && sectionIndex === 0 ? styles.beliefSectionHeadingFirst : null,
                columns ? styles.beliefSectionHeadingColumn : null,
              ]}
            >
              {section.heading}
            </Text>
            {section.intro ? (
              <Text style={[styles.blockBody, styles.beliefSectionIntro]}>{section.intro}</Text>
            ) : null}
            {section.items && section.items.length > 0 ? (
              <BeliefItemsList
                items={section.items}
                onPaper={onPaper}
                inColumn={columns}
                tooltips={tooltips}
              />
            ) : null}
            {section.groups?.map((group) => (
              <View key={group.heading} style={styles.beliefGroup}>
                <Text style={styles.beliefGroupHeading}>{group.heading}</Text>
                <BeliefItemsList
                  items={group.items}
                  onPaper={onPaper}
                  inColumn={columns}
                  tooltips={tooltips}
                />
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }
  if (items && items.length > 0) {
    return <BeliefItemsList items={items} onPaper={onPaper} tooltips={false} />;
  }
  return null;
}

function ArticleProseParagraph({
  lines,
}: {
  lines: { body: string; weight: StorefrontArticleProseWeight }[];
}) {
  if (lines.length === 1) {
    const line = lines[0];
    return (
      <Text style={[styles.blockBody, proseWeightStyle(line.weight)]}>
        {preventWidow(line.body)}
      </Text>
    );
  }
  return (
    <Text style={styles.blockBody}>
      {lines.map((line, index) => (
        <Text key={index} style={proseWeightStyle(line.weight)}>
          {index > 0 ? ' ' : ''}
          {index === lines.length - 1 ? preventWidow(line.body) : line.body}
        </Text>
      ))}
    </Text>
  );
}

function ArticleProseBody({
  body,
}: {
  body: string | readonly StorefrontArticleProseParagraph[];
}) {
  const paragraphs = normalizeProseParagraphs(body);
  if (paragraphs.length === 0) return null;
  if (paragraphs.length === 1) {
    return <ArticleProseParagraph lines={paragraphs[0]} />;
  }
  return (
    <View style={styles.proseParagraphs}>
      {paragraphs.map((lines, index) => (
        <ArticleProseParagraph key={index} lines={lines} />
      ))}
    </View>
  );
}

/** Prefer 3-up when the list’s own width fits it; else 2. Gaps instead of hairlines. */
function ArticleLinkCell({
  item,
  width,
}: {
  item: { label: string; detail?: string; onPress: () => void };
  width: number;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onPress={item.onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="link"
      accessibilityLabel={item.label}
      style={[
        styles.linkCell,
        width > 0 ? { width } : styles.linkCellFallback,
        { borderColor: hovered ? semanticColors.logoDark : semanticColors.goldMuted },
        Platform.OS === 'web'
          ? ({
              transitionProperty: 'border-color',
              transitionDuration: '120ms',
              cursor: 'pointer',
            } as object)
          : null,
      ]}
    >
      <Text style={styles.linkLabel}>{item.label}</Text>
      {item.detail ? <Text style={styles.linkDetail}>{item.detail}</Text> : null}
    </Pressable>
  );
}

function ArticleLinkList({
  heading,
  items,
}: {
  heading?: string;
  items: { label: string; detail?: string; onPress: () => void }[];
}) {
  const { width: windowWidth } = useWindowDimensions();
  const [gridWidth, setGridWidth] = useState(0);
  const gap = spacing.md;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w <= 0) return;
    setGridWidth((prev) => (Math.abs(prev - w) > 1 ? w : prev));
  };

  // Article column caps at COLUMN_MAX; fall back to window until onLayout fires.
  const layoutW =
    gridWidth > 0 ? gridWidth : Math.min(windowWidth, COLUMN_MAX) - MOBILE_GUTTER * 2;
  // ~480 fits three readable cells inside the 720 article column; phones stay 2-up.
  const cols = layoutW >= 480 ? 3 : 2;
  const cellWidth = Math.max(0, Math.floor((layoutW - gap * (cols - 1)) / cols));

  return (
    <View style={[styles.block, styles.linkListBlock]}>
      {heading ? <Text style={styles.blockHeading}>{heading}</Text> : null}
      <View style={[styles.linkGrid, { gap }]} onLayout={onLayout}>
        {items.map((item) => (
          <ArticleLinkCell key={item.label} item={item} width={cellWidth} />
        ))}
      </View>
    </View>
  );
}

function ArticleBandBlock({
  block,
}: {
  block: Extract<StorefrontArticleBlock, { type: 'band' }>;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const compact = windowWidth < LAYOUT.BREAKPOINT_TABLET;
  const heading =
    compact && block.headingMobile ? block.headingMobile : block.heading;

  const bandInner = (
    <>
      <Text style={block.paper ? styles.bandPaperHeading : styles.blockHeading}>{heading}</Text>
      <Text style={styles.blockBody}>{preventWidow(block.body)}</Text>
      {block.cta || block.secondaryCta ? (
        <View style={[styles.bandCtas, !compact ? styles.bandCtasRow : null]}>
          {block.cta ? (
          <TouchableOpacity
              style={[styles.bandCta, !compact ? styles.bandCtaRowItem : null]}
              onPress={block.cta.onPress}
              disabled={block.cta.disabled}
              accessibilityRole="button"
              accessibilityLabel={block.cta.label}
              accessibilityState={{ disabled: Boolean(block.cta.disabled) }}
            >
              <Text style={styles.bandCtaText}>{block.cta.label}</Text>
          </TouchableOpacity>
          ) : null}
          {block.secondaryCta ? (
            <TouchableOpacity
              style={[
                styles.bandCtaSecondary,
                !compact ? styles.bandCtaRowItem : null,
                block.secondaryCta.disabled ? styles.ctaDisabled : null,
              ]}
              onPress={block.secondaryCta.onPress}
              disabled={block.secondaryCta.disabled}
              accessibilityRole="button"
              accessibilityLabel={block.secondaryCta.label}
              accessibilityState={{
                disabled: Boolean(block.secondaryCta.disabled),
              }}
            >
              <Text style={styles.bandCtaSecondaryText}>{block.secondaryCta.label}</Text>
            </TouchableOpacity>
          ) : null}
      </View>
      ) : null}
    </>
  );

  if (block.paper) {
    return (
      <View style={styles.bandPaperBlock}>
        <StorefrontPaperCardShell style={styles.bandPaperShell} contentStyle={styles.bandOnPaper}>
          {bandInner}
        </StorefrontPaperCardShell>
      </View>
    );
  }
  return (
    <View style={styles.block}>
      <View style={styles.band}>{bandInner}</View>
    </View>
  );
}

function ArticleBlocks({ blocks }: { blocks: StorefrontArticleBlock[] }) {
  return (
    <View style={styles.blocks}>
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        switch (block.type) {
          case 'prose':
            return (
              <View
                key={key}
                style={block.showDividerAfter ? styles.blockWithAfterDivider : undefined}
              >
                <View
                  style={[
                    styles.block,
                    block.maxWidth != null ? { maxWidth: block.maxWidth } : null,
                    block.paddingTop != null ? { paddingTop: block.paddingTop } : null,
                    block.paddingBottom != null ? { paddingBottom: block.paddingBottom } : null,
                  ]}
                >
                  {block.heading ? (
                    <Text
                      style={
                        block.headingVariant === 'title'
                          ? styles.blockHeadingTitle
                          : styles.blockHeading
                      }
                    >
                      {block.heading}
                    </Text>
                  ) : null}
                  {block.thumbs && block.thumbs.length > 0 ? (
                    <View style={styles.thumbRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                      {block.thumbs.map((src, thumbIndex) => (
                        <View key={thumbIndex} style={styles.thumbCell}>
                          <Image
                            source={src}
                            style={styles.thumbImage}
                            resizeMode="cover"
                            accessible={false}
                          />
                        </View>
                      ))}
                    </View>
                  ) : null}
                  <ArticleProseBody body={block.body} />
                </View>
                {block.showDividerAfter ? <ArticleHairlineDivider /> : null}
              </View>
            );
          case 'steps': {
            if (block.paper) {
              return (
                <View key={key} style={styles.stepsPaperBlock}>
                  {block.heading ? (
                    <Text style={[styles.blockHeading, styles.stepsPaperHeading]}>
                      {block.heading}
                    </Text>
                  ) : null}
                  <StorefrontPaperCardShell
                    style={styles.stepsPaperShell}
                    compactVerticalPadding
                    contentStyle={styles.stepsOnPaper}
                    contentMaxWidth={1024}
                  >
                    <View style={styles.stepsRow}>
                      {block.items.map((item, i) => (
                        <View key={item.title} style={styles.stepCol}>
                          <Text style={styles.stepNum}>{i + 1}</Text>
                          <Text style={styles.stepTitle}>{item.title}</Text>
                        </View>
                      ))}
                    </View>
                  </StorefrontPaperCardShell>
                </View>
              );
            }
            return (
              <View key={key} style={styles.block}>
                {block.heading ? <Text style={styles.blockHeading}>{block.heading}</Text> : null}
                {block.items.map((item, i) => (
                  <View key={item.title} style={styles.stepRow}>
                    <Text style={styles.stepNum}>{i + 1}</Text>
                    <View style={styles.stepCopy}>
                      <Text style={styles.stepTitle}>{item.title}</Text>
                      {item.body ? <Text style={styles.blockBody}>{item.body}</Text> : null}
                    </View>
                  </View>
                ))}
              </View>
            );
          }
          case 'missions':
            return (
              <View key={key} style={styles.block}>
                {block.heading ? <Text style={styles.blockHeading}>{block.heading}</Text> : null}
                {block.items.map((item) => (
                  <View key={item.num} style={styles.missionRow}>
                    <Text style={styles.missionNum}>{item.num}</Text>
                    <View style={styles.stepCopy}>
                      <Text style={styles.stepTitle}>{item.title}</Text>
                      <Text style={styles.blockBody}>{item.body}</Text>
                    </View>
                  </View>
                ))}
              </View>
            );
          case 'beliefs': {
            const beliefsList = (
              <BeliefsContent items={block.items} sections={block.sections} onPaper={block.paper} />
            );
            if (block.paper) {
              return (
                <View key={key} style={styles.beliefsPaperBlock}>
                  <StorefrontPaperCardShell
                    style={styles.beliefsPaperShell}
                    contentStyle={styles.beliefsOnPaper}
                    overflowVisible
                  >
                    <View style={styles.beliefsLogoWrap}>
                      <GrapejuiceBrandMark
                        markOnly
                        color={semanticColors.logoDark}
                        decorative
                      />
                    </View>
                    {block.heading ? (
                      <Text style={styles.beliefsPaperHeading}>{block.heading}</Text>
                    ) : null}
                    {beliefsList}
                  </StorefrontPaperCardShell>
                </View>
              );
            }
            return (
              <View key={key} style={styles.block}>
                {block.heading ? <Text style={styles.blockHeading}>{block.heading}</Text> : null}
                {beliefsList}
              </View>
            );
          }
          case 'visualPlaceholder':
            return (
              <View key={key} style={styles.block}>
                <View
                  style={[styles.visualPlaceholder, { aspectRatio: block.aspectRatio ?? 16 / 9 }]}
                  accessibilityLabel={block.label}
                >
                  <Text style={styles.visualPlaceholderText}>{block.label}</Text>
                </View>
              </View>
            );
          case 'band':
            return <ArticleBandBlock key={key} block={block} />;
          case 'linkList':
            return <ArticleLinkList key={key} heading={block.heading} items={block.items} />;
          case 'roadmap':
            return (
              <View key={key} style={styles.block}>
                {block.heading ? <Text style={styles.blockHeading}>{block.heading}</Text> : null}
                <View style={styles.roadList}>
                  {block.groups.map((group, groupIndex) => (
                    <View key={group.tag ?? `group-${groupIndex}`} style={styles.roadGroup}>
                      {group.tag ? <Text style={styles.roadTag}>{group.tag}</Text> : null}
                      {group.items.map((item) => {
                        const ctaPrimary = item.ctaVariant !== 'outline';
                        return (
                        <View
                          key={`${item.when}-${item.what}`}
                          style={[
                            styles.roadItem,
                            item.cta ? styles.roadItemWithCta : styles.roadItemNoCta,
                          ]}
                        >
                            <Text style={styles.roadWhen}>{item.when}</Text>
                            <Text style={styles.roadWhat}>{item.what}</Text>
                            {item.note ? <Text style={styles.blockBody}>{item.note}</Text> : null}
                            {item.cta ? (
                              <TouchableOpacity
                                style={[
                                  styles.roadCta,
                                  ctaPrimary ? styles.roadCtaPrimary : styles.roadCtaOutline,
                                  item.cta.disabled ? styles.ctaDisabled : null,
                                ]}
                                onPress={item.cta.onPress}
                                disabled={item.cta.disabled}
                                accessibilityRole="button"
                                accessibilityLabel={item.cta.label}
                                accessibilityState={{
                                  disabled: Boolean(item.cta.disabled),
                                }}
                              >
                                <Text
                                  style={[
                                    styles.roadCtaText,
                                    ctaPrimary ? styles.roadCtaTextPrimary : styles.roadCtaTextOutline,
                                  ]}
                                >
                                  {item.cta.label}
                                </Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </View>
            );
          case 'cta': {
            const ctaPrimary = block.ctaVariant === 'primary';
            return (
              <View key={key} style={styles.block}>
                <Text style={styles.blockHeading}>{block.heading}</Text>
                <TouchableOpacity
                  style={[
                    styles.sectionCta,
                    ctaPrimary ? styles.roadCtaPrimary : styles.roadCtaOutline,
                  ]}
                  onPress={block.cta.onPress}
                  accessibilityRole="link"
                  accessibilityLabel={block.cta.label}
                >
                  <Text
                    style={[
                      styles.sectionCtaText,
                      ctaPrimary ? styles.roadCtaTextPrimary : styles.roadCtaTextOutline,
                    ]}
                  >
                    {block.cta.label}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          }
          default:
            return null;
        }
      })}
    </View>
  );
}

/** Article-page aisle rail header (home keeps its own “Browse by Aisle” copy). */
function BrowseByAisleHeader() {
  return (
    <View style={styles.aisleSectionHead}>
      <Text style={styles.aisleSectionTitle}>Explore the Hanukkah collection</Text>
    </View>
  );
}

/**
 * Rich storefront content page — hero, typed blocks, optional
 * `beforeFooterStrips`, then Build Box / Ask Rav / aisle before chrome footer.
 * Shared header format for Passover / Our Story / How-To screens (no breadcrumbs,
 * 80px top padding, balanced headline wrap on web).
 */
export function StorefrontArticlePage({
  eyebrow,
  title,
  lead,
  leadMaxWidth,
  primaryCta,
  secondaryCta,
  primaryCtaSize = 'default',
  blocks,
  showHeroDivider = false,
  showFooterStrips = true,
  buildBoxHeadline,
  beforeFooterStrips,
}: Props) {
  const { askRav, startBox, goCategory } = useStorefrontActions();
  const mediumPrimary = primaryCtaSize === 'medium';
  const largePrimary = primaryCtaSize === 'large';

  return (
    <StorefrontChrome>
      <View style={styles.page}>
        <View
          style={[
            styles.hero,
            largePrimary ? styles.heroAfterLargeCta : null,
            showHeroDivider ? styles.heroBeforeDivider : null,
          ]}
        >
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.title}>{title}</Text>
          <View
            style={[
              styles.leadStack,
              leadMaxWidth != null ? { maxWidth: leadMaxWidth } : null,
            ]}
          >
            {normalizeLead(lead).map((segment, index) => (
              <View key={index} style={styles.leadSegment}>
                {segment.heading ? (
                  <Text style={styles.blockHeading}>{segment.heading}</Text>
                ) : null}
                <Text style={styles.lead}>{preventWidow(segment.body)}</Text>
              </View>
            ))}
          </View>

          {primaryCta || secondaryCta ? (
            <View
              style={[
                styles.ctas,
                mediumPrimary ? styles.ctasMedium : null,
                largePrimary ? styles.ctasLarge : null,
              ]}
            >
              {primaryCta ? (
                <TouchableOpacity
                  style={[
                    styles.ctaPrimary,
                    mediumPrimary ? styles.ctaPrimaryMedium : null,
                    largePrimary ? styles.ctaPrimaryLarge : null,
                    primaryCta.disabled ? styles.ctaDisabled : null,
                  ]}
                  onPress={primaryCta.onPress}
                  disabled={primaryCta.disabled}
                  accessibilityRole="button"
                  accessibilityLabel={primaryCta.label}
                  accessibilityState={{ disabled: Boolean(primaryCta.disabled) }}
                >
                  <Text
                    style={[
                      styles.ctaPrimaryText,
                      mediumPrimary ? styles.ctaPrimaryTextMedium : null,
                      largePrimary ? styles.ctaPrimaryTextLarge : null,
                    ]}
                  >
                    {primaryCta.label}
                  </Text>
                </TouchableOpacity>
              ) : null}
              {secondaryCta ? (
                <TouchableOpacity
                  style={[
                    styles.ctaSecondary,
                    secondaryCta.disabled ? styles.ctaDisabled : null,
                  ]}
                  onPress={secondaryCta.onPress}
                  disabled={secondaryCta.disabled}
                  accessibilityRole="button"
                  accessibilityLabel={secondaryCta.label}
                  accessibilityState={{ disabled: Boolean(secondaryCta.disabled) }}
                >
                  <Text style={styles.ctaSecondaryText}>{secondaryCta.label}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>

        {showHeroDivider ? <ArticleHairlineDivider /> : null}

        <ArticleBlocks blocks={blocks} />

        {beforeFooterStrips ?? null}

        {showFooterStrips ? (
          <View style={styles.footerStrips}>
            <StorefrontBuildBoxStrip
              onPress={startBox}
              headline={buildBoxHeadline}
              variant="content"
            />
            <StorefrontAskRavStrip onSubmit={(message) => askRav(message)} />
            <View style={styles.browseByAisle}>
              <BrowseByAisleHeader />
              <StorefrontCategoryRail
                heading={null}
                cards={STOREFRONT_HOME_AISLE_CARDS}
                onCategoryPress={(category) => goCategory(category)}
              />
            </View>
          </View>
        ) : null}
      </View>
    </StorefrontChrome>
  );
}

const styles = StyleSheet.create({
  page: {
    alignItems: 'center',
    width: '100%',
  },
  footerStrips: {
    width: '100%',
    alignSelf: 'stretch',
  },
  browseByAisle: {
    width: '100%',
    alignSelf: 'stretch',
    paddingBottom: spacing.xxxl,
  },
  aisleSectionHead: {
    width: '100%',
    maxWidth: 1024,
    alignSelf: 'center',
    paddingHorizontal: MOBILE_GUTTER,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  aisleSectionTitle: {
    ...typeface('medium'),
    fontSize: 28,
    letterSpacing: -0.3,
    color: semanticColors.logoDark,
  },
  hero: {
    width: '100%',
    maxWidth: COLUMN_MAX,
    alignSelf: 'center',
    alignItems: 'center',
    paddingHorizontal: MOBILE_GUTTER,
    paddingTop: 80,
    paddingBottom: spacing.xxxl,
    gap: spacing.sm,
  },
  /** Extra room between large hero CTA and first content block. */
  heroAfterLargeCta: {
    paddingBottom: spacing.xxl,
  },
  /** Spacing moves to the divider wrap so the rule sits centered in the gap. */
  heroBeforeDivider: {
    paddingBottom: 0,
  },
  heroDividerWrap: {
    width: '100%',
    maxWidth: COLUMN_MAX,
    alignSelf: 'center',
    paddingHorizontal: MOBILE_GUTTER,
    paddingVertical: spacing.xl,
  },
  heroDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: semanticColors.border,
    width: '100%',
  },
  eyebrow: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.goldMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
  },
  title: {
    ...typeface('medium'),
    fontSize: 32,
    // RN lineHeight is px only — 115% of fontSize (unitless % is not supported).
    lineHeight: 32 * 1.15,
    color: semanticColors.logoDark,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.md,
    ...(Platform.OS === 'web' ? ({ textWrap: 'balance' } as object) : null),
  },
  leadStack: {
    gap: spacing.md,
    width: '100%',
    alignSelf: 'center',
    alignItems: 'center',
  },
  leadSegment: {
    gap: spacing.sm,
    width: '100%',
    alignItems: 'center',
  },
  lead: {
    ...typeface('regular'),
    fontSize: 16,
    lineHeight: 24,
    color: semanticColors.textSecondary,
    textAlign: 'center',
    width: '100%',
    ...(Platform.OS === 'web' ? ({ textWrap: 'pretty' } as object) : null),
  },
  ctas: {
    gap: spacing.sm,
    marginTop: spacing.md,
    alignItems: 'center',
  },
  ctasMedium: {
    marginTop: spacing.md + spacing.xs,
  },
  ctasLarge: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  ctaPrimary: {
    backgroundColor: semanticColors.brand,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  /** Between default (sm/lg) and large (md/xl). */
  ctaPrimaryMedium: {
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  ctaPrimaryLarge: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  ctaPrimaryText: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  /** Mid scale between typography.md and blockHeading 22. */
  ctaPrimaryTextMedium: {
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.25,
  },
  /** Same type scale as blockHeading (“What comes in the Passover box?”). */
  ctaPrimaryTextLarge: {
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  ctaSecondary: {
    backgroundColor: 'transparent',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: semanticColors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  ctaSecondaryText: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
    textAlign: 'center',
  },
  ctaDisabled: {
    opacity: 0.72,
  },
  blocks: {
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingBottom: spacing.xxl,
    gap: spacing.xxl,
  },
  /** Cancels blocks `gap` so after-divider paddingVertical alone equals space above/below the hairline. */
  blockWithAfterDivider: {
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'center',
    marginBottom: -spacing.xxl,
  },
  block: {
    maxWidth: COLUMN_MAX,
    width: '100%',
    paddingHorizontal: MOBILE_GUTTER,
    gap: spacing.md,
    alignItems: 'center',
  },
  stepsPaperBlock: {
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepsPaperHeading: {
    maxWidth: 1024,
    paddingHorizontal: MOBILE_GUTTER,
  },
  stepsPaperShell: {
    marginTop: 0,
  },
  stepsOnPaper: {
    gap: 0,
    width: '100%',
    alignItems: 'center',
  },
  stepsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignSelf: 'center',
    width: 'auto',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  stepCol: {
    flexGrow: 0,
    flexShrink: 0,
    maxWidth: 160,
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  blockHeading: {
    ...typeface('medium'),
    fontSize: 22,
    lineHeight: 28,
    color: semanticColors.logoDark,
    letterSpacing: -0.3,
    textAlign: 'center',
    width: '100%',
  },
  /** Same type as hero `title`, with extra space before body. */
  blockHeadingTitle: {
    ...typeface('medium'),
    fontSize: 32,
    lineHeight: 32 * 1.15,
    color: semanticColors.logoDark,
    textAlign: 'center',
    width: '100%',
    marginBottom: spacing.lg,
    ...(Platform.OS === 'web' ? ({ textWrap: 'balance' } as object) : null),
  },
  thumbRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
    gap: spacing.sm,
  },
  thumbCell: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 64,
    minWidth: 64,
    aspectRatio: 1,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    backgroundColor: semanticColors.border,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  proseParagraphs: {
    width: '100%',
    gap: spacing.md,
    alignItems: 'center',
  },
  blockBody: {
    ...typeface('regular'),
    fontSize: 15,
    lineHeight: 22,
    color: semanticColors.textSecondary,
    textAlign: 'center',
    width: '100%',
    ...(Platform.OS === 'web' ? ({ textWrap: 'pretty' } as object) : null),
  },
  /** Medium / semibold (~500–600) — not bold 700. */
  blockBodySemibold: {
    ...typeface('medium'),
    color: semanticColors.logoDark,
  },
  blockBodyBold: {
    ...typeface('bold'),
    color: semanticColors.logoDark,
  },
  stepRow: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.xs,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.border,
    width: '100%',
  },
  stepNum: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textTertiary,
    textAlign: 'center',
  },
  stepCopy: {
    width: '100%',
    gap: spacing.xs,
    alignItems: 'center',
  },
  stepTitle: {
    ...typeface('medium'),
    fontSize: 15,
    color: semanticColors.logoDark,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  missionRow: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.border,
    width: '100%',
  },
  missionNum: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textTertiary,
    textAlign: 'center',
  },
  beliefsPaperBlock: {
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  beliefsPaperShell: {
    marginTop: 0,
    marginBottom: 0,
  },
  beliefsOnPaper: {
    gap: spacing.md,
    width: '100%',
    alignItems: 'center',
    overflow: 'visible',
  },
  beliefsLogoWrap: {
    marginBottom: spacing.md,
  },
  /** Match Passover / PaperCardStrip headline scale inside the paper shell. */
  beliefsPaperHeading: {
    ...typeface('medium'),
    fontSize: 28,
    lineHeight: 28,
    color: semanticColors.logoDark,
    textAlign: 'center',
    maxWidth: 400,
    alignSelf: 'center',
    marginBottom: spacing.md,
    ...(Platform.OS === 'web' ? ({ textWrap: 'balance' } as object) : null),
  },
  beliefsDeck: {
    width: '100%',
    gap: spacing.xl,
    alignItems: 'center',
  },
  beliefsTocList: {
    width: '100%',
    gap: 2,
    alignItems: 'center',
  },
  /** Flat 9-item TOC (no Practice / Personal / Practical section heads). */
  beliefsTocFlat: {
    width: '100%',
    gap: 2,
    alignItems: 'center',
  },
  beliefsTocFlatColumns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'stretch',
    width: '100%',
    // Side columns flex to the edges; middle hugs. 24px between columns.
    gap: MOBILE_GUTTER,
  },
  beliefsTocFlatCol: {
    gap: 2,
  },
  /** Fills to the left edge; copy block sits toward center. */
  beliefsTocFlatColLeft: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    alignItems: 'flex-end',
  },
  /** Hugs longest title; stays centered between the flanking columns. */
  beliefsTocFlatColCenter: {
    flexGrow: 0,
    flexShrink: 0,
    alignItems: 'center',
  },
  /** Fills to the right edge; copy block sits toward center. */
  beliefsTocFlatColRight: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    alignItems: 'flex-start',
  },
  /** Hug-width stack; titles center on a shared axis. */
  beliefsTocFlatColInner: {
    alignItems: 'center',
    gap: 2,
  },
  beliefsTocRow: {
    alignSelf: 'center',
    paddingVertical: 2,
    paddingHorizontal: 2,
    alignItems: 'center',
  },
  beliefsTocRowInColumn: {
    alignSelf: 'stretch',
    paddingHorizontal: 0,
    alignItems: 'center',
  },
  beliefsTocTitle: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: -0.1,
    textAlign: 'center',
  },
  beliefsTocTitleInColumn: {
    textAlign: 'center',
  },
  beliefsTocTitleActive: {
    color: semanticColors.logoDark,
    textDecorationLine: 'underline',
    textDecorationColor: semanticColors.logoDark,
  },
  beliefsCarouselWrap: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
  /** Tablet+: soft edge dissolve via mask. */
  beliefsCarouselWrapMasked: {
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({
          WebkitMaskImage:
            'linear-gradient(to right, transparent 0%, #000 18%, #000 82%, transparent 100%)',
          maskImage:
            'linear-gradient(to right, transparent 0%, #000 18%, #000 82%, transparent 100%)',
        } as object)
      : null),
  },
  /** Mobile: no mask / blur — cards stay sharp edge to edge. */
  beliefsCarouselWrapOpen: {
    overflow: 'visible',
    ...(Platform.OS === 'web' ? ({ overflowY: 'visible' } as object) : null),
  },
  beliefsCarouselScroll: {
    overflow: 'visible',
    ...(Platform.OS === 'web' ? ({ overflowY: 'visible' } as object) : null),
  },
  beliefsCarouselContent: {
    alignItems: 'stretch',
  },
  beliefCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: borderRadius.md,
    borderWidth: 0,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
    justifyContent: 'center',
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 6px 18px rgba(20, 20, 20, 0.08)' } as object)
      : null),
  },
  beliefCardEyebrow: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textSecondary,
    textAlign: 'center',
    letterSpacing: -0.1,
  },
  beliefCardTitle: {
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.25,
    ...(Platform.OS === 'web' ? ({ textWrap: 'balance' } as object) : null),
  },
  beliefCardBody: {
    ...typeface('regular'),
    fontSize: 14,
    lineHeight: 20,
    color: semanticColors.textSecondary,
    textAlign: 'center',
    ...(Platform.OS === 'web' ? ({ textWrap: 'pretty' } as object) : null),
  },
  beliefsDots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  beliefsDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(20, 20, 20, 0.2)',
  },
  beliefsDotActive: {
    backgroundColor: semanticColors.logoDark,
    width: 16,
  },
  beliefsDeckHint: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textTertiary,
    textAlign: 'center',
  },
  beliefsOnPaperList: {
    width: '100%',
    gap: 0,
    alignItems: 'center',
    overflow: 'visible',
    zIndex: 1,
  },
  beliefsSections: {
    width: '100%',
    gap: spacing.xl,
    alignItems: 'center',
    overflow: 'visible',
  },
  beliefsSectionsColumns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    overflow: 'visible',
  },
  beliefSection: {
    width: '100%',
    gap: spacing.xs,
    alignItems: 'center',
    overflow: 'visible',
  },
  beliefSectionColumn: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    overflow: 'visible',
  },
  beliefSectionLast: {},
  beliefSectionHeading: {
    ...typeface('medium'),
    fontSize: 22,
    lineHeight: 28,
    color: semanticColors.logoDark,
    letterSpacing: -0.3,
    textAlign: 'center',
    width: '100%',
    marginTop: spacing.md,
  },
  beliefSectionHeadingFirst: {
    marginTop: 0,
  },
  beliefSectionHeadingColumn: {
    marginTop: 0,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: -0.15,
    marginBottom: 2,
  },
  beliefSectionIntro: {
    marginBottom: spacing.xs,
  },
  beliefGroup: {
    width: '100%',
    gap: spacing.xs,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  beliefGroupHeading: {
    ...typeface('medium'),
    fontSize: 16,
    lineHeight: 22,
    color: semanticColors.logoDark,
    letterSpacing: -0.2,
    textAlign: 'center',
    width: '100%',
  },
  beliefRow: {
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.border,
    alignItems: 'center',
    width: '100%',
    position: 'relative',
    zIndex: 0,
    overflow: 'visible',
  },
  beliefRowInColumn: {
    borderBottomWidth: 0,
    paddingVertical: spacing.xs,
  },
  beliefRowLast: {
    borderBottomWidth: 0,
  },
  beliefRowHovered: {
    zIndex: 20,
  },
  beliefTitle: {
    ...typeface('medium'),
    fontSize: 15,
    lineHeight: 20,
    color: semanticColors.logoDark,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  beliefTitleItalic: {
    fontStyle: 'italic',
  },
  beliefTooltip: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: spacing.xs,
    zIndex: 21,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 280,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.border,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 8px 24px rgba(20, 20, 20, 0.14)',
        } as object)
      : null),
  },
  beliefTooltipText: {
    ...typeface('regular'),
    fontSize: 13,
    lineHeight: 18,
    color: semanticColors.textSecondary,
    textAlign: 'center',
  },
  visualPlaceholder: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    backgroundColor: semanticColors.bgDark,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  visualPlaceholderText: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.goldMuted,
    textAlign: 'center',
  },
  band: {
    backgroundColor: semanticColors.bgDark,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
    width: '100%',
  },
  bandPaperBlock: {
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  bandPaperShell: {
    marginTop: 0,
    marginBottom: 0,
  },
  bandOnPaper: {
    gap: spacing.lg,
    width: '100%',
    alignItems: 'center',
  },
  bandPaperHeading: {
    ...typeface('medium'),
    fontSize: 32,
    lineHeight: 36,
    color: semanticColors.logoDark,
    letterSpacing: -0.3,
    textAlign: 'center',
    width: '100%',
    ...(Platform.OS === 'web' ? ({ textWrap: 'balance' } as object) : null),
  },
  bandCtas: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  bandCtasRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'stretch',
    maxWidth: 560,
    alignSelf: 'center',
  },
  bandCta: {
    alignSelf: 'stretch',
    maxWidth: 360,
    width: '100%',
    backgroundColor: semanticColors.brand,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  bandCtaRowItem: {
    flex: 1,
    maxWidth: undefined,
    width: undefined,
    alignSelf: 'stretch',
  },
  bandCtaText: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
    textAlign: 'center',
  },
  bandCtaSecondary: {
    alignSelf: 'stretch',
    maxWidth: 360,
    width: '100%',
    backgroundColor: 'transparent',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: semanticColors.logoDark,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  bandCtaSecondaryText: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
    textAlign: 'center',
  },
  linkGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
    justifyContent: 'flex-start',
  },
  /** Roomier gap under “Get involved” (and other link-list headings). */
  linkListBlock: {
    gap: spacing.xl,
    marginBottom: spacing.xl,
  },
  linkCell: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: semanticColors.goldMuted,
    borderRadius: borderRadius.md,
    backgroundColor: semanticColors.bgPrimary,
  },
  /** Before onLayout: ~2-up so the first paint isn’t a single tall column. */
  linkCellFallback: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '45%',
    maxWidth: '50%',
  },
  linkLabel: {
    ...typeface('medium'),
    fontSize: 15,
    color: semanticColors.logoDark,
    textAlign: 'center',
  },
  linkDetail: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textTertiary,
    textAlign: 'center',
  },
  /** Intrinsic width = widest row; centered in the article column. */
  roadList: {
    alignSelf: 'center',
  },
  roadGroup: {
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  roadTag: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textTertiary,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: semanticColors.logoDark,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  roadItem: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.border,
  },
  /** Rows with a CTA button: roomier vertical padding. */
  roadItemWithCta: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  /** Date+title-only rows: tighter vertical padding so they don’t look empty without a CTA.
   * Vertical padding lives only here (not on roadItem) so RN-web atomic classes can’t leave
   * the taller base paddingTop in place.
   * Optically biased (4/8 vs equal xs): date line-height leaves more empty above the glyphs
   * than the title leaves below, so equal padding reads top-heavy. */
  roadItemNoCta: {
    paddingTop: 4,
    paddingBottom: 8,
  },
  roadWhen: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textTertiary,
    textAlign: 'center',
  },
  roadWhat: {
    ...typeface('medium'),
    fontSize: 14,
    color: semanticColors.logoDark,
    textAlign: 'center',
  },
  roadCta: {
    marginTop: spacing.xs,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
  },
  roadCtaPrimary: {
    backgroundColor: semanticColors.brand,
  },
  roadCtaOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: semanticColors.logoDark,
  },
  roadCtaText: {
    ...typeface('medium'),
    fontSize: typography.sm,
    textAlign: 'center',
  },
  roadCtaTextPrimary: {
    color: semanticColors.logoDark,
  },
  roadCtaTextOutline: {
    color: semanticColors.logoDark,
  },
  /** Standalone section CTA under a blockHeading (e.g. Lunar Cycle). */
  sectionCta: {
    alignSelf: 'center',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  sectionCtaText: {
    ...typeface('medium'),
    fontSize: typography.md,
    textAlign: 'center',
  },
});
