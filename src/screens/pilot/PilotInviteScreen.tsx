import React from 'react';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { useMobileLayout } from '../../hooks/useMobileLayout';
import { usePilotInvite } from './usePilotInvite';
import { PilotInviteDesktop } from './PilotInviteDesktop';
import { PilotInviteMobile } from './PilotInviteMobile';

/** `/pilot/<token>`: invite-only Pilot Participants sign-up. Private, never linked from the site. */
export function PilotInviteScreen() {
  const mobile = useMobileLayout();
  const s = usePilotInvite();
  if (!mobile) return <PilotInviteDesktop s={s} />;
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav hideSearchAndRav fillChromeHidden>
      <PilotInviteMobile s={s} />
    </StorefrontChrome>
  );
}
