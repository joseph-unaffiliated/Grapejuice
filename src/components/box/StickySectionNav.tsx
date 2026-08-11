import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
  ScrollView,
  type LayoutChangeEvent,
} from 'react-native';
import type { BoxDisplaySectionId } from '../../constants/boxDisplaySections';
import { BOX_DISPLAY_SECTIONS } from '../../constants/boxDisplaySections';
import { typography, spacing, typeface, MOBILE_GUTTER, semanticColors } from '../../constants/theme';
import { BOX_DETAIL_TAB_GUTTER } from './boxDetailLayout';
import { useThemeMode } from '../../context/ThemeContext';
import { useWebLayout } from '../../hooks/useWebLayout';
import type { SemanticColors } from '../../constants/themeMode';
import { STOREFRONT_H_SCROLL_CLASS } from '../storefront/storefrontScroll';

type Props = {
  activeSection: BoxDisplaySectionId;
  onSelect: (id: BoxDisplaySectionId) => void;
  /** Tabs to show — omit empty sections. Defaults to all five. */
  sectionIds?: BoxDisplaySectionId[];
  /**
   * `page` — in-body sticky (white).
   * `services` — black secondary bar (same layout as StorefrontCategoryNav).
   */
  variant?: 'page' | 'services';
};

export function StickySectionNav({
  activeSection,
  onSelect,
  sectionIds,
  variant = 'page',
}: Props) {
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const styles = useMemo(
    () => createNavStyles(colors, isDesktop, variant),
    [colors, isDesktop, variant],
  );
  const tabs = useMemo(
    () =>
      (sectionIds ?? BOX_DISPLAY_SECTIONS.map((section) => section.id))
        .map((id) => BOX_DISPLAY_SECTIONS.find((section) => section.id === id))
        .filter((section): section is (typeof BOX_DISPLAY_SECTIONS)[number] => section != null),
    [sectionIds],
  );
  const tabLayouts = useRef<Partial<Record<BoxDisplaySectionId, { x: number; width: number }>>>({});
  const indicatorX = useRef(new Animated.Value(0)).current;
  const indicatorW = useRef(new Animated.Value(0)).current;

  const moveIndicator = (id: BoxDisplaySectionId) => {
    const layout = tabLayouts.current[id];
    if (!layout) return;
    Animated.parallel([
      Animated.spring(indicatorX, { toValue: layout.x, useNativeDriver: false, friction: 8 }),
      Animated.spring(indicatorW, { toValue: layout.width, useNativeDriver: false, friction: 8 }),
    ]).start();
  };

  useEffect(() => {
    moveIndicator(activeSection);
  }, [activeSection]);

  const onTabLayout = (id: BoxDisplaySectionId) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    tabLayouts.current[id] = { x, width };
    if (id === activeSection) {
      indicatorX.setValue(x);
      indicatorW.setValue(width);
    }
  };

  const tabRow = (
    <View style={styles.row}>
      {tabs.map(({ id, navLabel }) => {
        const active = id === activeSection;
        return (
          <TouchableOpacity
            key={id}
            style={styles.tab}
            onLayout={onTabLayout(id)}
            onPress={() => onSelect(id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
              {navLabel}
            </Text>
          </TouchableOpacity>
        );
      })}
      <Animated.View
        style={[
          styles.indicator,
          {
            left: indicatorX,
            width: indicatorW,
          },
        ]}
      />
    </View>
  );

  return (
    <View style={styles.wrap}>
      {isDesktop ? (
        tabRow
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          // @ts-expect-error web className
          className={Platform.OS === 'web' ? STOREFRONT_H_SCROLL_CLASS : undefined}
        >
          {tabRow}
        </ScrollView>
      )}
    </View>
  );
}

/** Section tab row — full practice labels; scrollable on compact widths. */
function createNavStyles(
  colors: SemanticColors,
  isDesktop: boolean,
  variant: 'page' | 'services',
) {
  const services = variant === 'services';
  return StyleSheet.create({
    // `services` mirrors StorefrontCategoryNav: same black bar height/padding/gap.
    wrap: {
      paddingTop: services ? 0 : spacing.md,
      paddingBottom: 0,
      paddingHorizontal: services ? 0 : isDesktop ? 0 : BOX_DETAIL_TAB_GUTTER,
      backgroundColor: services ? semanticColors.logoDark : colors.bgPrimary,
      // Dark secondary bar — no light/white bottom stroke.
      borderBottomWidth: 0,
      zIndex: 10,
      ...(Platform.OS === 'web' && !services
        ? { position: 'sticky' as const, top: 0 }
        : {}),
    },
    scrollContent: {
      flexGrow: 1,
      ...(services ? { justifyContent: 'center' } : null),
    },
    row: {
      flexGrow: services ? 1 : undefined,
      flexDirection: 'row',
      alignItems: 'center',
      position: 'relative',
      // Page variant keeps a soft gold rule; services bar has none.
      borderBottomWidth: services ? 0 : 0.5,
      borderBottomColor: 'rgba(216,201,144,0.5)',
      gap: services || isDesktop ? spacing.lg : spacing.md,
      paddingHorizontal: services ? MOBILE_GUTTER : 0,
      paddingVertical: services ? spacing.sm : 0,
      ...(isDesktop || services ? { justifyContent: 'center' } : null),
    },
    tab: {
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      // Keep indicator room without growing past category-bar height.
      paddingBottom: services ? 0 : 8,
      paddingRight: isDesktop && !services ? spacing.sm : 0,
    },
    tabText: {
      fontSize: typography.sm,
      ...(services ? typeface('medium') : typeface('light')),
      color: services ? semanticColors.textInverse : colors.textPrimary,
      letterSpacing: services ? 0 : -0.22,
      ...(services ? { opacity: 0.85 } : null),
      ...(Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as object) : {}),
    },
    tabTextActive: {
      ...(services ? { opacity: 1 } : typeface('regular')),
    },
    indicator: {
      position: 'absolute',
      bottom: services ? spacing.sm - 1 : 0,
      height: 1,
      backgroundColor: services ? semanticColors.brand : colors.brand,
    },
  });
}
