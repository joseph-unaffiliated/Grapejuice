import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { AdminPreviewCalendar } from './AdminPreviewCalendar';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { useSession } from '../../hooks/useSession';
import { useAuthStore } from '../../stores/authStore';
import {
  useUserStatePreviewStore,
  USER_STATE_PREVIEW_OPTIONS,
  formatPreviewNowIso,
  type UserStatePreview,
} from '../../stores/userStatePreviewStore';
import { useEntryContextStore } from '../../stores/entryContextStore';
import {
  ENTRY_LANDING_PREVIEW_OPTIONS,
  landingAudienceById,
  landingSectionSummary,
} from '../../constants/landingAudiences';
import { useMockFlowStore } from '../../stores/mockFlowStore';
import { getHanukkahConfig } from '../../services/firestore/config';
import { getHanukkahWindow } from '../../services/hanukkah/dates';
import { resetTesterBox } from '../../services/admin/resetTesterBox';
import { isAdminEmail } from '../../constants/admin';
import { navigateMainStack } from '../../navigation/mainStackNavigation';
import {
  borderRadius,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

const FAB_SIZE = 52;
const PANEL_WIDTH = 340;
const PANEL_MAX_HEIGHT = '78%';

/**
 * Floating admin control panel (bottom-right). Holds user-state preview, date
 * override, box reset, catalog admin, and Test landings (mock entry flows).
 * Visible to allowlisted admins and in __DEV__.
 */
export function AdminControlPanel() {
  const { household, refresh } = useSession();
  const realUserEmail = useAuthStore((s) => s.user?.email);
  const show =
    isAdminEmail(realUserEmail) || (typeof __DEV__ !== 'undefined' && __DEV__);

  const preview = useUserStatePreviewStore((s) => s.preview);
  const setPreview = useUserStatePreviewStore((s) => s.setPreview);
  const previewNowIso = useUserStatePreviewStore((s) => s.previewNowIso);
  const setPreviewNowIso = useUserStatePreviewStore((s) => s.setPreviewNowIso);
  const clearPreview = useUserStatePreviewStore((s) => s.clearPreview);
  const entryAudienceId = useEntryContextStore((s) => s.audienceId);
  const clearEntry = useEntryContextStore((s) => s.clear);
  const mockFlowActive = useMockFlowStore((s) => s.active);
  const mockLandingId = useMockFlowStore((s) => s.landingId);
  const mockLandingLabel = useMockFlowStore((s) => s.landingLabel);
  const mockPersonaLabel = useMockFlowStore((s) => s.personaLabel);
  const enterMockFlow = useMockFlowStore((s) => s.enter);
  const exitMockFlow = useMockFlowStore((s) => s.exit);

  const [open, setOpen] = useState(false);
  const [userStateOpen, setUserStateOpen] = useState(false);
  const [previewDateOpen, setPreviewDateOpen] = useState(false);
  const [resettingBox, setResettingBox] = useState(false);
  const [datePresets, setDatePresets] = useState<{ label: string; iso: string }[]>([]);
  const [markerIsos, setMarkerIsos] = useState<string[]>([]);

  useEffect(() => {
    if (!show || !open) return;
    let cancelled = false;
    getHanukkahConfig().then((config) => {
      if (cancelled) return;
      const toDay = (raw: string | null | undefined): string | null => {
        if (!raw?.trim()) return null;
        const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})/);
        return m?.[1] ?? null;
      };
      const lock = toDay(config.lockAt);
      const ship = toDay(config.estimatedDeliveryBy);
      const hanukkah = toDay(config.startsOn) ?? '2026-12-05';
      const presets: { label: string; iso: string }[] = [];
      const push = (label: string, iso: string | null) => {
        if (!iso || presets.some((p) => p.iso === iso)) return;
        presets.push({ label, iso });
      };
      if (lock) {
        const [y, m, d] = lock.split('-').map(Number);
        const before = new Date(y, m - 1, d - 14, 12);
        push('Before lock', formatPreviewNowIso(before));
        push('Lock day', lock);
        const afterLock = new Date(y, m - 1, d + 3, 12);
        push('After lock', formatPreviewNowIso(afterLock));
      }
      push('Ships', ship);
      push('Hanukkah', hanukkah);
      const { endDate } = getHanukkahWindow(config.startsOn);
      const after = new Date(endDate);
      after.setDate(after.getDate() + 1);
      push('After Hanukkah', formatPreviewNowIso(after));
      setDatePresets(presets);
      setMarkerIsos(
        [lock, ship, hanukkah, formatPreviewNowIso(after)].filter((v): v is string => Boolean(v))
      );
    });
    return () => {
      cancelled = true;
    };
  }, [show, open]);

  const performResetBox = useCallback(async () => {
    setResettingBox(true);
    try {
      const result = await resetTesterBox(household?.id);
      await refresh({ silent: true });
      setOpen(false);
      if (!result.restartedOnboarding) {
        navigateMainStack('StorefrontHome');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not reset box.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(message);
      } else {
        Alert.alert('Reset failed', message);
      }
    } finally {
      setResettingBox(false);
    }
  }, [household?.id, refresh]);

  const confirmResetBox = () => {
    if (resettingBox) return;
    const title = 'Reset box?';
    const body =
      'Clears your current Hanukkah box and curation progress so you can build again from scratch. Account and kids are kept.';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`${title}\n\n${body}`)) void performResetBox();
      return;
    }
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset box', style: 'destructive', onPress: () => void performResetBox() },
    ]);
  };

  const selectUserState = (next: UserStatePreview | null) => {
    setPreview(next);
  };

  const selectEntryLanding = (opt: (typeof ENTRY_LANDING_PREVIEW_OPTIONS)[number]) => {
    if (!opt.ready) return;
    if (!opt.audienceId) {
      if (mockFlowActive) exitMockFlow();
      else clearEntry();
      setOpen(false);
      navigateMainStack('StorefrontHome');
      return;
    }
    const audience = landingAudienceById(opt.audienceId);
    if (!audience) return;
    enterMockFlow({
      audienceId: opt.audienceId,
      landingLabel: audience.navLabel,
      sourcePath: audience.path,
    });
    setOpen(false);
    // Admin panel sits outside Stack.Navigator — use root ref, not useNavigation.
    navigateMainStack(opt.screen);
  };

  if (!show) return null;

  const previewActive = Boolean(preview || previewNowIso || entryAudienceId || mockFlowActive);
  const activeUserLabel =
    USER_STATE_PREVIEW_OPTIONS.find((opt) => opt.id === preview)?.label ?? 'Live (you)';

  return (
    <View style={styles.host} pointerEvents="box-none">
      <TouchableOpacity
        style={[styles.fab, previewActive && styles.fabActive]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Admin controls"
        accessibilityState={{ expanded: open }}
      >
        <Icon icon={icons.gear} size={22} color={semanticColors.logoDark} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot} pointerEvents="box-none">
          <Pressable
            style={styles.backdrop}
            onPress={() => setOpen(false)}
            accessibilityLabel="Dismiss admin controls"
          />
          <View style={styles.panel} accessibilityRole="menu" accessibilityLabel="Admin controls">
            <View style={styles.panelHeader}>
              <View>
                <Text style={styles.panelTitle}>Admin</Text>
                <Text style={styles.panelHint} numberOfLines={1}>
                  {mockFlowActive
                    ? `Mock: ${mockLandingLabel ?? mockLandingId}${mockPersonaLabel ? ` · ${mockPersonaLabel}` : ''}`
                    : `${activeUserLabel}${previewNowIso ? ` · ${previewNowIso}` : ''}${
                        entryAudienceId ? ` · entry:${entryAudienceId}` : ''
                      }`}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setOpen(false)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close admin controls"
                style={styles.closeHit}
              >
                <Icon icon={icons.close} size={18} color={semanticColors.logoDark} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <TouchableOpacity
                style={styles.collapseHeader}
                onPress={() => setUserStateOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: userStateOpen }}
                accessibilityLabel="User state section"
              >
                <View style={styles.collapseHeaderCopy}>
                  <Text style={styles.sectionHeadingInline}>User state</Text>
                  {!userStateOpen ? (
                    <Text style={styles.collapseSummary} numberOfLines={1}>
                      {activeUserLabel}
                    </Text>
                  ) : null}
                </View>
                <Icon
                  icon={userStateOpen ? icons.chevronDown : icons.chevronRight}
                  size={12}
                  color={semanticColors.goldMuted}
                />
              </TouchableOpacity>
              {userStateOpen ? (
                <>
                  <Text style={styles.sectionDesc}>
                    Overlay auth / box chrome without changing real household data.
                  </Text>
                  {USER_STATE_PREVIEW_OPTIONS.map((opt) => {
                    const selected = preview === opt.id;
                    return (
                      <TouchableOpacity
                        key={opt.id ?? 'live'}
                        style={[styles.row, selected && styles.rowSelected]}
                        onPress={() => selectUserState(opt.id)}
                        accessibilityRole="menuitem"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`Preview as ${opt.label}`}
                      >
                        <View style={[styles.radio, selected && styles.radioOn]} />
                        <View style={styles.rowCopy}>
                          <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]}>
                            {opt.label}
                          </Text>
                          <Text style={styles.rowDesc}>{opt.description}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </>
              ) : null}

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.collapseHeader}
                onPress={() => setPreviewDateOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: previewDateOpen }}
                accessibilityLabel="Preview date section"
              >
                <View style={styles.collapseHeaderCopy}>
                  <Text style={styles.sectionHeadingInline}>Preview date</Text>
                  {!previewDateOpen ? (
                    <Text style={styles.collapseSummary} numberOfLines={1}>
                      {previewNowIso ? previewNowIso : 'Real today'}
                    </Text>
                  ) : null}
                </View>
                <Icon
                  icon={previewDateOpen ? icons.chevronDown : icons.chevronRight}
                  size={12}
                  color={semanticColors.goldMuted}
                />
              </TouchableOpacity>
              {previewDateOpen ? (
                <>
                  <Text style={styles.sectionDesc}>
                    Moves timeline pin and countdown. Live mode also uses this for lock.
                  </Text>
                  {datePresets.length ? (
                    <View style={styles.chips}>
                      {datePresets.map((p) => {
                        const selected = previewNowIso === p.iso;
                        return (
                          <TouchableOpacity
                            key={p.iso}
                            style={[styles.chip, selected && styles.chipSelected]}
                            onPress={() => setPreviewNowIso(p.iso)}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            accessibilityLabel={`Preview date ${p.label}`}
                          >
                            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                              {p.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : null}
                  <AdminPreviewCalendar
                    valueIso={previewNowIso}
                    onChangeIso={setPreviewNowIso}
                    markerIsos={markerIsos}
                  />
                  <Text style={styles.sectionDesc}>
                    {previewNowIso ? `Previewing ${previewNowIso}` : 'Using real today'}
                  </Text>
                </>
              ) : null}

              <View style={styles.divider} />

              <Text style={styles.sectionHeading}>Test landings</Text>
              <Text style={styles.sectionDesc}>
                Opens the entry page as a mock visitor. Exit via the top banner.
              </Text>
              {ENTRY_LANDING_PREVIEW_OPTIONS.map((opt) => {
                const active =
                  opt.audienceId == null
                    ? !mockFlowActive && opt.id === 'default'
                    : mockFlowActive && mockLandingId === opt.audienceId;
                const audience = opt.audienceId ? landingAudienceById(opt.audienceId) : null;
                const pathHint = audience?.path ?? '/store';
                const sectionsHint = audience ? landingSectionSummary(audience) : 'clear mock · home';
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[
                      styles.actionRow,
                      active && styles.actionRowActive,
                      !opt.ready && styles.rowDisabled,
                    ]}
                    onPress={() => selectEntryLanding(opt)}
                    disabled={!opt.ready}
                    accessibilityRole="link"
                    accessibilityState={{ disabled: !opt.ready }}
                    accessibilityLabel={`Open test landing ${opt.label}`}
                  >
                    <View style={styles.rowCopy}>
                      <Text
                        style={[
                          styles.actionLabel,
                          active && styles.actionLabelActive,
                          !opt.ready && styles.rowLabelDisabled,
                        ]}
                      >
                        {opt.label}
                        {active && opt.audienceId ? ' · live' : ''}
                        {!opt.ready ? ' · soon' : ''}
                      </Text>
                      <Text style={styles.rowDesc}>
                        {pathHint}
                        {sectionsHint ? ` · ${sectionsHint}` : ''}
                      </Text>
                    </View>
                    <Icon
                      icon={icons.chevronRight}
                      size={14}
                      color={active ? semanticColors.logoDark : semanticColors.goldMuted}
                    />
                  </TouchableOpacity>
                );
              })}

              <View style={styles.divider} />

              <Text style={styles.sectionHeading}>Tools</Text>
              <TouchableOpacity
                style={styles.row}
                onPress={confirmResetBox}
                disabled={resettingBox}
                accessibilityRole="menuitem"
                accessibilityLabel="Reset box"
              >
                <Icon
                  icon={icons.trash}
                  size={14}
                  color={semanticColors.goldMuted}
                  style={styles.toolIcon}
                />
                <View style={styles.rowCopy}>
                  <Text style={[styles.rowLabel, styles.dangerLabel]}>
                    {resettingBox ? 'Resetting…' : 'Reset box'}
                  </Text>
                  <Text style={styles.rowDesc}>
                    Clear curated box and restart onboarding / reveal
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.row}
                onPress={() => {
                  setOpen(false);
                  navigateMainStack('AdminLandings');
                }}
                accessibilityRole="menuitem"
                accessibilityLabel="Marketing landings CMS"
              >
                <Icon
                  icon={icons.barcode}
                  size={14}
                  color={semanticColors.logoDark}
                  style={styles.toolIcon}
                />
                <View style={styles.rowCopy}>
                  <Text style={styles.rowLabel}>Marketing landings</Text>
                  <Text style={styles.rowDesc}>Add, remove, and edit page sections</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.row}
                onPress={() => {
                  setOpen(false);
                  navigateMainStack('AdminCatalog');
                }}
                accessibilityRole="menuitem"
                accessibilityLabel="Catalog admin"
              >
                <Icon
                  icon={icons.barcode}
                  size={14}
                  color={semanticColors.logoDark}
                  style={styles.toolIcon}
                />
                <View style={styles.rowCopy}>
                  <Text style={styles.rowLabel}>Catalog admin</Text>
                  <Text style={styles.rowDesc}>Create and edit storefront SKUs</Text>
                </View>
              </TouchableOpacity>
              {(preview || previewNowIso || entryAudienceId || mockFlowActive) && (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => {
                    if (mockFlowActive) exitMockFlow();
                    else {
                      clearPreview();
                      clearEntry();
                    }
                  }}
                  accessibilityRole="menuitem"
                  accessibilityLabel="Clear all previews"
                >
                  <Icon
                    icon={icons.close}
                    size={14}
                    color={semanticColors.logoDark}
                    style={styles.toolIcon}
                  />
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowLabel}>
                      {mockFlowActive ? 'Exit mock flow' : 'Clear all previews'}
                    </Text>
                    <Text style={styles.rowDesc}>
                      {mockFlowActive
                        ? 'Restore your real account chrome'
                        : 'User state, date, and entry landing'}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2000,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: semanticColors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 6px 20px rgba(17, 2, 34, 0.22)',
          cursor: 'pointer',
        } as object)
      : {
          shadowColor: '#110222',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.22,
          shadowRadius: 10,
          elevation: 10,
        }),
  },
  fabActive: {
    borderWidth: 2,
    borderColor: semanticColors.logoDark,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 2, 34, 0.28)',
  },
  panel: {
    width: PANEL_WIDTH,
    maxWidth: '94%',
    maxHeight: PANEL_MAX_HEIGHT,
    marginRight: spacing.lg,
    marginBottom: FAB_SIZE + spacing.lg + spacing.sm,
    backgroundColor: semanticColors.bgPrimary,
    borderRadius: borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.border,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 12px 40px rgba(17, 2, 34, 0.18)' } as object)
      : {
          shadowColor: '#110222',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.18,
          shadowRadius: 20,
          elevation: 12,
        }),
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.border,
  },
  panelTitle: {
    ...typeface('medium'),
    fontSize: 18,
    color: semanticColors.logoDark,
    letterSpacing: -0.3,
  },
  panelHint: {
    ...typeface('light'),
    fontSize: typography.sm,
    color: semanticColors.goldMuted,
    marginTop: 2,
    maxWidth: 240,
  },
  closeHit: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flexGrow: 0 },
  scrollContent: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  sectionHeading: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
    marginBottom: 4,
    paddingHorizontal: spacing.xs,
  },
  sectionHeadingInline: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  collapseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    marginTop: spacing.sm,
  },
  collapseHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  collapseSummary: {
    ...typeface('light'),
    fontSize: typography.sm,
    color: semanticColors.goldMuted,
  },
  sectionDesc: {
    ...typeface('light'),
    fontSize: typography.sm,
    color: semanticColors.goldMuted,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
    lineHeight: 18,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: semanticColors.border,
    marginVertical: spacing.md,
    marginHorizontal: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.md,
  },
  rowSelected: {
    backgroundColor: semanticColors.brandLight,
  },
  rowDisabled: {
    opacity: 0.45,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.border,
    marginBottom: 6,
    backgroundColor: semanticColors.bgPrimary,
  },
  actionRowActive: {
    backgroundColor: semanticColors.brandLight,
    borderColor: semanticColors.brand,
  },
  actionLabel: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
  },
  actionLabelActive: {
    color: semanticColors.logoDark,
  },
  radio: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: semanticColors.goldMuted,
    marginTop: 3,
  },
  radioOn: {
    borderColor: semanticColors.logoDark,
    backgroundColor: semanticColors.logoDark,
  },
  rowCopy: { flex: 1, gap: 2 },
  rowLabel: {
    ...typeface('regular'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
  },
  rowLabelSelected: {
    ...typeface('medium'),
  },
  rowLabelDisabled: {
    color: semanticColors.goldMuted,
  },
  rowDesc: {
    ...typeface('light'),
    fontSize: typography.sm,
    color: semanticColors.goldMuted,
    lineHeight: 16,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.border,
  },
  chipSelected: {
    backgroundColor: semanticColors.logoDark,
    borderColor: semanticColors.logoDark,
  },
  chipText: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
  },
  chipTextSelected: {
    color: semanticColors.brand,
  },
  toolIcon: {
    marginTop: 3,
  },
  dangerLabel: {
    color: semanticColors.goldMuted,
  },
});
