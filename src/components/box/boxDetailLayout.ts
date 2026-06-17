import { StyleSheet } from 'react-native';
import { spacing, typography, borderRadius, MOBILE_GUTTER, typeface } from '../../constants/theme';
import type { SemanticColors } from '../../constants/themeMode';

/** Figma 370:3524 — tab row horizontal inset. */
export const BOX_DETAIL_TAB_GUTTER = 32;

/** Figma 370:3534 — section horizontal inset. */
export const BOX_DETAIL_SECTION_GUTTER = MOBILE_GUTTER;

export const BOX_DETAIL_SCROLL_SPY_OFFSET = 56;

export function formatBoxLockDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

export function boxHeaderSubtext(lockAt: string | null, now: Date): string {
  const parts: string[] = [];
  if (lockAt) {
    const lockMs = new Date(lockAt).getTime() - now.getTime();
    if (lockMs > 0) {
      const days = Math.max(0, Math.ceil(lockMs / 86_400_000));
      parts.push(`${days} day${days === 1 ? '' : 's'} to customize`);
    }
  }
  const dateLabel = lockAt
    ? formatBoxLockDate(lockAt)
    : new Date(now.getFullYear(), 11, 4).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
  parts.push(dateLabel);
  return parts.join('  •  ');
}

/** Shared styles for Hanukkah box detail (Figma 370:3514). */
export function createBoxDetailStyles(colors: SemanticColors) {
  return StyleSheet.create({
    scrollContent: {
      paddingBottom: spacing.xxl,
    },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
    toolbarSide: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
    toolbarCenter: { flex: 1, alignItems: 'center', gap: 2 },
    toolbarTitle: {
      fontSize: typography.xxl,
      ...typeface('regular'),
      color: colors.textPrimary,
      letterSpacing: -0.45,
      textAlign: 'center',
    },
    toolbarMeta: {
      fontSize: typography.sm,
      ...typeface('light'),
      color: colors.goldMuted,
      letterSpacing: -0.33,
      textAlign: 'center',
    },
    backText: {
      fontSize: typography.xxl,
      color: colors.goldMuted,
      ...typeface('regular'),
    },
    sectionBlock: {
      borderBottomWidth: 0.5,
      borderBottomColor: colors.goldMuted,
      paddingTop: spacing.xs,
      paddingBottom: spacing.xl,
      paddingHorizontal: BOX_DETAIL_SECTION_GUTTER,
    },
    sectionHeader: { alignItems: 'center', marginBottom: spacing.md, gap: spacing.xs },
    sectionTitle: {
      fontSize: typography.lg,
      ...typeface('regular'),
      color: colors.textPrimary,
      letterSpacing: -0.26,
      textAlign: 'center',
    },
    sectionDesc: {
      fontSize: typography.sm,
      ...typeface('light'),
      color: colors.textPrimary,
      textAlign: 'center',
      lineHeight: 16.5,
      maxWidth: 255,
      letterSpacing: -0.33,
    },
    itemList: { gap: spacing.md, paddingBottom: spacing.lg, width: '100%' },
    browseChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      justifyContent: 'center',
    },
    browseChip: {
      borderWidth: 0.5,
      borderColor: colors.goldMuted,
      borderRadius: borderRadius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      backgroundColor: colors.bgPrimary,
    },
    browseChipText: {
      fontSize: 9,
      color: colors.textPrimary,
      ...typeface('regular'),
      letterSpacing: -0.18,
    },
    reviewCta: {
      backgroundColor: colors.textPrimary,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      alignItems: 'center',
      marginTop: spacing.lg,
      marginHorizontal: BOX_DETAIL_SECTION_GUTTER,
      borderWidth: 0.5,
      borderColor: colors.goldMuted,
    },
    reviewCtaDisabled: { opacity: 0.7 },
    reviewCtaText: {
      fontSize: typography.xxl,
      ...typeface('regular'),
      color: colors.goldMuted,
      letterSpacing: -0.3,
      textAlign: 'center',
    },
    headerExtras: {
      paddingHorizontal: BOX_DETAIL_SECTION_GUTTER,
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
  });
}
