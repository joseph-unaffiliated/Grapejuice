import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Icon } from '../ui/Icon';
import { SearchPill, SEARCH_PILL_HEIGHT } from '../ui/SearchPill';
import { icons } from '../../constants/icons';
import { GrapejuiceBrandMark } from '../brand/GrapejuiceBrandMark';
import { StorefrontAccountMenu } from './StorefrontAccountMenu';
import { StorefrontCartBoxButton } from './StorefrontCartBoxButton';
import { StorefrontMobileNav } from './StorefrontMobileNav';
import { useStorefrontRav } from './storefrontRavContext';
import { useStorefrontLeave } from './storefrontLeaveContext';
import type { MainStackParamList } from '../../navigation/types';
import {
  LAYOUT,
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
} from '../../constants/theme';

type Nav = StackNavigationProp<MainStackParamList>;

type Props = {
  onLogoPress?: () => void;
};

/** Preferred side column width on a wide desktop row. */
const SIDE_COL = 340;
/** Tighter horizontal inset on mobile header only. */
const MOBILE_HEADER_GUTTER = 16;
const RAV_BTN = SEARCH_PILL_HEIGHT;
const SEARCH_GO_SIZE = 28;
const SEARCH_TRAILING_WIDTH = 28;
const SEARCH_LEADING_WIDTH = 20;
/** Floor for the desktop search pill — below this we collapse to the mobile header. */
const SEARCH_MIN_WIDTH = 200;
/** Logo column can compress to mark + truncated wordmark. */
const SIDE_MIN_LEFT = 148;
/** Account + cart buttons. */
const SIDE_MIN_RIGHT = 36 + spacing.sm + 36;
const SEARCH_CLUSTER_MIN = SEARCH_MIN_WIDTH + RAV_BTN + spacing.sm;
const SEARCH_CLUSTER_MAX = SIDE_COL + RAV_BTN + spacing.sm;

function canFitDesktopSearch(windowWidth: number): boolean {
  const contentW = windowWidth - MOBILE_GUTTER * 2;
  return contentW >= SIDE_MIN_LEFT + SIDE_MIN_RIGHT + SEARCH_CLUSTER_MIN + spacing.sm * 2;
}

/**
 * Desktop: logo left, centered SearchPill + Rav, account menu right.
 * Mobile: menu + mark | account; full-width search + Rav below.
 */
export function StorefrontHeader({ onLogoPress }: Props) {
  const navigation = useNavigation<Nav>();
  const leave = useStorefrontLeave();
  const { openRav } = useStorefrontRav();
  const [query, setQuery] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const { width } = useWindowDimensions();
  const compact = width < LAYOUT.BREAKPOINT_TABLET || !canFitDesktopSearch(width);

  const submitSearch = () => {
    const msg = query.trim();
    if (!msg) return;
    if (leave) {
      leave({ type: 'category', slug: 'collection', q: msg });
      return;
    }
    navigation.navigate('StorefrontCategory', {
      category: 'collection',
      q: msg,
    });
  };

  const ravButton = (
    <TouchableOpacity
      style={styles.ravBtn}
      onPress={() => openRav()}
      accessibilityRole="button"
      accessibilityLabel="Ask Rav"
    >
      <Icon icon={icons.childReaching} size={18} color={semanticColors.logoDark} />
    </TouchableOpacity>
  );

  const searchGo = (
    <TouchableOpacity
      style={[styles.searchGo, !query.trim() && styles.searchGoIdle]}
      onPress={submitSearch}
      disabled={!query.trim()}
      accessibilityRole="button"
      accessibilityLabel="Search"
      hitSlop={8}
    >
      <Icon icon={icons.arrowUp} size={16} color={semanticColors.brand} />
    </TouchableOpacity>
  );

  const searchCluster = (
    <View style={compact ? styles.searchClusterMobile : styles.searchClusterDesktop}>
      <View style={compact ? styles.searchWrapMobile : styles.searchWrapDesktop}>
        <SearchPill
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={submitSearch}
          placeholder="Search"
          animatePlaceholder={false}
          textAlign="left"
          accessibilityLabel="Search"
          leading={
            <Icon icon={icons.search} size={14} color={semanticColors.goldMuted} />
          }
          leadingWidth={SEARCH_LEADING_WIDTH}
          trailing={searchGo}
          trailingWidth={SEARCH_TRAILING_WIDTH}
        />
      </View>
      {ravButton}
    </View>
  );

  const desktopLogo = (
    <TouchableOpacity
      style={styles.logoHit}
      onPress={onLogoPress}
      accessibilityRole="button"
      accessibilityLabel="Grapejuice store home"
    >
      <GrapejuiceBrandMark markOnly compact color={semanticColors.logoDark} />
      <Text style={styles.wordmark} numberOfLines={1} ellipsizeMode="tail">
        Grapejuice
      </Text>
    </TouchableOpacity>
  );

  const account = (
    <View style={[styles.sideRight, compact && styles.sideRightCompact]}>
      <StorefrontAccountMenu />
      <StorefrontCartBoxButton />
    </View>
  );

  if (compact) {
    return (
      <View style={[styles.root, styles.rootMobile]}>
        <View style={styles.mobileTop}>
          <View style={styles.mobileLeft}>
            <TouchableOpacity
              style={styles.menuHit}
              onPress={() => setNavOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Open menu"
            >
              <Icon icon={icons.menu} size={18} color={semanticColors.logoDark} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.markHit}
              onPress={onLogoPress}
              accessibilityRole="button"
              accessibilityLabel="Grapejuice store home"
            >
              <GrapejuiceBrandMark markOnly compact color={semanticColors.logoDark} decorative />
            </TouchableOpacity>
          </View>
          {account}
        </View>
        {searchCluster}
        <StorefrontMobileNav visible={navOpen} onClose={() => setNavOpen(false)} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <View style={styles.sideLeft}>{desktopLogo}</View>
        <View style={styles.searchMiddle} pointerEvents="box-none">
          {searchCluster}
        </View>
        {account}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: MOBILE_GUTTER,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.border,
    backgroundColor: semanticColors.bgPrimary,
    gap: spacing.sm,
  },
  rootMobile: {
    paddingHorizontal: MOBILE_HEADER_GUTTER,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    minHeight: 44,
    gap: spacing.sm,
  },
  mobileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    minHeight: 40,
    gap: spacing.sm,
  },
  mobileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
    minWidth: 0,
  },
  menuHit: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markHit: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  sideLeft: {
    flexGrow: 1,
    flexShrink: 2,
    flexBasis: SIDE_COL,
    minWidth: SIDE_MIN_LEFT,
    maxWidth: SIDE_COL,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
  },
  sideRight: {
    flexGrow: 1,
    flexShrink: 2,
    flexBasis: SIDE_COL,
    minWidth: SIDE_MIN_RIGHT,
    maxWidth: SIDE_COL,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    zIndex: 5,
  },
  sideRightCompact: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    minWidth: undefined,
    maxWidth: undefined,
  },
  searchMiddle: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: SEARCH_CLUSTER_MAX,
    minWidth: SEARCH_CLUSTER_MIN,
    maxWidth: SEARCH_CLUSTER_MAX,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
  },
  searchClusterDesktop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
  },
  searchClusterMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
  },
  searchWrapDesktop: {
    flex: 1,
    minWidth: SEARCH_MIN_WIDTH,
  },
  searchWrapMobile: {
    flex: 1,
    minWidth: 0,
  },
  searchGo: {
    width: SEARCH_GO_SIZE,
    height: SEARCH_GO_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchGoIdle: {
    opacity: 0.4,
  },
  ravBtn: {
    width: RAV_BTN,
    height: RAV_BTN,
    borderRadius: RAV_BTN / 2,
    backgroundColor: semanticColors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  logoHit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
  },
  wordmark: {
    ...typeface('bold'),
    fontSize: 22,
    color: semanticColors.logoDark,
    letterSpacing: -0.5,
    flexShrink: 1,
    minWidth: 0,
  },
});
