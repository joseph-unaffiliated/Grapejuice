import type { BoxLineItem } from '../../types/pilot';
import {
  auditIncluded,
  auditKidKey,
  auditProblemKey,
  auditSlotBase,
  healIncludedInCustomerFavor,
  overProblems,
  type AuditCatalogRow,
  type AuditHousehold,
  type AuditOptions,
  type AuditProblem,
} from './includedAudit';

export type BoxSaveAudit = {
  /** Lines to save: the edit with customer-favor price fixes applied. */
  lineItems: BoxLineItem[];
  healed: AuditProblem[];
  /** Over-allowance problems this edit introduced (absent from the box it started from). */
  introduced: AuditProblem[];
};

/** Per-kid lines whose kid isn't in the household yet (kids still loading): auditing would misfire. */
function householdUnknown(lines: BoxLineItem[], household: AuditHousehold): boolean {
  const keys = new Set(household.kidKeys);
  return lines.some((li) => {
    const base = auditSlotBase(li.slotId);
    if (base !== 'story' && base !== 'gift') return false;
    const kid = auditKidKey(li);
    return !kid || !keys.has(kid);
  });
}

/** Audit a box edit before it is saved. Null when the household can't be audited yet. */
export function auditBoxSave(
  base: BoxLineItem[],
  next: BoxLineItem[],
  catalog: AuditCatalogRow[],
  household: AuditHousehold,
  opts: AuditOptions = {}
): BoxSaveAudit | null {
  if (!next.length || householdUnknown(next, household)) return null;
  const heal = healIncludedInCustomerFavor(next, catalog, household, opts);
  const before = new Set(overProblems(auditIncluded(base, catalog, household, opts)).map(auditProblemKey));
  const introduced = overProblems(heal.audit).filter((p) => !before.has(auditProblemKey(p)));
  return { lineItems: heal.lineItems, healed: heal.healed, introduced };
}
