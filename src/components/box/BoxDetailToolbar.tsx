import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Platform, useWindowDimensions } from 'react-native';
import type { TextStyle } from 'react-native';
import { createBoxDetailStyles } from './boxDetailLayout';
import { AddToCalendarMenu } from '../holiday/AddToCalendarMenu';
import { useThemeMode } from '../../context/ThemeContext';
import { useWebLayout } from '../../hooks/useWebLayout';
import { spacing } from '../../constants/theme';
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
  /** Overrides the responsive title sizing (e.g. to match checkout step titles). */
  titleStyle?: TextStyle;
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
  titleStyle,
}: Props) {
  const { colors } = useThemeMode();
  const styles = useMemo(
    () => createBoxDetailStyles(colors, { desktop: align === 'left' }),
    [colors, align]
  );
  const { tier } = useWebLayout();
  const { width: windowWidth } = useWindowDimensions();
  const desktopTitle = Platform.OS === 'web' && tier === 'desktop-web';
  const leftAlign = align === 'left';
  const showBack = !!onBack && !hideBack;
  const phoneTitle = !leftAlign && (tier === 'native' || tier === 'mobile-web');
  const phoneTitleStyle = useMemo(() => {
    if (!phoneTitle) return null;
    // DM Sans regular averages ~0.44em per character; keep the title on one line.
    const available = windowWidth - spacing.md * 2 - (showBack ? 48 : 0);
    const fontSize = Math.round(
      Math.min(46, Math.max(28, (available * 0.78) / (title.length * 0.44)))
    );
    return {
      fontSize,
      lineHeight: Math.round(fontSize * 1.16),
      letterSpacing: -0.025 * fontSize,
    };
  }, [phoneTitle, windowWidth, showBack, title]);
  const lockLabel = isBoxLocked(lockAt, now)
    ? lockedBoxChipLabel(estimatedDeliveryBy, now)
    : boxLockChipLabel(now, lockAt);

  return (
    <View>
      <View
        style={[
          styles.toolbar,
          (desktopTitle || phoneTitle) && !leftAlign && styles.toolbarTitlePad,
          leftAlign && styles.toolbarLeft,
        ]}
      >
        {leftAlign || (phoneTitle && !showBack) ? null : (
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
          <Text
            style={[
              styles.toolbarTitle,
              desktopTitle && !leftAlign && styles.toolbarTitleDesktop,
              leftAlign && styles.toolbarTitleLeft,
              phoneTitleStyle,
              titleStyle,
            ]}
          >
            {title}
          </Text>
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
        {leftAlign || (phoneTitle && !showBack) ? null : <View style={styles.toolbarSide} />}
      </View>
    </View>
  );
}
