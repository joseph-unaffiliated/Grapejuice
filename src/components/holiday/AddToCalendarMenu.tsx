import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Linking } from 'react-native';
import {
  googleCalendarUrl,
  icsContent,
  hanukkahCalendarEvents,
  type CalendarEvent,
} from '../../utils/calendarLinks';
import { spacing, typography, borderRadius } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';

type Props = {
  startsOn: string | null;
  lockAt: string | null;
  estimatedDeliveryBy: string | null;
  compact?: boolean;
  /** Match box toolbar alignment on desktop. */
  align?: 'left' | 'center';
};

function openIcs(event: CalendarEvent) {
  const body = icsContent(event);
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob([body], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'grapejuice-hanukkah.ics';
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  void Linking.openURL(`data:text/calendar;charset=utf-8,${encodeURIComponent(body)}`);
}

export function AddToCalendarMenu({
  startsOn,
  lockAt,
  estimatedDeliveryBy,
  compact,
  align = 'center',
}: Props) {
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const events = useMemo(
    () => hanukkahCalendarEvents({ startsOn, lockAt, estimatedDeliveryBy }),
    [startsOn, lockAt, estimatedDeliveryBy]
  );

  if (!events.length) return null;

  const addAllGoogle = () => {
    events.forEach((e) => void Linking.openURL(googleCalendarUrl(e)));
  };

  const left = align === 'left';

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Text style={[styles.label, left && styles.labelLeft]}>Add to calendar</Text>
      <View style={[styles.row, left && styles.rowLeft]}>
        {events.map((event) => (
          <TouchableOpacity
            key={event.title}
            style={styles.chip}
            onPress={() => void Linking.openURL(googleCalendarUrl(event))}
          >
            <Text style={styles.chipText} numberOfLines={1}>
              {event.title.replace('Hanukkah ', '').replace('Customize your ', 'Lock ')}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.chip} onPress={addAllGoogle}>
          <Text style={styles.chipText}>All (Google)</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.chip} onPress={() => events.forEach(openIcs)}>
          <Text style={styles.chipText}>Download .ics</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useThemeMode>['colors']) {
  return StyleSheet.create({
    wrap: {
      gap: spacing.xs,
      marginHorizontal: spacing.md,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.xxl,
      /** Pale gold wash — brand gold at low opacity over white. */
      backgroundColor: 'rgba(216, 201, 144, 0.22)',
    },
    wrapCompact: { marginHorizontal: 0 },
    label: {
      fontSize: typography.sm,
      fontWeight: '500',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    labelLeft: { textAlign: 'left' },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: 'center' },
    rowLeft: { justifyContent: 'flex-start' },
    chip: {
      borderWidth: 0.5,
      borderColor: colors.goldMuted,
      borderRadius: borderRadius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      flexShrink: 0,
      alignSelf: 'flex-start',
      backgroundColor: colors.bgPrimary,
    },
    chipText: {
      fontSize: 9,
      color: colors.textPrimary,
      textAlign: 'center',
      ...(Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as object) : {}),
    },
  });
}
