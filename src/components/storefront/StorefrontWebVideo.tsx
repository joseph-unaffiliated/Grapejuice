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
};

/**
 * Web-only looping reel that does not block the document load / tab spinner.
 *
 * Chrome treats autoplaying <video src> as a load-blocking subresource. With
 * multi‑MB storefront reels that can leave readyState at "interactive" for a
 * long time (or indefinitely if Metro/Dropbox stalls). We:
 *  1. Paint the poster as a normal Image immediately
 *  2. Attach video src only after window "load" (or next tick if already complete)
 *  3. Use preload="none" so the element itself never opts into early fetch
 */
export function StorefrontWebVideo({ src, poster, style }: Props) {
  const [armed, setArmed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const arm = () => {
      if (cancelled) return;
      setArmed(true);
    };

    if (typeof document === 'undefined') {
      arm();
      return;
    }

    if (document.readyState === 'complete') {
      // Next macrotask: avoid starting a large fetch in the same turn as load.
      timeoutId = setTimeout(arm, 0);
    } else {
      window.addEventListener('load', arm, { once: true });
    }

    return () => {
      cancelled = true;
      if (timeoutId != null) clearTimeout(timeoutId);
      window.removeEventListener('load', arm);
    };
  }, []);

  useEffect(() => {
    if (!armed) return;
    const el = videoRef.current;
    if (!el) return;
    void el.play().catch(() => {
      /* autoplay policy / interrupted — poster remains visible */
    });
  }, [armed, src]);

  return (
    <View style={[styles.root, style]} pointerEvents="none">
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
            // network fetch racing the document load event.
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
