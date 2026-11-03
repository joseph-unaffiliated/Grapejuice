import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { usePreviewedHasStartedBox } from '../../hooks/useUserStatePreview';
import { usePaymentGate } from '../../hooks/usePaymentGate';
import { useStorefrontHomeMode } from '../../hooks/useStorefrontHomeMode';
import { getHanukkahConfig, peekHanukkahConfig } from '../../services/firestore/config';
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
 * Cart (with count badge) when no box yet; My Box after the user has started one;
 * Orders when the box is frozen in post-lock shop mode.
 */
export function StorefrontCartBoxButton() {
  const navigation = useNavigation<Nav>();
  const leave = useStorefrontLeave();
  const hasBox = usePreviewedHasStartedBox();
  const { openOrder } = usePaymentGate();
  const [lockAt, setLockAt] = useState<string | null>(() => peekHanukkahConfig()?.lockAt ?? null);
  const [startsOn, setStartsOn] = useState<string | null>(
    () => peekHanukkahConfig()?.startsOn ?? null
  );
  const mode = useStorefrontHomeMode(lockAt, startsOn);
  const cartItems = useMarketplaceCartStore((s) => s.items);
  const frozenToOrders = mode === 'shop' && !!openOrder;
  const showBox = hasBox && !frozenToOrders;
  const cartCount = showBox || frozenToOrders ? 0 : marketplaceCartCount(cartItems);
  const badgeLabel = cartCount > 99 ? '99+' : String(cartCount);

  useEffect(() => {
    let cancelled = false;
    void getHanukkahConfig().then((config) => {
      if (cancelled) return;
      setLockAt(config.lockAt);
      setStartsOn(config.startsOn);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={() => {
        if (frozenToOrders) {
          if (leave) {
            leave({ type: 'screen', nav: { screen: 'Orders' } });
            return;
          }
          navigation.navigate('Orders');
          return;
        }
        if (showBox) {
          if (leave) {
            leave({ type: 'myBox' });
            return;
          }
          navigation.navigate('MyBox');
          return;
        }
        if (leave) {
          leave({ type: 'screen', nav: { screen: 'StorefrontCart' } });
          return;
        }
        navigation.navigate('StorefrontCart');
      }}
      accessibilityRole="button"
      accessibilityLabel={
        frozenToOrders
          ? 'Orders'
          : showBox
            ? 'My Box'
            : cartCount > 0
              ? `Cart, ${cartCount} items`
              : 'Cart'
      }
    >
      <Icon
        icon={frozenToOrders ? icons.boxOpen : showBox ? icons.boxOpen : icons.cart}
        size={16}
        color={semanticColors.logoDark}
      />
      {!showBox && !frozenToOrders && cartCount > 0 ? (
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
    backgroundColor: semanticColors.bgPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.goldMuted,
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
