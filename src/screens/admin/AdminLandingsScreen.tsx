import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuthStore } from '../../stores/authStore';
import { isAdminEmail } from '../../constants/admin';
import { LANDING_REGISTRY, landingSectionSummary } from '../../constants/landingAudiences';
import { landingsService } from '../../services/firestore/landings';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { useThemeMode } from '../../context/ThemeContext';
import { useWebLayout } from '../../hooks/useWebLayout';
import { spacing, typography, borderRadius } from '../../constants/theme';
import type { SemanticColors } from '../../constants/themeMode';
import type { MainStackParamList } from '../../navigation/types';

type Nav = StackNavigationProp<MainStackParamList>;

/** Ops list of marketing landings — open editor per audience. */
export function AdminLandingsScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const styles = useMemo(() => createStyles(colors, isDesktop), [colors, isDesktop]);
  const user = useAuthStore((s) => s.user);
  const allowed = isAdminEmail(user?.email);

  const [overrideIds, setOverrideIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ids = await landingsService.listIds();
      setOverrideIds(new Set(ids));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load landings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) void load();
    else setLoading(false);
  }, [allowed, load]);

  const panelProps = {
    flush: isDesktop,
    centerDesktop: isDesktop,
    omitDesktopTopPadding: isDesktop,
    style: styles.panel,
  } as const;

  if (!allowed) {
    return (
      <WebContentPanel {...panelProps}>
        <View style={styles.centered}>
          <Text style={styles.deniedTitle}>Admin only</Text>
          <Text style={styles.deniedBody}>This tooling is limited to allowlisted ops accounts.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
        </View>
      </WebContentPanel>
    );
  }

  return (
    <WebContentPanel {...panelProps}>
      <View style={styles.root}>
        <View style={styles.column}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
              <Text style={styles.backLink}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Marketing landings</Text>
            <Text style={styles.sub}>
              Edit modular sections. Saved overrides live in Firestore; reset restores code defaults.
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.brand} style={styles.loader} />
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : (
            <ScrollView contentContainerStyle={styles.list}>
              {LANDING_REGISTRY.map((landing) => {
                const hasOverride = overrideIds.has(landing.id);
                return (
                  <TouchableOpacity
                    key={landing.id}
                    style={styles.row}
                    onPress={() =>
                      navigation.navigate('AdminLandingEditor', { audienceId: landing.id })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${landing.navLabel}`}
                  >
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowTitle}>{landing.navLabel}</Text>
                      <Text style={styles.rowMeta}>
                        {landing.path} · {landingSectionSummary(landing)}
                      </Text>
                    </View>
                    <Text style={[styles.badge, hasOverride ? styles.badgeCms : styles.badgeCode]}>
                      {hasOverride ? 'CMS' : 'Code'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </WebContentPanel>
  );
}

function createStyles(colors: SemanticColors, isDesktop: boolean) {
  return StyleSheet.create({
    panel: { flex: 1, backgroundColor: colors.bgPrimary },
    root: { flex: 1, padding: spacing.lg },
    column: { flex: 1, maxWidth: isDesktop ? 720 : undefined, width: '100%', alignSelf: 'center' },
    header: { marginBottom: spacing.lg, gap: spacing.xs },
    backLink: { fontSize: typography.md, color: colors.brand, marginBottom: spacing.sm },
    title: { fontSize: 24, fontWeight: '600', color: colors.logoDark, letterSpacing: -0.4 },
    sub: { fontSize: typography.md, color: colors.goldMuted, lineHeight: 22 },
    loader: { marginTop: spacing.xl },
    error: { color: colors.error, marginTop: spacing.md },
    list: { gap: spacing.sm, paddingBottom: spacing.xxl },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.bgPrimary,
    },
    rowCopy: { flex: 1, gap: 4 },
    rowTitle: { fontSize: typography.lg, fontWeight: '500', color: colors.logoDark },
    rowMeta: { fontSize: typography.sm, color: colors.goldMuted },
    badge: {
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: borderRadius.sm,
      overflow: 'hidden',
    },
    badgeCms: { backgroundColor: colors.brandLight, color: colors.logoDark },
    badgeCode: { backgroundColor: colors.bgDark, color: colors.goldMuted },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
    deniedTitle: { fontSize: 20, fontWeight: '600', color: colors.logoDark },
    deniedBody: { fontSize: typography.md, color: colors.goldMuted, textAlign: 'center' },
    backBtn: { marginTop: spacing.md, padding: spacing.sm },
    backBtnText: { color: colors.brand, fontSize: typography.md },
  });
}
