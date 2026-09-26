import React, { type ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebContentPanel } from './WebContentPanel';
import {
  MOBILE_GUTTER,
  borderRadius,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';
import { useWebLayout } from '../../hooks/useWebLayout';
import { AccountHubHeader, type AccountHubPage } from '../account/AccountHubHeader';
import { BrandLoadingMark } from '../brand/BrandLoadingMark';

/** Account hub column — same narrow centered measure as the Account page. */
const HUB_COLUMN = 560;

type PageProps = {
  children: ReactNode;
  /** Gold back link, same as History. Omit on tab roots like Account. */
  onBack?: () => void;
  /**
   * Use the storefront-wide column (My Box, 1120) instead of the 1024 reading column.
   * Checkout needs the extra width for a form beside the summary.
   */
  wide?: boolean;
  /** Centered grape loader. Replaces the page body while data is loading. */
  loading?: boolean;
  /**
   * Account-style page: 560px centered column, hub title, and links to the
   * other system pages. Replaces the back link and the left-aligned page title.
   */
  hub?: AccountHubPage;
};

/**
 * Shared frame for Account, Orders, Gifts, and History.
 * History is the reference: column width, type scale, and button styles live here
 * so a later pass can change all four at once.
 */
export function SystemPage({ children, onBack, wide = false, loading = false, hub }: PageProps) {
  const { isDesktop, layoutWidth, widePanelMaxWidth } = useWebLayout();
  const columnWidth = hub ? HUB_COLUMN : wide ? widePanelMaxWidth : layoutWidth;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={[]}>
        {onBack && !hub ? (
          <TouchableOpacity
            onPress={onBack}
            style={styles.loaderBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        ) : null}
        <View
          style={styles.pageLoader}
          accessibilityLabel="Loading"
          accessibilityRole="progressbar"
        >
          <BrandLoadingMark />
        </View>
      </SafeAreaView>
    );
  }

  const body = (
    <>
      {hub ? (
        <>
          <AccountHubHeader page={hub} />
          <View style={styles.hubDivider} />
        </>
      ) : onBack ? (
        <TouchableOpacity
          onPress={onBack}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      ) : null}
      {children}
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <WebContentPanel
        flush={isDesktop}
        gutter={!isDesktop}
        centerDesktop={isDesktop}
        omitDesktopTopPadding={isDesktop}
        style={styles.panel}
      >
        <ScrollView
          style={styles.root}
          contentContainerStyle={hub ? styles.hubScrollContent : styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {isDesktop ? (
            <View style={[styles.contentColumn, { maxWidth: columnWidth }]}>{body}</View>
          ) : (
            body
          )}
        </ScrollView>
      </WebContentPanel>
    </SafeAreaView>
  );
}

/** Grape loader for a section that is still loading inside an otherwise ready page. */
export function SystemPageSpinner() {
  return (
    <View style={styles.sectionLoader} accessibilityLabel="Loading" accessibilityRole="progressbar">
      <BrandLoadingMark />
    </View>
  );
}

export function SystemChip({
  label,
  onPress,
  disabled,
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, style, disabled && styles.chipDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text style={styles.chipText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function SystemTextAction({
  label,
  onPress,
  disabled,
  tone = 'muted',
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'muted' | 'brand';
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.textAction, style, disabled && styles.chipDisabled]}
    >
      <Text style={tone === 'brand' ? styles.link : styles.textActionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export const systemPageStyles = StyleSheet.create({
  title: {
    ...typeface('bold'),
    fontSize: 26,
    marginBottom: spacing.sm,
    color: semanticColors.textPrimary,
  },
  lead: {
    ...typeface('regular'),
    fontSize: typography.lg,
    lineHeight: 22,
    color: semanticColors.textSecondary,
    marginBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.xxl,
    gap: spacing.xs,
  },
  sectionHeading: {
    ...typeface('medium'),
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
    color: semanticColors.logoDark,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionLead: {
    ...typeface('regular'),
    fontSize: typography.md,
    letterSpacing: -0.22,
    lineHeight: 18,
    color: semanticColors.textSecondary,
    marginBottom: spacing.sm,
  },
  emptyText: {
    ...typeface('regular'),
    fontSize: typography.md,
    color: semanticColors.textTertiary,
    lineHeight: 20,
  },
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.border,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  rowTitle: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.textPrimary,
  },
  rowMeta: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textSecondary,
    lineHeight: 18,
  },
  rowAside: {
    ...typeface('regular'),
    fontSize: typography.xs,
    color: semanticColors.textTertiary,
    marginTop: 2,
  },
  field: {
    borderWidth: 1,
    borderColor: semanticColors.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
    fontSize: typography.md,
    color: semanticColors.textPrimary,
    ...typeface('regular'),
  },
  note: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.goldMuted,
    marginBottom: spacing.md,
  },
  link: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.brand,
  },
  errorText: {
    ...typeface('regular'),
    marginTop: spacing.sm,
    fontSize: typography.sm,
    color: semanticColors.error,
  },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: semanticColors.bgPrimary },
  panel: { flex: 1, width: '100%', backgroundColor: semanticColors.bgPrimary },
  root: { flex: 1, backgroundColor: semanticColors.bgPrimary, width: '100%' },
  scrollContent: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    width: '100%',
  },
  hubScrollContent: {
    paddingTop: spacing.xxl + spacing.md,
    paddingBottom: 120,
    width: '100%',
  },
  hubDivider: {
    alignSelf: 'stretch',
    height: StyleSheet.hairlineWidth,
    backgroundColor: semanticColors.border,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  contentColumn: {
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: MOBILE_GUTTER,
  },
  pageLoader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLoader: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  loaderBack: {
    marginBottom: spacing.md,
    paddingHorizontal: MOBILE_GUTTER,
    paddingTop: spacing.lg,
  },
  back: { marginBottom: spacing.md },
  backText: {
    ...typeface('regular'),
    fontSize: typography.lg,
    color: semanticColors.goldMuted,
  },
  chip: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
    borderColor: semanticColors.brand,
  },
  chipDisabled: { opacity: 0.45 },
  chipText: {
    ...typeface('medium'),
    color: semanticColors.brand,
    fontSize: typography.sm,
  },
  textAction: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.xs,
  },
  textActionLabel: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.textSecondary,
  },
  link: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.brand,
  },
});
