import React, { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { LAYOUT } from '../constants/theme';

export type RavSubnav = 'new' | 'recent' | null;

type WebSidebarContextValue = {
  collapsed: boolean;
  toggleCollapsed: () => void;
  /**
   * Width for layout math — matches the animated rail after each collapse finishes
   * so centered content can settle with the live main-area width.
   */
  layoutSidebarWidth: number;
  setLayoutSidebarWidth: (width: number) => void;
  /** Which Rav sidebar sub-link is active (desktop). */
  ravSubnav: RavSubnav;
  setRavSubnav: (value: RavSubnav) => void;
};

const WebSidebarContext = createContext<WebSidebarContextValue | null>(null);

export function WebSidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(true);
  const [layoutSidebarWidth, setLayoutSidebarWidth] = useState(LAYOUT.WEB_SIDEBAR_COLLAPSED_WIDTH);
  const [ravSubnav, setRavSubnav] = useState<RavSubnav>(null);
  const toggleCollapsed = useCallback(() => setCollapsed((v) => !v), []);

  const value = useMemo(
    () => ({
      collapsed,
      toggleCollapsed,
      layoutSidebarWidth,
      setLayoutSidebarWidth,
      ravSubnav,
      setRavSubnav,
    }),
    [collapsed, toggleCollapsed, layoutSidebarWidth, ravSubnav],
  );

  return <WebSidebarContext.Provider value={value}>{children}</WebSidebarContext.Provider>;
}

export function useWebSidebar() {
  return useContext(WebSidebarContext);
}
