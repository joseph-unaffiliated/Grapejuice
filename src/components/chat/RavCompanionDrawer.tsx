import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Easing,
  useWindowDimensions,
  Platform,
} from 'react-native';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import type { RavPaneKind, RavPanePayload, RavTreatPathOption } from '../../types/ravPane';
import { RavCompanionPane, RAV_COMPANION_PANE_WIDTH } from './RavCompanionPane';

const PANE_OPEN_MS = 320;
const PANE_CLOSE_MS = 280;

/** Soft gold edge glow toward chat — lighter than sidebar goldBar. */
const PANE_GOLD_SHADOW =
  Platform.OS === 'web'
    ? ({ boxShadow: '-2px 0 20px rgba(216, 201, 144, 0.28)' } as object)
    : undefined;

type Props = {
  open: boolean;
  onClose: () => void;
  /** When true, occupies layout width and pushes siblings. When false, overlays from the right. */
  push: boolean;
  kind?: RavPaneKind;
  title?: string;
  subtitle?: string;
  payload?: RavPanePayload;
  lineItems: BoxLineItem[];
  catalog: CatalogItem[];
  onConfirmReview?: () => void;
  onDismissReview?: () => void;
  onReviewAppliedDone?: () => void;
  reviewBusy?: boolean;
  onPickOption?: (itemId: string) => void;
  onPickTreatPath?: (path: RavTreatPathOption) => void;
};

/**
 * Screen-edge companion drawer. Render as a sibling of the content panel
 * (not inside WebContentPanel) so it enters from the true right of the main area.
 */
export function RavCompanionDrawer({
  open,
  onClose,
  push,
  kind = 'box',
  title,
  subtitle,
  payload,
  lineItems,
  catalog,
  onConfirmReview,
  onDismissReview,
  onReviewAppliedDone,
  reviewBusy,
  onPickOption,
  onPickTreatPath,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const [mounted, setMounted] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const readyRef = useRef(false);

  const widthTarget = push
    ? RAV_COMPANION_PANE_WIDTH
    : Math.min(RAV_COMPANION_PANE_WIDTH, Math.round(windowWidth * 0.88));

  useEffect(() => {
    if (!readyRef.current) {
      readyRef.current = true;
      return;
    }
    animRef.current?.stop();
    if (open) {
      setMounted(true);
      const anim = Animated.timing(progress, {
        toValue: 1,
        duration: PANE_OPEN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      });
      animRef.current = anim;
      const raf = requestAnimationFrame(() => anim.start());
      return () => {
        cancelAnimationFrame(raf);
        anim.stop();
      };
    }
    const anim = Animated.timing(progress, {
      toValue: 0,
      duration: PANE_CLOSE_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: false,
    });
    animRef.current = anim;
    anim.start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return () => anim.stop();
  }, [open, progress]);

  if (!open && !mounted) return null;

  const slotWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, widthTarget],
  });
  const slideX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [widthTarget, 0],
  });

  const pane = (
    <RavCompanionPane
      kind={kind}
      title={title}
      subtitle={subtitle}
      payload={payload}
      lineItems={lineItems}
      catalog={catalog}
      onClose={onClose}
      onConfirmReview={onConfirmReview}
      onDismissReview={onDismissReview}
      onReviewAppliedDone={onReviewAppliedDone}
      reviewBusy={reviewBusy}
      onPickOption={onPickOption}
      onPickTreatPath={onPickTreatPath}
    />
  );

  if (push) {
    return (
      <Animated.View
        style={[
          styles.slotOuter,
          { width: slotWidth },
          // Shadow lives here (overflow visible). Inner clip still hides the slide.
          open || mounted ? PANE_GOLD_SHADOW : null,
        ]}
      >
        <View style={styles.slotClip}>
          <Animated.View
            style={[
              styles.slide,
              { width: widthTarget, transform: [{ translateX: slideX }] },
            ]}
          >
            {pane}
          </Animated.View>
        </View>
      </Animated.View>
    );
  }

  return (
    <View style={styles.overlayRoot} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.overlaySheet,
          { width: widthTarget, transform: [{ translateX: slideX }] },
          PANE_GOLD_SHADOW,
        ]}
      >
        {pane}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  slotOuter: {
    flexShrink: 0,
    height: '100%',
    alignSelf: 'stretch',
    overflow: 'visible',
    zIndex: 2,
  },
  slotClip: {
    flex: 1,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  slide: {
    flex: 1,
    height: '100%',
  },
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    overflow: 'visible',
  },
  overlaySheet: {
    height: '100%',
    flexShrink: 0,
    overflow: 'visible',
  },
});
