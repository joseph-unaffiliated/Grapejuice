/**
 * Grapejuice design system. Simplified light theme for focus on functionality.
 * Design will be updated later from Figma mockups.
 */
import { Platform, type TextStyle } from 'react-native';

/** Google Fonts family — must match public/index.html link. */
export const WEB_FONT_FAMILY = 'DM Sans';

export const BRAND_ACCENT_ON_DARK = '#E16FFF';
export const BRAND_GRADIENT = { top: '#53006A', bottom: '#17001D' } as const;

/**
 * Simple light palette. White backgrounds, dark text.
 */
export const colors = {
  /** White – primary background, important. */
  white: '#FFFFFF',

  /** Warm palette (cream, beige, gold). */
  warm: {
    50: '#F4EEE4',   // cream – card/surface tint
    100: '#E4D7C1',  // light beige
    200: '#D8C990',  // gold – important, primary accent
    300: '#433C32',  // warm dark brown
    400: '#2F2412',  // dark brown
  },

  /** Purple palette. */
  purple: {
    50: '#E9E3EF',   // light lavender – card/surface tint
    100: '#AD00E1',  // vivid purple – important, accent
    200: '#9700C5',
    300: '#5C0075',
    400: '#430F6A',
    500: '#090113',  // off-black – text, logo
  },

  /** Legacy scales kept for semantic usage (maps to warm/purple). */
  primary: {
    50: '#F4EEE4',
    100: '#E4D7C1',
    200: '#D8C990',
    300: '#433C32',
    400: '#2F2412',
    500: '#D8C990',
    600: '#433C32',
    700: '#2F2412',
    800: '#2F2412',
    900: '#090113',
  },
  secondary: {
    50: '#E9E3EF',
    100: '#E9E3EF',
    200: '#AD00E1',
    300: '#9700C5',
    400: '#5C0075',
    500: '#430F6A',
    600: '#430F6A',
    700: '#090113',
    800: '#090113',
    900: '#090113',
  },
  accent: {
    50: '#E9E3EF',
    100: '#AD00E1',
    200: '#9700C5',
    300: '#5C0075',
    400: '#430F6A',
    500: '#AD00E1',
    600: '#9700C5',
    700: '#5C0075',
    800: '#430F6A',
    900: '#090113',
  },
  neutral: {
    50: '#F9FAFB',
    100: '#F4EEE4',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },
  success: { light: '#D1FAE5', main: '#10B981', dark: '#065F46' },
  warning: { light: '#FEF3C7', main: '#F59E0B', dark: '#92400E' },
  error: { light: '#FEE2E2', main: '#EF4444', dark: '#991B1B' },
  info: { light: '#DBEAFE', main: '#3B82F6', dark: '#1E40AF' },

  background: {
    primary: '#FFFFFF',
    dark: '#F9FAFB',
    elevated: '#F4EEE4',
  },
  accentFill: {
    cream: '#F4EEE4',
    lavender: '#E9E3EF',
  },

  text: {
    primary: '#111827',
    secondary: '#4B5563',
    tertiary: '#6B7280',
    inverse: '#FFFFFF',
  },

  border: {
    light: '#E5E7EB',
    main: '#D1D5DB',
    dark: '#9CA3AF',
  },

  overlay: 'rgba(0, 0, 0, 0.5)',
  /** Figma Untraditional: gold mute (secondary text, chips). */
  goldMuted: '#B8AC7F',
  /** Figma: logo / dark accent. */
  logoDark: '#110222',
};

export const semanticColors = {
  brand: colors.warm[200],
  brandLight: colors.warm[50],
  brandDark: colors.warm[300],
  secondary: colors.purple[100],
  secondaryLight: colors.purple[50],
  secondaryDark: colors.purple[400],
  accent: colors.purple[100],
  accentLight: colors.purple[50],
  accentDark: colors.purple[300],
  neutral: colors.neutral,
  /** Card/screen backgrounds only (BRAND_RULES). */
  bgPrimary: colors.background.primary,
  bgDark: colors.background.dark,
  bgElevated: colors.background.elevated,
  /** Accent only – form fields, highlights, chips. Never card/screen backgrounds. */
  accentCream: colors.accentFill.cream,
  accentLavender: colors.accentFill.lavender,
  textPrimary: colors.text.primary,
  textSecondary: colors.text.secondary,
  textTertiary: colors.text.tertiary,
  textInverse: colors.text.inverse,
  success: colors.success.main,
  warning: colors.warning.main,
  error: colors.error.main,
  info: colors.info.main,
  border: colors.border.light,
  borderDark: colors.border.main,
  /** Card outline – visible on off-black so card edges are clear. */
  borderCard: colors.border.main,
  overlay: colors.overlay,
  dark: '#111827',
  tabBarInactiveTint: colors.neutral[500],
  goldMuted: colors.goldMuted,
  logoDark: colors.logoDark,

  /** Brand-card schemes for colored cards (e.g. activity cards). Avoid deepIndigo for cards so they don’t blend into the page. */
  cardSchemes: {
    deepIndigo: { bg: colors.background.elevated, text: colors.text.primary, label: colors.text.secondary },
    elevatedDark: { bg: colors.background.elevated, text: colors.text.primary, label: colors.text.secondary },
    warmBrown: { bg: colors.background.elevated, text: colors.text.primary, label: colors.text.secondary },
    vibrantPurple: { bg: colors.background.elevated, text: colors.text.primary, label: colors.text.secondary },
    vividPurple: { bg: colors.background.elevated, text: colors.text.primary, label: colors.text.secondary },
    lavender: { bg: colors.background.elevated, text: colors.text.primary, label: colors.text.secondary },
    cream: { bg: colors.background.elevated, text: colors.text.primary, label: colors.text.secondary },
  } as const,
};

export const spacing = {
  xs: 6,
  sm: 12,
  md: 20,
  lg: 28,
  xl: 40,
  xxl: 56,
  xxxl: 72,
};

/** Figma mobile gutter — 24px horizontal padding on phone layouts. */
export const MOBILE_GUTTER = 24;

/** Figma 366:1799 — bottom tab bar (Home / Rav / Account). */
export const TAB_NAV = {
  padTop: 16,
  padBottom: 24,
  iconSize: 26,
  iconGap: spacing.xl,
  height: 16 + 26 + 24,
} as const;

export function tabBarTotalHeight(bottomSafeInset = 0): number {
  return TAB_NAV.height + bottomSafeInset;
}

/** Web layout — sidebar, panel max widths, breakpoints. Keep in sync with public/index.html. */
export const LAYOUT = {
  WEB_TABLET_MAX_WIDTH: 720,
  WEB_DESKTOP_MAX_WIDTH: 960,
  WEB_WIDE_PANEL_MAX_WIDTH: 1120,
  WEB_CONTENT_GUTTER: 32,
  WEB_AUTH_CARD_MAX_WIDTH: 440,
  WEB_SIDEBAR_WIDTH: 242,
  BREAKPOINT_TABLET: 768,
  BREAKPOINT_DESKTOP: 1024,
} as const;

export const borderRadius = {
  sm: 2,
  md: 4,
  lg: 6,
  xl: 8,
  xxl: 12,
  full: 9999,
  card: 6,
  input: 6,
  pill: 40,
  chip: 8,
};

/** Typography — DM Sans (Expo on native; Google Fonts on web). */
export const typography = {
  fontFamily: Platform.select({
    web: {
      light: WEB_FONT_FAMILY,
      regular: WEB_FONT_FAMILY,
      medium: WEB_FONT_FAMILY,
      bold: WEB_FONT_FAMILY,
    },
    default: {
      light: 'DMSans_200ExtraLight',
      regular: 'DMSans_400Regular',
      medium: 'DMSans_500Medium',
      bold: 'DMSans_700Bold',
    },
  })!,
  xs: 10,
  sm: 11,
  md: 12,
  lg: 13,
  xl: 14,
  xxl: 15,
  title: 14,
  titleLg: 16,
  headerLg: 17,
};

/** Per-weight typeface — web uses fontWeight; native uses Expo font files. */
export function typeface(weight: 'light' | 'regular' | 'medium' | 'bold' = 'regular'): Pick<TextStyle, 'fontFamily' | 'fontWeight'> {
  if (Platform.OS === 'web') {
    const fontWeight = { light: '200', regular: '400', medium: '500', bold: '700' } as const;
    return { fontFamily: WEB_FONT_FAMILY, fontWeight: fontWeight[weight] };
  }
  return { fontFamily: typography.fontFamily[weight] };
}

export const shadows = {
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  md: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 4 },
  lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 8 },
  card: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 3 },
  cardHover: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 },
  goldGlow: { shadowColor: '#D8C990', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 4 },
};

/** Web-only: use with style.boxShadow. */
export const shadowsWeb = {
  sm: '0px 1px 2px rgba(0,0,0,0.05)',
  md: '0px 2px 4px rgba(0,0,0,0.08)',
  lg: '0px 4px 8px rgba(0,0,0,0.1)',
  card: '0px 1px 4px rgba(0,0,0,0.06)',
  cardHover: '0px 2px 8px rgba(0,0,0,0.1)',
  fab: '0px 2px 4px rgba(0,0,0,0.2)',
  goldGlow: '0px 0px 16px rgba(216, 201, 144, 0.50)',
  goldGlowSm: '0px 0px 8px rgba(216, 201, 144, 0.50)',
};

export const themeColors = {
  primary: colors.warm[200],
  primaryDark: colors.warm[300],
  secondary: colors.purple[100],
  accent: colors.purple[100],
  background: colors.background.primary,
  backgroundDark: colors.background.dark,
  backgroundElevated: colors.background.elevated,
  accentCream: colors.accentFill.cream,
  accentLavender: colors.accentFill.lavender,
  error: colors.error.main,
  success: colors.success.main,
  text: colors.text.primary,
  textSecondary: colors.text.secondary,
  border: colors.border.light,
  dark: colors.purple[500],
};

export type Theme = {
  colors: typeof themeColors;
  spacing: typeof spacing;
  borderRadius: typeof borderRadius;
  typography: typeof typography;
  shadows: typeof shadows;
};

export const theme: Theme = {
  colors: themeColors,
  spacing,
  borderRadius,
  typography,
  shadows,
};
