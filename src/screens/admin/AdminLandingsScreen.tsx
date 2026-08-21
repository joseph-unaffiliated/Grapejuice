import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Platform,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuthStore } from '../../stores/authStore';
import { isOpsAdmin } from '../../constants/admin';
import {
  LANDING_REGISTRY,
  landingAudienceById,
  landingSectionSummary,
} from '../../constants/landingAudiences';
import {
  landingIdFromPath,
  normalizeLandingPath,
  validateNewLandingPath,
} from '../../constants/landingPaths';
import {
  blankLandingDoc,
  cloneLandingDoc,
  landingsService,
} from '../../services/firestore/landings';
import {
  invalidateLandingCatalog,
  isCodeSeedLandingId,
  loadMergedLandings,
} from '../../services/landingCatalog';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { useThemeMode } from '../../context/ThemeContext';
import { useWebLayout } from '../../hooks/useWebLayout';
import { spacing, typography, borderRadius } from '../../constants/theme';
import type { SemanticColors } from '../../constants/themeMode';
import type { MainStackParamList } from '../../navigation/types';

type Nav = StackNavigationProp<MainStackParamList>;

type LandingRow = {
  id: string;
  navLabel: string;
  path: string;
  summary: string;
  kind: 'seed' | 'cms';
  hasOverride: boolean;
  canDelete: boolean;
};

/** Ops list of marketing landings — create, edit, delete CMS pages. */
export function AdminLandingsScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const styles = useMemo(() => createStyles(colors, isDesktop), [colors, isDesktop]);
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.isLoading);
  const allowed = isOpsAdmin(user);

  const [rows, setRows] = useState<LandingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newPath, setNewPath] = useState('');
  const [cloneFromId, setCloneFromId] = useState<string>('');
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      invalidateLandingCatalog();
      const merged = await loadMergedLandings();
      const overrideIds = new Set(await landingsService.listIds());
      setRows(
        merged.map((landing) => {
          const seed = isCodeSeedLandingId(landing.id);
          return {
            id: landing.id,
            navLabel: landing.navLabel,
            path: landing.path,
            summary: landingSectionSummary(landing),
            kind: seed ? 'seed' : 'cms',
            hasOverride: overrideIds.has(landing.id),
            canDelete: !seed,
          };
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load landings');
      setRows(
        LANDING_REGISTRY.map((landing) => ({
          id: landing.id,
          navLabel: landing.navLabel,
          path: landing.path,
          summary: landingSectionSummary(landing),
          kind: 'seed' as const,
          hasOverride: false,
          canDelete: false,
        }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) void load();
    else setLoading(false);
  }, [allowed, load]);

  const takenPaths = useMemo(() => {
    const paths: string[] = [];
    for (const row of rows) {
      paths.push(row.path);
      const seed = landingAudienceById(row.id);
      seed?.legacyPaths?.forEach((p) => paths.push(p));
    }
    return paths;
  }, [rows]);

  const createLanding = async () => {
    setCreateError(null);
    const path = normalizeLandingPath(newPath);
    const label = newLabel.trim() || path.replace(/^\//, '') || 'New landing';
    const pathError = validateNewLandingPath(path, takenPaths);
    if (pathError) {
      setCreateError(pathError);
      return;
    }
    const id = landingIdFromPath(path);
    if (!id) {
      setCreateError('Could not derive an id from that path');
      return;
    }
    if (rows.some((r) => r.id === id)) {
      setCreateError('That id is already in use');
      return;
    }

    setCreating(true);
    try {
      let doc;
      if (cloneFromId) {
        const source =
          landingAudienceById(cloneFromId) ??
          (await loadMergedLandings()).find((l) => l.id === cloneFromId);
        if (!source) throw new Error('Clone source not found');
        doc = cloneLandingDoc(source, { id, path, navLabel: label });
      } else {
        doc = blankLandingDoc({ id, path, navLabel: label });
      }
      await landingsService.upsert(doc);
      invalidateLandingCatalog();
      setShowCreate(false);
      setNewLabel('');
      setNewPath('');
      setCloneFromId('');
      navigation.navigate('AdminLandingEditor', { audienceId: id });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  const deleteLanding = (row: LandingRow) => {
    if (!row.canDelete) return;
    const run = async () => {
      try {
        await landingsService.remove(row.id);
        invalidateLandingCatalog();
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Delete failed');
      }
    };
    const title = 'Delete landing?';
    const body = `Removes ${row.path} from Firestore. The URL will stop resolving.`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`${title}\n\n${body}`)) void run();
      return;
    }
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void run() },
    ]);
  };

  const panelProps = {
    flush: isDesktop,
    centerDesktop: isDesktop,
    omitDesktopTopPadding: isDesktop,
    style: styles.panel,
  } as const;

  if (authLoading) {
    return (
      <WebContentPanel {...panelProps}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </WebContentPanel>
    );
  }

  if (!allowed) {
    return (
      <WebContentPanel {...panelProps}>
        <View style={styles.centered}>
          <Text style={styles.deniedTitle}>Admin only</Text>
          <Text style={styles.deniedBody}>
            This tooling is limited to allowlisted ops accounts
            {user?.email ? ` (signed in as ${user.email})` : ''}.
          </Text>
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
              Edit existing pages, or create a new slug. CMS-only pages live in Firestore until you
              delete them.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.createToggle}
            onPress={() => {
              setShowCreate((v) => {
                const next = !v;
                if (next) {
                  setNewLabel('New campaign');
                  setNewPath('/new-campaign');
                  setCloneFromId('');
                  setCreateError(null);
                }
                return next;
              });
            }}
            accessibilityRole="button"
          >
            <Text style={styles.createToggleText}>
              {showCreate ? 'Cancel new page' : '+ New landing page'}
            </Text>
          </TouchableOpacity>

          {showCreate ? (
            <View style={styles.createCard}>
              <Text style={styles.label}>Nav label</Text>
              <TextInput
                style={styles.input}
                value={newLabel}
                onChangeText={setNewLabel}
                placeholder="Grandparents"
              />
              <Text style={styles.label}>Path / slug</Text>
              <TextInput
                style={styles.input}
                value={newPath}
                onChangeText={setNewPath}
                placeholder="/grandparents"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.hint}>
                Edit the path above (must start with /). Example: /grandparents → id grandparents.
              </Text>
              <Text style={styles.label}>Clone from (optional)</Text>
              <View style={styles.cloneRow}>
                <TouchableOpacity
                  style={[styles.cloneChip, !cloneFromId && styles.cloneChipOn]}
                  onPress={() => setCloneFromId('')}
                >
                  <Text style={styles.cloneChipText}>Blank</Text>
                </TouchableOpacity>
                {LANDING_REGISTRY.map((seed) => (
                  <TouchableOpacity
                    key={seed.id}
                    style={[styles.cloneChip, cloneFromId === seed.id && styles.cloneChipOn]}
                    onPress={() => setCloneFromId(seed.id)}
                  >
                    <Text style={styles.cloneChipText}>{seed.navLabel}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {createError ? <Text style={styles.error}>{createError}</Text> : null}
              <TouchableOpacity
                style={[styles.primaryBtn, creating && styles.btnDisabled]}
                onPress={() => void createLanding()}
                disabled={creating}
              >
                <Text style={styles.primaryBtnText}>
                  {creating ? 'Creating…' : 'Create & edit'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {loading ? (
            <ActivityIndicator color={colors.brand} style={styles.loader} />
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : (
            <ScrollView contentContainerStyle={styles.list}>
              {rows.map((row) => (
                <View key={row.id} style={styles.row}>
                  <TouchableOpacity
                    style={styles.rowMain}
                    onPress={() =>
                      navigation.navigate('AdminLandingEditor', { audienceId: row.id })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${row.navLabel}`}
                  >
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowTitle}>{row.navLabel}</Text>
                      <Text style={styles.rowMeta}>
                        {row.path} · {row.summary}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.badge,
                        row.kind === 'cms'
                          ? styles.badgeCmsOnly
                          : row.hasOverride
                            ? styles.badgeCms
                            : styles.badgeCode,
                      ]}
                    >
                      {row.kind === 'cms' ? 'CMS only' : row.hasOverride ? 'CMS' : 'Code'}
                    </Text>
                  </TouchableOpacity>
                  {row.canDelete ? (
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => deleteLanding(row)}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${row.navLabel}`}
                    >
                      <Text style={styles.deleteBtnText}>Delete</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}
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
    header: { marginBottom: spacing.md, gap: spacing.xs },
    backLink: { fontSize: typography.md, color: colors.brand, marginBottom: spacing.sm },
    title: { fontSize: 24, fontWeight: '600', color: colors.logoDark, letterSpacing: -0.4 },
    sub: { fontSize: typography.md, color: colors.goldMuted, lineHeight: 22 },
    createToggle: { marginBottom: spacing.md, alignSelf: 'flex-start' },
    createToggleText: { fontSize: typography.md, fontWeight: '600', color: colors.brand },
    createCard: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      marginBottom: spacing.lg,
      gap: 4,
      backgroundColor: colors.bgPrimary,
    },
    label: {
      fontSize: typography.sm,
      fontWeight: '500',
      color: colors.logoDark,
      marginTop: spacing.sm,
      marginBottom: 4,
    },
    hint: { fontSize: typography.sm, color: colors.goldMuted, marginBottom: spacing.xs },
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: Platform.OS === 'web' ? 10 : spacing.sm,
      fontSize: typography.md,
      color: colors.logoDark,
      backgroundColor: colors.bgPrimary,
    },
    cloneRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    cloneChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: borderRadius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.bgDark,
    },
    cloneChipOn: { backgroundColor: colors.brandLight, borderColor: colors.brand },
    cloneChipText: { fontSize: typography.sm, color: colors.logoDark },
    primaryBtn: {
      marginTop: spacing.md,
      backgroundColor: colors.brand,
      paddingVertical: 12,
      borderRadius: borderRadius.md,
      alignItems: 'center',
    },
    primaryBtnText: { fontWeight: '600', color: colors.logoDark },
    btnDisabled: { opacity: 0.6 },
    loader: { marginTop: spacing.xl },
    error: { color: colors.error, marginTop: spacing.sm },
    list: { gap: spacing.sm, paddingBottom: spacing.xxl },
    row: {
      borderRadius: borderRadius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.bgPrimary,
      overflow: 'hidden',
    },
    rowMain: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
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
    badgeCmsOnly: { backgroundColor: colors.brand, color: colors.logoDark },
    badgeCode: { backgroundColor: colors.bgDark, color: colors.goldMuted },
    deleteBtn: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingVertical: 10,
      alignItems: 'center',
      backgroundColor: colors.bgDark,
    },
    deleteBtnText: { fontSize: typography.sm, color: colors.error, fontWeight: '500' },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.xl,
      gap: spacing.sm,
    },
    deniedTitle: { fontSize: 20, fontWeight: '600', color: colors.logoDark },
    deniedBody: { fontSize: typography.md, color: colors.goldMuted, textAlign: 'center' },
    backBtn: { marginTop: spacing.md, padding: spacing.sm },
    backBtnText: { color: colors.brand, fontSize: typography.md },
  });
}
