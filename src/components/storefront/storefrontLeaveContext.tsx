import React, { createContext, useContext, type ReactNode } from 'react';
import type { StorefrontServiceId } from './StorefrontServicesNav';
import type { PendingMainNav } from '../../navigation/pendingMainNav';

export type StorefrontLeaveTarget =
  | { type: 'home' }
  | { type: 'category'; slug: string; q?: string }
  | { type: 'myBox' }
  | { type: 'service'; id: StorefrontServiceId }
  | { type: 'screen'; nav: PendingMainNav };

const StorefrontLeaveContext = createContext<((target: StorefrontLeaveTarget) => void) | null>(
  null
);

export function StorefrontLeaveProvider({
  onLeave,
  children,
}: {
  onLeave: (target: StorefrontLeaveTarget) => void;
  children: ReactNode;
}) {
  return (
    <StorefrontLeaveContext.Provider value={onLeave}>{children}</StorefrontLeaveContext.Provider>
  );
}

/** When set (e.g. onboarding under chrome), prefer leaving the isolated flow over MainStack navigate. */
export function useStorefrontLeave(): ((target: StorefrontLeaveTarget) => void) | null {
  return useContext(StorefrontLeaveContext);
}
