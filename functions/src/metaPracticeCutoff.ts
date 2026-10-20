/**
 * Broad campaigns optimize on BoxBuilt. The admin "low practice" filter and the Pilot
 * Participants auto-invite use this same line. Follow-up membership does NOT — the follow-up
 * audience includes builders at every practice level. The score is never a Meta parameter.
 * Keep in sync with src/services/analytics/metaServerEvents.ts (client mirror) and the filter in
 * src/screens/admin/AdminBoxesScreen.tsx.
 *
 * Both sliders default to 50 when nobody touches them, so a practice score of exactly 50 is
 * ambiguous — it could be a real answer or an untouched default. The Hanukkah slider (almost
 * always moved, since most people do at least a little Hanukkah) breaks the tie:
 *   - Jewish practice 50 AND Hanukkah 50 (neither moved) — ambiguous, don't count it.
 *   - Jewish practice 50 and Hanukkah under 60 — count it (low practice).
 *   - Jewish practice 50 and Hanukkah 60 or above — don't count it.
 * Any other practice score at or under the cutoff counts on its own, regardless of Hanukkah.
 */
export const META_BOX_BUILT_MAX_PRACTICE = 59;

function toScore(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function scoreQualifies(practice: number, familiarity: number | null): boolean {
  if (practice > META_BOX_BUILT_MAX_PRACTICE) return false;
  if (practice === 50) {
    const hanukkah = familiarity ?? 50; // missing Hanukkah reads as its own untouched default
    if (hanukkah === 50) return false; // both untouched — ambiguous, ignore the record
    return hanukkah < 60;
  }
  return true;
}

/** Low practice (or ambiguous-excluded) by the rule above, for one reported (practice, Hanukkah) pair. */
export function practiceQualifies(practiceRaw: unknown, familiarityRaw?: unknown): boolean {
  const practice = toScore(practiceRaw);
  return practice != null && scoreQualifies(practice, toScore(familiarityRaw));
}

/**
 * True when BoxBuilt (Meta) should be withheld for this score pair. A missing practice score
 * never withholds — an unscored box still fires BoxBuilt.
 */
export function practiceAboveMetaCutoff(practiceRaw: unknown, familiarityRaw?: unknown): boolean {
  const practice = toScore(practiceRaw);
  if (practice == null) return false;
  return !scoreQualifies(practice, toScore(familiarityRaw));
}

