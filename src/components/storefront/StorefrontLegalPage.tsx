import React from 'react';
import {
  StorefrontArticlePage,
  type StorefrontArticleLeadSegment,
  type StorefrontArticleProseLine,
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
const EMAIL_RE = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/;

/** DOM id for a numbered section heading ("4. Your Rights…" → `section-4`). */
export function legalSectionAnchor(sectionNumber: number): string {
  return `section-${sectionNumber}`;
}

function anchorForHeading(heading?: string): string | undefined {
  const match = heading?.match(/^(\d+)\./);
  return match ? legalSectionAnchor(Number(match[1])) : undefined;
}

function linkifyEmails(line: StorefrontArticleProseLine): StorefrontArticleProseLine[] {
  const run = typeof line === 'string' ? { body: line } : line;
  if (run.href) return [line];
  // split() with a capture group puts the matched emails at odd indexes.
  const parts = run.body.split(EMAIL_RE);
  if (parts.length === 1) return [line];
  return parts
    .map((part, index) =>
      index % 2 === 1 ? { ...run, body: part, href: `mailto:${part}` } : { ...run, body: part }
    )
    .filter((part) => part.body.trim().length > 0);
}

function linkifyParagraph(paragraph: StorefrontArticleProseParagraph): StorefrontArticleProseParagraph {
  const lines = Array.isArray(paragraph) ? paragraph : [paragraph];
  const out = lines.flatMap((line) => linkifyEmails(line as StorefrontArticleProseLine));
  return out.length === 1 && !Array.isArray(paragraph) ? out[0] : out;
}

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
        body: section.body.map(linkifyParagraph),
        align: 'left' as const,
        anchorId: anchorForHeading(section.heading),
        paddingBottom: index === lastIndex ? PAGE_BOTTOM_PADDING : undefined,
      }))}
    />
  );
}
