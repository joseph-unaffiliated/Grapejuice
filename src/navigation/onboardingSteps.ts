import type { GuestOnboardingStep } from '../stores/guestSessionStore';
import type { OnboardingPreviewStep } from '../stores/devPreviewStore';

/** Screens the box builder can show. Legacy persisted ids normalize onto these. */
export type OnboardingStep = 'family' | 'details' | 'email' | 'building' | 'reveal';

/** Map any persisted / preview id (including retired screens) onto a current step. */
export function normalizeOnboardingStep(step: GuestOnboardingStep): OnboardingStep {
  switch (step) {
    case 'hanukkah-intro':
    case 'practices':
    case 'box-intro':
    case 'children':
      return 'family';
    case 'child-interests':
    case 'familiarity':
    case 'rav-question':
      return 'details';
    default:
      return step;
  }
}

/**
 * Secondary-bar progress for the Hanukkah box builder (replaces store category nav).
 * `email` and `building` are transitional and map onto What We Do.
 */
export const ONBOARDING_WIZARD_NAV_STEPS: ReadonlyArray<{
  id: Exclude<OnboardingStep, 'building' | 'email'>;
  label: string;
  /** Gold accent + opacity 1 — matches storefront “On Sale”. */
  navStyle?: 'default' | 'accent';
  separatorBefore?: boolean;
}> = [
  { id: 'family', label: 'Your Family' },
  { id: 'details', label: 'What We Do' },
  {
    id: 'reveal',
    label: 'My Box',
    navStyle: 'accent',
    separatorBefore: true,
  },
];

export type OnboardingWizardNavStepId = (typeof ONBOARDING_WIZARD_NAV_STEPS)[number]['id'];

export function wizardNavStepId(step: OnboardingStep): OnboardingWizardNavStepId {
  if (step === 'building' || step === 'email') return 'details';
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

  if (previewStep) return normalizeOnboardingStep(previewStep);
  if (revealOnly) return 'reveal';
  const persisted = persistedStep ? normalizeOnboardingStep(persistedStep) : null;
  if (onboardingComplete && lineItemsCount > 0 && !boxRevealComplete) {
    // Built but not revealed: guests are still behind the email gate. Signed-in users
    // land here too and OnboardingStack forwards them straight to the reveal.
    return 'email';
  }
  if (persisted && persisted !== 'reveal' && persisted !== 'email') return persisted;
  return 'family';
}

export function onboardingErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong building your box. Please try again.';
}
