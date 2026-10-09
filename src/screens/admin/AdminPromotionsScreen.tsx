import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuthStore } from '../../stores/authStore';
import { isOpsAdmin } from '../../constants/admin';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { useViewportPinnedHeight } from '../../components/storefront/storefrontViewport';
import { useThemeMode } from '../../context/ThemeContext';
import { useWebLayout } from '../../hooks/useWebLayout';
import { spacing, typography, borderRadius, typeface } from '../../constants/theme';
import type { SemanticColors } from '../../constants/themeMode';
import type { MainStackParamList } from '../../navigation/types';
import { PromotionsSection, type PromotionsTab } from './AdminPromotionsSections';

type Nav = StackNavigationProp<MainStackParamList>;

const TABS: ReadonlyArray<[PromotionsTab, string, string]> = [
  ['discounts', 'Discounts', 'Discount codes'],
  ['credit', 'Credit', 'Direct credit'],
  ['influencers', 'Influencers', 'Influencer links'],
];
const TAB_STORAGE_KEY = 'gj.adminPromotions.tab';

/** The open tab survives a browser refresh of /admin/promotions. */
function readStoredTab(): PromotionsTab {
  try {
    const raw = typeof window !== 'undefined' ? window.sessionStorage?.getItem(TAB_STORAGE_KEY) : null;
    return TABS.some(([t]) => t === raw) ? (raw as PromotionsTab) : 'discounts';
  } catch {
    return 'discounts';
  }
}

function storeTab(tab: PromotionsTab): void {
  try {
    if (typeof window !== 'undefined') window.sessionStorage?.setItem(TAB_STORAGE_KEY, tab);
  } catch {
    // Private mode / native: tab just resets on reload.
  }
}

/** Discount codes, direct credit and influencer links — admin-gated. */
export function AdminPromotionsScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const styles = useMemo(() => createStyles(colors, isDesktop), [colors, isDesktop]);
  const user = useAuthStore((s) => s.user);
  const allowed = isOpsAdmin(user);
  const hostRef = useRef<View>(null);
  // Stack screens on web grow to content height; pin to the viewport so the ScrollView scrolls (iOS especially).
  const pinnedHeight = useViewportPinnedHeight(hostRef, true);
  const hostStyle = [styles.host, pinnedHeight != null ? { height: pinnedHeight, maxHeight: pinnedHeight } : null];
  const [tab, setTabState] = useState<PromotionsTab>(readStoredTab);
  const setTab = (next: PromotionsTab) => {
    setTabState(next);
    storeTab(next);
  };

  const panelProps = {
    flush: isDesktop,
    centerDesktop: isDesktop,
    omitDesktopTopPadding: isDesktop,
    style: styles.panel,
  } as const;

  if (!allowed) {
    return (
      <View ref={hostRef} style={hostStyle}>
        <WebContentPanel {...panelProps}>
          <View style={styles.centered}>
            <Text style={styles.title}>Admin only</Text>
            <Text style={styles.hint}>This page is limited to allowlisted ops accounts.</Text>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.backLink}>← Back</Text>
            </TouchableOpacity>
          </View>
        </WebContentPanel>
      </View>
    );
  }

  const heading = TABS.find(([t]) => t === tab)?.[2] ?? '';

  return (
    <View ref={hostRef} style={hostStyle}>
      <WebContentPanel {...panelProps}>
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.backWrap}>
            <Text style={styles.backLink}>← Account</Text>
          </TouchableOpacity>
          <View style={styles.headerBlock}>
            <Text style={styles.title}>Promotions</Text>
            <Text style={styles.subtitle}>Discount codes, direct credit and influencer links</Text>
          </View>

          <View style={styles.sectionDivider} />
          <View style={styles.chipRow}>
            {TABS.map(([t, label]) => (
              <TouchableOpacity
                key={t}
                style={[styles.chip, tab === t && styles.chipActive]}
                onPress={() => setTab(t)}
                accessibilityRole="button"
                accessibilityState={{ selected: tab === t }}
              >
                <Text style={styles.chipLabel}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.section}>{heading}</Text>
          <PromotionsSection tab={tab} />
        </ScrollView>
      </WebContentPanel>
    </View>
  );
}

function createStyles(colors: SemanticColors, isDesktop: boolean) {
  return StyleSheet.create({
    host: { flex: 1, width: '100%', minHeight: 0, backgroundColor: colors.bgPrimary },
    panel: { flex: 1, width: '100%', minHeight: 0, backgroundColor: colors.bgPrimary },
    root: { flex: 1, backgroundColor: colors.bgPrimary },
    content: {
      padding: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: 120,
      maxWidth: isDesktop ? 1120 : undefined,
      width: '100%',
      alignSelf: isDesktop ? 'center' : undefined,
    },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.sm },
    backWrap: { alignSelf: 'flex-start' },
    backLink: {
      ...typeface('regular'),
      fontSize: typography.md,
      color: colors.textSecondary,
      letterSpacing: -0.22,
    },
    headerBlock: { alignItems: 'center', marginTop: spacing.sm },
    title: {
      ...typeface('medium'),
      fontSize: 36,
      letterSpacing: -0.8,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    subtitle: {
      ...typeface('light'),
      fontSize: typography.lg,
      marginTop: spacing.sm,
      color: colors.textPrimary,
      letterSpacing: -0.26,
      textAlign: 'center',
    },
    hint: {
      ...typeface('regular'),
      fontSize: typography.md,
      letterSpacing: -0.22,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    section: {
      ...typeface('medium'),
      fontSize: 22,
      lineHeight: 28,
      letterSpacing: -0.3,
      color: colors.logoDark,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    sectionDivider: {
      alignSelf: 'stretch',
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginTop: spacing.lg,
      marginBottom: spacing.md,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
    chip: {
      borderRadius: borderRadius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.brand,
      backgroundColor: colors.bgPrimary,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      minHeight: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipActive: { backgroundColor: colors.brand },
    chipLabel: {
      ...typeface('regular'),
      fontSize: typography.sm,
      color: colors.textPrimary,
      letterSpacing: -0.22,
    },
  });
}
