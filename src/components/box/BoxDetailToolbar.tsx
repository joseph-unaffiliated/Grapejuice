import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { createBoxDetailStyles } from './boxDetailLayout';
import { AddToCalendarMenu } from '../holiday/AddToCalendarMenu';
import { useThemeMode } from '../../context/ThemeContext';
import {
  boxLockChipLabel,
  lockedBoxChipLabel,
} from '../../constants/hanukkahBoxLock';
import { isBoxLocked } from '../../services/firestore/config';

type Props = {
  lockAt: string | null;
  now: Date;
  onBack?: () => void;
  title?: string;
  startsOn?: string | null;
  estimatedDeliveryBy?: string | null;
  showCalendar?: boolean;
  /** Desktop / home-style left alignment vs mobile centered toolbar. */
  align?: 'left' | 'center';
  /** Hide the back control even when `onBack` is passed (My Box chrome). */
  hideBack?: boolean;
  /** Calendar UI: full chip strip vs inline text link under the subline. */
  calendarVariant?: 'strip' | 'inlineLink';
};

/** Compact box header — title, lock countdown, optional calendar. */
export function BoxDetailToolbar({
  lockAt,
  now,
  onBack,
  title = 'Your Hanukkah Box',
  startsOn = null,
  estimatedDeliveryBy = null,
  showCalendar = true,
  align = 'center',
  hideBack = false,
  calendarVariant = 'strip',
}: Props) {
  const { colors } = useThemeMode();
  const styles = useMemo(
    () => createBoxDetailStyles(colors, { desktop: align === 'left' }),
    [colors, align]
  );
  const leftAlign = align === 'left';
  const showBack = !!onBack && !hideBack;
  const lockLabel = isBoxLocked(lockAt, now)
    ? lockedBoxChipLabel(estimatedDeliveryBy, now)
    : boxLockChipLabel(now);

  return (
    <View>
      <View style={[styles.toolbar, leftAlign && styles.toolbarLeft]}>
        {leftAlign ? null : (
          <View style={styles.toolbarSide}>
            {showBack ? (
              <TouchableOpacity onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
                <Text style={styles.backText}>←</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
        <View style={[styles.toolbarCenter, leftAlign && styles.toolbarCenterLeft]}>
          {leftAlign && showBack ? (
            <TouchableOpacity
              onPress={onBack}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={styles.toolbarBackInline}
            >
              <Text style={styles.backText}>←</Text>
            </TouchableOpacity>
          ) : null}
          <Text style={[styles.toolbarTitle, leftAlign && styles.toolbarTitleLeft]}>{title}</Text>
          <View style={[styles.lockChipRow, leftAlign && styles.lockChipRowLeft]}>
            <Text style={styles.lockChipText}>{lockLabel}</Text>
            {showCalendar ? (
              <AddToCalendarMenu
                startsOn={startsOn}
                lockAt={lockAt}
                estimatedDeliveryBy={estimatedDeliveryBy}
                compact
                align={align}
                variant={calendarVariant}
              />
            ) : null}
          </View>
        </View>
        {leftAlign ? null : <View style={styles.toolbarSide} />}
      </View>
      <View style={styles.toolbarGoldDivider} accessibilityRole="none" />
    </View>
  );
}
