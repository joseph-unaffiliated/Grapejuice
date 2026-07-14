import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { boxHeaderSubtext, createBoxDetailStyles } from './boxDetailLayout';
import { AddToCalendarMenu } from '../holiday/AddToCalendarMenu';
import { useThemeMode } from '../../context/ThemeContext';

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
};

/** Figma 370:3516 — compact box header with optional back. */
export function BoxDetailToolbar({
  lockAt,
  now,
  onBack,
  title = 'Your Hanukkah Box',
  startsOn = null,
  estimatedDeliveryBy = null,
  showCalendar = true,
  align = 'center',
}: Props) {
  const { colors } = useThemeMode();
  const styles = useMemo(
    () => createBoxDetailStyles(colors, { desktop: align === 'left' }),
    [colors, align]
  );
  const leftAlign = align === 'left';

  return (
    <View>
      <View style={[styles.toolbar, leftAlign && styles.toolbarLeft]}>
        {leftAlign ? null : (
          <View style={styles.toolbarSide}>
            {onBack ? (
              <TouchableOpacity onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
                <Text style={styles.backText}>←</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
        <View style={[styles.toolbarCenter, leftAlign && styles.toolbarCenterLeft]}>
          {leftAlign && onBack ? (
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
          <Text style={[styles.toolbarMeta, leftAlign && styles.toolbarMetaLeft]}>
            {boxHeaderSubtext(lockAt, now)}
          </Text>
        </View>
        {leftAlign ? null : <View style={styles.toolbarSide} />}
      </View>
      {showCalendar ? (
        <AddToCalendarMenu
          startsOn={startsOn}
          lockAt={lockAt}
          estimatedDeliveryBy={estimatedDeliveryBy}
          compact
        />
      ) : null}
    </View>
  );
}
