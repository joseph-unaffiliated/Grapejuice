import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuthStore } from '../../stores/authStore';
import { isAdminEmail } from '../../constants/admin';
import {
  CATALOG_FIELD_OPTIONS,
  CATALOG_HOLIDAY,
  catalogService,
  slugifyCatalogId,
} from '../../services/firestore/catalog';
import { BoxItemImage } from '../../components/box/BoxItemImage';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { useThemeMode } from '../../context/ThemeContext';
import { useWebLayout } from '../../hooks/useWebLayout';
import { spacing, typography, borderRadius } from '../../constants/theme';
import type { SemanticColors } from '../../constants/themeMode';
import type {
  AgeGroup,
  CatalogCurationTag,
  CatalogPricingTier,
  CatalogSlot,
} from '../../types/pilot';
import type { MainStackParamList } from '../../navigation/types';

type Nav = StackNavigationProp<MainStackParamList>;
type Route = RouteProp<MainStackParamList, 'AdminCatalogItem'>;

type FormState = {
  id: string;
  name: string;
  description: string;
  slot: CatalogSlot;
  slotId: string;
  dollarInput: string;
  pricingTier: CatalogPricingTier | '';
  ageGroups: AgeGroup[];
  defaultFor: AgeGroup[];
  swapOptionsText: string;
  imageUrl: string;
  curationTags: CatalogCurationTag[];
  brand: string;
};

const EMPTY_FORM: FormState = {
  id: '',
  name: '',
  description: '',
  slot: 'base',
  slotId: '',
  dollarInput: '0',
  pricingTier: '',
  ageGroups: ['0-2', '3-5', '6-8', '9-12'],
  defaultFor: [],
  swapOptionsText: '',
  imageUrl: '',
  curationTags: [],
  brand: '',
};

function toggleInList<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Create / edit a single catalog SKU — admin-gated. */
export function AdminCatalogItemScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const itemId = route.params?.itemId;
  const isCreate = !itemId;

  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const styles = useMemo(() => createStyles(colors, isDesktop), [colors, isDesktop]);
  const user = useAuthStore((s) => s.user);
  const allowed = isAdminEmail(user?.email);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idTouched, setIdTouched] = useState(false);

  const patch = useCallback((partial: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...partial }));
  }, []);

  useEffect(() => {
    if (!allowed || isCreate || !itemId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const item = await catalogService.getById(itemId);
        if (cancelled) return;
        if (!item) {
          setError('Item not found.');
          return;
        }
        setForm({
          id: item.id,
          name: item.name,
          description: item.description,
          slot: item.slot,
          slotId: item.slotId,
          dollarInput: (item.dollarCostCents / 100).toFixed(2),
          pricingTier: item.pricingTier ?? '',
          ageGroups: item.ageGroups,
          defaultFor: item.defaultFor,
          swapOptionsText: item.swapOptions.join(', '),
          imageUrl: item.imageUrl ?? '',
          curationTags: item.curationTags ?? [],
          brand: item.brand ?? '',
        });
        setIdTouched(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load item');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed, isCreate, itemId]);

  const onChangeName = (name: string) => {
    patch({
      name,
      ...(isCreate && !idTouched ? { id: slugifyCatalogId(name) } : null),
    });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const dollars = Number.parseFloat(form.dollarInput.replace(/[^0-9.]/g, ''));
      const dollarCostCents = Number.isFinite(dollars) ? Math.round(dollars * 100) : 0;
      const id = slugifyCatalogId(form.id.trim() || form.name);
      if (isCreate) {
        if (!id) throw new Error('Id is required.');
        if (await catalogService.idExists(id)) {
          throw new Error(`Id “${id}” already exists. Pick another.`);
        }
      } else if (!form.id.trim()) {
        throw new Error('Id is required.');
      }
      await catalogService.upsert({
        id: isCreate ? id : form.id.trim(),
        name: form.name,
        description: form.description,
        slot: form.slot,
        slotId: form.slotId,
        dollarCostCents,
        pricingTier: form.pricingTier || undefined,
        ageGroups: form.ageGroups,
        defaultFor: form.defaultFor,
        swapOptions: form.swapOptionsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        imageUrl: form.imageUrl.trim() || undefined,
        curationTags: form.curationTags.length ? form.curationTags : undefined,
        brand: form.brand.trim() || undefined,
        holiday: CATALOG_HOLIDAY,
      });
      if (Platform.OS === 'web') {
        // Soft confirm without blocking navigation awkwardly on web.
        Alert.alert('Saved', isCreate ? 'Item created.' : 'Item updated.');
      } else {
        Alert.alert('Saved', isCreate ? 'Item created.' : 'Item updated.');
      }
      navigation.navigate('AdminCatalog');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const removeItem = async () => {
    if (isCreate || !form.id.trim()) return;
    setDeleting(true);
    setError(null);
    try {
      await catalogService.remove(form.id.trim());
      setConfirmDeleteOpen(false);
      navigation.navigate('AdminCatalog');
    } catch (err) {
      setConfirmDeleteOpen(false);
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

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
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.link}>← Back</Text>
          </TouchableOpacity>
        </View>
      </WebContentPanel>
    );
  }

  if (loading) {
    return (
      <WebContentPanel {...panelProps}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </WebContentPanel>
    );
  }

  return (
    <WebContentPanel {...panelProps}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={() => navigation.navigate('AdminCatalog')} hitSlop={12}>
          <Text style={styles.link}>← Catalog</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{isCreate ? 'Add catalog item' : 'Edit catalog item'}</Text>

        <View style={styles.previewRow}>
          <BoxItemImage itemId={form.id || undefined} imageUrl={form.imageUrl || undefined} size={64} />
          <Text style={styles.previewHint}>Preview uses id + image URL (or bundled asset by id).</Text>
        </View>

        <Field label="Name">
          <TextInput
            style={styles.input}
            value={form.name}
            onChangeText={onChangeName}
            placeholder="Hanukkah candles (44-pack)"
            placeholderTextColor={colors.textTertiary}
          />
        </Field>

        <Field label="Id (create only — stable forever)">
          <TextInput
            style={[styles.input, !isCreate && styles.inputDisabled]}
            value={form.id}
            onChangeText={(id) => {
              setIdTouched(true);
              patch({ id: id.toLowerCase().replace(/[^a-z0-9-]/g, '') });
            }}
            editable={isCreate}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="candles-44-pack"
            placeholderTextColor={colors.textTertiary}
          />
        </Field>

        <Field label="Description">
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={form.description}
            onChangeText={(description) => patch({ description })}
            multiline
            placeholder="Short shopper-facing description"
            placeholderTextColor={colors.textTertiary}
          />
        </Field>

        <Field label="Slot">
          <ChipRow
            options={[...CATALOG_FIELD_OPTIONS.slots]}
            selected={[form.slot]}
            onToggle={(slot) => patch({ slot: slot as CatalogSlot })}
            colors={colors}
          />
        </Field>

        <Field label="Slot id">
          <TextInput
            style={styles.input}
            value={form.slotId}
            onChangeText={(slotId) => patch({ slotId })}
            autoCapitalize="none"
            placeholder="candles"
            placeholderTextColor={colors.textTertiary}
          />
        </Field>

        <Field label="Price (USD)">
          <TextInput
            style={styles.input}
            value={form.dollarInput}
            onChangeText={(dollarInput) => patch({ dollarInput })}
            keyboardType="decimal-pad"
            placeholder="8.00"
            placeholderTextColor={colors.textTertiary}
          />
        </Field>

        <Field label="Pricing tier (optional — inferred from slot if empty)">
          <ChipRow
            options={['', ...CATALOG_FIELD_OPTIONS.pricingTiers]}
            labels={{ '': 'auto' }}
            selected={[form.pricingTier]}
            onToggle={(tier) => patch({ pricingTier: tier as CatalogPricingTier | '' })}
            colors={colors}
          />
        </Field>

        <Field label="Age groups">
          <ChipRow
            options={[...CATALOG_FIELD_OPTIONS.ageGroups]}
            selected={form.ageGroups}
            onToggle={(age) => patch({ ageGroups: toggleInList(form.ageGroups, age as AgeGroup) })}
            colors={colors}
          />
        </Field>

        <Field label="Default for ages">
          <ChipRow
            options={[...CATALOG_FIELD_OPTIONS.ageGroups]}
            selected={form.defaultFor}
            onToggle={(age) => patch({ defaultFor: toggleInList(form.defaultFor, age as AgeGroup) })}
            colors={colors}
          />
        </Field>

        <Field label="Curation tags (home rails)">
          <ChipRow
            options={[...CATALOG_FIELD_OPTIONS.curationTags]}
            selected={form.curationTags}
            onToggle={(tag) =>
              patch({ curationTags: toggleInList(form.curationTags, tag as CatalogCurationTag) })
            }
            colors={colors}
          />
        </Field>

        <Field label="Swap options (comma-separated item ids)">
          <TextInput
            style={styles.input}
            value={form.swapOptionsText}
            onChangeText={(swapOptionsText) => patch({ swapOptionsText })}
            autoCapitalize="none"
            placeholder="gelt-premium, gelt-allergy-friendly"
            placeholderTextColor={colors.textTertiary}
          />
        </Field>

        <Field label="Image URL (optional)">
          <TextInput
            style={styles.input}
            value={form.imageUrl}
            onChangeText={(imageUrl) => patch({ imageUrl })}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="https://…"
            placeholderTextColor={colors.textTertiary}
          />
        </Field>

        <Field label="Brand (optional)">
          <TextInput
            style={styles.input}
            value={form.brand}
            onChangeText={(brand) => patch({ brand })}
            placeholder="Pottery Barn"
            placeholderTextColor={colors.textTertiary}
          />
        </Field>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.saveBtn, (saving || deleting) && styles.saveBtnDisabled]}
          onPress={() => void save()}
          disabled={saving || deleting}
        >
          <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save item'}</Text>
        </TouchableOpacity>

        {!isCreate ? (
          <TouchableOpacity
            style={[styles.deleteBtn, (saving || deleting) && styles.saveBtnDisabled]}
            onPress={() => setConfirmDeleteOpen(true)}
            disabled={saving || deleting}
          >
            <Text style={styles.deleteBtnText}>Delete item</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      <Modal
        visible={confirmDeleteOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !deleting && setConfirmDeleteOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => !deleting && setConfirmDeleteOpen(false)}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete this item?</Text>
            <Text style={styles.modalBody}>
              “{form.name || form.id}” will be removed from the catalog. This can’t be undone.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setConfirmDeleteOpen(false)}
                disabled={deleting}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalDeleteBtn, deleting && styles.saveBtnDisabled]}
                onPress={() => void removeItem()}
                disabled={deleting}
              >
                <Text style={styles.modalDeleteText}>{deleting ? 'Deleting…' : 'Delete'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </WebContentPanel>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors } = useThemeMode();
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={{ fontSize: typography.sm, color: colors.textSecondary, marginBottom: 6 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function ChipRow({
  options,
  selected,
  onToggle,
  colors,
  labels,
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  colors: SemanticColors;
  labels?: Record<string, string>;
}) {
  return (
    <View style={chipStyles.row}>
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <TouchableOpacity
            key={option || 'empty'}
            style={[
              chipStyles.chip,
              { borderColor: colors.border, backgroundColor: colors.bgElevated },
              active && { backgroundColor: colors.brand, borderColor: colors.brand },
            ]}
            onPress={() => onToggle(option)}
          >
            <Text
              style={[
                chipStyles.chipText,
                { color: colors.textPrimary },
                active && { color: colors.textInverse },
              ]}
            >
              {labels?.[option] ?? (option || 'auto')}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const chipStyles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    borderWidth: 1,
    borderRadius: borderRadius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  chipText: { fontSize: typography.sm },
});

function createStyles(colors: SemanticColors, isDesktop: boolean) {
  return StyleSheet.create({
    panel: { flex: 1, width: '100%', backgroundColor: colors.bgPrimary },
    root: { flex: 1, backgroundColor: colors.bgPrimary },
    content: {
      padding: spacing.lg,
      paddingBottom: spacing.xxl,
      maxWidth: isDesktop ? 640 : undefined,
      width: '100%',
      alignSelf: 'center',
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
      gap: spacing.sm,
    },
    link: { color: colors.brand, fontWeight: '600', marginBottom: spacing.sm },
    title: {
      fontSize: typography.titleLg,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: spacing.lg,
    },
    previewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    previewHint: { flex: 1, fontSize: typography.sm, color: colors.textSecondary },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: Platform.OS === 'web' ? 10 : spacing.sm,
      fontSize: typography.md,
      color: colors.textPrimary,
      backgroundColor: colors.bgElevated,
    },
    inputMultiline: { minHeight: 88, textAlignVertical: 'top' },
    inputDisabled: { opacity: 0.6 },
    error: { color: colors.error, marginBottom: spacing.md },
    saveBtn: {
      backgroundColor: colors.brand,
      borderRadius: borderRadius.pill,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    saveBtnDisabled: { opacity: 0.7 },
    saveBtnText: { color: colors.textInverse, fontWeight: '700', fontSize: typography.lg },
    deleteBtn: {
      borderWidth: 1,
      borderColor: colors.error,
      borderRadius: borderRadius.pill,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginTop: spacing.md,
    },
    deleteBtnText: { color: colors.error, fontWeight: '700', fontSize: typography.lg },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.lg,
    },
    modalCard: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: colors.bgPrimary,
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      gap: spacing.sm,
      zIndex: 1,
    },
    modalTitle: {
      fontSize: typography.titleLg,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    modalBody: {
      fontSize: typography.md,
      color: colors.textSecondary,
      lineHeight: 22,
      marginBottom: spacing.sm,
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    modalCancelBtn: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.pill,
    },
    modalCancelText: { color: colors.textSecondary, fontWeight: '600', fontSize: typography.md },
    modalDeleteBtn: {
      backgroundColor: colors.error,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.pill,
    },
    modalDeleteText: { color: colors.textInverse, fontWeight: '700', fontSize: typography.md },
    deniedTitle: { fontSize: typography.titleLg, fontWeight: '700', color: colors.textPrimary },
  });
}
