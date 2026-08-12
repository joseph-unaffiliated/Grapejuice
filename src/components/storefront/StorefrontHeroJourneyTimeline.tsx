import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { usePreviewNow } from '../../hooks/useUserStatePreview';
import { getHanukkahStatus } from '../../services/hanukkah/dates';
import { semanticColors, spacing, typeface } from '../../constants/theme';

export type BoxJourneyDates = {
  startsOn: string | null;
  lockAt: string | null;
  estimatedDeliveryBy: string | null;
};

type Milestone = {
  id: string;
  label: string;
  /** Calendar date under the node; omit for milestones that are already done. */
  date: Date | null;
  /** When true, this milestone is behind the “you are here” pin. */
  completed: boolean;
};

function parseIsoDate(iso: string): Date {
  // Date-only → local midnight; full ISO → as parsed.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(iso);
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatMilestoneDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function daysUntil(target: Date, now: Date): number {
  const ms = startOfLocalDay(target).getTime() - startOfLocalDay(now).getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/**
 * Pin position 0–1 along milestone indices (0 = first node, 1 = last).
 * On a milestone’s calendar day the pin sits on that node; between days it
 * interpolates. Uses local start-of-day so noon preview dates don’t overshoot.
 */
function pinProgress(milestones: Milestone[], now: Date): number {
  const n = milestones.length;
  if (n < 2) return 0;

  const today = startOfLocalDay(now).getTime();

  const times = milestones.map((m, i) => {
    if (m.date) return startOfLocalDay(m.date).getTime();
    // Undated reveal: two weeks before the next dated milestone (or before now).
    for (let j = i + 1; j < n; j += 1) {
      if (milestones[j].date) {
        return startOfLocalDay(milestones[j].date!).getTime() - 14 * 86_400_000;
      }
    }
    return today - (n - i) * 86_400_000;
  });

  // Exact milestone day → sit on that node (not past it).
  for (let i = 0; i < n; i += 1) {
    if (milestones[i].date && sameLocalDay(milestones[i].date!, now)) {
      return i / (n - 1);
    }
  }

  if (today <= times[0]!) return 0;
  if (today >= times[n - 1]!) return 1;

  for (let i = 0; i < n - 1; i += 1) {
    const a = times[i]!;
    const b = times[i + 1]!;
    if (today >= a && today <= b) {
      const seg = b === a ? 0 : (today - a) / (b - a);
      return (i + seg) / (n - 1);
    }
  }
  return 1;
}

/** Map 0–1 milestone progress to the horizontal center of equal-width columns. */
function pinLeftPercent(progress: number, count: number): number {
  if (count <= 1) return 50;
  const index = progress * (count - 1);
  return ((index + 0.5) / count) * 100;
}

export function boxJourneyCopy(journey: BoxJourneyDates, now = new Date()) {
  const status = getHanukkahStatus(journey.startsOn, now);
  let headline = 'Your Hanukkah box is underway';
  if (status.phase === 'before' && status.daysUntilStart != null) {
    const d = status.daysUntilStart;
    headline = d <= 1 ? 'Hanukkah starts tomorrow' : `Hanukkah is in ${d} days`;
  } else if (status.phase === 'during') {
    headline = status.night ? `Night ${status.night} of Hanukkah` : 'Hanukkah is here';
  } else if (status.phase === 'after') {
    headline = 'Hanukkah 2026';
  }

  const lockDate = journey.lockAt ? parseIsoDate(journey.lockAt) : null;
  const lockDays =
    lockDate && startOfLocalDay(lockDate).getTime() > startOfLocalDay(now).getTime()
      ? daysUntil(lockDate, now)
      : lockDate && sameLocalDay(lockDate, now)
        ? 0
        : null;
  const lockLine =
    lockDays == null
      ? lockDate && startOfLocalDay(lockDate).getTime() <= startOfLocalDay(now).getTime()
        ? 'Your box is started — locked.'
        : 'Your box is started — customize anytime before it locks.'
      : lockDays === 0
        ? 'Your box is started — locks today.'
        : `Your box is started · locks in ${lockDays} day${lockDays === 1 ? '' : 's'}`;

  return { headline, lockLine, lockDays };
}

export type BoxJourneyStatusMode = 'guest_box' | 'customize' | 'needs_payment' | 'locked';

/** Mode-specific subline under the Hanukkah countdown headline. */
export function boxJourneyStatusLine(
  journey: BoxJourneyDates,
  mode: BoxJourneyStatusMode,
  now = new Date()
): string {
  const { lockDays } = boxJourneyCopy(journey, now);
  const lockSuffix =
    lockDays == null
      ? null
      : lockDays === 0
        ? 'locks today'
        : `locks in ${lockDays} day${lockDays === 1 ? '' : 's'}`;

  if (mode === 'guest_box') {
    return lockSuffix
      ? `Create an account to save your box · ${lockSuffix}`
      : 'Create an account to save your box.';
  }
  if (mode === 'needs_payment') {
    return lockSuffix
      ? `Add payment to secure your box · ${lockSuffix}`
      : 'Add payment to secure your box — you won’t be charged until it ships.';
  }
  if (mode === 'locked') {
    const delivery = journey.estimatedDeliveryBy
      ? parseIsoDate(journey.estimatedDeliveryBy)
      : null;
    if (!delivery) return 'Your box is locked — shipping soon.';
    if (sameLocalDay(delivery, now) || startOfLocalDay(delivery).getTime() <= startOfLocalDay(now).getTime()) {
      return startOfLocalDay(delivery).getTime() < startOfLocalDay(now).getTime()
        ? 'Your box is locked — on its way.'
        : 'Your box is locked — shipping soon.';
    }
    const shipDays = daysUntil(delivery, now);
    if (shipDays === 0) return 'Your box is locked — shipping soon.';
    return `Your box is locked · ships in ${shipDays} day${shipDays === 1 ? '' : 's'}`;
  }
  return boxJourneyCopy(journey, now).lockLine;
}

type Props = {
  journey: BoxJourneyDates;
  compact?: boolean;
};

/**
 * Horizontal box-journey timeline for the storefront hero (customize state).
 * Styled for the dark hero scrim — gold rail, light labels, location pin.
 */
export function StorefrontHeroJourneyTimeline({ journey, compact }: Props) {
  const now = usePreviewNow();
  const milestones: Milestone[] = useMemo(() => {
    const starts =
      journey.startsOn?.trim() ||
      `${now.getFullYear() === 2026 ? 2026 : now.getFullYear()}-12-05`;
    const lockDate = journey.lockAt ? parseIsoDate(journey.lockAt) : null;
    const arrivesDate = journey.estimatedDeliveryBy
      ? parseIsoDate(journey.estimatedDeliveryBy)
      : null;
    const hanukkahDate = parseIsoDate(starts);
    const today = startOfLocalDay(now);

    return [
      // Seeing this hero means the parent already completed the in-app reveal.
      { id: 'reveal', label: 'My Box', date: null, completed: true },
      {
        id: 'lock',
        label: 'Box Locks',
        date: lockDate,
        completed: !!lockDate && startOfLocalDay(lockDate).getTime() < today.getTime(),
      },
      {
        id: 'arrives',
        label: 'Box Arrives',
        date: arrivesDate,
        completed: !!arrivesDate && startOfLocalDay(arrivesDate).getTime() < today.getTime(),
      },
      {
        id: 'hanukkah',
        label: 'Hanukkah Starts',
        date: hanukkahDate,
        completed: startOfLocalDay(hanukkahDate).getTime() < today.getTime(),
      },
    ];
  }, [journey, now]);

  const progress = pinProgress(milestones, now);
  const pinLeft = pinLeftPercent(progress, milestones.length);
  const trackInset = `${50 / milestones.length}%`;

  return (
    <View style={[styles.root, compact && styles.rootCompact]} accessibilityRole="summary">
      <View style={styles.rail}>
        <View style={[styles.trackLine, { left: trackInset, right: trackInset }]} />
        <View style={[styles.pin, { left: `${pinLeft}%` }]} accessibilityLabel="You are here">
          <Icon icon={icons.locationDot} size={compact ? 14 : 16} color="#FFFFFF" />
        </View>
        <View style={styles.dotsRow}>
          {milestones.map((m) => (
            <View key={m.id} style={styles.dotCol}>
              <View style={styles.markerDot} />
            </View>
          ))}
        </View>
      </View>
      <View style={styles.labelsRow}>
        {milestones.map((m) => (
          <View key={m.id} style={styles.labelCol}>
            <Text style={[styles.label, compact && styles.labelCompact]} numberOfLines={2}>
              {m.label}
            </Text>
            <Text
              style={[
                styles.date,
                compact && styles.dateCompact,
                !m.date && styles.datePlaceholder,
              ]}
              numberOfLines={1}
            >
              {m.date ? formatMilestoneDate(m.date) : ' '}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  rootCompact: {
    marginBottom: spacing.md,
    maxWidth: 420,
  },
  rail: {
    height: 28,
    justifyContent: 'center',
    marginBottom: spacing.sm,
    position: 'relative',
  },
  trackLine: {
    position: 'absolute',
    top: '50%',
    height: 0,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(216, 201, 144, 0.85)',
    ...(Platform.OS === 'web'
      ? ({
          borderTopStyle: 'dashed',
        } as object)
      : null),
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dotCol: {
    flex: 1,
    alignItems: 'center',
  },
  markerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: semanticColors.brand,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  pin: {
    position: 'absolute',
    top: -2,
    marginLeft: -8,
    zIndex: 2,
  },
  labelsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  labelCol: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  label: {
    ...typeface('medium'),
    fontSize: 11,
    lineHeight: 14,
    color: semanticColors.textInverse,
    textAlign: 'center',
    textShadowColor: 'rgba(17, 2, 34, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
    width: '100%',
  },
  labelCompact: {
    fontSize: 10,
    lineHeight: 13,
  },
  date: {
    ...typeface('regular'),
    fontSize: 10,
    lineHeight: 13,
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    marginTop: 2,
    width: '100%',
  },
  dateCompact: {
    fontSize: 9,
    lineHeight: 12,
  },
  datePlaceholder: {
    opacity: 0,
  },
});
