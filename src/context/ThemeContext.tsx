import React, { createContext, useContext, useMemo } from 'react';
import type { AppThemeMode } from '../constants/themeMode';
import { semanticColorsForMode, type SemanticColors } from '../constants/themeMode';

type ThemeContextValue = {
  mode: AppThemeMode;
  colors: SemanticColors;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  mode,
  children,
}: {
  mode: AppThemeMode;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({ mode, colors: semanticColorsForMode(mode) }),
    [mode]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeMode(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useThemeMode must be used within ThemeProvider');
  }
  return ctx;
}
