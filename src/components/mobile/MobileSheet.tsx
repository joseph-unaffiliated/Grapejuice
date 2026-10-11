import React from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { m, mFont, mRadius } from './mobileTheme';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Right-aligned link in the title row ("Keep editing"). */
  titleAction?: { label: string; onPress: () => void };
  children: React.ReactNode;
  /** Pinned under the scrolling body (buttons, a bar). */
  footer?: React.ReactNode;
  /** 0-1 of the screen height the sheet may take. */
  maxHeight?: number;
  accessibilityLabel?: string;
};

/** Bottom sheet for the phone layouts: scrim, grab handle, scrolling body, pinned footer. */
export function MobileSheet({ visible, onClose, title, titleAction, children, footer, maxHeight = 0.9, accessibilityLabel }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.host}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <View
          style={[styles.sheet, { maxHeight: `${Math.round(maxHeight * 100)}%` as unknown as number, paddingBottom: footer ? 0 : 12 + insets.bottom }]}
          accessibilityViewIsModal
          accessibilityLabel={accessibilityLabel ?? title}
          {...(Platform.OS === 'web' ? ({ role: 'dialog' } as object) : null)}
        >
          <View style={styles.grab} />
          {title || titleAction ? (
            <View style={styles.titleRow}>
              <Text style={styles.title}>{title}</Text>
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
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: m.line, marginTop: 8, marginBottom: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  title: { fontSize: 20, letterSpacing: -0.4, color: m.ink, ...mFont(500) },
  titleAction: { fontSize: 13, color: m.goldDark, textDecorationLine: 'underline', ...mFont(400) },
  body: { flexGrow: 0 },
  bodyContent: { paddingHorizontal: 16, paddingBottom: 16 },
  footer: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: m.line, backgroundColor: m.white },
  radius: { borderRadius: mRadius.md },
});
