import { Platform, StyleSheet } from 'react-native';
import { spacing, typography, borderRadius, MOBILE_GUTTER, typeface } from '../../constants/theme';
import type { SemanticColors } from '../../constants/themeMode';

/** Figma 370:3524 — tab row horizontal inset. */
export const BOX_DETAIL_TAB_GUTTER = 32;

/** Figma 370:3534 — section horizontal inset. */
export const BOX_DETAIL_SECTION_GUTTER = MOBILE_GUTTER;

export const BOX_DETAIL_SCROLL_SPY_OFFSET = 56;

/**
 * Optical rhythm: sticky-nav → title, lock line → gold divider, and
 * divider → first section heading share this gap.
 * Literal 48 — theme has no exact 48 token (md=20, lg=28).
 */
export const BOX_DETAIL_TOOLBAR_RHYTHM = 48;

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
export function createBoxDetailStyles(
  colors: SemanticColors,
  options?: {
    desktop?: boolean;
    tileGrid?: boolean;
    /** Visual width columns from list width (not forced max-per-row). */
    tileColumns?: 2 | 3;
  }
) {
  const desktop = options?.desktop ?? false;
  const tileGrid = options?.tileGrid ?? false;
  const tileColumns = options?.tileColumns ?? 2;
  /** Same % for Story 2-up and forced 2×2 when width allows 3-up. */
  const tileWidth = tileColumns === 3 ? '31.5%' : '48%';

  return StyleSheet.create({
    scrollContent: {
      // Float-bar clearance only — My Box overrides further when the summary float is shown.
      paddingBottom: Platform.OS === 'web' ? 160 : spacing.xxl,
    },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingHorizontal: desktop ? 0 : spacing.md,
      // Equal vertical padding so title block isn’t bottom-heavy under chrome.
      paddingTop: BOX_DETAIL_TOOLBAR_RHYTHM,
      paddingBottom: BOX_DETAIL_TOOLBAR_RHYTHM,
    },
    toolbarLeft: {
      justifyContent: 'flex-start',
    },
    toolbarSide: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
    toolbarCenter: { flex: 1, alignItems: 'center', gap: spacing.xs },
    toolbarCenterLeft: { alignItems: 'flex-start' },
    toolbarBackInline: { marginBottom: spacing.xs },
    toolbarTitle: {
      fontSize: 28,
      ...typeface('medium'),
      color: colors.textPrimary,
      letterSpacing: -0.6,
      textAlign: 'center',
    },
    toolbarTitleLeft: {
      textAlign: 'left',
      fontSize: 20,
      letterSpacing: -0.4,
    },
    toolbarMeta: {
      fontSize: typography.sm,
      ...typeface('light'),
      color: colors.goldMuted,
      letterSpacing: -0.33,
      textAlign: 'center',
    },
    toolbarMetaLeft: {
      textAlign: 'left',
    },
    lockChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    lockChipRowLeft: {
      justifyContent: 'flex-start',
    },
    /** Plain lock countdown — same line as calendar link, no chip/pill chrome. */
    lockChipText: {
      ...typeface('light'),
      fontSize: typography.sm,
      color: colors.goldMuted,
      letterSpacing: -0.33,
    },
    /** Gold rule under title / lock / calendar — same stroke as sectionBlock bottom border. */
    toolbarGoldDivider: {
      borderBottomWidth: 0.5,
      borderBottomColor: colors.goldMuted,
      alignSelf: 'stretch',
      width: '100%',
      marginHorizontal: 0,
      marginBottom: 0,
    },
    backText: {
      fontSize: typography.xxl,
      color: colors.goldMuted,
      ...typeface('regular'),
    },
    sectionBlock: {
      borderBottomWidth: 0.5,
      borderBottomColor: colors.goldMuted,
      // Match toolbar rhythm so gap below gold divider equals gap above it.
      paddingTop: BOX_DETAIL_TOOLBAR_RHYTHM,
      paddingBottom: spacing.xl,
      paddingHorizontal: desktop ? 0 : BOX_DETAIL_SECTION_GUTTER,
      ...(Platform.OS === 'web' ? { scrollMarginTop: BOX_DETAIL_SCROLL_SPY_OFFSET } : null),
    },
    /** Give Presents — tighter bottom so checklist doesn’t float above a large empty band. */
    sectionBlockPresents: {
      paddingBottom: spacing.md,
    },
    sectionHeader: {
      alignItems: 'center',
      alignSelf: 'center',
      width: '100%',
      maxWidth: 480,
      // Clearer gap before the item grid (was spacing.md).
      marginBottom: spacing.xl,
      // Title ↔ blurb (was spacing.xs / 6).
      gap: spacing.sm,
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      justifyContent: 'center',
    },
    sectionTitle: {
      fontSize: typography.titleLg,
      ...typeface('medium'),
      color: colors.textPrimary,
      letterSpacing: -0.32,
      textAlign: 'center',
    },
    sectionCountBadge: {
      minWidth: 16,
      height: 16,
      paddingHorizontal: 4,
      borderRadius: borderRadius.pill,
      backgroundColor: colors.brand,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionCountText: {
      fontSize: 9,
      ...typeface('medium'),
      color: colors.textInverse,
      letterSpacing: -0.18,
      lineHeight: 16,
      textAlign: 'center',
      ...(Platform.OS === 'android' ? { includeFontPadding: false, textAlignVertical: 'center' } : null),
      ...(Platform.OS === 'web'
        ? ({
            lineHeight: '16px',
            marginTop: 0,
            marginBottom: 0,
            paddingTop: 0,
            paddingBottom: 0,
          } as object)
        : null),
    },
    sectionDesc: {
      fontSize: typography.sm,
      ...typeface('light'),
      color: colors.textPrimary,
      textAlign: 'center',
      lineHeight: 16.5,
      // Slightly opener tracking than section chrome (-0.33 → -0.18).
      letterSpacing: -0.18,
      ...(Platform.OS === 'web' ? ({ textWrap: 'balance' } as object) : null),
    },
    sectionDescToggle: {
      fontSize: typography.sm,
      ...typeface('regular'),
      color: colors.goldMuted,
      textAlign: 'center',
      marginTop: 4,
      letterSpacing: -0.33,
    },
    sectionLeading: {
      width: '100%',
      marginBottom: spacing.md,
    },
    sectionTrailing: {
      width: '100%',
      marginTop: spacing.sm,
      marginBottom: spacing.sm,
    },
    itemList: {
      gap: spacing.md,
      paddingBottom: spacing.lg,
      width: '100%',
      alignSelf: 'center',
      ...(tileGrid
        ? {
            // Stack of centered rows (chunked in BoxDetailSectionBlock) so
            // max-per-row can be 2 while tile width stays at 3-col size.
            flexDirection: 'column' as const,
            alignItems: 'stretch' as const,
          }
        : null),
    },
    itemListPresents: {
      paddingBottom: spacing.sm,
    },
    /** One centered row of tiles (used when tileGrid). */
    itemRow: {
      flexDirection: 'row' as const,
      flexWrap: 'nowrap' as const,
      justifyContent: 'center' as const,
      alignItems: 'flex-start' as const,
      gap: spacing.md,
      width: '100%',
    },
    /**
     * Desktop grid cell — width from width-capacity columns (2 → 48%, 3 → 31.5%),
     * not from forced max-per-row, so 2×2 stays Story-sized.
     */
    itemTile: {
      width: tileWidth,
      maxWidth: tileWidth,
      flexGrow: 0,
      flexShrink: 0,
    },
    reviewCta: {
      backgroundColor: colors.textPrimary,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      alignItems: 'center',
      marginTop: spacing.lg,
      marginHorizontal: desktop ? 0 : BOX_DETAIL_SECTION_GUTTER,
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
      paddingHorizontal: desktop ? 16 : BOX_DETAIL_SECTION_GUTTER,
      paddingVertical: 16,
      gap: spacing.sm,
      marginBottom: spacing.sm,
      // Glow lives here only — never put overflow:visible on the ScrollView.
      overflow: 'visible' as const,
    },
  });
}
