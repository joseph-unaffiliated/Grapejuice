import { useEffect, useRef } from 'react';
import { useAuthFlowStore } from '../stores/authFlowStore';
import { readPasswordResetFromWindow } from './passwordResetLink';

/**
 * Web: `/auth/action?mode=resetPassword&oobCode=…` (Firebase email link)
 * → branded ResetPasswordConfirm on the Auth stack.
 */
export function PasswordResetLinkEffect() {
  const beginPasswordReset = useAuthFlowStore((s) => s.beginPasswordReset);
  const consumed = useRef(false);

  useEffect(() => {
    if (consumed.current) return;
    const link = readPasswordResetFromWindow();
    if (!link) return;
    consumed.current = true;
    beginPasswordReset(link.oobCode);
  }, [beginPasswordReset]);

  return null;
}
