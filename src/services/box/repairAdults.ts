/** Adults named in a family draft. Undefined when the draft has no adult rows. */
export function adultCountFromDrafts(
  drafts: ReadonlyArray<{ role?: unknown }> | undefined
): number | undefined {
  const n = (drafts ?? []).filter((d) => d.role === 'adult').length;
  return n > 0 ? n : undefined;
}

/**
 * Adult count for the dreidel repair. The family just saved wins. The count already
 * on screen can still be the previous household (more adults, fewer kids).
 */
export function adultsForBoxRepair(
  savedDrafts: ReadonlyArray<{ role?: unknown }> | undefined,
  screenAdults: number | undefined
): number | undefined {
  return adultCountFromDrafts(savedDrafts) ?? screenAdults;
}
