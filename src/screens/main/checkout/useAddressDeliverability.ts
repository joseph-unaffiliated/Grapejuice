import { useCallback, useRef, useState } from 'react';
import type { ShippingAddress } from '../../../types/pilot';
import {
  normalizeShippingAddress,
  type ShippingAddressFieldErrors,
} from '../../../utils/formValidation';
import {
  validateAddressRemote,
  type RemoteAddressCheck,
  type SuggestedAddress,
} from '../../../services/checkout/validateAddressRemote';

export type DeliverabilityVerdict =
  | { ok: true }
  | { ok: false; message: string | null; fields: ShippingAddressFieldErrors };

function fingerprint(address: ShippingAddress): string {
  const a = normalizeShippingAddress(address);
  return [a.line1, a.line2 ?? '', a.city, a.stateProvince, a.postalCode.slice(0, 5)]
    .map((v) => v.toUpperCase().replace(/\s+/g, ' '))
    .join('|');
}

/**
 * Runs the server deliverability check on Continue (after the local format check passes).
 * A suggested correction blocks once; pressing Continue again keeps what was typed.
 */
export function useAddressDeliverability(
  address: ShippingAddress,
  onChange: (patch: Partial<ShippingAddress>) => void
) {
  const [suggestion, setSuggestion] = useState<{ for: string; address: SuggestedAddress } | null>(null);
  const [checking, setChecking] = useState(false);
  const cache = useRef(new Map<string, RemoteAddressCheck>());
  const accepted = useRef(new Set<string>());

  const verify = useCallback(
    async (candidate: ShippingAddress = address): Promise<DeliverabilityVerdict> => {
      const key = fingerprint(candidate);
      if (accepted.current.has(key)) return { ok: true };
      let result = cache.current.get(key);
      if (!result) {
        setChecking(true);
        try {
          result = await validateAddressRemote(normalizeShippingAddress(candidate));
        } finally {
          setChecking(false);
        }
        if (result.status !== 'unavailable') cache.current.set(key, result);
      }
      switch (result.status) {
        case 'ok':
        case 'unavailable':
          accepted.current.add(key);
          setSuggestion(null);
          return { ok: true };
        case 'suggest':
          accepted.current.add(key);
          setSuggestion({ for: key, address: result.suggestion });
          return { ok: false, message: null, fields: {} };
        default:
          setSuggestion(null);
          return { ok: false, message: null, fields: { [result.field ?? 'line1']: result.message } };
      }
    },
    [address]
  );

  const acceptSuggestion = useCallback(() => {
    if (!suggestion) return;
    const next = suggestion.address;
    const patch: Partial<ShippingAddress> = {
      line1: next.line1,
      line2: next.line2 ?? address.line2,
      city: next.city,
      stateProvince: next.stateProvince,
      postalCode: next.postalCode,
      country: 'US',
    };
    accepted.current.add(fingerprint({ ...address, ...patch }));
    setSuggestion(null);
    onChange(patch);
  }, [suggestion, address, onChange]);

  const visible = suggestion && suggestion.for === fingerprint(address) ? suggestion.address : null;

  return {
    verify,
    checking,
    suggestion: visible,
    fieldsProps: { suggestion: visible, onUseSuggestion: acceptSuggestion },
  };
}
