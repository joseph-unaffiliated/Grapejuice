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
   * Mobile overlay uses 0 (full visual viewport over chrome).
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
/** Above sticky chrome (30), floating footer (20), and admin FAB (2000). */
const MOBILE_SHEET_Z = 2100;

/**
 * Rav chat pane — docked side panel on desktop; full visual-viewport sheet on mobile.
 * Mobile web pins to the visual viewport (over storefront chrome) and locks background
 * scroll so the soft keyboard can’t shove the storefront out from under the sheet.
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
    offsetLeft: 0,
    width: typeof window !== 'undefined' ? window.innerWidth : drawerWidth,
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
        offsetLeft: v?.offsetLeft ?? 0,
        width: v?.width ?? window.innerWidth,
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

  // Hide OneTrust cookie FAB while mobile Rav is open (keyboard detection is unreliable
  // with interactive-widget=resizes-content — layout height shrinks with the keyboard).
  useEffect(() => {
    if (docked || Platform.OS !== 'web' || typeof document === 'undefined') {
      return;
    }
    if (!visible) {
      document.body.classList.remove('rav-sheet-open', 'rav-keyboard-open');
      return;
    }
    document.body.classList.add('rav-sheet-open');
    const syncKeyboard = () => {
      const v = window.visualViewport;
      // Prefer screen/outer metrics: with resizes-content, innerHeight ≈ vv.height.
      const layoutH = window.innerHeight;
      const screenH = window.screen?.height ?? window.outerHeight;
      const vvBottomGap =
        v != null ? Math.max(0, layoutH - (v.height + v.offsetTop)) : 0;
      const shrunkVsScreen = screenH > 0 && layoutH / screenH < 0.72;
      const keyboardOpen = vvBottomGap > 60 || shrunkVsScreen;
      document.body.classList.toggle('rav-keyboard-open', keyboardOpen);
    };
    syncKeyboard();
    const v = window.visualViewport;
    v?.addEventListener('resize', syncKeyboard);
    v?.addEventListener('scroll', syncKeyboard);
    window.addEventListener('resize', syncKeyboard);
    return () => {
      document.body.classList.remove('rav-sheet-open', 'rav-keyboard-open');
      v?.removeEventListener('resize', syncKeyboard);
      v?.removeEventListener('scroll', syncKeyboard);
      window.removeEventListener('resize', syncKeyboard);
    };
  }, [docked, visible]);

  if (!mounted) return null;

  const historyOpen = ravView === 'recent';
  const panelWidth = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, drawerWidth],
  });
  const fadeOpacity = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const chrome = (
    <View style={[styles.chrome, !docked && styles.chromeFloating]}>
      <TouchableOpacity
        style={[styles.chromeAction, !docked && styles.chromeActionFloating]}
        onPress={onHistoryToggle}
        accessibilityRole="button"
        accessibilityLabel={historyOpen ? 'Back to Rav' : 'Chat history'}
      >
        <View style={[styles.chromeHit, !docked && styles.chromeHitFloating]}>
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
        style={[styles.chromeAction, !docked && styles.chromeActionFloating]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close Rav"
      >
        {docked ? <Text style={styles.chromeLabel}>collapse</Text> : null}
        <View style={[styles.chromeHit, !docked && styles.chromeHitFloating]}>
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
        bottomInset={0}
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

  // Mobile: full visual viewport over storefront chrome (topInset typically 0).
  // Opacity fade (no translateX) so the sheet never leaves a side gap while opening.
  const sheetTop = Platform.OS === 'web' ? vv.offsetTop + insetPx : insetPx;
  const sheetLeft = Platform.OS === 'web' ? vv.offsetLeft : 0;
  const sheetWidth = Platform.OS === 'web' ? vv.width : drawerWidth;
  const sheetHeight =
    Platform.OS === 'web' ? Math.max(160, vv.height - insetPx) : undefined;

  return (
    <Animated.View
      style={[
        styles.overlaySheet,
        Platform.OS === 'web' ? styles.overlaySheetFixed : null,
        {
          left: sheetLeft,
          width: sheetWidth,
          top: sheetTop,
          ...(sheetHeight != null
            ? { height: sheetHeight, bottom: undefined, right: undefined }
            : { bottom: 0, right: 0 }),
          opacity: bootstrapping && !uiRevealed ? 0 : fadeOpacity,
        },
      ]}
      pointerEvents={uiRevealed ? 'auto' : 'none'}
      accessibilityLabel="Rav chat"
    >
      {/* Chat fills the sheet; floating circles sit on top so history reads to the edge. */}
      <View style={styles.overlayInner}>
        {chat}
        {chrome}
      </View>
    </Animated.View>
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
    // Above sticky chrome / floating footer so the sheet owns the phone viewport.
    zIndex: MOBILE_SHEET_Z,
    backgroundColor: semanticColors.bgPrimary,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 0 32px rgba(17, 2, 34, 0.18)' } as object)
      : {
          shadowColor: '#110222',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.18,
          shadowRadius: 24,
          elevation: 24,
        }),
  },
  /** Web: escape document scroll / keyboard jank by pinning to the viewport. */
  overlaySheetFixed: {
    position: 'fixed' as unknown as 'absolute',
  },
  overlayInner: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    position: 'relative',
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
  /** Mobile: transparent overlay so thread scrolls under the controls. */
  chromeFloating: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
    paddingTop: spacing.sm + 2,
    paddingBottom: 0,
    backgroundColor: 'transparent',
    pointerEvents: 'box-none',
  },
  chromeAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chromeActionFloating: {
    pointerEvents: 'auto',
  },
  chromeHit: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chromeHitFloating: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17, 2, 34, 0.08)',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 2px 10px rgba(17, 2, 34, 0.12)' } as object)
      : {
          shadowColor: '#110222',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.12,
          shadowRadius: 6,
          elevation: 3,
        }),
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
