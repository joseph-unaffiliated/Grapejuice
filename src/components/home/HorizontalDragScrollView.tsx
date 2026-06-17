import React, { forwardRef, useMemo, useRef } from 'react';
import { Platform, ScrollView, type ScrollViewProps } from 'react-native';
import { useDragToScrollWeb } from '../../hooks/useDragToScrollWeb';
import { HORIZONTAL_RAIL_SCROLL_CLASS } from './CatalogProductRail';

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (value: T) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === 'function') ref(value);
      else (ref as React.MutableRefObject<T | null>).current = value;
    }
  };
}

/** Horizontal ScrollView with desktop click-and-drag scrolling on web. */
export const HorizontalDragScrollView = forwardRef<ScrollView, ScrollViewProps>(
  function HorizontalDragScrollView({ className, ...props }, forwardedRef) {
    const innerRef = useRef<ScrollView>(null);
    useDragToScrollWeb(innerRef);

    const webClassName = useMemo(() => {
      if (Platform.OS !== 'web') return className;
      return [HORIZONTAL_RAIL_SCROLL_CLASS, className].filter(Boolean).join(' ');
    }, [className]);

    return (
      <ScrollView
        ref={mergeRefs(innerRef, forwardedRef)}
        {...props}
        {...(Platform.OS === 'web' && webClassName ? { className: webClassName } : {})}
      />
    );
  }
);
