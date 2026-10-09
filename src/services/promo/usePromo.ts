import { useCallback, useEffect, useState } from 'react';
import { bestDiscount, type PromoTerms } from './promoPricing';
import {
  checkPromo,
  promoForServer,
  setStoredCode,
  storedCode,
  storedRef,
  subscribePromo,
  type PromoRequest,
} from './promoSession';

type AppliedCode = { code: string; label: string; terms: PromoTerms };
type Influencer = { slug: string; name: string; label: string; terms: PromoTerms };

export type PromoState = {
  discountCents: number;
  /** Order-summary row label, e.g. "Code SAVE10" or "Maya's offer". */
  discountLabel: string;
  code: AppliedCode | null;
  influencer: Influencer | null;
  codeError: string | null;
  checking: boolean;
  applyCode: (text: string) => Promise<boolean>;
  removeCode: () => void;
  /** Send with the checkout callable. */
  request: () => PromoRequest | undefined;
};

function termsOf(t: Partial<PromoTerms>): PromoTerms {
  return { percentOff: t.percentOff ?? null, amountOffCents: t.amountOffCents ?? null };
}

function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : '';
  if (/resource-exhausted|too many/i.test(msg)) return 'Too many tries. Wait a bit and try again.';
  return 'Couldn’t check that code. Try again.';
}

/** Discount preview for a checkout. `eligibleCents` is the merchandise subtotal (no shipping/tax). */
export function usePromo(eligibleCents: number): PromoState {
  const [code, setCode] = useState<AppliedCode | null>(null);
  const [influencer, setInfluencer] = useState<Influencer | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  // The landing capture can store a ref after first render.
  const [refSlug, setRefSlug] = useState(() => storedRef()?.slug ?? null);

  useEffect(() => subscribePromo(() => setRefSlug(storedRef()?.slug ?? null)), []);

  useEffect(() => {
    const saved = storedCode();
    const ref = storedRef();
    if (!saved && !ref) return;
    let cancelled = false;
    checkPromo({ ...(saved ? { code: saved } : {}), ...(ref ? { ref: ref.slug, refAt: ref.at } : {}) })
      .then((res) => {
        if (cancelled) return;
        setInfluencer(res.influencer ? { ...res.influencer, terms: termsOf(res.influencer) } : null);
        if (res.code?.ok) {
          setCode({ code: res.code.code, label: res.code.label, terms: termsOf(res.code) });
          setCodeError(null);
        } else if (res.code) {
          setStoredCode(null);
          setCode(null);
          setCodeError(res.code.message);
        }
      })
      .catch(() => {
        /* checkout still validates server-side */
      });
    return () => {
      cancelled = true;
    };
  }, [refSlug]);

  const applyCode = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    setChecking(true);
    setCodeError(null);
    try {
      const res = await checkPromo({ code: trimmed });
      if (res.code?.ok) {
        setStoredCode(res.code.code);
        setCode({ code: res.code.code, label: res.code.label, terms: termsOf(res.code) });
        return true;
      }
      setCodeError(res.code && !res.code.ok ? res.code.message : 'We don’t recognize that code.');
      return false;
    } catch (err) {
      setCodeError(errorMessage(err));
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  const removeCode = useCallback(() => {
    setStoredCode(null);
    setCode(null);
    setCodeError(null);
  }, []);

  const best = bestDiscount(eligibleCents, code?.terms ?? null, influencer?.terms ?? null);
  const discountLabel =
    best.source === 'code' && code
      ? `Code ${code.code}`
      : best.source === 'influencer' && influencer
        ? `${influencer.name}’s offer`
        : 'Discount';

  return {
    discountCents: best.discountCents,
    discountLabel,
    code,
    influencer,
    codeError,
    checking,
    applyCode,
    removeCode,
    request: promoForServer,
  };
}
