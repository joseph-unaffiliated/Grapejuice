import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { PilotAIChatSheet, type PilotAIChatSheetRef } from '../../components/chat/PilotAIChatSheet';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { useWebLayout } from '../../hooks/useWebLayout';
import type { MainTabsParamList } from '../../navigation/types';
import { semanticColors, tabBarTotalHeight } from '../../constants/theme';
import { useGuestSessionStore } from '../../stores/guestSessionStore';

type RavRoute = RouteProp<MainTabsParamList, 'Rav'>;

export function RavScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<BottomTabNavigationProp<MainTabsParamList>>();
  const { isDesktop } = useWebLayout();
  const route = useRoute<RavRoute>();
  const ref = useRef<PilotAIChatSheetRef>(null);
  const tabBarHeight = tabBarTotalHeight(Math.max(insets.bottom, 0));
  const bottomInset = isDesktop ? spacingBottomDesktop : tabBarHeight;
  const initialMessage = route.params?.initialMessage;
  const recordGuestRavPrompt = useGuestSessionStore((s) => s.recordGuestRavPrompt);

  useEffect(() => {
    recordGuestRavPrompt();
  }, [recordGuestRavPrompt]);

  /** Figma 366:1388 — re-tap Rav tab while in chat returns to Rav welcome home. */
  useEffect(() => {
    const unsub = navigation.addListener('tabPress', () => {
      if (navigation.isFocused()) {
        ref.current?.resetToWelcome();
      }
    });
    return unsub;
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <WebContentPanel>
        <PilotAIChatSheet ref={ref} embedded bottomInset={bottomInset} initialMessage={initialMessage} />
      </WebContentPanel>
    </SafeAreaView>
  );
}

const spacingBottomDesktop = 24;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: semanticColors.bgPrimary },
});
