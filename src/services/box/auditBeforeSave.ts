import type { BoxLineItem, ChildProfile } from '../../types/pilot';
import { peekCatalogItems } from '../firestore/catalog';
import { Sentry } from '../monitoring/sentry';
import { auditBoxSave } from './boxAuditOnSave';
import { auditProblemKey, type AuditCatalogRow } from './includedAudit';

const reportedAuditProblems = new Set<string>();

/**
 * Included-items audit on every save: customer-favor price fixes go into the saved lines, and
 * over-allowance problems this edit introduced go to Sentry once per box and problem.
 */
export function auditBeforeSave(
  base: BoxLineItem[],
  next: BoxLineItem[],
  scope: string,
  children: ChildProfile[],
  adults: number | undefined,
  wrapSelectedItemIds: string[],
  catalogRows?: AuditCatalogRow[]
): BoxLineItem[] {
  const catalog = catalogRows?.length ? catalogRows : peekCatalogItems();
  if (!catalog) return next;
  const result = auditBoxSave(base, next, catalog, { kidKeys: children.map((c) => c.id), adults }, { wrapSelectedItemIds });
  if (!result) return next;
  for (const problem of result.introduced) {
    const key = `${scope}|${auditProblemKey(problem)}`;
    if (reportedAuditProblems.has(key)) continue;
    reportedAuditProblems.add(key);
    Sentry.captureMessage(`Box over allowance: ${problem.detail}`, {
      level: 'warning',
      tags: { area: 'box-audit', code: problem.code, section: problem.section },
      extra: { problem, scope },
    });
  }
  if (result.healed.length) {
    Sentry.addBreadcrumb({
      category: 'box-audit',
      message: `Fixed in the customer's favor: ${result.healed.map((p) => p.detail).join('; ')}`,
    });
  }
  return result.lineItems;
}
