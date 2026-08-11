import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { StorefrontRavDrawer } from './StorefrontRavDrawer';

type StorefrontRavContextValue = {
  openRav: (initialMessage?: string) => void;
  closeRav: () => void;
};

const StorefrontRavContext = createContext<StorefrontRavContextValue | null>(null);

/**
 * Screens often call `useStorefrontActions()` above `<StorefrontChrome>`, so React
 * context isn’t available when `askRav` is created. This bridge lets askRav reach
 * the mounted drawer anyway.
 */
let openRavBridge: ((initialMessage?: string) => void) | null = null;

export function openStorefrontRav(initialMessage?: string) {
  openRavBridge?.(initialMessage);
}

export function isStorefrontRavOpenable(): boolean {
  return openRavBridge != null;
}

export function useStorefrontRav(): StorefrontRavContextValue {
  const ctx = useContext(StorefrontRavContext);
  if (!ctx) {
    throw new Error('useStorefrontRav must be used within StorefrontRavProvider');
  }
  return ctx;
}

export function useStorefrontRavOptional(): StorefrontRavContextValue | null {
  return useContext(StorefrontRavContext);
}

type ProviderProps = {
  children: ReactNode;
};

/** Hosts the Rav drawer so header + page CTAs can open the same pane. */
export function StorefrontRavProvider({ children }: ProviderProps) {
  const [visible, setVisible] = useState(false);
  const [initialMessage, setInitialMessage] = useState<string | undefined>();
  const [messageNonce, setMessageNonce] = useState(0);

  const openRav = useCallback((message?: string) => {
    const trimmed = message?.trim();
    setInitialMessage(trimmed || undefined);
    setMessageNonce((n) => n + 1);
    setVisible(true);
  }, []);

  const closeRav = useCallback(() => {
    setVisible(false);
  }, []);

  useEffect(() => {
    openRavBridge = openRav;
    return () => {
      if (openRavBridge === openRav) openRavBridge = null;
    };
  }, [openRav]);

  const value = useMemo(() => ({ openRav, closeRav }), [openRav, closeRav]);

  return (
    <StorefrontRavContext.Provider value={value}>
      {children}
      <StorefrontRavDrawer
        visible={visible}
        onClose={closeRav}
        initialMessage={initialMessage}
        initialMessageNonce={messageNonce}
      />
    </StorefrontRavContext.Provider>
  );
}
