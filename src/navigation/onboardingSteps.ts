import type { GuestOnboardingStep } from '../stores/guestSessionStore';
import type { OnboardingPreviewStep } from '../stores/devPreviewStore';

export type OnboardingStep = GuestOnboardingStep;

/**
 * Secondary-bar progress for the Hanukkah box builder (replaces store category nav).
 * `building` is transitional and maps onto Notes while the loader runs.
 */
export const ONBOARDING_WIZARD_NAV_STEPS: ReadonlyArray<{
  id: Exclude<OnboardingStep, 'building' | 'practices' | 'children' | 'familiarity'>;
  label: string;
  /** Gold accent + opacity 1 — matches storefront “On Sale”. */
  navStyle?: 'default' | 'accent';
  separatorBefore?: boolean;
}> = [
  { id: 'hanukkah-intro', label: 'How it Works' },
  { id: 'box-intro', label: 'Your Family' },
  { id: 'child-interests', label: 'What We Do' },
  { id: 'rav-question', label: 'Notes' },
  {
    id: 'reveal',
    label: 'My Box',
    navStyle: 'accent',
    separatorBefore: true,
  },
];

export type OnboardingWizardNavStepId = (typeof ONBOARDING_WIZARD_NAV_STEPS)[number]['id'];

export function wizardNavStepId(step: OnboardingStep): OnboardingWizardNavStepId {
  if (step === 'building') return 'rav-question';
  // Practices → How it Works; Kids → Your Family; Familiarity → What We Do.
  if (step === 'practices') return 'hanukkah-intro';
  if (step === 'children') return 'box-intro';
  if (step === 'familiarity') return 'child-interests';
  return step;
}

export function wizardNavStepIndex(step: OnboardingStep): number {
  const id = wizardNavStepId(step);
  return ONBOARDING_WIZARD_NAV_STEPS.findIndex((s) => s.id === id);
}

export function resolveOnboardingStep(options: {
  revealOnly: boolean;
  previewStep?: OnboardingPreviewStep;
  persistedStep: GuestOnboardingStep | null;
  onboardingComplete: boolean;
  lineItemsCount: number;
  boxRevealComplete: boolean;
}): OnboardingStep {
  const { revealOnly, previewStep, persistedStep, onboardingComplete, lineItemsCount, boxRevealComplete } =
    options;

  if (previewStep) {
    if (previewStep === 'practices') return 'hanukkah-intro';
    if (previewStep === 'children') return 'box-intro';
    if (previewStep === 'familiarity') return 'child-interests';
    return previewStep;
  }
  if (revealOnly) return 'reveal';
  if (onboardingComplete && lineItemsCount > 0 && !boxRevealComplete) {
    return persistedStep === 'building' ? 'building' : 'reveal';
  }
  if (persistedStep === 'practices') return 'hanukkah-intro';
  if (persistedStep === 'children') return 'box-intro';
  if (persistedStep === 'familiarity') return 'child-interests';
  if (persistedStep && persistedStep !== 'reveal') return persistedStep;
  return 'hanukkah-intro';
}

export function onboardingErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong building your box. Please try again.';
}
