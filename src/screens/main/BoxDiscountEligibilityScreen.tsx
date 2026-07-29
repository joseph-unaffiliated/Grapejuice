import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { useSession } from '../../hooks/useSession';
import { useAuthStore } from '../../stores/authStore';
import { useWebLayout } from '../../hooks/useWebLayout';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { LAYOUT, MOBILE_GUTTER, spacing, typography } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { MainStackParamList } from '../../navigation/types';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import { LIST_BOX_PRICE_CENTS, LIST_BOX_VALUE_CENTS } from '../../services/box/pricing';

/** Match Home / About Hanukkah desktop top inset. */
const DESKTOP_CONTENT_TOP = 41;

const STATEMENTS = [
  'I identify as Jewish, or I’m part of a Jewish or interfaith household.',
  'I’m building or deepening Hanukkah traditions at home (not shopping as a one-off gift reseller).',
  'I understand this discount is intended for households in Grapejuice’s core community — not for wholesale or resale.',
] as const;

export function BoxDiscountEligibilityScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const { colors } = useThemeMode();
  const { isDesktop, layoutWidth } = useWebLayout();
  const { household, profile, refresh } = useSession();
  const user = useAuthStore((s) => s.user);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [attestAll, setAttestAll] = useState(false);
  const [email, setEmail] = useState(profile?.email ?? user?.email ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(household?.boxDiscountCode ?? null);

  const allChecked = useMemo(
    () => STATEMENTS.every((_, i) => checked[i]) && attestAll,
    [checked, attestAll]
  );

  const submit = async () => {
    if (!allChecked) {
      setError('Please confirm each statement and the final attestation.');
      return;
    }
    const trimmed = email.trim();
    if (!trimmed.includes('@')) {
      setError('Enter a valid email to receive your code.');
      return;
    }
    if (!functions) {
      setError('Discount requests aren’t available right now.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const fn = httpsCallable(functions, 'requestBoxDiscountCode');
      const res = await fn({
        email: trimmed,
        statements: STATEMENTS.map((s, i) => ({ text: s, affirmed: !!checked[i] })),
        attestAllTrue: attestAll,
      });
      const data = res.data as { code?: string };
      if (data.code) setCode(data.code);
      await refresh({ silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not request a discount code.');
    } finally {
      setSubmitting(false);
    }
  };

  const body = (
    <>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
        <Text style={[styles.back, { color: colors.textPrimary }]}>Back</Text>
      </TouchableOpacity>

      <Text style={[styles.title, { color: colors.textPrimary }]}>
        Additional Hanukkah box discount
      </Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        The Hanukkah box is {formatCatalogDollars(LIST_BOX_PRICE_CENTS)} (
        {formatCatalogDollars(LIST_BOX_VALUE_CENTS)} value). If you’re in the community this offering
        is designed for, attest below and we’ll email a discount code.
      </Text>

      {code ? (
        <View style={[styles.success, { borderColor: colors.border }]}>
          <Text style={[styles.successTitle, { color: colors.textPrimary }]}>Your code</Text>
          <Text style={[styles.code, { color: colors.textPrimary }]}>{code}</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            We emailed this to {email.trim() || 'you'}. Apply it at checkout when you subscribe to the
            box.
          </Text>
        </View>
      ) : (
        <>
          {STATEMENTS.map((statement, i) => (
            <TouchableOpacity
              key={statement}
              style={styles.checkRow}
              onPress={() => setChecked((c) => ({ ...c, [i]: !c[i] }))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !!checked[i] }}
            >
              <View
                style={[
                  styles.box,
                  {
                    borderColor: colors.textPrimary,
                    backgroundColor: checked[i] ? colors.textPrimary : 'transparent',
                  },
                ]}
              />
              <Text style={[styles.checkLabel, { color: colors.textPrimary }]}>{statement}</Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={styles.checkRow}
            onPress={() => setAttestAll((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: attestAll }}
          >
            <View
              style={[
                styles.box,
                {
                  borderColor: colors.textPrimary,
                  backgroundColor: attestAll ? colors.textPrimary : 'transparent',
                },
              ]}
            />
            <Text style={[styles.checkLabel, { color: colors.textPrimary }]}>
              I attest that all of the above is true.
            </Text>
          </TouchableOpacity>

          <Text style={[styles.label, { color: colors.textTertiary }]}>Email for your code</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={colors.textTertiary}
            style={[
              styles.input,
              {
                color: colors.textPrimary,
                borderColor: colors.border,
                backgroundColor: colors.bgPrimary,
              },
            ]}
          />

          {error ? <Text style={{ color: colors.error, marginTop: spacing.sm }}>{error}</Text> : null}

          <TouchableOpacity
            style={[
              styles.cta,
              { backgroundColor: colors.textPrimary, opacity: allChecked && !submitting ? 1 : 0.5 },
            ]}
            disabled={!allChecked || submitting}
            onPress={submit}
          >
            {submitting ? (
              <ActivityIndicator color={colors.bgPrimary} />
            ) : (
              <Text style={[styles.ctaText, { color: colors.bgPrimary }]}>Email my code</Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </>
  );

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.bgPrimary }]}
      edges={Platform.OS === 'web' ? [] : ['top']}
    >
      <WebContentPanel
        flush={isDesktop}
        gutter={!isDesktop}
        centerDesktop={isDesktop}
        omitDesktopTopPadding={isDesktop}
        style={[styles.panel, { backgroundColor: colors.bgPrimary }]}
      >
        <View style={[styles.scrollHost, isDesktop && styles.scrollHostDesktopBleed]}>
          <ScrollView
            style={[styles.root, { backgroundColor: colors.bgPrimary }]}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingTop: isDesktop ? DESKTOP_CONTENT_TOP : spacing.lg },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {isDesktop ? (
              <View style={[styles.contentColumn, { maxWidth: layoutWidth }]}>{body}</View>
            ) : (
              body
            )}
          </ScrollView>
        </View>
      </WebContentPanel>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  panel: { flex: 1, width: '100%', overflow: 'visible' as const },
  scrollHost: { flex: 1, width: '100%' },
  /** Match Home — cancel panel gutter so content spans the main-area frame. */
  scrollHostDesktopBleed: {
    marginHorizontal: -LAYOUT.WEB_CONTENT_GUTTER,
    ...(Platform.OS === 'web'
      ? ({ width: `calc(100% + ${LAYOUT.WEB_CONTENT_GUTTER * 2}px)` } as object)
      : { alignSelf: 'stretch' as const }),
  },
  root: { flex: 1, width: '100%' },
  scrollContent: {
    paddingBottom: 120,
    width: '100%',
  },
  contentColumn: {
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: MOBILE_GUTTER,
  },
  backRow: { marginBottom: spacing.lg },
  back: {
    fontSize: typography.sm,
    fontWeight: '500',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 28,
    fontWeight: '400',
    letterSpacing: 0,
    marginBottom: spacing.md,
  },
  body: {
    fontSize: typography.md,
    lineHeight: 22,
    letterSpacing: 0,
    marginBottom: spacing.lg,
  },
  checkRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  box: {
    width: 18,
    height: 18,
    borderWidth: 1,
    marginTop: 2,
    flexShrink: 0,
  },
  checkLabel: {
    flex: 1,
    fontSize: typography.md,
    lineHeight: 22,
    letterSpacing: 0,
  },
  label: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    fontSize: typography.md,
    letterSpacing: 0,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  cta: {
    marginTop: spacing.xl,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: {
    fontSize: typography.sm,
    fontWeight: '500',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  success: {
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  successTitle: {
    fontSize: typography.sm,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  code: {
    fontSize: 28,
    fontWeight: '500',
    letterSpacing: 2,
  },
});
