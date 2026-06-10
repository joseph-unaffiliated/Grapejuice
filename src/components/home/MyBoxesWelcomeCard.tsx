import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { MyBoxesHolidayRow } from './MyBoxesHolidayRow';
import { MY_BOXES_HOLIDAYS } from '../../constants/myBoxesHolidays';
import { useMyBoxesDismissedHolidays } from '../../hooks/useMyBoxesDismissedHolidays';
import { semanticColors, spacing, typography, shadows, shadowsWeb, MOBILE_GUTTER } from '../../constants/theme';
import type { MainTabsParamList } from '../../navigation/types';

type Nav = BottomTabNavigationProp<MainTabsParamList>;

type Props = {
  /** Fixed width for peek card in horizontal carousel */
  width?: number;
  peek?: boolean;
  onPress: () => void;
  passoverRegistered?: boolean;
  onPassoverPreregister?: () => void;
  onPreregisterInterest?: (interestKey: string) => void;
};

const SHADOW_BLEED = 8;
/** Figma 370:2995 — fixed empty-state card height. */
const WELCOME_CARD_HEIGHT = 420;
const CARD_PAD = 16;
const CARD_SECTION_GAP = 24;
const HOLIDAY_ROW_GAP = 8;

/** Figma 370:2995 — empty My Boxes card with interactive holiday rows. */
export function MyBoxesWelcomeCard({
  width,
  peek = false,
  onPress,
  passoverRegistered = false,
  onPassoverPreregister,
  onPreregisterInterest,
}: Props) {
  const navigation = useNavigation<Nav>();
  const { dismissed, dismiss, restore, loaded } = useMyBoxesDismissedHolidays();

  const cardShadow =
    Platform.OS === 'web' ? { boxShadow: shadowsWeb.goldGlow } : shadows.goldGlow;
  const inCarousel = width != null;

  const wrapStyle = inCarousel ? styles.carouselWrap : styles.shadowWrap;
  const cardStyle = [
    styles.card,
    inCarousel ? { width, minWidth: width } : { minHeight: WELCOME_CARD_HEIGHT },
    cardShadow,
  ];

  const visibleHolidays = useMemo(
    () => MY_BOXES_HOLIDAYS.filter((holiday) => !dismissed.includes(holiday.id)),
    [dismissed]
  );

  const dismissedHolidays = useMemo(
    () => MY_BOXES_HOLIDAYS.filter((holiday) => dismissed.includes(holiday.id)),
    [dismissed]
  );

  const handleHolidayAction = useCallback(
    (holidayId: string) => {
      const holiday = MY_BOXES_HOLIDAYS.find((h) => h.id === holidayId);
      if (!holiday) return;

      if (holiday.action === 'get-started') {
        onPress();
        return;
      }

      if (holiday.id === 'passover-2027' && !passoverRegistered) {
        onPassoverPreregister?.();
      } else if (holiday.interestKey) {
        onPreregisterInterest?.(holiday.interestKey);
      }

      if (holiday.ravPrompt) {
        navigation.navigate('Rav', { initialMessage: holiday.ravPrompt });
      }
    },
    [navigation, onPassoverPreregister, onPreregisterInterest, onPress, passoverRegistered]
  );

  return (
    <View style={wrapStyle}>
      <View style={cardStyle}>
        {!peek ? (
          <TouchableOpacity style={styles.headerCopy} onPress={onPress} activeOpacity={0.92}>
            <Text style={styles.headerTitle}>You don&apos;t have any boxes yet</Text>
            <Text style={styles.headerSub}>Start your first box now</Text>
          </TouchableOpacity>
        ) : null}

        {loaded ? (
          <View style={styles.holidayList}>
            {visibleHolidays.map((holiday) => (
              <MyBoxesHolidayRow
                key={holiday.id}
                holiday={holiday}
                onAction={() => handleHolidayAction(holiday.id)}
                onDismiss={() => dismiss(holiday.id)}
              />
            ))}

            {dismissedHolidays.length > 0 ? (
              <View style={styles.dismissedSection}>
                {dismissedHolidays.map((holiday) => (
                  <TouchableOpacity
                    key={holiday.id}
                    onPress={() => restore(holiday.id)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Restore ${holiday.dismissLabel}`}
                  >
                    <Text style={styles.dismissedLabel}>{holiday.dismissLabel}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    overflow: 'visible' as const,
    paddingHorizontal: MOBILE_GUTTER,
    paddingBottom: SHADOW_BLEED,
    marginBottom: -SHADOW_BLEED,
  },
  carouselWrap: {
    overflow: 'visible' as const,
    paddingVertical: 4,
  },
  card: {
    width: '100%',
    backgroundColor: semanticColors.bgPrimary,
    borderRadius: 16,
    paddingHorizontal: CARD_PAD,
    paddingVertical: CARD_SECTION_GAP,
    alignItems: 'stretch',
    gap: CARD_SECTION_GAP,
    overflow: 'hidden',
  },
  headerCopy: { alignItems: 'center', gap: 2, width: '100%' },
  headerTitle: {
    fontSize: typography.lg,
    fontWeight: '400',
    color: semanticColors.textPrimary,
    letterSpacing: -0.26,
    textAlign: 'center',
  },
  headerSub: {
    fontSize: typography.sm,
    fontWeight: '200',
    color: semanticColors.textPrimary,
    letterSpacing: -0.22,
    textAlign: 'center',
  },
  holidayList: {
    width: '100%',
    flex: 1,
    gap: HOLIDAY_ROW_GAP,
  },
  dismissedSection: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  dismissedLabel: {
    fontSize: typography.sm,
    fontWeight: '200',
    color: semanticColors.textSecondary,
    letterSpacing: -0.22,
    paddingVertical: 2,
  },
});
