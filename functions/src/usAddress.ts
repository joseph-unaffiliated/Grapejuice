/**
 * U.S.-only shipping format rules. Mirror of src/utils/usAddress.ts — keep in sync.
 */

export const NON_US_SHIPPING_MESSAGE = 'Sorry. We currently can only ship in the U.S.';

/** 50 states + DC. */
export const US_STATES: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  DC: 'District of Columbia',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
};

const STATE_BY_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(US_STATES).map(([code, name]) => [name.toLowerCase(), code])
);
STATE_BY_NAME['washington dc'] = 'DC';
STATE_BY_NAME['washington d.c.'] = 'DC';
STATE_BY_NAME['d.c.'] = 'DC';

/** Canadian provinces / territories (codes and names) — the usual non-U.S. entry. */
const CANADIAN_REGIONS = new Set([
  'ab', 'bc', 'mb', 'nb', 'nl', 'ns', 'nt', 'nu', 'on', 'pe', 'qc', 'sk', 'yt',
  'alberta', 'british columbia', 'manitoba', 'new brunswick', 'newfoundland',
  'newfoundland and labrador', 'nova scotia', 'northwest territories', 'nunavut', 'ontario',
  'prince edward island', 'quebec', 'québec', 'saskatchewan', 'yukon',
]);

/** Territories and military mail aren't serviceable for boxes; treat as outside the U.S. */
const NON_STATE_US = new Set(['pr', 'gu', 'vi', 'as', 'mp', 'aa', 'ae', 'ap', 'puerto rico', 'guam']);

const US_ZIP_RE = /^\d{5}(-\d{4})?$/;
const CA_POSTAL_RE = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;
const UK_POSTAL_RE = /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/;

/** "New York" / "ny" / "N.Y." → "NY"; null when it isn't one of the 50 states or DC. */
export function normalizeUsState(raw: string): string | null {
  const v = raw.trim().replace(/\s+/g, ' ');
  if (!v) return null;
  const compact = v.replace(/\./g, '').toUpperCase();
  if (compact.length === 2 && US_STATES[compact]) return compact;
  return STATE_BY_NAME[v.toLowerCase()] ?? STATE_BY_NAME[v.toLowerCase().replace(/\./g, '')] ?? null;
}

/** 5-digit ZIP or ZIP+4 ("123456789" → "12345-6789"). Null when not a U.S. ZIP. */
export function normalizeUsZip(raw: string): string | null {
  const v = raw.trim();
  if (/^\d{9}$/.test(v)) return `${v.slice(0, 5)}-${v.slice(5)}`;
  return US_ZIP_RE.test(v) ? v : null;
}

export type UsAddressInput = {
  line1?: string;
  line2?: string;
  city?: string;
  stateProvince?: string;
  postalCode?: string;
  country?: string;
};

export type UsFormatResult =
  | { ok: true; stateCode: string; zip: string }
  | { ok: false; field: 'stateProvince' | 'postalCode'; message: string };

/** Format-only check (no network). Required-field checks happen before this. */
export function checkUsAddressFormat(address: UsAddressInput): UsFormatResult {
  const country = (address.country ?? 'US').trim().toUpperCase();
  const stateRaw = (address.stateProvince ?? '').trim();
  const zipRaw = (address.postalCode ?? '').trim();
  const stateKey = stateRaw.toLowerCase().replace(/\./g, '');

  if (country && country !== 'US' && country !== 'USA') {
    return { ok: false, field: 'stateProvince', message: NON_US_SHIPPING_MESSAGE };
  }
  if (CANADIAN_REGIONS.has(stateKey) || NON_STATE_US.has(stateKey)) {
    return { ok: false, field: 'stateProvince', message: NON_US_SHIPPING_MESSAGE };
  }
  if (CA_POSTAL_RE.test(zipRaw) || UK_POSTAL_RE.test(zipRaw) || /[A-Za-z]/.test(zipRaw)) {
    return { ok: false, field: 'postalCode', message: NON_US_SHIPPING_MESSAGE };
  }
  const stateCode = normalizeUsState(stateRaw);
  if (!stateCode) {
    return { ok: false, field: 'stateProvince', message: 'Enter a U.S. state, like NY.' };
  }
  const zip = normalizeUsZip(zipRaw);
  if (!zip) {
    return { ok: false, field: 'postalCode', message: 'Enter a 5-digit ZIP code.' };
  }
  return { ok: true, stateCode, zip };
}
