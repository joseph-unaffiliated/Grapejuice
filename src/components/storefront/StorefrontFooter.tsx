import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { GrapejuiceBrandMark } from '../brand/GrapejuiceBrandMark';
import { STOREFRONT_CATEGORIES } from '../../constants/storefrontCategories';
import {
  FOOTER_WHO_ITS_FOR,
  landingScreenForAudience,
  type LandingAudienceConfig,
} from '../../constants/landingAudiences';
import type { MainStackParamList } from '../../navigation/types';
import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { useEntryContextStore } from '../../stores/entryContextStore';
import { usePreviewedIsAuthenticated } from '../../hooks/useUserStatePreview';
import { isStorefrontRavOpenable, openStorefrontRav } from './storefrontRavContext';
import {
  LAYOUT,
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

type Nav = StackNavigationProp<MainStackParamList>;

type FooterLink = {
  label: string;
  onPress: () => void;
};

type FooterColumn = {
  heading: string;
  links: FooterLink[];
  /** Marketplace: pack links into N side-by-side lists. */
  linkColumns?: number;
};

/** True black — not brand navy/purple (`logoDark` #110222). */
const FOOTER_BG = '#000000';
const FOOTER_FG = '#FFFFFF';
const FOOTER_LINK = semanticColors.brand;

function chunkLinks(links: FooterLink[], columns: number): FooterLink[][] {
  const cols = Math.max(1, columns);
  const size = Math.ceil(links.length / cols);
  return Array.from({ length: cols }, (_, i) => links.slice(i * size, (i + 1) * size)).filter(
    (stack) => stack.length > 0,
  );
}

function FooterLinkButton({ link }: { link: FooterLink }) {
  return (
    <TouchableOpacity
      onPress={link.onPress}
      accessibilityRole="link"
      accessibilityLabel={link.label}
      hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
    >
      <Text style={styles.link}>{link.label}</Text>
    </TouchableOpacity>
  );
}

/**
 * Deep storefront footer — mark left, link columns right.
 * Scrolls with the page (never fixed).
 */
export function StorefrontFooter() {
  const navigation = useNavigation<Nav>();
  const isAuthenticated = usePreviewedIsAuthenticated();
  const captureEntry = useEntryContextStore((s) => s.capture);
  const { width } = useWindowDimensions();
  const compact = width < LAYOUT.BREAKPOINT_TABLET;

  const columns = useMemo((): FooterColumn[] => {
    const goCategory = (slug: string) =>
      navigation.navigate('StorefrontCategory', { category: slug });

    const startBox = () => {
      if (!isAuthenticated) {
        useGuestSessionStore.getState().startBuildBox();
        return;
      }
      navigation.navigate('MyBox');
    };

    const openAudienceLanding = (audience: LandingAudienceConfig) => {
      const screen = landingScreenForAudience(audience.id);
      if (!screen) return;
      captureEntry({
        audienceId: audience.id,
        sourcePath: audience.path,
        utm: null,
      });
      navigation.navigate(screen);
    };

    const marketplaceLinks: FooterLink[] = STOREFRONT_CATEGORIES.filter(
      (c) => c.slug !== 'collection'
    ).map((c) => ({
      label: c.label,
      onPress: () => goCategory(c.slug),
    }));

    return [
      {
        heading: 'Marketplace',
        linkColumns: 3,
        links: [
          { label: 'Shop all', onPress: () => goCategory('collection') },
          ...marketplaceLinks,
        ],
      },
      {
        heading: 'Who its for',
        links: FOOTER_WHO_ITS_FOR.map((audience) => ({
          label: audience.navLabel,
          onPress: () => openAudienceLanding(audience),
        })),
      },
      {
        heading: 'Seasonal boxes',
        links: [
          { label: '2026 Hanukkah Box', onPress: startBox },
          { label: '2027 Passover', onPress: () => navigation.navigate('StorefrontPassover') },
          { label: 'My Box', onPress: () => navigation.navigate('MyBox') },
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
            label: 'hello@grapejuice.com',
            onPress: () => {
              void Linking.openURL('mailto:hello@grapejuice.com');
            },
          },
        ],
      },
    ];
  }, [captureEntry, isAuthenticated, navigation]);

  return (
    <View style={styles.root} accessibilityRole="contentinfo">
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
                          <FooterLinkButton key={link.label} link={link} />
                        ))}
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.linkStack}>
                    {col.links.map((link) => (
                      <FooterLinkButton key={link.label} link={link} />
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
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
    paddingVertical: spacing.xxl,
    paddingHorizontal: MOBILE_GUTTER,
  },
  inner: {
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
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
  link: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: FOOTER_LINK,
    letterSpacing: -0.2,
    paddingVertical: 0,
  },
});
