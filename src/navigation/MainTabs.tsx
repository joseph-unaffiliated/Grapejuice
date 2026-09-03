import React from 'react';
import { Platform, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { MainTabsParamList } from './types';
import { StorefrontHomeScreen } from '../screens/storefront/StorefrontHomeScreen';
import { RavScreen } from '../screens/main/RavScreen';
import { AccountScreen } from '../screens/main/AccountScreen';
import { PilotTabBar } from '../components/navigation/PilotTabBar';
import { TabBarIconWithBadge } from '../components/navigation/TabBarIconWithBadge';
import { icons } from '../constants/icons';
import { TAB_NAV } from '../constants/theme';
import { useWebLayout } from '../hooks/useWebLayout';
import { useAuthStore } from '../stores/authStore';
import { useThemeMode } from '../context/ThemeContext';
import { Icon } from '../components/ui/Icon';

const Tab = createBottomTabNavigator<MainTabsParamList>();

function EmptyTabBar() {
  return null;
}

function TabBarWrapper(props: React.ComponentProps<typeof PilotTabBar>) {
  return (
    <View
      style={[styles.tabBarOuter, Platform.OS === 'web' && styles.tabBarOuterWeb]}
      testID="main-tab-bar"
      nativeID="main-tab-bar"
    >
      <PilotTabBar {...props} />
    </View>
  );
}

export function MainTabs() {
  const { isDesktop } = useWebLayout();
  const { colors } = useThemeMode();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accountBadge = !isAuthenticated ? 1 : 0;

  return (
    <Tab.Navigator
      initialRouteName="Home"
      backBehavior={Platform.OS === 'web' ? 'history' : 'firstRoute'}
      tabBar={isDesktop ? EmptyTabBar : (props) => <TabBarWrapper {...props} />}
      safeAreaInsets={Platform.OS === 'web' ? { bottom: 0 } : undefined}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.textPrimary,
        tabBarInactiveTintColor: colors.goldMuted,
        tabBarShowLabel: false,
        sceneContainerStyle:
          Platform.OS === 'web' && isDesktop ? { overflow: 'visible' as const } : undefined,
      }}
    >
      <Tab.Screen
        name="Home"
        component={StorefrontHomeScreen}
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Icon icon={icons.explosion} size={TAB_NAV.iconSize} color={color} />,
        }}
      />
      <Tab.Screen
        name="Rav"
        component={RavScreen}
        options={{
          title: 'Rav',
          tabBarIcon: ({ color }) => (
            <Icon icon={icons.childReaching} size={TAB_NAV.iconSize} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Account"
        component={AccountScreen}
        options={{
          title: 'Account',
          tabBarIcon: ({ color }) => (
            <TabBarIconWithBadge
              icon={icons.fingerprint}
              color={color}
              size={TAB_NAV.iconSize}
              badge={accountBadge}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = {
  tabBarOuter: { position: 'absolute' as const, bottom: 0, left: 0, right: 0 },
  tabBarOuterWeb: { width: '100%' as const },
};
