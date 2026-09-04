import type { ShippingAddress } from '../types/pilot';

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
  { key: 'stateProvince', label: 'State / Province' },
  { key: 'postalCode', label: 'Postal code' },
];

export function validateShippingAddress(address: ShippingAddress): ShippingAddressValidation {
  const fields: ShippingAddressFieldErrors = {};
  for (const { key } of REQUIRED_SHIPPING) {
    const value = (address[key] ?? '').trim();
    if (!value) fields[key] = 'Required';
  }
  const missing = REQUIRED_SHIPPING.filter((f) => fields[f.key]).map((f) => f.label);
  if (missing.length === 0) {
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
