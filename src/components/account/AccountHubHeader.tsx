import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { MainStackParamList } from '../../navigation/types';
import {
  borderRadius,
  spacing,
  typography,
  typeface,
} from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

export type AccountHubPage = 'account' | 'orders' | 'gifts' | 'history' | 'favorites';

type HubChip = {
  id: AccountHubPage;
  label: string;
  navigate: (nav: StackNavigationProp<MainStackParamList>) => void;
};

const HUB_CHIPS: HubChip[] = [
  {
    id: 'account',
    label: 'Account',
    navigate: (nav) => nav.navigate('MainTabs', { screen: 'Account' }),
  },
  {
    id: 'orders',
    label: 'Orders',
    navigate: (nav) => nav.navigate('Orders'),
  },
  {
    id: 'gifts',
    label: 'Gifts',
    navigate: (nav) => nav.navigate('MyGifts'),
  },
  {
    id: 'history',
    label: 'History',
    navigate: (nav) => nav.navigate('History'),
  },
  {
    id: 'favorites',
    label: 'Favorites',
    navigate: (nav) => nav.navigate('StorefrontFavorites'),
  },
];

const PAGE_TITLE: Record<AccountHubPage, string> = {
  account: 'Account',
  orders: 'Orders',
  gifts: 'Gifts',
  history: 'History',
  favorites: 'Favorites',
};

type Props = {
  page: AccountHubPage;
  /** Shown under the title on the Account page. */
  email?: string | null;
  displayName?: string | null;
};

/**
 * Shared Account hub banner: page title (+ identity on Account) and chip nav
 * to sibling hubs. The current page’s chip is omitted; other hubs show Account
 * in its place.
 */
export function AccountHubHeader({ page, email, displayName }: Props) {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const chips = HUB_CHIPS.filter((c) => c.id !== page);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerBlock}>
        <Text style={styles.title}>{PAGE_TITLE[page]}</Text>
        {page === 'account' ? (
          <>
            {email ? <Text style={styles.email}>{email}</Text> : null}
            {displayName ? <Text style={styles.meta}>{displayName}</Text> : null}
          </>
        ) : null}
      </View>

      <View style={styles.chipRow}>
        {chips.map((chip) => (
          <TouchableOpacity
            key={chip.id}
            style={styles.chip}
            onPress={() => chip.navigate(navigation)}
            accessibilityRole="button"
            accessibilityLabel={chip.label}
          >
            <Text style={styles.chipLabel} numberOfLines={1}>
              {chip.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function createStyles(colors: SemanticColors) {
  return StyleSheet.create({
    wrap: {
      marginBottom: spacing.xs,
    },
    headerBlock: {
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    title: {
      ...typeface('medium'),
      fontSize: 36,
      letterSpacing: -0.8,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    email: {
      ...typeface('light'),
      fontSize: typography.lg,
      marginTop: spacing.sm,
      color: colors.textPrimary,
      letterSpacing: -0.26,
      textAlign: 'center',
    },
    meta: {
      ...typeface('light'),
      fontSize: typography.sm,
      color: colors.goldMuted,
      marginTop: 4,
      letterSpacing: -0.22,
      textAlign: 'center',
    },
    chipRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      flexWrap: 'nowrap',
      gap: spacing.xs,
      width: '100%',
    },
    chip: {
      flexShrink: 1,
      borderRadius: borderRadius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.brand,
      backgroundColor: colors.bgPrimary,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      minHeight: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipLabel: {
      ...typeface('regular'),
      fontSize: typography.sm,
      color: colors.textPrimary,
      letterSpacing: -0.22,
    },
  });
}
