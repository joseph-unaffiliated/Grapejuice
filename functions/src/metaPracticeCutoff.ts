/**
 * Broad campaigns optimize on BoxBuilt. Follow-up membership uses the same line.
 * The score is never a Meta parameter. Keep in sync with
 * src/services/analytics/metaServerEvents.ts.
 */
export const META_BOX_BUILT_MAX_PRACTICE = 49;

export function practiceAboveMetaCutoff(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > META_BOX_BUILT_MAX_PRACTICE;
}

/** At least one numeric score, and every one of them at or under the cutoff. */
export function practiceEligibleForFollowUp(...values: unknown[]): boolean {
  const scores = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return scores.length > 0 && scores.every((n) => n <= META_BOX_BUILT_MAX_PRACTICE);
}
