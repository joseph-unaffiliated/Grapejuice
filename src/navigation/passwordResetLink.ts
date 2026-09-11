import { Platform } from 'react-native';
import { getBootLocation } from './bootLocation';
import { PASSWORD_RESET_PATH } from '../services/auth/auth';
import { useAuthFlowStore } from '../stores/authFlowStore';

export const PASSWORD_RESET_PATHS = [PASSWORD_RESET_PATH, '/reset-password'] as const;

export type PasswordResetLink = {
  oobCode: string;
  mode: 'resetPassword';
};

function parsePasswordResetSearch(search: string): PasswordResetLink | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const mode = params.get('mode');
  const oobCode = params.get('oobCode')?.trim();
  if (!oobCode) return null;
  // Firebase always sends mode=resetPassword; accept missing mode on /reset-password.
  if (mode && mode !== 'resetPassword') return null;
  return { oobCode, mode: 'resetPassword' };
}

/** True when the path is our branded password-reset handler. */
export function isPasswordResetPath(pathname: string): boolean {
  const path = pathname.replace(/\/$/, '') || '/';
  return (PASSWORD_RESET_PATHS as readonly string[]).includes(path);
}

/**
 * Read a Firebase email-action reset link from the address bar.
 * Prefer the boot snapshot so later `/store` rewrites don’t drop the oobCode.
 */
export function readPasswordResetFromWindow(): PasswordResetLink | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const boot = getBootLocation();
  const pathname = (boot?.pathname ?? window.location.pathname).replace(/\/$/, '') || '/';
  const search = boot?.search ?? window.location.search;
  if (
    !isPasswordResetPath(pathname) &&
    pathname !== '/__/auth/action' &&
    !(search.includes('oobCode=') && search.includes('mode=resetPassword'))
  ) {
    return null;
  }
  return parsePasswordResetSearch(search);
}

/** Capture email-link oobCode before the first RootRoutes gate decision. */
export function hydratePasswordResetFromBoot(): void {
  if (Platform.OS !== 'web') return;
  const link = readPasswordResetFromWindow();
  if (!link) return;
  if (useAuthFlowStore.getState().passwordResetOobCode) return;
  useAuthFlowStore.getState().beginPasswordReset(link.oobCode);
}
