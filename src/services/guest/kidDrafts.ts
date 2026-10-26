import type { ChildDraft } from '../../components/family/familyDraft';

/** Kids only — adult drafts must never enter `users/{uid}/children` or guest-N remap. */
export function kidDraftsOnly(drafts: ChildDraft[]): ChildDraft[] {
  return drafts.filter((c) => c.role !== 'adult');
}
