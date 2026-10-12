import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { m, mFont, mRadius } from './mobileTheme';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Small icon before the title (the tradition's icon). */
  titleIcon?: React.ReactNode;
  /** Right-aligned link in the title row ("Keep editing"). */
  titleAction?: { label: string; onPress: () => void };
  children: React.ReactNode;
  /** Pinned under the scrolling body (buttons, a bar). */
  footer?: React.ReactNode;
  /** 0-1 of the screen height the sheet may take. */
  maxHeight?: number;
  accessibilityLabel?: string;
};

type WebPointer = {
  clientY?: number;
  pointerId?: number;
  preventDefault?: () => void;
  stopPropagation?: () => void;
  currentTarget?: { setPointerCapture?: (id: number) => void };
  nativeEvent?: { clientY?: number; pointerId?: number };
};

/** Bottom sheet: the scrim is there immediately; only the sheet slides. Drag the handle down to dismiss. */
export function MobileSheet({ visible, onClose, title, titleIcon, titleAction, children, footer, maxHeight = 0.9, accessibilityLabel }: Props) {
  const insets = useSafeAreaInsets();
  const [dragY, setDragY] = useState(0);
  const [entered, setEntered] = useState(false);
  const dragYRef = useRef(0);
  const startY = useRef<number | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    if (!visible) {
      setEntered(false);
      setDragY(0);
      dragYRef.current = 0;
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [visible]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (!visible) return;
    document.body.classList.add('gj-sheet-open');
    const html = document.documentElement;
    const prevBody = document.body.style.overscrollBehavior;
    const prevHtml = html.style.overscrollBehavior;
    document.body.style.overscrollBehavior = 'none';
    html.style.overscrollBehavior = 'none';
    return () => {
      document.body.classList.remove('gj-sheet-open');
      document.body.style.overscrollBehavior = prevBody;
      html.style.overscrollBehavior = prevHtml;
    };
  }, [visible]);

  const finishDrag = () => {
    if (startY.current == null && !dragging.current) return;
    startY.current = null;
    dragging.current = false;
    if (dragYRef.current > 90) onClose();
    dragYRef.current = 0;
    setDragY(0);
  };

  const pointY = (e: WebPointer) => e.nativeEvent?.clientY ?? e.clientY ?? 0;
  const grabHandlers =
    Platform.OS === 'web'
      ? {
          onPointerDown: (e: WebPointer) => {
            e.preventDefault?.();
            e.stopPropagation?.();
            const id = e.nativeEvent?.pointerId ?? e.pointerId;
            if (id != null) e.currentTarget?.setPointerCapture?.(id);
            startY.current = pointY(e);
            dragging.current = true;
          },
          onPointerMove: (e: WebPointer) => {
            if (startY.current == null) return;
            e.preventDefault?.();
            const dy = Math.max(0, pointY(e) - startY.current);
            dragYRef.current = dy;
            setDragY(dy);
          },
          onPointerUp: () => finishDrag(),
          onPointerCancel: () => finishDrag(),
        }
      : null;

  const sheetShift = entered ? dragY : 480;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.host}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <View
          style={[
            styles.sheet,
            { maxHeight: `${Math.round(maxHeight * 100)}%` as unknown as number, paddingBottom: footer ? 0 : 12 + insets.bottom },
            { transform: [{ translateY: sheetShift }] },
            Platform.OS === 'web' ? ({ transition: dragging.current ? 'none' : 'transform 220ms ease-out' } as object) : null,
          ]}
          accessibilityViewIsModal
          accessibilityLabel={accessibilityLabel ?? title}
          {...(Platform.OS === 'web' ? ({ role: 'dialog' } as object) : null)}
        >
          <View style={styles.grabHit} accessibilityRole="button" accessibilityLabel="Drag down to close" {...(grabHandlers as object)}>
            <View style={styles.grab} />
          </View>
          {title || titleAction ? (
            <View style={styles.titleRow}>
              {titleIcon ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>{titleIcon}<Text style={styles.title}>{title}</Text></View> : <Text style={styles.title}>{title}</Text>}
              {titleAction ? (
                <Pressable onPress={titleAction.onPress} accessibilityRole="button" hitSlop={8}>
                  <Text style={styles.titleAction}>{titleAction.label}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(17,24,39,0.45)' },
  sheet: { backgroundColor: m.white, borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden' },
  grabHit: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    paddingBottom: 8,
    ...(Platform.OS === 'web' ? ({ touchAction: 'none', cursor: 'grab' } as object) : null),
  },
  grab: { width: 40, height: 4, borderRadius: 2, backgroundColor: m.line },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  title: { fontSize: 20, letterSpacing: -0.4, color: m.ink, ...mFont(500) },
  titleAction: { fontSize: 13, color: m.goldDark, textDecorationLine: 'underline', ...mFont(400) },
  body: { flexGrow: 0 },
  bodyContent: { paddingHorizontal: 16, paddingBottom: 16 },
  footer: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: m.line, backgroundColor: m.white },
  radius: { borderRadius: mRadius.md },
});
