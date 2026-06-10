import { Platform } from 'react-native';

/** Playwright capture sets this so dynamic countdown text matches the Figma reference. */
export function isFigmaCompareCapture(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    return window.localStorage?.getItem('grapejuice-figma-compare') === '1';
  } catch {
    return false;
  }
}

export const FIGMA_HERO_SUBTITLE = 'Hanukkah is in 25 days (ships in 6 days)';
