import type { UserStatePreview } from '../../stores/userStatePreviewStore';
import { isHouseholdBoxFrozen } from '../../constants/hanukkahBoxLock';
import type { PilotOrder } from '../../types/pilot';

function isBoxLocked(lockAt: string | null, now: Date): boolean {
  if (!lockAt) return false;
  return now.getTime() >= new Date(lockAt).getTime();
}

/**
 * Stand-in open box order for admin “Signed in · locked” when the real household
 * has no paid box. Same shape the live path checks (`status` in the frozen set).
 */
export const PREVIEW_LOCKED_OPEN_ORDER: PilotOrder = {
  id: 'preview-locked-order',
  status: 'committed',
  lineItems: [],
  totalCents: 0,
  shippingAddress: {
    name: '',
    line1: '',
    city: '',
    stateProvince: '',
    postalCode: '',
    country: 'US',
  },
  lockAt: '2000-01-01T00:00:00.000Z',
};

/**
 * Whether box editing is seasonally locked.
 * Admin personas no longer force unlock — they use the same lock clock as live
 * (or the admin preview date). “Signed in · locked” still forces locked so that
 * persona stays a post-lock box holder even if you pin a pre-lock day by mistake.
 */
export function resolveEffectiveBoxLocked(
  preview: UserStatePreview | null,
  lockAt: string | null,
  now: Date,
  familyOpen: boolean
): boolean {
  if (preview === 'signed_in_locked') return true;
  if (familyOpen) return false;
  return isBoxLocked(lockAt, now);
}

/**
 * Seasonal lock, plus a household whose own box is already frozen.
 * Persona overlays use the same seasonal clock; they do not inherit the live
 * household’s freeze when simulating a different box state (except Live).
 */
export function resolveBoxEditingLocked(
  preview: UserStatePreview | null,
  seasonalLocked: boolean,
  openOrder: { status?: string | null; lockAt?: string | null } | null | undefined,
  now: Date
): boolean {
  if (preview === 'signed_in_locked') return true;
  if (preview) return seasonalLocked;
  return seasonalLocked || isHouseholdBoxFrozen(openOrder, now);
}

/** Payment-gate override: null = use real household; boolean = force. */
export function resolvePreviewCanMutateBox(
  preview: UserStatePreview | null,
  realCanMutate: boolean
): boolean {
  if (preview === 'signed_in_needs_payment') return false;
  if (
    preview === 'signed_in_box' ||
    preview === 'signed_in_locked' ||
    preview === 'signed_in_no_box'
  ) {
    return true;
  }
  if (preview === 'signed_out' || preview === 'signed_out_box') return false;
  return realCanMutate;
}

/**
 * Open Hanukkah box order under an admin persona.
 * Locked preview supplies a stand-in when the real household has no paid box,
 * so Orders chrome matches a real post-lock box holder.
 */
export function resolvePreviewOpenOrder(
  preview: UserStatePreview | null,
  realOpenOrder: PilotOrder | null
): PilotOrder | null {
  if (preview === 'signed_in_locked') return realOpenOrder ?? PREVIEW_LOCKED_OPEN_ORDER;
  if (
    preview === 'signed_out' ||
    preview === 'signed_out_box' ||
    preview === 'signed_in_no_box' ||
    preview === 'signed_in_needs_payment'
  ) {
    return null;
  }
  // signed_in_box: real order if any (secured customize); else draft-only path.
  return realOpenOrder;
}

/** Post-lock shop with a (real or preview) box order → Orders chrome, not cart. */
export function shopHasBoxOrder(
  mode: string,
  openOrder: { id?: string } | null | undefined
): boolean {
  return mode === 'shop' && !!openOrder;
}
