import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { GrapejuiceBrandMark } from '../brand/GrapejuiceBrandMark';
import { useWishlist } from '../../hooks/useWishlist';
import type { MainStackParamList } from '../../navigation/types';
import {
  LAYOUT,
  borderRadius,
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

type Nav = StackNavigationProp<MainStackParamList>;

type Props = {
  onLogoPress?: () => void;
};

/** Fixed side column width so the centered logo sits on the true screen midpoint. */
const SIDE_COL = 300;

/**
 * C&B-style header: fixed-width side columns + absolutely centered logomark on desktop.
 * On mobile: logo + icon actions on one row, full-width search below — no absolute overlay.
 */
export function StorefrontHeader({ onLogoPress }: Props) {
  const navigation = useNavigation<Nav>();
  const { ids } = useWishlist();
  const [query, setQuery] = useState('');
  const { width } = useWindowDimensions();
  const compact = width < LAYOUT.BREAKPOINT_TABLET;

  const submitSearch = () => {
    const msg = query.trim();
    if (!msg) {
      navigation.navigate('MainTabs', { screen: 'Rav', params: { view: 'welcome' } });
      return;
    }
    navigation.navigate('MainTabs', {
      screen: 'Rav',
      params: { newChat: true, initialMessage: msg },
    });
  };

  const searchField = (
    <View style={[styles.searchWrap, compact && styles.searchWrapCompact]}>
      <Icon icon={icons.search} size={14} color={semanticColors.textTertiary} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="What can we help you find?"
        placeholderTextColor={semanticColors.textTertiary}
        style={styles.input}
        returnKeyType="search"
        onSubmitEditing={submitSearch}
        accessibilityLabel="Search"
      />
      <TouchableOpacity
        onPress={submitSearch}
        accessibilityRole="button"
        accessibilityLabel="Search"
        hitSlop={8}
      >
        <Text style={styles.searchBtn}>Search</Text>
      </TouchableOpacity>
    </View>
  );

  const logo = (
    <TouchableOpacity
      style={styles.logoHit}
      onPress={onLogoPress}
      accessibilityRole="button"
      accessibilityLabel="Grapejuice store home"
    >
      <GrapejuiceBrandMark markOnly compact color={semanticColors.logoDark} />
      <Text style={[styles.wordmark, compact && styles.wordmarkCompact]}>Grapejuice</Text>
    </TouchableOpacity>
  );

  const actions = (
    <View style={[styles.sideRight, compact && styles.sideRightCompact]}>
      <TouchableOpacity
        style={styles.action}
        onPress={() => navigation.navigate('MainTabs', { screen: 'Account' })}
        accessibilityRole="button"
        accessibilityLabel="Account"
      >
        <Icon icon={icons.user} size={16} color={semanticColors.logoDark} />
        {compact ? null : <Text style={styles.actionLabel}>Account</Text>}
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.action}
        onPress={() => navigation.navigate('MainTabs', { screen: 'Account' })}
        accessibilityRole="button"
        accessibilityLabel={`Wishlist, ${ids.length} items`}
      >
        <Icon icon={icons.heart} size={16} color={semanticColors.logoDark} />
        <Text style={styles.actionLabel}>{ids.length}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.action}
        onPress={() => navigation.navigate('MyBox')}
        accessibilityRole="button"
        accessibilityLabel="My Box"
      >
        <Icon icon={icons.boxOpen} size={16} color={semanticColors.logoDark} />
        {compact ? null : <Text style={styles.actionLabel}>Box</Text>}
      </TouchableOpacity>
    </View>
  );

  if (compact) {
    return (
      <View style={styles.root}>
        <View style={styles.mobileTop}>
          {logo}
          {actions}
        </View>
        {searchField}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <View style={styles.sideLeft}>{searchField}</View>
        <View style={styles.logoSlot} pointerEvents="box-none">
          {logo}
        </View>
        {actions}
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
  row: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    minHeight: 44,
  },
  mobileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    minHeight: 40,
    gap: spacing.sm,
  },
  sideLeft: {
    width: SIDE_COL,
    maxWidth: '38%',
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
  },
  sideRight: {
    width: SIDE_COL,
    maxWidth: '38%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.md,
    zIndex: 1,
  },
  sideRightCompact: {
    width: undefined,
    maxWidth: undefined,
    flexShrink: 0,
    gap: spacing.md,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
    borderWidth: 1,
    borderColor: semanticColors.borderDark,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: Platform.OS === 'web' ? 8 : 6,
    backgroundColor: semanticColors.bgPrimary,
  },
  searchWrapCompact: {
    flex: undefined,
    width: '100%',
  },
  input: {
    flex: 1,
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textPrimary,
    outlineStyle: 'none' as never,
    minWidth: 0,
  },
  searchBtn: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
  },
  logoSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
  },
  logoHit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    flexShrink: 1,
    minWidth: 0,
  },
  wordmark: {
    ...typeface('bold'),
    fontSize: 22,
    color: semanticColors.logoDark,
    letterSpacing: -0.5,
  },
  wordmarkCompact: {
    fontSize: 18,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  actionLabel: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
  },
});
