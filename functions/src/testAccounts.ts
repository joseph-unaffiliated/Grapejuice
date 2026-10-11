/**
 * Team and QA accounts by email only: @unaffiliated.co, placeholder domains, or Joseph's / Brendan's
 * addresses. Names don't count — the family form pre-filled "Joseph" for customers until Oct 8.
 */
/**
 * Automated test checkouts: `joseph+test-<purpose>@unaffiliated.co`. Their orders are
 * treated as visitor playthroughs (no stock allocation, no ShipStation export), so the
 * browser test flows can place orders without touching inventory. Narrower than isTest
 * on purpose: Joseph's own real orders must still ship.
 */
export function isPlaythroughTestEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return /^joseph\+test[-._+][^@\s]*@unaffiliated\.co$/i.test(email.trim());
}

export function isTest(...vals: Array<string | null | undefined>): boolean {
  return vals.some((v) => {
    if (!v || !v.includes('@')) return false;
    const s = v.toLowerCase();
    return /@unaffiliated?(\.co)?$/.test(s) || /@(a\.com|test\.com|example\.com)$/.test(s) || /joseph|jweissgold|brendan/.test(s);
  });
}
