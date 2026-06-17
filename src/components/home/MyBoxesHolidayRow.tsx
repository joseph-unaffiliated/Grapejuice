import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform } from 'react-native';
import type { MyBoxesHoliday } from '../../constants/myBoxesHolidays';
import { typography, borderRadius, colors as palette } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

const THUMB_WIDTH = 64;
const GOLD = palette.warm[200];
const ROW_TINT = 'rgba(216, 201, 144, 0.22)';

type Props = {
  holiday: MyBoxesHoliday;
  onAction: () => void;
  onDismiss: () => void;
};

/** Figma 370:3027+ — tinted row, 64px thumb, micro CTAs. */
export function MyBoxesHolidayRow({ holiday, onAction, onDismiss }: Props) {
  const { colors: themeColors } = useThemeMode();
  const styles = useMemo(() => createHolidayRowStyles(themeColors), [themeColors]);
  const isGetStarted = holiday.action === 'get-started';
  const actionText = isGetStarted ? 'get started >' : 'pre-register >';

  const getStartedFillStyle =
    Platform.OS === 'web'
      ? ({
          backgroundImage:
            'linear-gradient(139.92deg, rgb(63, 50, 1) 0%, rgb(0, 0, 0) 100%)',
          boxShadow: 'inset 2px 2px 6px #d8c990, inset -2px -2px 6px #000000',
        } as object)
      : null;

  return (
    <View style={styles.row}>
      <View style={styles.thumb}>
        <Image source={holiday.image} style={styles.thumbImage} resizeMode="cover" accessibilityIgnoresInvertColors />
      </View>

      {isGetStarted ? (
        <View style={styles.getStartedBody}>
          <View style={styles.getStartedLeft}>
            <View style={styles.copy}>
              <Text style={styles.date}>{holiday.dateLabel}</Text>
              <Text style={styles.name} numberOfLines={2}>
                {holiday.name}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.dismissOutline}
              onPress={onDismiss}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Dismiss ${holiday.name}`}
            >
              <Text style={styles.dismissText}>dismiss</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.getStartedRight}>
            <TouchableOpacity
              style={[styles.getStartedBtn, !getStartedFillStyle && styles.getStartedBtnNative]}
              onPress={onAction}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Get started for ${holiday.name}`}
            >
              {getStartedFillStyle ? <View style={[StyleSheet.absoluteFill, getStartedFillStyle]} /> : null}
              <Text style={styles.getStartedText}>{actionText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.preRegisterBody}>
          <View style={styles.copy}>
            <Text style={styles.date}>{holiday.dateLabel}</Text>
            <Text style={styles.name} numberOfLines={2}>
              {holiday.name}
            </Text>
          </View>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.preRegisterBtn}
              onPress={onAction}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Pre-register for ${holiday.name}`}
            >
              <Text style={styles.actionText}>{actionText}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.dismissOutline}
              onPress={onDismiss}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Dismiss ${holiday.name}`}
            >
              <Text style={styles.dismissText}>dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

function createHolidayRowStyles(colors: SemanticColors) {
  return StyleSheet.create({
    row: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'stretch',
      backgroundColor: ROW_TINT,
      borderRadius: borderRadius.xl,
      overflow: 'hidden',
      minHeight: 72,
      flexShrink: 0,
    },
    thumb: {
      width: THUMB_WIDTH,
      alignSelf: 'stretch',
      backgroundColor: 'rgba(0,0,0,0.05)',
    },
    thumbImage: {
      width: THUMB_WIDTH,
      height: '100%',
      ...(Platform.OS === 'web' ? ({ objectFit: 'cover' } as object) : {}),
    },
    getStartedBody: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    getStartedLeft: {
      flexDirection: 'column',
      gap: 6,
      paddingLeft: 16,
      paddingVertical: 10,
      flexShrink: 0,
    },
    getStartedRight: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: 8,
      flexShrink: 0,
    },
    preRegisterBody: {
      flex: 1,
      flexDirection: 'column',
      gap: 6,
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      flexShrink: 0,
    },
    copy: {
      gap: 2,
      flexShrink: 0,
    },
    date: {
      fontSize: 9,
      fontWeight: '200',
      color: colors.textPrimary,
      letterSpacing: -0.18,
      flexShrink: 0,
      ...(Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as object) : {}),
    },
    name: {
      fontSize: typography.lg,
      fontWeight: '400',
      color: colors.textPrimary,
      letterSpacing: -0.26,
      flexShrink: 0,
    },
    buttonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    dismissOutline: {
      alignSelf: 'flex-start',
      backgroundColor: colors.bgPrimary,
      borderWidth: 0.5,
      borderColor: GOLD,
      borderRadius: borderRadius.pill,
      paddingHorizontal: 8,
      paddingTop: 2,
      paddingBottom: 3,
    },
    dismissText: {
      fontSize: 9,
      fontWeight: '400',
      color: GOLD,
      letterSpacing: -0.18,
    },
    preRegisterBtn: {
      backgroundColor: palette.purple[500],
      borderWidth: 0.5,
      borderColor: GOLD,
      borderRadius: borderRadius.pill,
      paddingHorizontal: 8,
      paddingTop: 2,
      paddingBottom: 3,
    },
    actionText: {
      fontSize: 9,
      fontWeight: '400',
      color: GOLD,
      letterSpacing: -0.18,
    },
    getStartedBtn: {
      borderWidth: 0.5,
      borderColor: GOLD,
      borderRadius: borderRadius.xl,
      paddingVertical: 16,
      paddingLeft: 20,
      paddingRight: 16,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 88,
      ...(Platform.OS === 'web' ? ({ boxShadow: '2px 2px 1.5px rgba(0,0,0,0.25)' } as object) : {}),
    },
    getStartedBtnNative: {
      backgroundColor: '#3f3201',
    },
    getStartedText: {
      fontSize: 9,
      fontWeight: '400',
      color: GOLD,
      letterSpacing: -0.18,
      zIndex: 1,
    },
  });
}
