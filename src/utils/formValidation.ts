import type { ShippingAddress } from '../types/pilot';
import { checkUsAddressFormat, normalizeUsState, normalizeUsZip } from './usAddress';

/** Trimmed, with the state as its 2-letter code and the ZIP formatted — what we store and ship to. */
export function normalizeShippingAddress(address: ShippingAddress): ShippingAddress {
  const state = address.stateProvince.trim();
  const zip = address.postalCode.trim();
  return {
    ...address,
    name: address.name.trim(),
    line1: address.line1.trim(),
    line2: address.line2?.trim() || undefined,
    city: address.city.trim(),
    stateProvince: normalizeUsState(state) ?? state,
    postalCode: normalizeUsZip(zip) ?? zip,
    country: 'US',
  };
}

/** Required shipping fields (line2 is optional). */
export type ShippingRequiredField = 'name' | 'line1' | 'city' | 'stateProvince' | 'postalCode';

export type ShippingAddressFieldErrors = Partial<Record<ShippingRequiredField, string>>;

export type ShippingAddressValidation = {
  ok: boolean;
  message: string | null;
  fields: ShippingAddressFieldErrors;
};

/**
 * Plausible email: local@domain.tld with at least one dot in the domain.
 * Not a deliverability check — format only.
 */
export function isValidEmail(raw: string): boolean {
  const email = raw.trim();
  if (!email || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

const REQUIRED_SHIPPING: { key: ShippingRequiredField; label: string }[] = [
  { key: 'name', label: 'Full name' },
  { key: 'line1', label: 'Address line 1' },
  { key: 'city', label: 'City' },
  { key: 'stateProvince', label: 'State' },
  { key: 'postalCode', label: 'Zip code' },
];

export function validateShippingAddress(address: ShippingAddress): ShippingAddressValidation {
  const fields: ShippingAddressFieldErrors = {};
  for (const { key } of REQUIRED_SHIPPING) {
    const value = (address[key] ?? '').trim();
    if (!value) fields[key] = 'Required';
  }
  const missing = REQUIRED_SHIPPING.filter((f) => fields[f.key]).map((f) => f.label);
  if (missing.length === 0) {
    const format = checkUsAddressFormat(address);
    if (!format.ok) {
      return { ok: false, message: format.message, fields: { [format.field]: format.message } };
    }
    return { ok: true, message: null, fields: {} };
  }
  if (missing.length === 1) {
    return {
      ok: false,
      message: `Please enter ${missing[0].toLowerCase()}.`,
      fields,
    };
  }
  return {
    ok: false,
    message: 'Please fill in all required address fields.',
    fields,
  };
}
