/**
 * Team and QA accounts by email only: @unaffiliated.co, placeholder domains, or Joseph's / Brendan's
 * addresses. Names don't count — the family form pre-filled "Joseph" for customers until Oct 8.
 */
export function isTest(...vals: Array<string | null | undefined>): boolean {
  return vals.some((v) => {
    if (!v || !v.includes('@')) return false;
    const s = v.toLowerCase();
    return /@unaffiliated?(\.co)?$/.test(s) || /@(a\.com|test\.com|example\.com)$/.test(s) || /joseph|jweissgold|brendan/.test(s);
  });
}
