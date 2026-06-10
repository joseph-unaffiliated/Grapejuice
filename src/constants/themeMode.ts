/**
 * Parent vs kid visual modes. Parent: gold on white. Kid: pink accent on dark.
 */
import { colors, semanticColors as parentSemantic } from './theme';

export type AppThemeMode = 'parent' | 'kid';

const kidBackground = colors.purple[500];
const kidSurface = '#17001D';

export const kidSemantic = {
  ...parentSemantic,
  brand: '#E16FFF',
  brandLight: colors.purple[200],
  brandDark: colors.purple[300],
  bgPrimary: kidBackground,
  bgDark: kidSurface,
  bgElevated: colors.purple[400],
  textPrimary: colors.text.inverse,
  textSecondary: colors.goldMuted,
  textTertiary: colors.neutral[400],
  border: 'rgba(255,255,255,0.12)',
  borderCard: 'rgba(255,255,255,0.2)',
  goldMuted: colors.goldMuted,
  textInverse: colors.text.inverse,
  accentCream: colors.purple[400],
} as const;

export type SemanticColors = typeof parentSemantic | typeof kidSemantic;

export function semanticColorsForMode(mode: AppThemeMode): SemanticColors {
  return mode === 'kid' ? kidSemantic : parentSemantic;
}

export const BRAND_BYLINE = 'by Untraditional';
