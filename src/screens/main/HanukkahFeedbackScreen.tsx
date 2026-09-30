/** Post-Hanukkah feedback survey — linked from the after-Hanukkah hero (signed in). */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
} from 'react-native';
import { StorefrontChrome, useStorefrontActions } from '../../components/storefront/StorefrontChrome';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { ButtonLoadingLabel } from '../../components/brand/ButtonLoadingLabel';
import { useAuthStore } from '../../stores/authStore';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { reflectionsService } from '../../services/firestore/reflections';
import { HOLIDAY_ID, type HolidayFeedbackResponse } from '../../types/pilot';
import { spacing, typography, borderRadius, typeface, shadowsWeb, MOBILE_GUTTER } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import { useWebLayout } from '../../hooks/useWebLayout';
import { useStorefrontInterest } from '../../hooks/useStorefrontInterest';
import {
  PASSOVER_NOTIFY_INTEREST,
  PRE_REGISTERED_CTA_LABEL,
  PRE_REGISTER_PASSOVER_CTA_LABEL,
} from '../../constants/pilotHolidays';

export const HANUKKAH_FEEDBACK_CREDIT_CENTS = 5000;

const OVERALL_OPTIONS = [
  { value: 1, label: 'Not for us' },
  { value: 2, label: 'Meh' },
  { value: 3, label: 'Good' },
  { value: 4, label: 'Great' },
  { value: 5, label: 'Loved it' },
] as const;

const PASSOVER_OPTIONS = [
  { value: 'yes', label: 'Yes, count us in' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'no', label: 'Not this time' },
] as const;

type Draft = Omit<HolidayFeedbackResponse, 'submittedAt'>;

const EMPTY_DRAFT: Draft = {
  overall: null,
  nights: [],
  favoriteItem: '',
  change: '',
  recommend: null,
  passoverInterest: null,
  anythingElse: '',
};

function HanukkahFeedbackBody() {
  const { goHome } = useStorefrontActions();
  const passoverInterest = useStorefrontInterest(PASSOVER_NOTIFY_INTEREST);
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const styles = useMemo(() => createStyles(colors, isDesktop), [colors, isDesktop]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const patch = (next: Partial<Draft>) => setDraft((d) => ({ ...d, ...next }));
  const toggleNight = (night: number) =>
    setDraft((d) => ({
      ...d,
      nights: d.nights.includes(night)
        ? d.nights.filter((n) => n !== night)
        : [...d.nights, night].sort((a, b) => a - b),
    }));

  const canSubmit = draft.overall != null && draft.recommend != null && !saving;

  const submit = async () => {
    if (!isAuthenticated || !user?.uid) {
      useAuthFlowStore.getState().startAuthInPlace('signin');
      return;
    }
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      await reflectionsService.save(user.uid, {
        holidayId: HOLIDAY_ID,
        wins: draft.favoriteItem,
        hardMoments: draft.change,
        nextYearShift: draft.passoverInterest ?? 'maybe',
        favoriteNight: draft.nights.join(', '),
        updatedAt: now,
        feedback: { ...draft, submittedAt: now },
      });
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your answers. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (submitted) {
    return (
      <View style={styles.shell}>
        <Text style={styles.check} accessibilityLabel="Submitted">
          ✓
        </Text>
        <Text style={styles.title}>Thank you!</Text>
        <Text style={styles.lead}>
          We read every response — it shapes what we build for Passover 2027 and next Hanukkah.
          Your $50 in credit will be added to your account.
        </Text>
        <TouchableOpacity style={styles.cta} onPress={passoverInterest.toggle} accessibilityRole="button">
          <Text style={styles.ctaText}>
            {passoverInterest.marked ? PRE_REGISTERED_CTA_LABEL : PRE_REGISTER_PASSOVER_CTA_LABEL}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goHome} style={styles.secondary} accessibilityRole="button">
          <Text style={styles.secondaryText}>Back to store</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <View style={styles.breadcrumb}>
        <Text style={styles.crumbLink} onPress={goHome} accessibilityRole="link">
          Store
        </Text>
        <Text style={styles.crumbSep}> / </Text>
        <Text style={styles.crumbCurrent}>Hanukkah feedback</Text>
      </View>

      <Text style={styles.kicker}>Earn $50 in credit</Text>
      <Text style={styles.title}>How was Hanukkah?</Text>
      <Text style={styles.lead}>
        Two minutes, six questions. Tell us what worked and what didn’t — we’ll add $50 in credit to
        your account as a thank-you.
      </Text>

      <Section styles={styles} number={1} title="Overall, how was your Hanukkah box?">
        <View style={styles.chipRow}>
          {OVERALL_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              styles={styles}
              label={`${o.value}`}
              caption={o.label}
              selected={draft.overall === o.value}
              onPress={() => patch({ overall: o.value })}
              wide
            />
          ))}
        </View>
      </Section>

      <Section styles={styles} number={2} title="Which nights did you do something together?">
        <View style={styles.chipRow}>
          {Array.from({ length: 8 }, (_, i) => i + 1).map((night) => (
            <Chip
              key={night}
              styles={styles}
              label={`Night ${night}`}
              selected={draft.nights.includes(night)}
              onPress={() => toggleNight(night)}
            />
          ))}
        </View>
      </Section>

      <Section styles={styles} number={3} title="What was your family’s favorite part of the box?">
        <TextInput
          style={styles.input}
          value={draft.favoriteItem}
          onChangeText={(favoriteItem) => patch({ favoriteItem })}
          placeholder="The latke kit, the stuffie, the book…"
          placeholderTextColor={colors.textTertiary}
          multiline
        />
      </Section>

      <Section styles={styles} number={4} title="What would you change?">
        <TextInput
          style={styles.input}
          value={draft.change}
          onChangeText={(change) => patch({ change })}
          placeholder="Anything that missed, felt like too much, or was hard to use"
          placeholderTextColor={colors.textTertiary}
          multiline
        />
      </Section>

      <Section
        styles={styles}
        number={5}
        title="How likely are you to recommend Grapejuice to a friend?"
      >
        <View style={styles.scaleRow}>
          {Array.from({ length: 11 }, (_, i) => i).map((n) => (
            <TouchableOpacity
              key={n}
              style={[styles.scaleCell, draft.recommend === n && styles.scaleCellOn]}
              onPress={() => patch({ recommend: n })}
              accessibilityRole="radio"
              accessibilityState={{ selected: draft.recommend === n }}
              accessibilityLabel={`${n} out of 10`}
            >
              <Text style={[styles.scaleText, draft.recommend === n && styles.scaleTextOn]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.scaleLegend}>
          <Text style={styles.scaleLegendText}>Not likely</Text>
          <Text style={styles.scaleLegendText}>Very likely</Text>
        </View>
      </Section>

      <Section styles={styles} number={6} title="Want a Passover box in 2027?">
        <View style={styles.chipRow}>
          {PASSOVER_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              styles={styles}
              label={o.label}
              selected={draft.passoverInterest === o.value}
              onPress={() => patch({ passoverInterest: o.value })}
            />
          ))}
        </View>
      </Section>

      <Section styles={styles} title="Anything else? (optional)">
        <TextInput
          style={styles.input}
          value={draft.anythingElse}
          onChangeText={(anythingElse) => patch({ anythingElse })}
          placeholder="A moment you loved, an idea, a complaint — all welcome"
          placeholderTextColor={colors.textTertiary}
          multiline
        />
      </Section>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[
          styles.cta,
          !canSubmit && styles.ctaDisabled,
          Platform.OS === 'web' ? ({ boxShadow: shadowsWeb.sm } as object) : null,
        ]}
        onPress={() => void submit()}
        disabled={!canSubmit}
        accessibilityRole="button"
        accessibilityLabel="Submit feedback and earn $50 in credit"
      >
        <ButtonLoadingLabel
          label="Submit & earn $50 in credit"
          loading={saving}
          loaderColor={colors.goldMuted}
          labelStyle={styles.ctaText}
        />
      </TouchableOpacity>
      {!canSubmit && !saving ? (
        <Text style={styles.hint}>Answer questions 1 and 5 to submit.</Text>
      ) : null}
    </View>
  );
}

type Styles = ReturnType<typeof createStyles>;

function Section({
  styles,
  number,
  title,
  children,
}: {
  styles: Styles;
  number?: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {number != null ? <Text style={styles.sectionNumber}>{number}. </Text> : null}
        {title}
      </Text>
      {children}
    </View>
  );
}

function Chip({
  styles,
  label,
  caption,
  selected,
  onPress,
  wide,
}: {
  styles: Styles;
  label: string;
  caption?: string;
  selected: boolean;
  onPress: () => void;
  wide?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, wide && styles.chipWide, selected && styles.chipOn]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={caption ? `${label} — ${caption}` : label}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
      {caption ? (
        <Text style={[styles.chipCaption, selected && styles.chipTextOn]}>{caption}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

export function HanukkahFeedbackScreen() {
  const { isDesktop } = useWebLayout();
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors, isDesktop), [colors, isDesktop]);
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <WebContentPanel flush centerDesktop omitDesktopTopPadding gutter={!isDesktop} style={styles.panel}>
        <ScrollView
          contentContainerStyle={[styles.scroll, isDesktop && styles.scrollDesktop]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <HanukkahFeedbackBody />
        </ScrollView>
      </WebContentPanel>
    </StorefrontChrome>
  );
}

function createStyles(colors: SemanticColors, isDesktop: boolean) {
  return StyleSheet.create({
    panel: {
      flex: 1,
      width: '100%',
      minHeight: 0,
      backgroundColor: colors.bgPrimary,
    },
    scroll: {
      paddingHorizontal: isDesktop ? 0 : MOBILE_GUTTER,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xxl * 2,
      flexGrow: 1,
    },
    scrollDesktop: {
      paddingTop: spacing.xl,
      alignItems: 'center',
    },
    shell: {
      width: '100%',
      maxWidth: 600,
      alignSelf: 'center',
    },
    breadcrumb: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    crumbLink: {
      ...typeface('regular'),
      fontSize: typography.md,
      color: colors.goldMuted,
    },
    crumbSep: {
      ...typeface('regular'),
      fontSize: typography.md,
      color: colors.goldMuted,
    },
    crumbCurrent: {
      ...typeface('medium'),
      fontSize: typography.md,
      color: colors.logoDark,
    },
    kicker: {
      fontSize: typography.sm,
      color: colors.goldMuted,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      textAlign: 'center',
      marginBottom: spacing.xs,
      ...typeface('medium'),
    },
    check: {
      fontSize: 40,
      color: colors.brand,
      textAlign: 'center',
      marginTop: spacing.xl,
      marginBottom: spacing.sm,
      ...typeface('bold'),
    },
    title: {
      fontSize: isDesktop ? 36 : 30,
      lineHeight: isDesktop ? 42 : 36,
      color: colors.textPrimary,
      letterSpacing: -0.4,
      textAlign: 'center',
      marginBottom: spacing.sm,
      ...typeface('regular'),
    },
    lead: {
      fontSize: typography.md,
      lineHeight: typography.md * 1.45,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.xl,
      ...typeface('regular'),
    },
    section: {
      backgroundColor: isDesktop ? colors.bgElevated : colors.accentCream,
      borderRadius: 16,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    sectionTitle: {
      fontSize: typography.md,
      lineHeight: typography.md * 1.4,
      color: colors.textPrimary,
      marginBottom: spacing.md,
      ...typeface('medium'),
    },
    sectionNumber: {
      color: colors.goldMuted,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    chip: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgPrimary,
      alignItems: 'center',
    },
    chipWide: {
      flexGrow: 1,
      flexBasis: 0,
      minWidth: 64,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.sm,
    },
    chipOn: {
      borderColor: colors.brand,
      backgroundColor: colors.brandLight,
    },
    chipText: {
      fontSize: typography.md,
      color: colors.textPrimary,
      ...typeface('medium'),
    },
    chipTextOn: {
      color: colors.logoDark,
    },
    chipCaption: {
      fontSize: typography.xs,
      color: colors.textSecondary,
      marginTop: 2,
      ...typeface('regular'),
    },
    input: {
      minHeight: 88,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      backgroundColor: colors.bgPrimary,
      padding: spacing.sm,
      fontSize: 16,
      color: colors.textPrimary,
      textAlignVertical: 'top',
      ...typeface('regular'),
    },
    scaleRow: {
      flexDirection: 'row',
      gap: 4,
    },
    scaleCell: {
      flex: 1,
      aspectRatio: 1,
      maxHeight: 44,
      borderRadius: borderRadius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgPrimary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scaleCellOn: {
      borderColor: colors.brand,
      backgroundColor: colors.brand,
    },
    scaleText: {
      fontSize: typography.sm,
      color: colors.textPrimary,
      ...typeface('medium'),
    },
    scaleTextOn: {
      color: colors.textInverse,
    },
    scaleLegend: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: spacing.xs,
    },
    scaleLegendText: {
      fontSize: typography.xs,
      color: colors.textTertiary,
      ...typeface('regular'),
    },
    error: {
      fontSize: typography.sm,
      color: colors.error,
      textAlign: 'center',
      marginTop: spacing.sm,
      ...typeface('medium'),
    },
    cta: {
      backgroundColor: colors.textPrimary,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'stretch',
      minHeight: 52,
      marginTop: spacing.lg,
    },
    ctaDisabled: {
      opacity: 0.4,
    },
    ctaText: {
      color: colors.goldMuted,
      fontWeight: '700',
      fontSize: typography.md,
    },
    hint: {
      fontSize: typography.sm,
      color: colors.textTertiary,
      textAlign: 'center',
      marginTop: spacing.sm,
      ...typeface('regular'),
    },
    secondary: {
      marginTop: spacing.md,
      alignItems: 'center',
      padding: spacing.sm,
    },
    secondaryText: {
      color: colors.brand,
      fontSize: typography.md,
      ...typeface('medium'),
    },
  });
}
