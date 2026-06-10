import React from 'react';
import { Platform, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { MainTabsParamList } from './types';
import { HomeScreen } from '../screens/main/HomeScreen';
import { RavScreen } from '../screens/main/RavScreen';
import { AccountScreen } from '../screens/main/AccountScreen';
import { PilotTabBar } from '../components/navigation/PilotTabBar';
import { TabBarIconWithBadge } from '../components/navigation/TabBarIconWithBadge';
import { icons } from '../constants/icons';
import { semanticColors, TAB_NAV } from '../constants/theme';
import { useWebLayout } from '../hooks/useWebLayout';
import { useGuestSessionStore } from '../stores/guestSessionStore';
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
  const guestRavPromptCount = useGuestSessionStore((s) => s.guestRavPromptCount);
  const ravBadge = guestRavPromptCount === 0 ? 1 : 0;

  return (
    <Tab.Navigator
      initialRouteName="Home"
      tabBar={isDesktop ? EmptyTabBar : (props) => <TabBarWrapper {...props} />}
      safeAreaInsets={Platform.OS === 'web' ? { bottom: 0 } : undefined}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: semanticColors.textPrimary,
        tabBarInactiveTintColor: semanticColors.goldMuted,
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color }) => <Icon icon={icons.explosion} size={TAB_NAV.iconSize} color={color} />,
        }}
      />
      <Tab.Screen
        name="Rav"
        component={RavScreen}
        options={{
          tabBarIcon: ({ color }) => (
            <Icon icon={icons.childReaching} size={TAB_NAV.iconSize} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Account"
        component={AccountScreen}
        options={{
          tabBarIcon: ({ color }) => (
            <TabBarIconWithBadge
              icon={icons.fingerprint}
              color={color}
              size={TAB_NAV.iconSize}
              badge={ravBadge}
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
