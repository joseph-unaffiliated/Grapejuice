/**
 * Pure rules for the mobile layouts switch. No React, no Firestore, so they can be
 * tested directly. The hook in useMobileLayout.ts feeds them live values.
 *
 * The new mobile screens show when all of these hold:
 *   - the viewport is phone width (useLayoutBreakpoint().isCompact)
 *   - config/mobile.enabled is true (the kill switch), unless `?mbx=new` forces it
 *   - the session isn't forced to the old layout with `?mbx=control`
 */
export type MobileOverride = 'new' | 'control' | null;

export const MOBILE_OVERRIDE_QUERY = 'mbx';
export const MOBILE_OVERRIDE_STORAGE_KEY = 'gj.mbx';

export function parseMobileOverride(value: string | null | undefined): MobileOverride {
  if (value === 'new' || value === 'control') return value;
  return null;
}

export function resolveMobileLayout(input: {
  isCompact: boolean;
  enabled: boolean | null;
  override: MobileOverride;
}): boolean {
  if (!input.isCompact) return false;
  if (input.override === 'control') return false;
  if (input.override === 'new') return true;
  return input.enabled === true;
}

/** The value sent with analytics so sessions can be split by layout. */
export function mobileLayoutTag(isNew: boolean): 'new' | 'control' {
  return isNew ? 'new' : 'control';
}
