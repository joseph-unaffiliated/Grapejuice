import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { useAuthStore } from '../../stores/authStore';
import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { useSession } from '../../hooks/useSession';
import type { MainStackParamList } from '../../navigation/types';
import { semanticColors } from '../../constants/theme';

type Nav = StackNavigationProp<MainStackParamList>;

const BTN_SIZE = 36;

/** True once the household has completed (or revealed) a Hanukkah box build. */
function useHasStartedBox(): boolean {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { profile } = useSession();
  const guestOnboardingComplete = useGuestSessionStore((s) => s.onboardingComplete);
  const guestRevealComplete = useGuestSessionStore((s) => s.boxRevealComplete);

  if (isAuthenticated) {
    return !!profile?.onboardingComplete;
  }
  return guestOnboardingComplete || guestRevealComplete;
}

/**
 * Header action to the right of the account menu.
 * Cart when no box yet; My Box after the user has started one.
 */
export function StorefrontCartBoxButton() {
  const navigation = useNavigation<Nav>();
  const hasBox = useHasStartedBox();

  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={() => navigation.navigate('MyBox')}
      accessibilityRole="button"
      accessibilityLabel={hasBox ? 'My Box' : 'Cart'}
    >
      <Icon
        icon={hasBox ? icons.boxOpen : icons.cart}
        size={16}
        color={semanticColors.logoDark}
      />
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
});
