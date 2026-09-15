/**
 * Given name for onboarding / family forms.
 * Google (and most OAuth) display names are "First Last" — we only want First.
 */
export function firstNameFromDisplayName(displayName?: string | null): string {
  const trimmed = displayName?.trim() ?? '';
  if (!trimmed) return '';
  const first = trimmed.split(/\s+/)[0] ?? '';
  return first.trim();
}
