import { Platform } from 'react-native';

type Geq = {
  page?: (...args: unknown[]) => void;
  suppress?: (email: string) => void;
  trackOrder?: (payload: {
    order_number: string;
    order_amount: string | number;
    order_email: string;
  }) => void;
  addToCart?: (payload: Record<string, unknown>) => void;
  identify?: (email: string) => void;
  push?: (...args: unknown[]) => void;
};

declare global {
  interface Window {
    geq?: Geq;
  }
}

function geq(): Geq | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return window.geq ?? null;
}

/**
 * Collection ping for SPA navigations (React Navigation / history sync).
 * Initial load already calls geq.page() from public/index.html.
 */
export function retentionPage(): void {
  const g = geq();
  if (!g) return;
  try {
    if (typeof g.page === 'function') g.page();
    else g.push?.('page');
  } catch {
    /* ignore */
  }
}

/** Tell Retention not to prospect this email (organic capture / signup). */
export function retentionSuppress(email: string): void {
  const trimmed = email.trim();
  if (!trimmed) return;
  const g = geq();
  if (!g) return;
  try {
    if (typeof g.suppress === 'function') g.suppress(trimmed);
    else g.push?.('suppress', trimmed);
  } catch {
    /* ignore — marketing must never break checkout/auth */
  }
}

/** Fire Retention revenue on post-checkout confirmation. */
export function retentionTrackOrder(input: {
  orderNumber: string;
  orderAmountDollars: number;
  orderEmail: string;
}): void {
  const email = input.orderEmail.trim();
  const orderNumber = input.orderNumber.trim();
  if (!email || !orderNumber) return;
  const g = geq();
  if (!g) return;
  const payload = {
    order_number: orderNumber,
    order_amount: Number(input.orderAmountDollars.toFixed(2)),
    order_email: email,
  };
  try {
    if (typeof g.trackOrder === 'function') g.trackOrder(payload);
    else g.push?.('trackOrder', payload);
  } catch {
    /* ignore */
  }
}
