import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { spacing, typography, borderRadius, typeface } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import { formatDollars } from '../../services/box/buildDefaultBox';
import { getMyInfluencerStats, type InfluencerStatsView } from '../../services/promo/promotionsApi';
import { copyText } from '../../services/promo/copyText';

function day(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function Stat({ value, label, styles }: { value: string; label: string; styles: Styles }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function LinkCard({ inf, styles }: { inf: InfluencerStatsView; styles: Styles }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (await copyText(inf.link)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  return (
    <View style={styles.card}>
      <View style={styles.linkRow}>
        <Text style={styles.link} selectable numberOfLines={1}>
          {inf.link}
        </Text>
        <TouchableOpacity style={styles.copy} onPress={() => void copy()} accessibilityRole="button" accessibilityLabel="Copy your link">
          <Text style={styles.copyLabel}>{copied ? 'Copied' : 'Copy'}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>
        {[
          inf.discountLabel ? `Your audience gets ${inf.discountLabel}.` : null,
          `You earn ${inf.commissionPercent}% of each purchase, after discounts, before shipping and tax.`,
          inf.active ? null : 'This link is paused.',
        ]
          .filter(Boolean)
          .join(' ')}
      </Text>
      <View style={styles.stats}>
        <Stat value={String(inf.purchases)} label="Purchases" styles={styles} />
        <Stat value={formatDollars(inf.salesCents)} label="Total sales" styles={styles} />
        <Stat value={formatDollars(inf.earningsCents)} label="Earned" styles={styles} />
        <Stat value={formatDollars(inf.owedCents)} label={inf.paidOutCents ? `Owed · ${formatDollars(inf.paidOutCents)} paid` : 'Owed'} styles={styles} />
      </View>
      {inf.recent.length ? (
        <View style={styles.recent}>
          {inf.recent.map((r, i) => (
            <View key={`${r.date}-${i}`} style={styles.recentRow}>
              <Text style={styles.recentText}>{`${day(r.date)} · ${r.kind}`}</Text>
              <Text style={styles.recentText}>{`${formatDollars(r.netCents)} → ${formatDollars(r.commissionCents)}`}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.hint}>No purchases yet. They show up here once someone buys through your link.</Text>
      )}
    </View>
  );
}

/** Shown on Account only when the signed-in (verified) email belongs to an influencer. Stats come from the server. */
export function InfluencerDashboard({ enabled, sectionStyle, dividerStyle }: { enabled: boolean; sectionStyle: object; dividerStyle: object }) {
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [rows, setRows] = useState<InfluencerStatsView[]>([]);

  useEffect(() => {
    if (!enabled) {
      setRows([]);
      return;
    }
    let cancelled = false;
    getMyInfluencerStats()
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!rows.length) return null;
  return (
    <>
      <View style={dividerStyle} />
      <Text style={sectionStyle}>Your referral link</Text>
      {rows.map((inf) => (
        <LinkCard key={inf.slug} inf={inf} styles={styles} />
      ))}
    </>
  );
}

type Styles = ReturnType<typeof createStyles>;

function createStyles(colors: SemanticColors) {
  return StyleSheet.create({
    card: { gap: spacing.sm, marginTop: spacing.xs },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.brand,
      borderRadius: borderRadius.xl,
      paddingLeft: spacing.md,
      paddingRight: 4,
      minHeight: 44,
    },
    link: { ...typeface('regular'), flex: 1, minWidth: 0, fontSize: typography.md, color: colors.textPrimary },
    copy: {
      backgroundColor: colors.brand,
      borderRadius: borderRadius.xl,
      paddingHorizontal: spacing.md,
      minHeight: 36,
      justifyContent: 'center',
    },
    copyLabel: { ...typeface('regular'), fontSize: typography.md, color: colors.logoDark },
    hint: {
      ...typeface('regular'),
      fontSize: typography.md,
      letterSpacing: -0.22,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
    stat: { flexGrow: 1, flexBasis: 110, minWidth: 0 },
    statValue: { ...typeface('medium'), fontSize: 24, letterSpacing: -0.5, color: colors.textPrimary },
    statLabel: { ...typeface('light'), fontSize: typography.sm, color: colors.textSecondary, letterSpacing: -0.22, marginTop: 2 },
    recent: { gap: 4, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    recentRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
    recentText: { ...typeface('light'), fontSize: typography.sm, color: colors.textSecondary, letterSpacing: -0.22 },
  });
}
