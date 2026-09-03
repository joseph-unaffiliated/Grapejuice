import { useEffect, useState } from 'react';
import { getHanukkahConfig } from '../services/firestore/config';
import { useBoxDraft } from './useBoxDraft';
import { usePaymentGate } from './usePaymentGate';
import {
  useEffectiveBoxLocked,
  usePreviewedIsAuthenticated,
} from './useUserStatePreview';

/** How far along the visitor is in their own Hanukkah box. */
export type OwnBoxStep =
  /** No box draft yet — acquisition copy still applies. */
  | 'none'
  /** Guest box living in the session; not saved to an account. */
  | 'guest'
  /** Box exists but no card / credit yet, so it can't be customized. */
  | 'needs_payment'
  /** Box is payable and still editable. */
  | 'customize'
  /** Past the customization lock — view only. */
  | 'locked';

/**
 * Progress in the visitor's *own* box, deliberately ignoring gift intent.
 * `useStorefrontHomeMode` lets an in-flight gift mask the box state, which is
 * the wrong answer for a "build your box" CTA — giving a gift and building your
 * own box are separate jobs.
 */
export function useOwnBoxStep(): OwnBoxStep {
  const isAuthenticated = usePreviewedIsAuthenticated();
  const { lineItems } = useBoxDraft();
  const { canMutateBox } = usePaymentGate();
  const [lockAt, setLockAt] = useState<string | null>(null);
  const locked = useEffectiveBoxLocked(lockAt);

  useEffect(() => {
    let cancelled = false;
    void getHanukkahConfig().then((config) => {
      if (cancelled) return;
      setLockAt(config.lockAt);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (lineItems.length === 0) return 'none';
  if (locked) return 'locked';
  if (!isAuthenticated) return 'guest';
  if (!canMutateBox) return 'needs_payment';
  return 'customize';
}
