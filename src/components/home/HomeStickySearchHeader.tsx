import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
} from 'react-native';
import { SearchPill } from '../ui/SearchPill';
import { spacing, typography, MOBILE_GUTTER, LAYOUT } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

export const HOME_HEADER_COLLAPSE_RANGE = 80;
/** Timed expand/collapse once scroll crosses the threshold (not scrubbed to scrollY). */
export const HOME_HEADER_COLLAPSE_MS = 280;
const HEADER_CHIP_GAP = 16;
const HEADER_DESKTOP_INNER_MAX_WIDTH = 480;
const HEADER_DESKTOP_COLLAPSED_MAX_WIDTH = 300;
const HEADER_DESKTOP_TOP_PAD = 72;
const HEADER_DESKTOP_BOTTOM_PAD = 48;
const HEADER_BOTTOM_PAD = 16;
const CHIP_ROW_HEIGHT = 36;

type Chip = { id: string; label: string };

type Props = {
  collapseProgress: Animated.Value | Animated.AnimatedInterpolation<number>;
  isDesktop: boolean;
  contentWidth: number;
  expandedPaddingTop: number;
  searchQuery: string;
  onChangeSearch: (text: string) => void;
  onSubmitSearch: () => void;
  chips: readonly Chip[];
  onChipPress: (id: Chip['id']) => void;
  headerShadow?: object;
  /** Typewriter placeholder only when header is fully expanded at top of page. */
  animatePlaceholder?: boolean;
};

export function HomeStickySearchHeader({
  collapseProgress,
  isDesktop,
  contentWidth,
  expandedPaddingTop,
  searchQuery,
  onChangeSearch,
  onSubmitSearch,
  chips,
  onChipPress,
  headerShadow,
  animatePlaceholder = false,
}: Props) {
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors, isDesktop), [colors, isDesktop]);

  const collapsedPaddingTop = isDesktop ? spacing.lg : spacing.sm;
  const collapsedPaddingBottom = spacing.sm * 2; // 24px — a touch more room below search when collapsed
  const expandedPaddingBottom = isDesktop ? HEADER_DESKTOP_BOTTOM_PAD : HEADER_BOTTOM_PAD;

  const mobileExpandedSearchWidth = Math.max(contentWidth - MOBILE_GUTTER * 2, 240);
  const mobileCollapsedSearchWidth = Math.max(contentWidth - MOBILE_GUTTER * 4, 200);

  const paddingTop = collapseProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [expandedPaddingTop, collapsedPaddingTop],
  });
  const paddingBottom = collapseProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [expandedPaddingBottom, collapsedPaddingBottom],
  });
  const headerGap = collapseProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [HEADER_CHIP_GAP, 0],
  });
  const searchMaxWidth = collapseProgress.interpolate({
    inputRange: [0, 1],
    outputRange: isDesktop
      ? [HEADER_DESKTOP_INNER_MAX_WIDTH, HEADER_DESKTOP_COLLAPSED_MAX_WIDTH]
      : [mobileExpandedSearchWidth, mobileCollapsedSearchWidth],
  });
  const chipsOpacity = collapseProgress.interpolate({
    inputRange: [0, 0.55],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const chipsTranslateY = collapseProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -CHIP_ROW_HEIGHT - HEADER_CHIP_GAP],
  });
  const chipsMaxHeight = collapseProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [CHIP_ROW_HEIGHT, 0],
  });

  const searchBlock = (
    <Animated.View
      style={[
        styles.searchWrap,
        isDesktop && styles.searchWrapDesktop,
        { maxWidth: searchMaxWidth, backgroundColor: colors.bgPrimary },
      ]}
    >
      <SearchPill
        value={searchQuery}
        onChangeText={onChangeSearch}
        onSubmitEditing={onSubmitSearch}
        animatePlaceholder={animatePlaceholder}
      />
    </Animated.View>
  );

  const chipsBlock = (
    <Animated.View
      style={[
        styles.chipsWrap,
        {
          opacity: chipsOpacity,
          maxHeight: chipsMaxHeight,
          transform: [{ translateY: chipsTranslateY }],
        },
      ]}
      pointerEvents="box-none"
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={[
          styles.categoryChips,
          isDesktop && styles.categoryChipsFlush,
          isDesktop && styles.categoryChipsDesktopCenter,
        ]}
      >
        {chips.map((chip) => (
          <TouchableOpacity
            key={chip.id}
            style={styles.categoryChip}
            onPress={() => onChipPress(chip.id)}
          >
            <Text style={styles.categoryChipText}>{chip.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </Animated.View>
  );

  return (
    <Animated.View
      style={[
        styles.header,
        !isDesktop && styles.headerSticky,
        isDesktop && styles.headerDesktopBar,
        headerShadow,
        { paddingTop, paddingBottom, gap: headerGap },
      ]}
    >
      {isDesktop ? (
        searchBlock
      ) : (
        <View style={styles.headerSearch}>{searchBlock}</View>
      )}
      {chipsBlock}
    </Animated.View>
  );
}

function createStyles(colors: SemanticColors, isDesktop: boolean) {
  return StyleSheet.create({
    header: {
      backgroundColor: colors.bgPrimary,
      overflow: 'hidden',
      zIndex: 20,
    },
    headerSticky: Platform.OS === 'web' ? ({ position: 'sticky' as const, top: 0 } as object) : {},
    headerDesktopBar: {
      width: '100%',
      alignSelf: 'stretch',
      paddingHorizontal: LAYOUT.WEB_CONTENT_GUTTER,
      alignItems: 'center',
    },
    headerSearch: {
      paddingHorizontal: MOBILE_GUTTER,
      alignItems: 'center',
      zIndex: 2,
    },
    searchWrap: {
      width: '100%',
      zIndex: 2,
    },
    searchWrapDesktop: {
      alignSelf: 'center',
    },
    chipsWrap: {
      width: '100%',
      overflow: 'hidden',
      zIndex: 1,
    },
    chipsScroll: {
      width: '100%',
    },
    categoryChips: {
      gap: 6,
      paddingLeft: MOBILE_GUTTER,
      flexDirection: 'row',
      alignItems: 'center',
    },
    categoryChipsFlush: { paddingLeft: 0 },
    categoryChipsDesktopCenter: {
      flexGrow: 1,
      justifyContent: 'center',
      ...(Platform.OS === 'web' ? ({ minWidth: '100%' } as object) : {}),
    },
    categoryChip: {
      borderWidth: 0.5,
      borderColor: colors.brand,
      borderRadius: 32,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
    },
    categoryChipText: {
      fontSize: typography.sm,
      fontWeight: '200',
      color: colors.textPrimary,
      letterSpacing: -0.22,
      fontFamily: typography.fontFamily.light,
    },
  });
}

export {
  HEADER_DESKTOP_TOP_PAD,
  HEADER_DESKTOP_BOTTOM_PAD,
  HEADER_DESKTOP_INNER_MAX_WIDTH,
};
