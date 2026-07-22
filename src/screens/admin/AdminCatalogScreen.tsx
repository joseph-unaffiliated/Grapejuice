import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuthStore } from '../../stores/authStore';
import { isAdminEmail } from '../../constants/admin';
import { catalogService } from '../../services/firestore/catalog';
import { formatDollars } from '../../services/box/buildDefaultBox';
import { BoxItemImage } from '../../components/box/BoxItemImage';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { useThemeMode } from '../../context/ThemeContext';
import { useWebLayout } from '../../hooks/useWebLayout';
import { spacing, typography, borderRadius } from '../../constants/theme';
import type { SemanticColors } from '../../constants/themeMode';
import type { CatalogItem } from '../../types/pilot';
import type { MainStackParamList } from '../../navigation/types';

type Nav = StackNavigationProp<MainStackParamList>;

/** Ops list of Hanukkah catalog SKUs — admin-gated. */
export function AdminCatalogScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const styles = useMemo(() => createStyles(colors, isDesktop), [colors, isDesktop]);
  const user = useAuthStore((s) => s.user);
  const allowed = isAdminEmail(user?.email);

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await catalogService.getAll();
      setItems(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) void load();
    else setLoading(false);
  }, [allowed, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.slotId.toLowerCase().includes(q) ||
        item.slot.toLowerCase().includes(q),
    );
  }, [items, query]);

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
              <Text style={styles.backLink}>← Account</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Catalog admin</Text>
            <Text style={styles.subtitle}>{items.length} Hanukkah items</Text>
          </View>

          <View style={styles.toolbar}>
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              placeholder="Search name, id, slot…"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => navigation.navigate('AdminCatalogItem', {})}
            >
              <Text style={styles.addBtnText}>Add item</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.brand} />
            </View>
          ) : error ? (
            <View style={styles.centered}>
              <Text style={styles.error}>{error}</Text>
              <TouchableOpacity onPress={() => void load()}>
                <Text style={styles.retry}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
            >
              {filtered.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.row}
                  onPress={() => navigation.navigate('AdminCatalogItem', { itemId: item.id })}
                >
                  <BoxItemImage itemId={item.id} imageUrl={item.imageUrl} size={48} />
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {item.slot} · {item.slotId} · {formatDollars(item.dollarCostCents)}
                    </Text>
                    <Text style={styles.rowId} numberOfLines={1}>
                      {item.id}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              ))}
              {filtered.length === 0 ? (
                <Text style={styles.empty}>No items match “{query.trim()}”.</Text>
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>
    </WebContentPanel>
  );
}

function createStyles(colors: SemanticColors, isDesktop: boolean) {
  const columnMax = isDesktop ? 720 : undefined;
  return StyleSheet.create({
    panel: { flex: 1, width: '100%', backgroundColor: colors.bgPrimary },
    root: { flex: 1, backgroundColor: colors.bgPrimary, width: '100%' },
    column: {
      flex: 1,
      width: '100%',
      maxWidth: columnMax,
      alignSelf: 'center',
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
      gap: spacing.sm,
    },
    header: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
    },
    backLink: { fontSize: typography.md, color: colors.brand, marginBottom: spacing.sm },
    title: { fontSize: typography.titleLg, fontWeight: '700', color: colors.textPrimary },
    subtitle: { fontSize: typography.sm, color: colors.textSecondary, marginTop: 4 },
    toolbar: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
      alignItems: 'center',
    },
    search: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: Platform.OS === 'web' ? 10 : spacing.sm,
      fontSize: typography.md,
      color: colors.textPrimary,
      backgroundColor: colors.bgElevated,
    },
    addBtn: {
      backgroundColor: colors.brand,
      borderRadius: borderRadius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    addBtnText: { color: colors.textInverse, fontWeight: '700', fontSize: typography.md },
    list: { flex: 1 },
    listContent: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xxl,
      gap: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
    },
    rowBody: { flex: 1, minWidth: 0 },
    rowTitle: { fontSize: typography.lg, fontWeight: '600', color: colors.textPrimary },
    rowMeta: { fontSize: typography.sm, color: colors.textSecondary, marginTop: 2 },
    rowId: { fontSize: typography.xs, color: colors.textTertiary, marginTop: 2 },
    chevron: { fontSize: 22, color: colors.textTertiary },
    empty: { textAlign: 'center', color: colors.textSecondary, marginTop: spacing.xl },
    error: { color: colors.error, textAlign: 'center' },
    retry: { color: colors.brand, fontWeight: '600', marginTop: spacing.sm },
    deniedTitle: { fontSize: typography.titleLg, fontWeight: '700', color: colors.textPrimary },
    deniedBody: { fontSize: typography.md, color: colors.textSecondary, textAlign: 'center' },
    backBtn: { marginTop: spacing.md },
    backBtnText: { color: colors.brand, fontWeight: '600' },
  });
}
