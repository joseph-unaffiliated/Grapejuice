import React, { useState } from 'react';
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

const COLUMN_MAX = 720;

export type StorefrontArticleCta = {
  label: string;
  onPress: () => void;
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
       * Single string, or ordered runs joined into one continuous prose block
       * (weighted spans sit inline — no stacked paragraph gaps).
       */
      body: string | readonly StorefrontArticleProseLine[];
      /** Decorative square thumbs rendered under the heading (before body). */
      thumbs?: readonly ImageSourcePropType[];
      /**
       * Hairline rule after this block (before the next). Same hairline + equal
       * vertical padding as `showHeroDivider`.
       */
      showDividerAfter?: boolean;
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
      body: string;
      cta?: StorefrontArticleCta;
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

function normalizeProseBody(
  body: string | readonly StorefrontArticleProseLine[],
): { body: string; weight: StorefrontArticleProseWeight }[] {
  const lines = typeof body === 'string' ? [body] : body;
  return lines
    .map((line) => {
      if (typeof line === 'string') {
        const text = line.trim();
        return text ? { body: text, weight: 'regular' as const } : null;
      }
      const text = line.body.trim();
      if (!text) return null;
      return { body: text, weight: line.weight ?? 'regular' };
    })
    .filter((line): line is { body: string; weight: StorefrontArticleProseWeight } => line != null);
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

function BeliefTitle({ title }: { title: string }) {
  const runs = parseBeliefTitleRuns(title);
  if (runs.length === 1 && !runs[0].italic) {
    return <Text style={styles.beliefTitle}>{runs[0].text}</Text>;
  }
  return (
    <Text style={styles.beliefTitle}>
      {runs.map((run, index) => (
        <Text key={index} style={run.italic ? styles.beliefTitleItalic : undefined}>
          {run.text}
        </Text>
      ))}
    </Text>
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
            <Text style={styles.blockBody}>{item.body}</Text>
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
  const columns = Boolean(
    sections &&
      sections.length >= 2 &&
      sections.length <= 3 &&
      windowWidth >= LAYOUT.BREAKPOINT_TABLET,
  );
  /** Hover tooltips for hierarchical / paper beliefs (Our Story); flat lists stay open. */
  const tooltips = Boolean(sections && sections.length > 0) || Boolean(onPaper);

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
    return <BeliefItemsList items={items} onPaper={onPaper} tooltips={tooltips} />;
  }
  return null;
}

function ArticleProseBody({ body }: { body: string | readonly StorefrontArticleProseLine[] }) {
  const lines = normalizeProseBody(body);
  if (lines.length === 0) return null;
  if (lines.length === 1) {
    const line = lines[0];
    return (
      <Text style={[styles.blockBody, proseWeightStyle(line.weight)]}>{line.body}</Text>
    );
  }
  // One Text parent + nested spans so weighted runs stay inline (no paragraph gaps).
  return (
    <Text style={styles.blockBody}>
      {lines.map((line, index) => (
        <Text key={index} style={proseWeightStyle(line.weight)}>
          {index > 0 ? ' ' : ''}
          {line.body}
        </Text>
      ))}
    </Text>
  );
}

/** Prefer 3-up when the list’s own width fits it; else 2. Gaps instead of hairlines. */
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
    <View style={styles.block}>
      {heading ? <Text style={styles.blockHeading}>{heading}</Text> : null}
      <View style={[styles.linkGrid, { gap }]} onLayout={onLayout}>
        {items.map((item) => (
          <TouchableOpacity
            key={item.label}
            style={[styles.linkCell, cellWidth > 0 ? { width: cellWidth } : styles.linkCellFallback]}
            onPress={item.onPress}
            accessibilityRole="link"
            accessibilityLabel={item.label}
          >
            <Text style={styles.linkLabel}>{item.label}</Text>
            {item.detail ? <Text style={styles.linkDetail}>{item.detail}</Text> : null}
          </TouchableOpacity>
        ))}
      </View>
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
                <View style={styles.block}>
                  {block.heading ? <Text style={styles.blockHeading}>{block.heading}</Text> : null}
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
                    contentMaxWidth={960}
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
          case 'band': {
            const bandInner = (
              <>
                <Text style={block.paper ? styles.bandPaperHeading : styles.blockHeading}>
                  {block.heading}
                </Text>
                <Text style={styles.blockBody}>{block.body}</Text>
                {block.cta ? (
                  <TouchableOpacity
                    style={styles.bandCta}
                    onPress={block.cta.onPress}
                    accessibilityRole="button"
                    accessibilityLabel={block.cta.label}
                  >
                    <Text style={styles.bandCtaText}>{block.cta.label}</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            );
            if (block.paper) {
              return (
                <View key={key} style={styles.bandPaperBlock}>
                  <StorefrontPaperCardShell
                    style={styles.bandPaperShell}
                    contentStyle={styles.bandOnPaper}
                  >
                    {bandInner}
                  </StorefrontPaperCardShell>
                </View>
              );
            }
            return (
              <View key={key} style={styles.block}>
                <View style={styles.band}>{bandInner}</View>
              </View>
            );
          }
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
                                ]}
                                onPress={item.cta.onPress}
                                accessibilityRole="button"
                                accessibilityLabel={item.cta.label}
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
                <Text style={styles.lead}>{segment.body}</Text>
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
                  ]}
                  onPress={primaryCta.onPress}
                  accessibilityRole="button"
                  accessibilityLabel={primaryCta.label}
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
                  style={styles.ctaSecondary}
                  onPress={secondaryCta.onPress}
                  accessibilityRole="button"
                  accessibilityLabel={secondaryCta.label}
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
    lineHeight: 38,
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
  blockBody: {
    ...typeface('regular'),
    fontSize: 15,
    lineHeight: 22,
    color: semanticColors.textSecondary,
    textAlign: 'center',
    width: '100%',
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
    gap: spacing.sm,
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
    lineHeight: 34,
    color: semanticColors.logoDark,
    textAlign: 'center',
    maxWidth: 400,
    alignSelf: 'center',
    marginBottom: spacing.xl,
    ...(Platform.OS === 'web' ? ({ textWrap: 'balance' } as object) : null),
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
    gap: spacing.lg,
    overflow: 'visible',
  },
  beliefSection: {
    width: '100%',
    gap: spacing.sm,
    alignItems: 'center',
    overflow: 'visible',
  },
  beliefSectionColumn: {
    flex: 1,
    minWidth: 0,
    gap: spacing.md,
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
    fontSize: 20,
    lineHeight: 26,
    marginBottom: spacing.xs,
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
    gap: spacing.sm,
    width: '100%',
    alignItems: 'center',
  },
  bandPaperHeading: {
    ...typeface('medium'),
    fontSize: 22,
    lineHeight: 28,
    color: semanticColors.logoDark,
    letterSpacing: -0.3,
    textAlign: 'center',
    width: '100%',
    ...(Platform.OS === 'web' ? ({ textWrap: 'balance' } as object) : null),
  },
  bandCta: {
    alignSelf: 'center',
    marginTop: spacing.sm,
    backgroundColor: semanticColors.brand,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  bandCtaText: {
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
  linkCell: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
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
