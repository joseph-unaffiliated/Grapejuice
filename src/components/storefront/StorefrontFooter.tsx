import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  type LayoutChangeEvent,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { GrapejuiceBrandMark } from '../brand/GrapejuiceBrandMark';
import { STOREFRONT_CATEGORIES } from '../../constants/storefrontCategories';
import type { MainStackParamList } from '../../navigation/types';
import { useLayoutBreakpoint } from '../../hooks/useLayoutBreakpoint';
import { isStorefrontRavOpenable, openStorefrontRav } from './storefrontRavContext';
import {
  MOBILE_GUTTER,
  WEB_FONT_FAMILY,
  borderRadius,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

type Nav = StackNavigationProp<MainStackParamList>;

type FooterLink = {
  label: string;
  onPress?: () => void;
  /** Non-interactive chip beside the label (e.g. Coming soon). */
  badge?: string;
};

type FooterColumn = {
  heading: string;
  links: FooterLink[];
  /** Marketplace: pack links into N side-by-side lists. */
  linkColumns?: number;
};

/** True black — not brand grey (`logoDark`). */
const FOOTER_BG = '#000000';
const FOOTER_FG = '#FFFFFF';
const FOOTER_LINK = semanticColors.brand;
const WORDMARK_LABEL = 'Grapejuice';
const WORDMARK_LETTER_SPACING = -4;
/** Seed before canvas/layout measure. */
const WORDMARK_WIDTH_DIVISOR = 6.2;

/** Natural glyph width at `fontSize` (no horizontal stretch). */
function measureWordmarkWidth(fontSize: number): number {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = `700 ${fontSize}px ${WEB_FONT_FAMILY}, sans-serif`;
      const base = ctx.measureText(WORDMARK_LABEL).width;
      // Canvas ignores CSS letter-spacing; apply manually.
      return base + WORDMARK_LETTER_SPACING * (WORDMARK_LABEL.length - 1);
    }
  }
  // Native / fallback: bold sans ≈ 0.62em average advance.
  return fontSize * WORDMARK_LABEL.length * 0.55 + WORDMARK_LETTER_SPACING * (WORDMARK_LABEL.length - 1);
}

function fitWordmarkFontSize(targetWidth: number): number {
  if (targetWidth <= 0) return 120;
  let size = Math.max(64, targetWidth / WORDMARK_WIDTH_DIVISOR);
  const measured = measureWordmarkWidth(size);
  if (measured <= 0) return size;
  return Math.max(48, size * (targetWidth / measured));
}

function chunkLinks(links: FooterLink[], columns: number): FooterLink[][] {
  const cols = Math.max(1, columns);
  const size = Math.ceil(links.length / cols);
  return Array.from({ length: cols }, (_, i) => links.slice(i * size, (i + 1) * size)).filter(
    (stack) => stack.length > 0,
  );
}

function FooterLinkRow({ link }: { link: FooterLink }) {
  const label = (
    <Text style={[styles.link, !link.onPress && styles.linkMuted]}>{link.label}</Text>
  );
  const badge = link.badge ? (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{link.badge}</Text>
    </View>
  ) : null;

  if (!link.onPress) {
    return (
      <View
        style={styles.linkRow}
        accessibilityRole="text"
        accessibilityLabel={link.badge ? `${link.label}, ${link.badge}` : link.label}
      >
        {label}
        {badge}
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={link.onPress}
      accessibilityRole="link"
      accessibilityLabel={link.label}
      hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
      style={styles.linkRow}
    >
      {label}
      {badge}
    </TouchableOpacity>
  );
}

/**
 * Deep storefront footer — mark left, link columns right.
 * Scrolls with the page (never fixed).
 */
export function StorefrontFooter() {
  const navigation = useNavigation<Nav>();
  const { isCompact: compact } = useLayoutBreakpoint();
  /** Shared shell width with the menu row — wordmark “e” aligns to contact column right edge. */
  const [shellWidth, setShellWidth] = useState(0);
  const [wordmarkFontSize, setWordmarkFontSize] = useState(120);

  const onShellLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - shellWidth) > 1) setShellWidth(w);
  };

  useEffect(() => {
    if (shellWidth <= 0) return;
    setWordmarkFontSize(fitWordmarkFontSize(shellWidth));
  }, [shellWidth]);

  const columns = useMemo((): FooterColumn[] => {
    const goCategory = (slug: string) =>
      navigation.navigate('StorefrontCategory', { category: slug });

    const marketplaceLinks: FooterLink[] = STOREFRONT_CATEGORIES.filter(
      (c) => c.slug !== 'collection'
    ).map((c) => ({
      label: c.label,
      onPress: () => goCategory(c.slug),
    }));

    return [
      {
        heading: 'The Collection',
        linkColumns: 3,
        links: [
          { label: 'Shop all', onPress: () => goCategory('collection') },
          ...marketplaceLinks,
        ],
      },
      {
        heading: 'Company',
        links: [
          {
            label: 'Our story',
            onPress: () => navigation.navigate('StorefrontOurStory'),
          },
          {
            label: 'Passover 2027',
            onPress: () => navigation.navigate('StorefrontPassover'),
          },
          {
            label: 'Account',
            onPress: () => navigation.navigate('MainTabs', { screen: 'Account' }),
          },
          {
            label: 'Terms',
            onPress: () => {
              void Linking.openURL('https://unaffiliated.co/terms/network');
            },
          },
          {
            label: 'Privacy',
            onPress: () => {
              void Linking.openURL('https://unaffiliated.co/privacy/network');
            },
          },
        ],
      },
      {
        heading: 'Contact',
        links: [
          {
            label: 'Ask Rav',
            onPress: () => {
              if (isStorefrontRavOpenable()) {
                openStorefrontRav();
                return;
              }
              navigation.navigate('MainTabs', {
                screen: 'Rav',
                params: { view: 'welcome' },
              });
            },
          },
          {
            label: 'hello@grapejuice.co',
            onPress: () => {
              void Linking.openURL('mailto:hello@grapejuice.co');
            },
          },
        ],
      },
    ];
  }, [navigation]);

  return (
    <View style={styles.root} accessibilityRole="contentinfo">
      <View style={styles.shell} onLayout={onShellLayout}>
        <View style={[styles.inner, compact && styles.innerCompact]}>
          <TouchableOpacity
            style={styles.brand}
            onPress={() => navigation.navigate('StorefrontHome')}
            accessibilityRole="button"
            accessibilityLabel="Grapejuice store home"
          >
            <GrapejuiceBrandMark markOnly compact color={FOOTER_LINK} decorative />
          </TouchableOpacity>

          <View style={[styles.columns, compact && styles.columnsCompact]}>
            {columns.map((col) => {
              const stacks =
                col.linkColumns && col.linkColumns > 1
                  ? chunkLinks(col.links, col.linkColumns)
                  : [col.links];

              return (
                <View key={col.heading} style={styles.column}>
                  <Text style={styles.heading}>{col.heading}</Text>
                  {stacks.length > 1 ? (
                    <View style={styles.linkGrid}>
                      {stacks.map((stack, i) => (
                        <View key={`${col.heading}-${i}`} style={styles.linkStack}>
                          {stack.map((link) => (
                            <FooterLinkRow key={link.label} link={link} />
                          ))}
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.linkStack}>
                      {col.links.map((link) => (
                        <FooterLinkRow key={link.label} link={link} />
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>
        <Text
          style={[
            styles.wordmarkWatermark,
            {
              fontSize: wordmarkFontSize,
              lineHeight: wordmarkFontSize,
              letterSpacing: WORDMARK_LETTER_SPACING,
            },
          ]}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {WORDMARK_LABEL}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    // With StorefrontChrome scrollContent flexGrow:1, this pins the footer to the
    // viewport bottom on short pages (empty space sits above, not below).
    marginTop: 'auto',
    backgroundColor: FOOTER_BG,
    paddingTop: MOBILE_GUTTER,
    paddingBottom: spacing.lg,
    paddingHorizontal: MOBILE_GUTTER,
    // Cover RN-web / svh subpixel seam that flashes the light page bg under the footer.
    // Bleed stays inside the scrollport (overflow:hidden clips negative margin).
    ...(Platform.OS === 'web'
      ? ({
          paddingBottom: spacing.lg + 48,
          boxShadow: `0 48px 0 0 ${FOOTER_BG}`,
        } as object)
      : null),
  },
  /** Same width as the menu row so wordmark right edge = contact column right edge. */
  shell: {
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
  },
  wordmarkWatermark: {
    ...typeface('bold'),
    color: FOOTER_LINK,
    opacity: 0.1,
    alignSelf: 'flex-start',
    marginTop: spacing.lg,
    marginBottom: 0,
    ...(Platform.OS === 'web'
      ? ({
          userSelect: 'none',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        } as object)
      : null),
  },
  inner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xxl,
  },
  innerCompact: {
    flexDirection: 'column',
    gap: spacing.xl,
  },
  brand: {
    paddingTop: 2,
    flexShrink: 0,
  },
  columns: {
    // Hug content; auto margin fills free space left of the group (logo stays left).
    marginLeft: 'auto',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 64,
    flexShrink: 1,
  },
  columnsCompact: {
    marginLeft: 0,
    alignSelf: 'stretch',
  },
  column: {
    // Width from content only — no flexGrow / basis / maxWidth stretch.
    flexGrow: 0,
    flexShrink: 0,
  },
  heading: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: FOOTER_FG,
    letterSpacing: -0.2,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  linkGrid: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  linkStack: {
    // Tighter vertical rhythm between links (was spacing.sm / 12).
    gap: spacing.xs,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  link: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: FOOTER_LINK,
    letterSpacing: -0.2,
    paddingVertical: 0,
  },
  linkMuted: {
    color: 'rgba(216, 201, 144, 0.72)',
  },
  badge: {
    backgroundColor: 'rgba(244, 237, 220, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: FOOTER_LINK,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
  },
  badgeText: {
    ...typeface('regular'),
    fontSize: typography.xs,
    color: FOOTER_LINK,
    letterSpacing: -0.1,
  },
});
