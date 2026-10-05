import React from 'react';
import { StorefrontLegalPage } from '../../components/storefront/StorefrontLegalPage';
import { PRIVACY_COPY } from '../../constants/storefrontPrivacyCopy';
import { usePublishRavSurface } from '../../hooks/usePublishRavSurface';

export function StorefrontPrivacyScreen() {
  usePublishRavSurface({ type: 'content', id: 'privacy', label: 'Privacy Policy' });
  return <StorefrontLegalPage copy={PRIVACY_COPY} />;
}
