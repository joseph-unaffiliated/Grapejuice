import { Platform, StyleSheet } from 'react-native';
import { borderRadius, semanticColors, spacing, typeface, typography } from '../../../constants/theme';

/** Account-page measure — checkout pages use the same narrow centered column. */
export const CHECKOUT_COLUMN = 560;

/**
 * Checkout chrome matched to the Account page: centered title, hairline section
 * dividers, 22px section headings, gold-outline inputs, filled gold buttons.
 */
export const checkoutUi = StyleSheet.create({
  title: {
    ...typeface('medium'),
    fontSize: 36,
    letterSpacing: -0.8,
    color: semanticColors.textPrimary,
    textAlign: 'center',
  },
  lead: {
    ...typeface('light'),
    fontSize: typography.lg,
    lineHeight: 20,
    marginTop: spacing.sm,
    color: semanticColors.textPrimary,
    letterSpacing: -0.26,
    textAlign: 'center',
    ...(Platform.OS === 'web' ? ({ textWrap: 'balance' } as object) : null),
  },
  divider: {
    alignSelf: 'stretch',
    height: StyleSheet.hairlineWidth,
    backgroundColor: semanticColors.border,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
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
  hint: {
    ...typeface('regular'),
    fontSize: typography.md,
    letterSpacing: -0.22,
    lineHeight: 18,
    color: semanticColors.textSecondary,
  },
  label: {
    ...typeface('regular'),
    fontSize: typography.sm,
    letterSpacing: -0.22,
    color: semanticColors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: 4,
  },
  input: {
    ...typeface('regular'),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.brand,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
    fontSize: Platform.OS === 'web' ? 14 : 16,
    color: semanticColors.textPrimary,
    backgroundColor: semanticColors.bgPrimary,
  },
  inputError: {
    borderColor: semanticColors.error,
  },
  fieldError: {
    ...typeface('regular'),
    marginTop: 4,
    fontSize: typography.sm,
    color: semanticColors.error,
  },
  button: {
    marginTop: spacing.md,
    alignSelf: 'stretch',
    width: '100%',
    borderRadius: borderRadius.xl,
  },
  buttonText: {
    ...typeface('regular'),
    color: semanticColors.logoDark,
  },
});
