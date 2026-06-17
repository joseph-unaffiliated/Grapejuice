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
}: Props) {
  const { colors } = useThemeMode();
  const styles = useMemo(() => createBoxDetailStyles(colors), [colors]);

  return (
    <View>
      <View style={styles.toolbar}>
        <View style={styles.toolbarSide}>
          {onBack ? (
            <TouchableOpacity onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
              <Text style={styles.backText}>←</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.toolbarCenter}>
          <Text style={styles.toolbarTitle}>{title}</Text>
          <Text style={styles.toolbarMeta}>{boxHeaderSubtext(lockAt, now)}</Text>
        </View>
        <View style={styles.toolbarSide} />
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
