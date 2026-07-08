import React, { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { LAYOUT } from '../constants/theme';

type WebSidebarContextValue = {
  collapsed: boolean;
  toggleCollapsed: () => void;
  sidebarWidth: number;
};

const WebSidebarContext = createContext<WebSidebarContextValue | null>(null);

export function WebSidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const toggleCollapsed = useCallback(() => setCollapsed((v) => !v), []);
  const sidebarWidth =
    Platform.OS === 'web'
      ? collapsed
        ? LAYOUT.WEB_SIDEBAR_COLLAPSED_WIDTH
        : LAYOUT.WEB_SIDEBAR_WIDTH
      : 0;

  const value = useMemo(
    () => ({ collapsed, toggleCollapsed, sidebarWidth }),
    [collapsed, toggleCollapsed, sidebarWidth]
  );

  return <WebSidebarContext.Provider value={value}>{children}</WebSidebarContext.Provider>;
}

export function useWebSidebar() {
  return useContext(WebSidebarContext);
}
