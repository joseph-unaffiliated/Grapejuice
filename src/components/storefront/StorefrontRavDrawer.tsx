import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
  Text,
  Easing,
} from 'react-native';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { PilotAIChatSheet, type PilotAIChatSheetRef } from '../chat/PilotAIChatSheet';
import { semanticColors, spacing, typeface } from '../../constants/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** When set with a new nonce, start a chat and send this as the first message. */
  initialMessage?: string;
  initialMessageNonce?: number;
  /** Panel width (desktop docked or mobile overlay). */
  width: number;
  /**
   * Offset from the top of the storefront shell so Rav sits below in-flow / pinned
   * header chrome rather than covering it.
   */
  topInset?: number;
  /**
   * Desktop: participate in the row layout and shift page content.
   * Mobile: absolute overlay (page stays mounted/scrollable underneath).
   */
  docked?: boolean;
};

type RavView = 'welcome' | 'recent' | 'thread';

const DRAWER_MS = 280;

/**
 * Rav chat pane — docked side panel on desktop; absolute sheet on mobile.
 * Not a Modal: the storefront page stays interactive and scrollable.
 *
 * When opening with an Ask Rav question, the pane stays hidden until the chat
 * reports thread view (seeded user bubble + thinking) so welcome/history never flash.
 */
export function StorefrontRavDrawer({
  visible,
  onClose,
  initialMessage,
  initialMessageNonce = 0,
  width: drawerWidth,
  topInset = 0,
  docked = true,
}: Props) {
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
      if (bootstrapMessage) setRavView('welcome');
      setUiRevealed(!bootstrapMessage);
      return;
    }
    setUiRevealed(false);
    Animated.timing(slide, {
      toValue: 0,
      duration: DRAWER_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: false, // width + translate share this value on docked layout
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
      useNativeDriver: false,
    }).start();
  }, [visible, uiRevealed, slide]);

  useEffect(() => {
    if (!visible || !bootstrapping) return;
    if (ravView === 'thread') {
      setUiRevealed(true);
    }
  }, [visible, bootstrapping, ravView]);

  useEffect(() => {
    if (!visible || !bootstrapping || uiRevealed) return;
    const t = setTimeout(() => setUiRevealed(true), 1500);
    return () => clearTimeout(t);
  }, [visible, bootstrapping, uiRevealed]);

  if (!mounted) return null;

  const historyOpen = ravView === 'recent';
  const panelWidth = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, drawerWidth],
  });
  const translateX = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [drawerWidth, 0],
  });

  const chrome = (
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
  );

  const chat = (
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
  );

  if (docked) {
    // Reserve horizontal space (shifts page) while inner panel stays full drawer width.
    // Width is driven only by `slide` so open/close animate; opacity hides bootstrap flash.
    return (
      <Animated.View
        style={[
          styles.dockShell,
          {
            width: panelWidth,
            paddingTop: topInset,
            opacity: bootstrapping && !uiRevealed ? 0 : 1,
          },
        ]}
        pointerEvents={uiRevealed ? 'auto' : 'none'}
        accessibilityLabel="Rav chat"
      >
        <View style={[styles.dockInner, { width: drawerWidth }]}>
          {chrome}
          {chat}
        </View>
      </Animated.View>
    );
  }

  // Mobile: absolute sheet — no Modal, so body scroll is never locked.
  return (
    <Animated.View
      style={[
        styles.overlaySheet,
        {
          width: drawerWidth,
          top: topInset,
          transform: [{ translateX }],
          opacity: bootstrapping && !uiRevealed ? 0 : 1,
        },
      ]}
      pointerEvents={uiRevealed ? 'auto' : 'none'}
      accessibilityLabel="Rav chat"
    >
      {chrome}
      {chat}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dockShell: {
    flexShrink: 0,
    height: '100%',
    overflow: 'hidden',
    backgroundColor: semanticColors.bgPrimary,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: semanticColors.border,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '-8px 0 32px rgba(17, 2, 34, 0.12)' } as object)
      : {
          shadowColor: '#110222',
          shadowOffset: { width: -6, height: 0 },
          shadowOpacity: 0.12,
          shadowRadius: 16,
          elevation: 8,
        }),
  },
  dockInner: {
    flex: 1,
    minHeight: 0,
    height: '100%',
  },
  overlaySheet: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    zIndex: 15,
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
