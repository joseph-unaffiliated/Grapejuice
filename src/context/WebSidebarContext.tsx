import React, { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { LAYOUT } from '../constants/theme';

type WebSidebarContextValue = {
  collapsed: boolean;
  toggleCollapsed: () => void;
  /** Width for layout math — updates when the sidebar width animation finishes. */
  layoutSidebarWidth: number;
  setLayoutSidebarWidth: (width: number) => void;
};

const WebSidebarContext = createContext<WebSidebarContextValue | null>(null);

export function WebSidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [layoutSidebarWidth, setLayoutSidebarWidth] = useState(LAYOUT.WEB_SIDEBAR_WIDTH);
  const toggleCollapsed = useCallback(() => setCollapsed((v) => !v), []);

  const value = useMemo(
    () => ({ collapsed, toggleCollapsed, layoutSidebarWidth, setLayoutSidebarWidth }),
    [collapsed, toggleCollapsed, layoutSidebarWidth],
  );

  return <WebSidebarContext.Provider value={value}>{children}</WebSidebarContext.Provider>;
}

export function useWebSidebar() {
  return useContext(WebSidebarContext);
}
