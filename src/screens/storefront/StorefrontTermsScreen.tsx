import React from 'react';
import { StorefrontLegalPage } from '../../components/storefront/StorefrontLegalPage';
import { TERMS_COPY } from '../../constants/storefrontTermsCopy';
import { usePublishRavSurface } from '../../hooks/usePublishRavSurface';

export function StorefrontTermsScreen() {
  usePublishRavSurface({ type: 'content', id: 'terms', label: 'Terms of Use and Sale' });
  return <StorefrontLegalPage copy={TERMS_COPY} />;
}
