import React, { useCallback, useEffect, type ReactNode } from 'react';
import {
  View,
  StyleSheet,
  Platform,
  Image,
  ScrollView,
  Pressable,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeMode } from '../../context/ThemeContext';
import { useWebLayout } from '../../hooks/useWebLayout';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { HOME_HOLIDAY_THUMBS } from '../../constants/homeImages';
import { GrapejuiceWordmarkLockup } from '../brand/GrapejuiceWordmarkLockup';
import {
  spacing,
  shadows,
  shadowsWeb,
  LAYOUT,
  semanticColors,
} from '../../constants/theme';

const IMAGE_SHADOW =
  Platform.OS === 'web'
    ? ('linear-gradient(180deg, rgba(0, 0, 0, 0.72) 0%, rgba(0, 0, 0, 0.58) 45%, rgba(0, 0, 0, 0.75) 100%)' as const)
    : null;

type Props = {
  children: ReactNode;
  /**
   * When true, force dismissible modal chrome (dimmed backdrop).
   * Default: auto from pending auth return / stack back.
   */
  modal?: boolean;
};

/**
 * Auth chrome: white card with storefront-style wordmark + grapes.
 * From guest Main (pendingReturn), renders as a dismissible modal over the app.
 * Cold-start Welcome keeps a photo backdrop behind the same card.
 */
export function AuthHeroShell({ children, modal }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const navigation = useNavigation();
  const pendingReturn = useAuthFlowStore((s) => s.pendingReturn);
  const clearPending = useAuthFlowStore((s) => s.clearPending);

  const dismissable = modal ?? (!!pendingReturn || navigation.canGoBack());
  /** Overlay over Main when guest started auth from the app. */
  const overApp = !!pendingReturn;
  const showPhotoBackdrop = !overApp;

  const onDismiss = useCallback(() => {
    if (pendingReturn) {
      clearPending();
      return;
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [pendingReturn, clearPending, navigation]);

  useEffect(() => {
    if (!dismissable || Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismissable, onDismiss]);

  const topPad = Platform.OS === 'web' ? spacing.xxl : Math.max(insets.top, spacing.xl);
  const bottomPad = Math.max(insets.bottom, spacing.xl) + spacing.lg;

  // Horizontal pad lives on scroll *content* (not the card chrome). ScrollView
  // clips at its edges — padding on the card outside the ScrollView leaves
  // full-bleed pills flush to the clip, cutting goldGlowSm / border-radius.
  const cardInner = (
    <View
      style={[
        styles.card,
        Platform.OS === 'web' ? ({ boxShadow: shadowsWeb.goldGlow } as object) : shadows.goldGlow,
        {
          maxWidth: isDesktop ? LAYOUT.WEB_AUTH_CARD_MAX_WIDTH : undefined,
          backgroundColor: colors.bgPrimary,
        },
      ]}
      accessibilityViewIsModal={overApp}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
        style={styles.cardScroll}
        contentContainerStyle={styles.cardScrollContent}
      >
        <View style={styles.brandBlock}>
          <GrapejuiceWordmarkLockup color={semanticColors.logoDark} />
        </View>
        {children}
      </ScrollView>
    </View>
  );

  return (
    <View style={[styles.root, overApp && styles.rootOverlay]}>
      {showPhotoBackdrop ? (
        <>
          <Image
            source={HOME_HOLIDAY_THUMBS.highHolidays}
            style={styles.bgImage}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              Platform.OS === 'web' && IMAGE_SHADOW
                ? ({ backgroundImage: IMAGE_SHADOW } as object)
                : { backgroundColor: 'rgba(0, 0, 0, 0.65)' },
            ]}
          />
        </>
      ) : null}

      <View
        style={[
          styles.stage,
          overApp && styles.backdropDim,
          { paddingTop: topPad, paddingBottom: bottomPad },
        ]}
      >
        {dismissable ? (
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss sign in"
          />
        ) : null}
        {/* Card sits above the backdrop press target — not nested inside a <button>. */}
        <View style={styles.cardHit} pointerEvents="box-none">
          {cardInner}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0C0A08',
    ...(Platform.OS === 'web' ? ({ minHeight: '100%' } as object) : null),
  },
  rootOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? ({ minHeight: '100%' } as object) : null),
  },
  bgImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  stage: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  backdropDim: {
    backgroundColor: 'rgba(17, 2, 34, 0.45)',
  },
  cardHit: {
    width: '100%',
    maxWidth: LAYOUT.WEB_AUTH_CARD_MAX_WIDTH,
    alignSelf: 'center',
  },
  card: {
    width: '100%',
    borderRadius: 16,
    // Keep pill shadows + radius visible; do not clip children to the card edge.
    overflow: 'visible',
    maxHeight: Platform.OS === 'web' ? ('85vh' as unknown as number) : undefined,
  },
  cardScroll: {
    // RN ScrollView still clips; inset content below provides shadow room.
    width: '100%',
  },
  cardScrollContent: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
});
