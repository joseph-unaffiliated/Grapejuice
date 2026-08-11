import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { usePreviewedHasStartedBox } from '../../hooks/useUserStatePreview';
import {
  marketplaceCartCount,
  useMarketplaceCartStore,
} from '../../stores/marketplaceCartStore';
import type { MainStackParamList } from '../../navigation/types';
import { semanticColors, typeface } from '../../constants/theme';
import { useStorefrontLeave } from './storefrontLeaveContext';

type Nav = StackNavigationProp<MainStackParamList>;

const BTN_SIZE = 36;
const BADGE_SIZE = 18;

/**
 * Header action to the right of the account menu.
 * Cart (with count badge) when no box yet; My Box after the user has started one.
 */
export function StorefrontCartBoxButton() {
  const navigation = useNavigation<Nav>();
  const leave = useStorefrontLeave();
  const hasBox = usePreviewedHasStartedBox();
  const cartItems = useMarketplaceCartStore((s) => s.items);
  const cartCount = hasBox ? 0 : marketplaceCartCount(cartItems);
  const badgeLabel = cartCount > 99 ? '99+' : String(cartCount);

  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={() => {
        if (hasBox) {
          if (leave) {
            leave({ type: 'myBox' });
            return;
          }
          navigation.navigate('MyBox');
          return;
        }
        navigation.navigate('StorefrontCart');
      }}
      accessibilityRole="button"
      accessibilityLabel={
        hasBox ? 'My Box' : cartCount > 0 ? `Cart, ${cartCount} items` : 'Cart'
      }
    >
      <Icon
        icon={hasBox ? icons.boxOpen : icons.cart}
        size={16}
        color={semanticColors.logoDark}
      />
      {!hasBox && cartCount > 0 ? (
        <View style={styles.badge} accessibilityElementsHidden>
          <Text style={styles.badgeText}>{badgeLabel}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: BTN_SIZE / 2,
    backgroundColor: semanticColors.bgDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: BADGE_SIZE,
    height: BADGE_SIZE,
    paddingHorizontal: 4,
    borderRadius: BADGE_SIZE / 2,
    backgroundColor: semanticColors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    ...typeface('medium'),
    fontSize: 10,
    lineHeight: 12,
    color: semanticColors.logoDark,
    letterSpacing: -0.2,
  },
});
