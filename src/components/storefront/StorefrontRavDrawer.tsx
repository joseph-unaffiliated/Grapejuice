import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  Animated,
  Platform,
  useWindowDimensions,
  Text,
  Easing,
} from 'react-native';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { PilotAIChatSheet, type PilotAIChatSheetRef } from '../chat/PilotAIChatSheet';
import {
  LAYOUT,
  semanticColors,
  spacing,
  typeface,
} from '../../constants/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** When set with a new nonce, start a chat and send this as the first message. */
  initialMessage?: string;
  initialMessageNonce?: number;
};

type RavView = 'welcome' | 'recent' | 'thread';

const DRAWER_MS = 280;
const DESKTOP_DRAWER_MAX = 520;

/**
 * Rav chat drawer — full-width on mobile; right side panel on desktop.
 * Chrome: history toggle (menu ↔ back) top-left, close top-right.
 *
 * When opening with an Ask Rav question, the pane stays hidden until the chat
 * reports thread view (seeded user bubble + thinking) so welcome/history never flash.
 */
export function StorefrontRavDrawer({
  visible,
  onClose,
  initialMessage,
  initialMessageNonce = 0,
}: Props) {
  const { width } = useWindowDimensions();
  const compact = width < LAYOUT.BREAKPOINT_TABLET;
  const drawerWidth = compact
    ? width
    : Math.min(DESKTOP_DRAWER_MAX, Math.round(width * 0.48));
  const slide = useRef(new Animated.Value(0)).current;
  const chatRef = useRef<PilotAIChatSheetRef>(null);
  const [mounted, setMounted] = useState(false);
  const [uiRevealed, setUiRevealed] = useState(false);
  const [ravView, setRavView] = useState<RavView>('welcome');
  const bootstrapMessage = initialMessage?.trim() || undefined;
  const bootstrapping = Boolean(bootstrapMessage) && visible;

  const onViewChange = useCallback((view: RavView) => {
    setRavView(view);
  }, []);

  const onHistoryToggle = () => {
    if (ravView === 'recent') {
      chatRef.current?.showWelcome();
      return;
    }
    chatRef.current?.showRecentChats();
  };

  // Mount early when opening; only animate/reveal when ready (avoids welcome flash).
  useEffect(() => {
    if (visible) {
      setMounted(true);
      // Avoid treating a prior session's "thread" as ready for a new bootstrap.
      if (bootstrapMessage) setRavView('welcome');
      setUiRevealed(!bootstrapMessage);
      return;
    }
    setUiRevealed(false);
    Animated.timing(slide, {
      toValue: 0,
      duration: DRAWER_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [visible, slide, bootstrapMessage]);

  useEffect(() => {
    if (!visible || !uiRevealed) return;
    slide.setValue(0);
    Animated.timing(slide, {
      toValue: 1,
      duration: DRAWER_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, uiRevealed, slide]);

  // Reveal once bootstrapped chat is on the thread (user bubble + thinking).
  useEffect(() => {
    if (!visible || !bootstrapping) return;
    if (ravView === 'thread') {
      setUiRevealed(true);
    }
  }, [visible, bootstrapping, ravView]);

  // Safety: don't leave the drawer invisible forever.
  useEffect(() => {
    if (!visible || !bootstrapping || uiRevealed) return;
    const t = setTimeout(() => setUiRevealed(true), 1500);
    return () => clearTimeout(t);
  }, [visible, bootstrapping, uiRevealed]);

  if (!mounted) return null;

  const historyOpen = ravView === 'recent';
  const translateX = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [drawerWidth, 0],
  });
  const backdropOpacity = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.4],
  });

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root} pointerEvents={uiRevealed ? 'auto' : 'none'}>
        <Animated.View
          style={[
            styles.backdrop,
            { opacity: uiRevealed ? backdropOpacity : 0 },
          ]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close Rav" />
        </Animated.View>
        <Animated.View
          style={[
            styles.drawer,
            {
              width: drawerWidth,
              transform: [{ translateX: uiRevealed ? translateX : drawerWidth }],
              opacity: uiRevealed ? 1 : 0,
            },
          ]}
          accessibilityLabel="Rav chat"
        >
          <View style={styles.chrome}>
            <TouchableOpacity
              style={styles.chromeHit}
              onPress={onHistoryToggle}
              accessibilityRole="button"
              accessibilityLabel={historyOpen ? 'Back to Rav' : 'Chat history'}
            >
              <Icon
                icon={historyOpen ? icons.arrowLeft : icons.menu}
                size={18}
                color={semanticColors.logoDark}
              />
            </TouchableOpacity>
            <Text style={styles.chromeTitle}>Rav</Text>
            <TouchableOpacity
              style={styles.chromeHit}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close Rav"
            >
              <Icon icon={icons.close} size={18} color={semanticColors.logoDark} />
            </TouchableOpacity>
          </View>
          <View style={styles.chat}>
            <PilotAIChatSheet
              key={initialMessageNonce || 'rav-idle'}
              ref={chatRef}
              embedded
              externalHistoryChrome
              bootstrapMessage={bootstrapMessage}
              onViewChange={onViewChange}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: semanticColors.bgPrimary,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '-8px 0 32px rgba(17, 2, 34, 0.18)' } as object)
      : {
          shadowColor: '#110222',
          shadowOffset: { width: -8, height: 0 },
          shadowOpacity: 0.18,
          shadowRadius: 24,
          elevation: 16,
        }),
  },
  chrome: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  chromeHit: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chromeTitle: {
    ...typeface('medium'),
    fontSize: 16,
    color: semanticColors.logoDark,
    letterSpacing: -0.3,
  },
  chat: {
    flex: 1,
    minHeight: 0,
  },
});
