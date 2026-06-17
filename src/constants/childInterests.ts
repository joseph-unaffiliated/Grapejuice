/** Onboarding interest tags (research panel Jun 10) — drives story/gift/craft picks. */

export type ChildInterestId = 'reading' | 'crafts' | 'games' | 'cooking';

export const CHILD_INTEREST_OPTIONS: { id: ChildInterestId; label: string }[] = [
  { id: 'reading', label: 'Reading & stories' },
  { id: 'crafts', label: 'Arts & crafts' },
  { id: 'games', label: 'Games & play' },
  { id: 'cooking', label: 'Cooking & food' },
];
