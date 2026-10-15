import { Platform } from 'react-native';
import type { BoxLineItem } from '../../types/pilot';
import type { AuditProblem, IncludedAudit } from './includedAudit';
import { overProblems } from './includedAudit';

export type BoxAuditDevSnapshot = {
  at: string;
  audit: IncludedAudit;
  /** Over-allowance / free-add-on / not-included problems (excludes donations). */
  open: AuditProblem[];
  lineItems: BoxLineItem[];
  totalCents: number;
  kidKeys: string[];
  adults: number | undefined;
  wrapSelectedItemIds: string[];
};

declare global {
  // eslint-disable-next-line no-var
  var __boxAudit: BoxAuditDevSnapshot | undefined;
  interface Window {
    __boxAudit?: BoxAuditDevSnapshot;
  }
}

/** Playwright fuzz sets `localStorage.grapejuice-box-fuzz = '1'` before load. */
export function boxFuzzHookEnabled(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    if (window.localStorage?.getItem('grapejuice-box-fuzz') === '1') return true;
  } catch {
    /* ignore */
  }
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

/** Publish the latest included-items audit for the phone fuzz script. */
export function publishBoxAuditDev(snapshot: Omit<BoxAuditDevSnapshot, 'at' | 'open'>): void {
  if (!boxFuzzHookEnabled()) return;
  const next: BoxAuditDevSnapshot = {
    ...snapshot,
    at: new Date().toISOString(),
    open: overProblems(snapshot.audit),
  };
  try {
    window.__boxAudit = next;
  } catch {
    /* ignore */
  }
}
