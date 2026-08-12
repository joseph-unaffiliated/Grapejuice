/** Onboarding interest tags — drives story/gift/craft picks. */

export type ChildInterestId =
  | 'reading'
  | 'crafts'
  | 'games'
  | 'cooking'
  | 'building'
  | 'drawing'
  | 'singing'
  | 'dancing'
  | 'cuddling';

export const CHILD_INTEREST_OPTIONS: { id: ChildInterestId; label: string }[] = [
  { id: 'building', label: 'Building' },
  { id: 'cooking', label: 'Cooking' },
  { id: 'drawing', label: 'Drawing' },
  { id: 'singing', label: 'Singing' },
  { id: 'reading', label: 'Reading' },
  { id: 'dancing', label: 'Dancing' },
  { id: 'cuddling', label: 'Cuddling' },
  { id: 'crafts', label: 'Crafts' },
  { id: 'games', label: 'Games' },
];
