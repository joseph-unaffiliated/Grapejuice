import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type StorefrontRavContextValue = {
  openRav: (initialMessage?: string) => void;
  closeRav: () => void;
  visible: boolean;
  initialMessage?: string;
  initialMessageNonce: number;
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

/** Holds Rav open state; chrome renders the pane in-layout (not a Modal). */
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

  const value = useMemo(
    () => ({
      openRav,
      closeRav,
      visible,
      initialMessage,
      initialMessageNonce: messageNonce,
    }),
    [openRav, closeRav, visible, initialMessage, messageNonce]
  );

  return (
    <StorefrontRavContext.Provider value={value}>{children}</StorefrontRavContext.Provider>
  );
}
