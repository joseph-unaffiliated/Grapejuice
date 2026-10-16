import type { BoxLineItem } from '../../types/pilot';
import { geltBagOf } from './includedAudit';

export type DietExclusions = {
  /** Kosher household: no food at all. */
  noFood: boolean;
  /** Gluten note: leave the sufganiyot kit out. Latkes stay. */
  noSufganiyot: boolean;
  /** No chocolate: no gelt. */
  noGelt: boolean;
};

function withoutNegatedKosher(text: string): string {
  return text
    .replace(/\bkosher-style\b/gi, '')
    .replace(/\b(?:not|non|isn't|isnt|aren't|arent)\b(?:\s+\w+){0,3}\s+kosher\b/gi, '');
}

/** What a household note asks us to leave out of the curated box. */
export function dietExclusionsFromNotes(notes: string | null | undefined): DietExclusions {
  const text = (notes ?? '').replace(/\s+/g, ' ').trim();
  const noFood = /\bkosher\b/i.test(withoutNegatedKosher(text));
  const noSufganiyot =
    noFood ||
    /\b(?:gluten[-\s]?free|no gluten|without gluten|zero gluten|celiac|coeliac|gluten[-\s]?(?:allergy|intoleran\w*)|allergic to gluten)\b/i.test(
      text
    ) ||
    /\b(?:can't|cannot|cant|don't|do not|won't|wont|avoid)\s+(?:have\s+|eat\s+|do\s+)?gluten\b/i.test(text);
  const noGelt =
    noFood ||
    /\b(?:no chocolate|chocolate[-\s]?free|without chocolate|chocolate allergy|allergic to chocolate)\b/i.test(text) ||
    /\b(?:can't|cannot|cant|don't|do not|won't|wont)\s+(?:have\s+|eat\s+)?chocolate\b/i.test(text);
  return { noFood, noSufganiyot, noGelt };
}

function slotBase(slotId: string): string {
  return slotId.replace(/::x$/i, '');
}

function hay(li: Pick<BoxLineItem, 'slotId' | 'itemId' | 'label'>): string {
  return `${slotBase(li.slotId)} ${li.itemId} ${li.label ?? ''}`.toLowerCase();
}

function isToyOrBook(h: string): boolean {
  return /stuffie|plush|\bbook\b|^book-/.test(h);
}

export function isSufganiyotLine(li: Pick<BoxLineItem, 'slotId' | 'itemId' | 'label'>): boolean {
  const item = `${li.itemId} ${li.label ?? ''}`.toLowerCase();
  return /sufgan/.test(item) && !isToyOrBook(item);
}

export function isLatkeFoodLine(li: Pick<BoxLineItem, 'slotId' | 'itemId' | 'label'>): boolean {
  const base = slotBase(li.slotId);
  const h = hay(li);
  if (isToyOrBook(h)) return false;
  if (base === 'latke-mix' || base === 'latke-kit' || base === 'applesauce') return true;
  return /latke[-\s]?(kit|mix)|applesauce/.test(h);
}

export function isGeltLine(li: Pick<BoxLineItem, 'slotId' | 'itemId' | 'label'>): boolean {
  if (geltBagOf(li.itemId, li.label ?? '') != null) return true;
  const base = slotBase(li.slotId);
  return base === 'gelt' || base.startsWith('gelt-');
}

/** Drop food the note rules out. Books and stuffies stay, even when they're named for a latke. */
export function applyDietNotes<T extends Pick<BoxLineItem, 'slotId' | 'itemId' | 'label'>>(
  lineItems: T[],
  notes: string | null | undefined
): T[] {
  const diet = dietExclusionsFromNotes(notes);
  if (!diet.noFood && !diet.noSufganiyot && !diet.noGelt) return lineItems;
  return lineItems.filter((li) => {
    if (diet.noFood && (isLatkeFoodLine(li) || isSufganiyotLine(li) || isGeltLine(li))) return false;
    if (diet.noSufganiyot && isSufganiyotLine(li)) return false;
    if (diet.noGelt && isGeltLine(li)) return false;
    return true;
  });
}
