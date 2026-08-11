import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import {
  dateFromPreviewNowIso,
  formatPreviewNowIso,
} from '../../stores/userStatePreviewStore';
import {
  borderRadius,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

type Props = {
  valueIso: string | null;
  onChangeIso: (iso: string | null) => void;
  /** Optional ISO days to highlight (lock, ship, Hanukkah, …). */
  markerIsos?: string[];
};

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

function shiftDay(iso: string | null, delta: number): string {
  const base = dateFromPreviewNowIso(iso);
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + delta);
  return formatPreviewNowIso(next);
}

/**
 * Compact month grid for admin preview-date scrubbing.
 */
export function AdminPreviewCalendar({ valueIso, onChangeIso, markerIsos = [] }: Props) {
  const selected = valueIso ? dateFromPreviewNowIso(valueIso) : null;
  const initial = selected ?? new Date();
  const [cursor, setCursor] = useState({ year: initial.getFullYear(), month: initial.getMonth() });

  const markerSet = useMemo(() => new Set(markerIsos), [markerIsos]);

  const monthLabel = useMemo(
    () =>
      new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      }),
    [cursor.year, cursor.month]
  );

  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const out: ({ day: number; iso: string } | null)[] = [];
    for (let i = 0; i < startPad; i += 1) out.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = formatPreviewNowIso(new Date(cursor.year, cursor.month, day));
      out.push({ day, iso });
    }
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor.year, cursor.month]);

  // Keep visible month in sync when presets jump far away.
  useEffect(() => {
    if (!valueIso) return;
    const d = dateFromPreviewNowIso(valueIso);
    setCursor((c) => {
      if (d.getFullYear() === c.year && d.getMonth() === c.month) return c;
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }, [valueIso]);

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={styles.stepBtn}
          onPress={() => onChangeIso(shiftDay(valueIso, -1))}
          accessibilityRole="button"
          accessibilityLabel="Previous day"
        >
          <Text style={styles.stepBtnText}>−1d</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.stepBtn}
          onPress={() => onChangeIso(shiftDay(valueIso, 1))}
          accessibilityRole="button"
          accessibilityLabel="Next day"
        >
          <Text style={styles.stepBtnText}>+1d</Text>
        </TouchableOpacity>
        <View style={styles.toolbarSpacer} />
        <TouchableOpacity
          style={styles.stepBtn}
          onPress={() => onChangeIso(null)}
          accessibilityRole="button"
          accessibilityLabel="Use real today"
        >
          <Text style={styles.stepBtnText}>Today</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.monthHeader}>
        <TouchableOpacity
          onPress={() => setCursor((c) => shiftMonth(c.year, c.month, -1))}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          hitSlop={8}
          style={styles.monthNav}
        >
          <Icon icon={icons.chevronRight} size={12} color={semanticColors.logoDark} style={styles.chevronPrev} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <TouchableOpacity
          onPress={() => setCursor((c) => shiftMonth(c.year, c.month, 1))}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          hitSlop={8}
          style={styles.monthNav}
        >
          <Icon icon={icons.chevronRight} size={12} color={semanticColors.logoDark} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={styles.weekday}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell, idx) => {
          if (!cell) {
            return <View key={`e-${idx}`} style={styles.dayCell} />;
          }
          const isSelected = valueIso === cell.iso;
          const isMarker = markerSet.has(cell.iso);
          return (
            <TouchableOpacity
              key={cell.iso}
              style={[
                styles.dayCell,
                isMarker && styles.dayMarker,
                isSelected && styles.daySelected,
              ]}
              onPress={() => onChangeIso(cell.iso)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={cell.iso}
            >
              <Text
                style={[
                  styles.dayText,
                  isMarker && styles.dayTextMarker,
                  isSelected && styles.dayTextSelected,
                ]}
              >
                {cell.day}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xs,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  toolbarSpacer: {
    flex: 1,
  },
  stepBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: semanticColors.bgDark,
  },
  stepBtnText: {
    ...typeface('medium'),
    fontSize: 11,
    color: semanticColors.logoDark,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  monthNav: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronPrev: {
    transform: [{ rotate: '180deg' }],
  },
  monthLabel: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    ...typeface('regular'),
    fontSize: 10,
    color: semanticColors.goldMuted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
  },
  dayMarker: {
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
  },
  daySelected: {
    backgroundColor: semanticColors.brand,
  },
  dayText: {
    ...typeface('regular'),
    fontSize: 12,
    color: semanticColors.logoDark,
  },
  dayTextMarker: {
    ...typeface('medium'),
  },
  dayTextSelected: {
    ...typeface('medium'),
    color: semanticColors.logoDark,
  },
});
