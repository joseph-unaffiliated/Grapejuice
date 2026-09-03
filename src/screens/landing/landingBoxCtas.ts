import type { LandingCta, LandingSection } from '../../constants/landingAudiences';
import type { OwnBoxStep } from '../../hooks/useOwnBoxStep';

/**
 * Replacement copy for a `start_box` CTA once the visitor's box exists.
 * `null` keeps the configured acquisition label.
 *
 * Wording tracks StorefrontHero so the same state reads the same everywhere.
 */
export function ownBoxCtaLabel(step: OwnBoxStep): string | null {
  switch (step) {
    case 'guest':
      return 'View your box';
    case 'needs_payment':
      return 'Add payment to secure your box';
    case 'customize':
      return 'Customize your box';
    case 'locked':
      return 'View your box';
    default:
      return null;
  }
}

/**
 * Re-label the "build your box" CTAs on a landing page for someone whose box is
 * already in progress.
 *
 * Gift CTAs are left exactly as configured: whether you've started your own box
 * says nothing about whether you want to send someone a gift.
 */
export function applyOwnBoxCtaCopy(
  sections: LandingSection[],
  step: OwnBoxStep
): LandingSection[] {
  const label = ownBoxCtaLabel(step);
  if (!label) return sections;

  const relabel = (cta: LandingCta): LandingCta =>
    cta.action.type === 'start_box' ? { ...cta, label } : cta;

  return sections.map((section) => {
    switch (section.type) {
      case 'hero':
        return { ...section, ctas: section.ctas.map(relabel) };
      case 'cta_row':
        return { ...section, ctas: section.ctas.map(relabel) };
      case 'story':
        return section.cta ? { ...section, cta: relabel(section.cta) } : section;
      default:
        return section;
    }
  });
}
