/**
 * Reusable style fragments from DESIGN_SYSTEM.md.
 * Pass theme colors from useThemeMode() where needed.
 */
import { Platform, type TextStyle, type ViewStyle } from 'react-native';
import {
  borderRadius,
  shadows,
  shadowsWeb,
  typography,
  MOBILE_GUTTER,
} from './theme';
import type { SemanticColors } from './themeMode';

const goldGlowSm =
  Platform.OS === 'web' ? ({ boxShadow: shadowsWeb.goldGlowSm } as ViewStyle) : (shadows.goldGlow as ViewStyle);

const goldGlow =
  Platform.OS === 'web' ? ({ boxShadow: shadowsWeb.goldGlow } as ViewStyle) : (shadows.goldGlow as ViewStyle);

export const designPresets = {
  cardHero: (colors: SemanticColors): ViewStyle => ({
    borderRadius: 16,
    backgroundColor: colors.bgPrimary,
    ...goldGlow,
  }),

  cardSurface: (colors: SemanticColors): ViewStyle => ({
    borderRadius: 16,
    backgroundColor: colors.bgElevated,
    ...goldGlow,
  }),

  cardBordered: (colors: SemanticColors): ViewStyle => ({
    borderRadius: borderRadius.md,
    backgroundColor: colors.bgPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  }),

  buttonPillPrimary: (colors: SemanticColors): ViewStyle => ({
    borderRadius: borderRadius.pill,
    backgroundColor: colors.bgPrimary,
    paddingHorizontal: MOBILE_GUTTER,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...goldGlowSm,
  }),

  buttonPillSecondary: (colors: SemanticColors): ViewStyle => ({
    borderRadius: borderRadius.pill,
    backgroundColor: colors.bgPrimary,
    paddingHorizontal: MOBILE_GUTTER,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.brand,
  }),

  buttonFilled: (colors: SemanticColors): ViewStyle => ({
    borderRadius: borderRadius.pill,
    backgroundColor: colors.brand,
    paddingHorizontal: MOBILE_GUTTER,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  }),

  chipCategory: (colors: SemanticColors): ViewStyle => ({
    borderRadius: 32,
    borderWidth: 0.5,
    borderColor: colors.brand,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: colors.bgPrimary,
  }),

  chipStarter: (colors: SemanticColors): ViewStyle => ({
    borderRadius: borderRadius.chip,
    borderWidth: 1,
    borderColor: colors.goldMuted,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgPrimary,
  }),

  textHeroTitle: (colors: SemanticColors): TextStyle => ({
    fontSize: typography.titleLg,
    fontWeight: '400',
    letterSpacing: -0.32,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.regular,
  }),

  textHeroSub: (colors: SemanticColors): TextStyle => ({
    fontSize: typography.sm,
    fontWeight: '200',
    letterSpacing: -0.22,
    color: colors.goldMuted,
    fontFamily: typography.fontFamily.light,
  }),

  textSectionTitle: (colors: SemanticColors): TextStyle => ({
    fontSize: typography.xl,
    fontWeight: '400',
    letterSpacing: -0.26,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.regular,
  }),

  textMicro: (colors: SemanticColors): TextStyle => ({
    fontSize: typography.sm,
    fontWeight: '200',
    letterSpacing: -0.22,
    color: colors.goldMuted,
    fontFamily: typography.fontFamily.light,
  }),

  textPillLabel: (colors: SemanticColors): TextStyle => ({
    fontSize: typography.lg,
    fontWeight: '400',
    letterSpacing: -0.26,
    color: colors.textPrimary,
    textAlign: 'center',
    fontFamily: typography.fontFamily.regular,
  }),
};
