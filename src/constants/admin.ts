/**
 * Pilot ops allowlist — keep short. Emails are compared lowercased.
 * Plus-aliases of these addresses (brendan+qa@…) count as admin so
 * visitor-playthrough accounts still open the CMS.
 * Keep firestore.rules `isAdmin()` in sync.
 */
export const ADMIN_EMAILS = [
  'brendan@unaffiliated.co',
  'joseph@unaffiliated.co',
  'maya@unaffiliated.co',
  'shameem@unaffiliated.co',
] as const;

/** Strip `+tag` so `local+qa@domain` matches `local@domain`. */
export function canonicalEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at <= 0) return normalized;
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  const plus = local.indexOf('+');
  const baseLocal = plus >= 0 ? local.slice(0, plus) : local;
  return `${baseLocal}@${domain}`;
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return (ADMIN_EMAILS as readonly string[]).includes(canonicalEmail(email));
}

/** Placeholder-domain QA sign-ups (test@test.com, a@a.com). Not admins. Keep in sync with adminDashboard `isTest`. */
const TEST_EMAIL_DOMAINS = ['a.com', 'test.com', 'example.com'];

export function isTestEmail(email?: string | null): boolean {
  if (!email) return false;
  const domain = email.trim().toLowerCase().split('@')[1];
  return domain != null && TEST_EMAIL_DOMAINS.includes(domain);
}

/**
 * Account → Ops. The signed-in address itself is on the allowlist.
 * Plus-aliases (joseph+test021@…) stay customers so a playthrough doesn't
 * see Catalog / Boxes / Promotions. Influencer stats are separate.
 */
export function isListedAdmin(user?: {
  email?: string | null;
  emails?: string[] | null;
} | null): boolean {
  if (!user) return false;
  const listed = (email?: string | null) =>
    !!email && (ADMIN_EMAILS as readonly string[]).includes(email.trim().toLowerCase());
  if (listed(user.email)) return true;
  return (user.emails ?? []).some((email) => listed(email));
}

/** True for allowlisted emails (any sign-in method / plus-alias) and in local __DEV__. */
export function isOpsAdmin(user?: {
  email?: string | null;
  emails?: string[] | null;
} | null): boolean {
  if (typeof __DEV__ !== 'undefined' && __DEV__) return true;
  if (!user) return false;
  if (isAdminEmail(user.email)) return true;
  return (user.emails ?? []).some((email) => isAdminEmail(email));
}
