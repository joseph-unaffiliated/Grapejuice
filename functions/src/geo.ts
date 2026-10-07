import { FieldValue } from 'firebase-admin/firestore';

/**
 * Approximate visitor region from the caller's IP, for the admin dashboard's "what state are people
 * from". Only country + region are stored; the IP itself is never written anywhere.
 *
 * geoip-lite holds its database in memory (~110 MB), so it is loaded on first lookup rather than at
 * import — every function in this codebase imports index.ts, and only the callers below need it.
 * Functions that call `geoFromRequest` should run with at least 512MiB.
 */

export type IpGeo = { country: string; region: string | null };

type GeoipLite = { lookup: (ip: string) => { country?: string; region?: string } | null };
let geoip: GeoipLite | null = null;

function lookup(ip: string): IpGeo | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    geoip ??= require('geoip-lite') as GeoipLite;
    const r = geoip.lookup(ip);
    if (!r?.country) return null;
    return { country: r.country, region: r.region ? r.region : null };
  } catch {
    return null;
  }
}

type RequestLike = { headers?: Record<string, string | string[] | undefined>; ip?: string };

export function requestIp(raw: unknown): string | null {
  const req = (raw ?? {}) as RequestLike;
  const forwarded = req.headers?.['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  const ip = first || req.ip;
  return ip ? ip.replace(/^::ffff:/, '') : null;
}

export function geoFromRequest(raw: unknown): IpGeo | null {
  const ip = requestIp(raw);
  return ip ? lookup(ip) : null;
}

/** Firestore value for `ipGeo` on users/{uid} and guestSessions/{visitorId}. */
export function ipGeoField(geo: IpGeo) {
  return { country: geo.country, region: geo.region, at: FieldValue.serverTimestamp() };
}
