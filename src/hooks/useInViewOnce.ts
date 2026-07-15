import { useEffect, useRef, useState } from 'react';
import { Platform, type View } from 'react-native';

/** Fires once when the ref element enters the viewport (web IntersectionObserver; native on mount). */
export function useInViewOnce(threshold = 0.35) {
  const ref = useRef<View>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      setInView(true);
      return;
    }

    let observer: IntersectionObserver | null = null;

    const attach = () => {
      const node = ref.current as unknown as Element | null;
      if (!node) return false;

      observer = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) {
            setInView(true);
            observer?.disconnect();
          }
        },
        { threshold },
      );
      observer.observe(node);
      return true;
    };

    if (!attach()) {
      const frame = requestAnimationFrame(() => attach());
      return () => {
        cancelAnimationFrame(frame);
        observer?.disconnect();
      };
    }

    return () => observer?.disconnect();
  }, [threshold]);

  return { ref, inView };
};
