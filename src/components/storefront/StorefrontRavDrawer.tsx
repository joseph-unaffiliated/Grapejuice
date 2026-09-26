import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
  Easing,
} from 'react-native';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { PilotAIChatSheet, type PilotAIChatSheetRef } from '../chat/PilotAIChatSheet';
import { semanticColors, spacing, typography, typeface } from '../../constants/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** When set with a new nonce, start a chat and send this as the first message. */
  initialMessage?: string;
  initialMessageNonce?: number;
  /** Panel width (desktop docked or mobile overlay). */
  width: number;
  /**
   * Offset from the top of the storefront shell so Rav sits under the visible nav
   * (promo+header at top, or sticky mini-bar mid-page).
   */
  topInset?: number | Animated.AnimatedInterpolation<number> | Animated.Value;
  /**
   * Desktop: participate in the row layout and shift page content.
   * Mobile: absolute overlay (page stays mounted/scrollable underneath).
   */
  docked?: boolean;
};

type RavView = 'welcome' | 'recent' | 'thread';

const DRAWER_MS = 280;

/**
 * Rav chat pane — docked side panel on desktop; fixed sheet under the nav on mobile.
 * Mobile web pins to the visual viewport and locks background scroll so the soft
 * keyboard can’t shove the storefront out from under the sheet.
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
  /** Web visual viewport — keep a fixed sheet above the soft keyboard. */
  const [vv, setVv] = useState(() => ({
    offsetTop: 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));
  const bootstrapMessage = initialMessage?.trim() || undefined;
  const bootstrapping = Boolean(bootstrapMessage) && visible;
  const insetPx = typeof topInset === 'number' ? topInset : 0;

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

  // Mobile web: pin to the visual viewport (not 100svh / document scroll).
  // Outer shell stays `position: fixed` without a transform so iOS doesn’t
  // scroll the page out from under the sheet when the keyboard opens.
  useEffect(() => {
    if (docked || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const sync = () => {
      const v = window.visualViewport;
      setVv({
        offsetTop: v?.offsetTop ?? 0,
        height: v?.height ?? window.innerHeight,
      });
    };
    sync();
    const v = window.visualViewport;
    v?.addEventListener('resize', sync);
    v?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    return () => {
      v?.removeEventListener('resize', sync);
      v?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [docked, visible]);

  // Lock background document scroll while the mobile sheet is open.
  useEffect(() => {
    if (docked || Platform.OS !== 'web' || !visible || typeof document === 'undefined') {
      return;
    }
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, [docked, visible]);

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
        style={styles.chromeAction}
        onPress={onHistoryToggle}
        accessibilityRole="button"
        accessibilityLabel={historyOpen ? 'Back to Rav' : 'Chat history'}
      >
        <View style={styles.chromeHit}>
          <Icon
            icon={historyOpen ? icons.arrowLeft : icons.clockHistory}
            size={14}
            color={semanticColors.logoDark}
          />
        </View>
        {docked ? (
          <Text style={styles.chromeLabel}>
            {historyOpen ? 'back' : 'chat history'}
          </Text>
        ) : null}
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.chromeAction}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close Rav"
      >
        {docked ? <Text style={styles.chromeLabel}>collapse</Text> : null}
        <View style={styles.chromeHit}>
          <Icon icon={icons.chevronsRight} size={14} color={semanticColors.logoDark} />
        </View>
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
        overlay="drawer"
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

  // Mobile: fixed to the visual viewport under the storefront nav.
  // Slide transform lives on an inner wrapper so `position: fixed` stays viewport-relative.
  // Mount as a direct child of StorefrontChrome root (not bodyRow) so fixed + z-index
  // stack correctly under the sticky chrome.
  const sheetTop = Platform.OS === 'web' ? vv.offsetTop + insetPx : topInset;
  const sheetHeight =
    Platform.OS === 'web' ? Math.max(160, vv.height - insetPx) : undefined;

  return (
    <View
      style={[
        styles.overlaySheet,
        Platform.OS === 'web' ? styles.overlaySheetFixed : null,
        {
          width: drawerWidth,
          top: sheetTop,
          ...(sheetHeight != null
            ? { height: sheetHeight, bottom: undefined }
            : { bottom: 0 }),
          opacity: bootstrapping && !uiRevealed ? 0 : 1,
        },
      ]}
      pointerEvents={uiRevealed ? 'auto' : 'none'}
      accessibilityLabel="Rav chat"
    >
      <Animated.View
        style={[styles.overlayInner, { transform: [{ translateX }] }]}
      >
        {chrome}
        {chat}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  dockShell: {
    flexShrink: 0,
    height: '100%',
    overflow: 'hidden',
    zIndex: 20,
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
    // Below sticky chrome (zIndex 30) so nav stays on top of the sheet.
    zIndex: 20,
    backgroundColor: semanticColors.bgPrimary,
    overflow: 'hidden',
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
  /** Web: escape document scroll / keyboard jank by pinning to the viewport. */
  overlaySheetFixed: {
    position: 'fixed' as unknown as 'absolute',
    left: 'auto',
    right: 0,
  },
  overlayInner: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'column',
    height: '100%',
  },
  chrome: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Match top padding optically on left/right.
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  chromeAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chromeHit: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chromeLabel: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
  },
  chat: {
    flex: 1,
    minHeight: 0,
  },
});
