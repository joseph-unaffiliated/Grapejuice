import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type Props = {
  /** Resolved video URL (http / metro asset). */
  src: string;
  /** Still frame under the video (also shown until src is armed). */
  poster?: ImageSourcePropType | null;
  style?: StyleProp<ViewStyle>;
  /**
   * eager — arm shortly after mount (hero).
   * lazy — arm when scrolled near the viewport (below-fold strips).
   *
   * Never wait on window "load": that event is blocked by every image on the
   * page, including multi‑MB lifestyle banners further down.
   */
  load?: 'eager' | 'lazy';
};

/**
 * Web-only looping reel that does not block the document load / tab spinner.
 *
 * Chrome treats autoplaying <video src> as a load-blocking subresource. With
 * multi‑MB storefront reels that can leave readyState at "interactive" for a
 * long time. We:
 *  1. Paint the poster as a normal Image immediately (when this mounts)
 *  2. Attach video src only after idle (eager) or when near viewport (lazy)
 *  3. Use preload="none" so the element itself never opts into early fetch
 */
export function StorefrontWebVideo({
  src,
  poster,
  style,
  load = 'lazy',
}: Props) {
  const [armed, setArmed] = useState(false);
  const rootRef = useRef<View>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (armed) return;
    let cancelled = false;

    const arm = () => {
      if (!cancelled) setArmed(true);
    };

    if (typeof window === 'undefined') {
      arm();
      return;
    }

    if (load === 'eager') {
      // Don’t wait for window.load — below-fold images would delay the hero reel.
      const w = window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        cancelIdleCallback?: (id: number) => void;
      };
      if (typeof w.requestIdleCallback === 'function') {
        const id = w.requestIdleCallback(arm, { timeout: 450 });
        return () => {
          cancelled = true;
          w.cancelIdleCallback?.(id);
        };
      }
      const timeoutId = window.setTimeout(arm, 180);
      return () => {
        cancelled = true;
        window.clearTimeout(timeoutId);
      };
    }

    const node = rootRef.current as unknown as Element | null;
    if (!node || typeof IntersectionObserver === 'undefined') {
      const timeoutId = window.setTimeout(arm, 800);
      return () => {
        cancelled = true;
        window.clearTimeout(timeoutId);
      };
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          arm();
          io.disconnect();
        }
      },
      { root: null, rootMargin: '200px 0px', threshold: 0.01 }
    );
    io.observe(node);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [armed, load]);

  useEffect(() => {
    if (!armed) return;
    const el = videoRef.current;
    if (!el) return;
    void el.play().catch(() => {
      /* autoplay policy / interrupted — poster remains visible */
    });
  }, [armed, src]);

  return (
    <View ref={rootRef} style={[styles.root, style]} pointerEvents="none" collapsable={false}>
      {poster ? (
        <Image source={poster} style={styles.poster} resizeMode="cover" />
      ) : null}
      {armed
        ? React.createElement('video', {
            ref: (node: HTMLVideoElement | null) => {
              videoRef.current = node;
            },
            src,
            autoPlay: true,
            muted: true,
            loop: true,
            playsInline: true,
            preload: 'none',
            'aria-hidden': true,
            // No poster attr — Image layer covers first paint; avoids a second
            // network fetch racing first paint.
            style: styles.video,
          })
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
  },
  poster: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    ...({ objectFit: 'cover', objectPosition: 'center bottom' } as object),
  },
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: 'center bottom',
  } as object,
});
