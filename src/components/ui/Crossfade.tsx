import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  /** When this changes, fade out → swap → fade in. */
  contentKey: string;
  children: ReactNode;
  /** Full crossfade duration (out + in). Default 720ms. */
  durationMs?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Crossfades children when `contentKey` changes. Same-key child updates apply
 * immediately (no animation) so live copy tweaks don’t blink.
 */
export function Crossfade({
  contentKey,
  children,
  durationMs = 720,
  style,
}: Props) {
  const opacity = useRef(new Animated.Value(1)).current;
  const [displayed, setDisplayed] = useState<{ key: string; node: ReactNode }>({
    key: contentKey,
    node: children,
  });
  const pendingRef = useRef<{ key: string; node: ReactNode } | null>(null);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  // Keep latest children for the in-flight key so the swap uses fresh nodes.
  if (pendingRef.current?.key === contentKey) {
    pendingRef.current = { key: contentKey, node: children };
  }

  useEffect(() => {
    if (contentKey === displayed.key) {
      setDisplayed({ key: contentKey, node: children });
      opacity.setValue(1);
      return;
    }

    pendingRef.current = { key: contentKey, node: children };
    const half = Math.max(80, Math.round(durationMs / 2));
    let cancelled = false;
    animRef.current?.stop();
    animRef.current = Animated.timing(opacity, {
      toValue: 0,
      duration: half,
      useNativeDriver: true,
    });
    animRef.current.start(({ finished }) => {
      if (!finished || cancelled) return;
      const next = pendingRef.current ?? { key: contentKey, node: children };
      pendingRef.current = null;
      setDisplayed(next);
      animRef.current = Animated.timing(opacity, {
        toValue: 1,
        duration: half,
        useNativeDriver: true,
      });
      animRef.current.start();
    });

    return () => {
      cancelled = true;
      animRef.current?.stop();
    };
    // Only re-run the fade when the key changes; children is read from the
    // render that introduced the new key (and refreshed via pendingRef).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [contentKey, durationMs, opacity]);

  return (
    <Animated.View style={[{ opacity }, style]} pointerEvents="box-none">
      {/* Live children when settled so style/copy tweaks aren’t stuck on a stale node. */}
      {contentKey === displayed.key ? children : displayed.node}
    </Animated.View>
  );
}
