import React from 'react';
import {
  StorefrontArticlePage,
  type StorefrontArticleLeadSegment,
  type StorefrontArticleProseParagraph,
} from './StorefrontArticlePage';

export type LegalPageSection = {
  heading?: string;
  body: readonly StorefrontArticleProseParagraph[];
};

export type LegalPageCopy = {
  eyebrow: string;
  title: string;
  /** Hero lead; nested arrays are inline weighted runs (flattened to plain text). */
  lead: readonly StorefrontArticleProseParagraph[];
  sections: readonly LegalPageSection[];
};

const PAGE_BOTTOM_PADDING = 120;

function leadSegments(lead: LegalPageCopy['lead']): StorefrontArticleLeadSegment[] {
  return lead.map((paragraph) => {
    const lines = Array.isArray(paragraph) ? paragraph : [paragraph];
    return lines.map((line) => (typeof line === 'string' ? line : line.body)).join('');
  });
}

/** Long-form legal page (privacy, terms): left-aligned prose, no promo strips. */
export function StorefrontLegalPage({ copy }: { copy: LegalPageCopy }) {
  const lastIndex = copy.sections.length - 1;
  return (
    <StorefrontArticlePage
      eyebrow={copy.eyebrow}
      title={copy.title}
      lead={leadSegments(copy.lead)}
      showFooterStrips={false}
      blocks={copy.sections.map((section, index) => ({
        type: 'prose' as const,
        heading: section.heading,
        body: section.body,
        align: 'left' as const,
        paddingBottom: index === lastIndex ? PAGE_BOTTOM_PADDING : undefined,
      }))}
    />
  );
}
