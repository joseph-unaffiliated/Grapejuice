import type { GuestOnboardingStep } from '../stores/guestSessionStore';
import type { OnboardingPreviewStep } from '../stores/devPreviewStore';

export type OnboardingStep = GuestOnboardingStep;

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

  if (previewStep) return previewStep;
  if (revealOnly) return 'reveal';
  if (onboardingComplete && lineItemsCount > 0 && !boxRevealComplete) {
    return persistedStep === 'building' ? 'building' : 'reveal';
  }
  if (persistedStep && persistedStep !== 'reveal') return persistedStep;
  return 'hanukkah-intro';
}

export function onboardingErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong building your box. Please try again.';
}
