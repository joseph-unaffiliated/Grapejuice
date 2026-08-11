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
import type { MainStackParamList } from '../../navigation/types';
import { useAuthStore } from '../../stores/authStore';
import { useGuestSessionStore } from '../../stores/guestSessionStore';
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
};

/** Brand deep navy (logoDark) — white type/icons on top. */
const FOOTER_BG = semanticColors.logoDark;
const FOOTER_FG = '#FFFFFF';
const FOOTER_MUTED = 'rgba(255, 255, 255, 0.72)';

/**
 * Deep storefront footer — mark left, link columns right.
 * Scrolls with the page (never fixed).
 */
export function StorefrontFooter() {
  const navigation = useNavigation<Nav>();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
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

    const marketplaceLinks: FooterLink[] = STOREFRONT_CATEGORIES.filter(
      (c) => c.slug !== 'collection'
    ).map((c) => ({
      label: c.label,
      onPress: () => goCategory(c.slug),
    }));

    return [
      {
        heading: 'Marketplace',
        links: [
          { label: 'Shop all', onPress: () => goCategory('collection') },
          ...marketplaceLinks,
        ],
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
            label: 'Store home',
            onPress: () => navigation.navigate('StorefrontHome'),
          },
          {
            label: 'Account',
            onPress: () => navigation.navigate('MainTabs', { screen: 'Account' }),
          },
        ],
      },
      {
        heading: 'Contact',
        links: [
          {
            label: 'Ask Rav',
            onPress: () =>
              navigation.navigate('MainTabs', {
                screen: 'Rav',
                params: { view: 'welcome' },
              }),
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
  }, [isAuthenticated, navigation]);

  return (
    <View style={styles.root} accessibilityRole="contentinfo">
      <View style={[styles.inner, compact && styles.innerCompact]}>
        <TouchableOpacity
          style={styles.brand}
          onPress={() => navigation.navigate('StorefrontHome')}
          accessibilityRole="button"
          accessibilityLabel="Grapejuice store home"
        >
          <GrapejuiceBrandMark markOnly compact color={FOOTER_FG} decorative />
        </TouchableOpacity>

        <View style={[styles.columns, compact && styles.columnsCompact]}>
          {columns.map((col) => (
            <View key={col.heading} style={[styles.column, compact && styles.columnCompact]}>
              <Text style={styles.heading}>{col.heading}</Text>
              {col.links.map((link) => (
                <TouchableOpacity
                  key={link.label}
                  onPress={link.onPress}
                  accessibilityRole="link"
                  accessibilityLabel={link.label}
                  hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                >
                  <Text style={styles.link}>{link.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
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
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.xl,
    minWidth: 0,
  },
  columnsCompact: {
    justifyContent: 'flex-start',
  },
  column: {
    gap: spacing.sm,
    minWidth: 140,
    flexGrow: 1,
    flexBasis: 140,
    maxWidth: 220,
  },
  columnCompact: {
    maxWidth: '46%',
    flexBasis: '42%',
  },
  heading: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: FOOTER_FG,
    letterSpacing: -0.2,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  link: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: FOOTER_MUTED,
    letterSpacing: -0.2,
    paddingVertical: 2,
  },
});
