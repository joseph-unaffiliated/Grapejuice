import React, { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { m, mFont } from './mobileTheme';
import { pinToViewport, useScreenFocused } from './StickyBar';

export type ToastState = { message: string; action?: { label: string; onPress: () => void } } | null;

type Props = { toast: ToastState; onDismiss: () => void; bottomOffset?: number; durationMs?: number };

/** "Added for Sam · Undo" above the sticky bar. Auto-dismisses. */
export function MobileToast({ toast, onDismiss, bottomOffset = 84, durationMs = 4000 }: Props) {
  const insets = useSafeAreaInsets();
  const focused = useScreenFocused();
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [toast, onDismiss, durationMs]);
  if (!toast || !focused) return null;
  return pinToViewport(
    <View style={[styles.root, { bottom: bottomOffset + insets.bottom }]} pointerEvents="box-none">
      <View style={styles.toast} accessibilityLiveRegion="polite">
        <Text style={styles.text} numberOfLines={2}>
          {toast.message}
        </Text>
        {toast.action ? (
          <Pressable
            onPress={() => {
              toast.action?.onPress();
              onDismiss();
            }}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text style={styles.action}>{toast.action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>,
  );
}

const styles = StyleSheet.create({
  root: { position: Platform.OS === 'web' ? ('fixed' as unknown as 'absolute') : 'absolute', left: 16, right: 16, zIndex: 50, alignItems: 'center' },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: m.ink, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 16, maxWidth: 420, width: '100%',
  },
  text: { flex: 1, color: m.white, fontSize: 14, ...mFont(400) },
  action: { color: m.gold, fontSize: 14, ...mFont(500) },
});
