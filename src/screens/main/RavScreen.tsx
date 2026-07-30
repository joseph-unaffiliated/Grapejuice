import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { PilotAIChatSheet, type PilotAIChatSheetRef } from '../../components/chat/PilotAIChatSheet';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { useWebLayout } from '../../hooks/useWebLayout';
import type { MainTabsParamList } from '../../navigation/types';
import { LAYOUT, tabBarTotalHeight } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import { useGuestSessionStore } from '../../stores/guestSessionStore';

type RavRoute = RouteProp<MainTabsParamList, 'Rav'>;

export function RavScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<BottomTabNavigationProp<MainTabsParamList>>();
  const { isDesktop } = useWebLayout();
  const { colors } = useThemeMode();
  const styles = useMemo(() => createRavStyles(colors), [colors]);
  const route = useRoute<RavRoute>();
  const ref = useRef<PilotAIChatSheetRef>(null);
  const tabBarHeight = tabBarTotalHeight(Math.max(insets.bottom, 0));
  const bottomInset = isDesktop ? spacingBottomDesktop : tabBarHeight;
  const recordGuestRavPrompt = useGuestSessionStore((s) => s.recordGuestRavPrompt);
  const view = route.params?.view;
  const newChat = route.params?.newChat;
  const threadId = route.params?.threadId;
  const initialMessage = route.params?.initialMessage;
  const openingAssistantMessage = route.params?.openingAssistantMessage;

  useEffect(() => {
    recordGuestRavPrompt();
  }, [recordGuestRavPrompt]);

  /** Figma 366:1388 — re-tap Rav tab while in chat returns to Rav welcome home. */
  useEffect(() => {
    const unsub = navigation.addListener('tabPress', () => {
      if (navigation.isFocused()) {
        ref.current?.showWelcome();
      }
    });
    return unsub;
  }, [navigation]);

  useEffect(() => {
    const hasIntent = Boolean(
      view || newChat || threadId || initialMessage || openingAssistantMessage
    );
    if (!hasIntent) return;

    let cancelled = false;
    let attempts = 0;

    const apply = () => {
      if (cancelled) return;
      const sheet = ref.current;
      if (!sheet) {
        if (attempts++ < 20) {
          requestAnimationFrame(apply);
        }
        return;
      }

      if (view === 'recent') {
        sheet.showRecentChats();
      } else if (threadId) {
        sheet.openThread(threadId, true);
      } else if (openingAssistantMessage) {
        sheet.startChatWithOpeningAssistant(openingAssistantMessage);
      } else if (newChat || initialMessage) {
        sheet.startNewChat(initialMessage);
      } else if (view === 'welcome') {
        sheet.showWelcome();
      }

      navigation.setParams({
        view: undefined,
        newChat: undefined,
        threadId: undefined,
        initialMessage: undefined,
        openingAssistantMessage: undefined,
      });
    };

    apply();
    return () => {
      cancelled = true;
    };
  }, [view, newChat, threadId, initialMessage, openingAssistantMessage, navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Desktop: centered readable column (not full main-area width). */}
      <WebContentPanel
        flush
        desktopContentMaxWidth={LAYOUT.WEB_TABLET_MAX_WIDTH}
        style={[styles.panel, isDesktop ? styles.panelDesktop : null]}
      >
        <PilotAIChatSheet ref={ref} embedded bottomInset={bottomInset} />
      </WebContentPanel>
    </SafeAreaView>
  );
}

const spacingBottomDesktop = 24;

function createRavStyles(colors: SemanticColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    panel: { overflow: 'visible' as const },
    panelDesktop: {
      alignItems: 'center',
    },
  });
}
