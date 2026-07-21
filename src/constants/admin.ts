/**
 * Pilot ops allowlist — keep short. Emails are compared lowercased.
 * Add teammates here when they need catalog admin access.
 */
export const ADMIN_EMAILS = ['brendan@unaffiliated.co', 'joseph@unaffiliated.co'] as const;

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return (ADMIN_EMAILS as readonly string[]).includes(normalized);
}
