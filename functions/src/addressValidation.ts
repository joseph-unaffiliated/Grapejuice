import * as logger from './logger';
import { onCall } from './sentry';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { requestIp } from './geo';
import { hitRateLimit } from './loginLinks';
import { checkUsAddressFormat, NON_US_SHIPPING_MESSAGE, normalizeUsState } from './usAddress';

/**
 * Deliverability check for shipping addresses (Google Address Validation API, USPS CASS on).
 * The client calls this on Continue; any outage or missing key returns `unavailable` and the
 * format check alone decides. Roughly $0.017 per call, so calls are rate-limited per IP.
 */

const addressValidationKey = defineSecret('GOOGLE_ADDRESS_VALIDATION_KEY');

const ENDPOINT = 'https://addressvalidation.googleapis.com/v1:validateAddress';
const TIMEOUT_MS = 5000;
const IP_LIMIT_PER_WINDOW = 40;

export const ADDRESS_NOT_FOUND_MESSAGE = "We couldn't find that address. Please double-check it.";

type SuggestedAddress = {
  line1: string;
  line2?: string;
  city: string;
  stateProvince: string;
  postalCode: string;
};

export type AddressValidationResult =
  | { status: 'ok' }
  | { status: 'unavailable' }
  | { status: 'non_us' | 'invalid'; message: string; field?: 'stateProvince' | 'postalCode' | 'line1' }
  | { status: 'suggest'; suggestion: SuggestedAddress };

type GoogleComponent = {
  componentType?: string;
  spellCorrected?: boolean;
  replaced?: boolean;
  unexpected?: boolean;
};

type GoogleResponse = {
  result?: {
    verdict?: {
      validationGranularity?: string;
      addressComplete?: boolean;
      hasUnconfirmedComponents?: boolean;
      possibleNextAction?: string;
    };
    address?: {
      postalAddress?: {
        regionCode?: string;
        postalCode?: string;
        administrativeArea?: string;
        locality?: string;
        addressLines?: string[];
      };
      addressComponents?: GoogleComponent[];
    };
    uspsData?: {
      dpvConfirmation?: string;
    };
  };
};

function str(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

const PREMISE_GRANULARITY = new Set(['PREMISE', 'SUB_PREMISE']);
const MEANINGFUL_COMPONENTS = new Set([
  'route',
  'street_number',
  'locality',
  'postal_code',
  'administrative_area_level_1',
]);

function comparable(v: string | undefined): string {
  return (v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const STREET_ABBREVIATIONS: Record<string, string> = {
  AVENUE: 'AVE',
  STREET: 'ST',
  ROAD: 'RD',
  BOULEVARD: 'BLVD',
  DRIVE: 'DR',
  LANE: 'LN',
  COURT: 'CT',
  PLACE: 'PL',
  PARKWAY: 'PKWY',
  HIGHWAY: 'HWY',
  TERRACE: 'TER',
  CIRCLE: 'CIR',
  SQUARE: 'SQ',
  TRAIL: 'TRL',
  APARTMENT: 'APT',
  SUITE: 'STE',
  NORTH: 'N',
  SOUTH: 'S',
  EAST: 'E',
  WEST: 'W',
  NORTHEAST: 'NE',
  NORTHWEST: 'NW',
  SOUTHEAST: 'SE',
  SOUTHWEST: 'SW',
};

/** Street line compared word by word with USPS abbreviations, so "Avenue" vs "Ave" isn't a change. */
function comparableStreet(v: string | undefined): string {
  return (v ?? '')
    .toUpperCase()
    .replace(/[.,#]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => STREET_ABBREVIATIONS[w] ?? w)
    .join(' ');
}

/** Pure interpretation of the API response (exported for tests). */
export function interpretValidation(
  input: { line1: string; line2?: string; city: string; stateCode: string; zip: string },
  body: GoogleResponse
): AddressValidationResult {
  const result = body.result;
  const postal = result?.address?.postalAddress;
  if (!result || !postal) return { status: 'unavailable' };

  if (postal.regionCode && postal.regionCode !== 'US') {
    return { status: 'non_us', message: NON_US_SHIPPING_MESSAGE, field: 'stateProvince' };
  }
  const suggestedState = normalizeUsState(postal.administrativeArea ?? '');
  if (postal.administrativeArea && !suggestedState) {
    return { status: 'non_us', message: NON_US_SHIPPING_MESSAGE, field: 'stateProvince' };
  }

  const verdict = result.verdict ?? {};
  const dpv = result.uspsData?.dpvConfirmation;
  const premiseConfirmed = PREMISE_GRANULARITY.has(verdict.validationGranularity ?? '');
  const deliverable =
    dpv === 'Y' ||
    dpv === 'S' ||
    dpv === 'D' ||
    (premiseConfirmed &&
      (verdict.addressComplete === true || verdict.possibleNextAction === 'CONFIRM_ADD_SUBPREMISES'));
  if (!deliverable || verdict.possibleNextAction === 'FIX') {
    return { status: 'invalid', message: ADDRESS_NOT_FOUND_MESSAGE, field: 'line1' };
  }

  const lines = postal.addressLines ?? [];
  const line1 = lines[0] ?? input.line1;
  const line2FoldedIn = !!input.line2 && comparable(line1).endsWith(comparable(input.line2));
  const keptLine2 = lines[1] ?? (line2FoldedIn ? undefined : input.line2);
  const suggestion: SuggestedAddress = {
    line1,
    ...(keptLine2 ? { line2: keptLine2 } : {}),
    city: postal.locality ?? input.city,
    stateProvince: suggestedState ?? input.stateCode,
    postalCode: (postal.postalCode ?? input.zip).slice(0, 5),
  };

  const corrected = (result.address?.addressComponents ?? []).some(
    (c) => (c.spellCorrected || c.replaced) && MEANINGFUL_COMPONENTS.has(c.componentType ?? '')
  );
  const streetDiffers =
    comparableStreet(line1) !== comparableStreet(input.line1) &&
    comparableStreet(lines.join(' ')) !== comparableStreet([input.line1, input.line2].filter(Boolean).join(' '));
  const differs =
    streetDiffers ||
    comparable(suggestion.city) !== comparable(input.city) ||
    suggestion.stateProvince !== input.stateCode ||
    suggestion.postalCode !== input.zip.slice(0, 5);
  if (corrected || differs) return { status: 'suggest', suggestion };
  return { status: 'ok' };
}

export const validateShippingAddress = onCall(
  { secrets: [addressValidationKey], maxInstances: 10 },
  async (request): Promise<AddressValidationResult> => {
    const data = (request.data ?? {}) as Record<string, unknown>;
    const line1 = str(data.line1);
    const line2 = str(data.line2);
    const city = str(data.city, 100);
    const stateProvince = str(data.stateProvince, 60);
    const postalCode = str(data.postalCode, 20);
    const country = str(data.country, 10) || 'US';

    if (!line1 || !city || !stateProvince || !postalCode) {
      return { status: 'invalid', message: 'Please complete the address.' };
    }
    const format = checkUsAddressFormat({ line1, city, stateProvince, postalCode, country });
    if (!format.ok) {
      return {
        status: format.message === NON_US_SHIPPING_MESSAGE ? 'non_us' : 'invalid',
        message: format.message,
        field: format.field,
      };
    }

    let key = '';
    try {
      key = addressValidationKey.value();
    } catch {
      key = '';
    }
    if (!key) return { status: 'unavailable' };

    const ip = requestIp(request.rawRequest);
    if (ip) {
      try {
        if (await hitRateLimit(getFirestore(), `addr:${ip}`, IP_LIMIT_PER_WINDOW, Date.now())) {
          return { status: 'unavailable' };
        }
      } catch (err) {
        logger.warn('validateShippingAddress rate limit check failed', { err: String(err) });
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          address: {
            regionCode: 'US',
            addressLines: line2 ? [line1, line2] : [line1],
            locality: city,
            administrativeArea: format.stateCode,
            postalCode: format.zip,
          },
          enableUspsCass: true,
        }),
      });
      if (!res.ok) {
        logger.warn('validateShippingAddress API error', { status: res.status });
        return { status: 'unavailable' };
      }
      const body = (await res.json()) as GoogleResponse;
      return interpretValidation(
        { line1, line2: line2 || undefined, city, stateCode: format.stateCode, zip: format.zip },
        body
      );
    } catch (err) {
      logger.warn('validateShippingAddress failed', { err: String(err) });
      return { status: 'unavailable' };
    } finally {
      clearTimeout(timer);
    }
  }
);
