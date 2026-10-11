/**
 * Tokens for the phone layouts (mockups/mobile-box). Imported only by the mobile
 * components, never by the shared theme, so desktop styling is untouched.
 *
 * One beige, one gold for lines and fills, one dark gold for text, one black (ink).
 */
import { Platform, type TextStyle } from 'react-native';

export const m = {
  ink: '#111827',
  gold: '#B8AC7F',
  goldDark: '#7D7148',
  beige: '#F3F0E6',
  lineWarm: '#E4DCC6',
  line: '#E5E7EB',
  muted: '#6B7280',
  body: '#374151',
  img: '#EDEDED',
  white: '#FFFFFF',
  warn: '#7A3A0F',
  warnBg: '#FDF0E7',
} as const;

export const mRadius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const mGutter = 16;

/** DM Sans is loaded site-wide; weights map to the loaded faces on web. */
export function mFont(weight: 300 | 400 | 500 | 700 = 400): TextStyle {
  if (Platform.OS === 'web') {
    return { fontFamily: "'DM Sans', Helvetica, Arial, sans-serif", fontWeight: String(weight) as TextStyle['fontWeight'] };
  }
  const map = { 300: 'DMSans_300Light', 400: 'DMSans_400Regular', 500: 'DMSans_500Medium', 700: 'DMSans_700Bold' } as const;
  return { fontFamily: map[weight] };
}

export const mType = {
  h1: { fontSize: 29, lineHeight: 33, letterSpacing: -0.8, color: m.ink, ...mFont(400) } as TextStyle,
  h2: { fontSize: 20, lineHeight: 25, letterSpacing: -0.4, color: m.ink, ...mFont(500) } as TextStyle,
  h3: { fontSize: 17, lineHeight: 22, letterSpacing: -0.2, color: m.ink, ...mFont(500) } as TextStyle,
  body: { fontSize: 15, lineHeight: 22, color: m.body, ...mFont(300) } as TextStyle,
  bodyStrong: { fontSize: 15, lineHeight: 22, color: m.ink, ...mFont(400) } as TextStyle,
  small: { fontSize: 13, lineHeight: 18, color: m.muted, ...mFont(400) } as TextStyle,
  smallDark: { fontSize: 13, lineHeight: 18, color: m.goldDark, ...mFont(400) } as TextStyle,
  tiny: { fontSize: 12, lineHeight: 16, color: m.muted, ...mFont(400) } as TextStyle,
  eyebrow: { fontSize: 13, lineHeight: 18, color: m.goldDark, ...mFont(500) } as TextStyle,
  button: { fontSize: 16, lineHeight: 20, ...mFont(400) } as TextStyle,
};

/** Text that should balance across lines on web (`.gj-mobile [data-balance]` in public/index.html). */
export const balanceProps = Platform.OS === 'web' ? ({ dataSet: { balance: '1' } } as object) : {};

export const TAP = 44;
