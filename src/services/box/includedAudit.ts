import type { BoxLineItem } from '../../types/pilot';

/**
 * Included-items integrity check for a Hanukkah box. Pure: no React, no Firestore, so the
 * client (after each save), Cloud Functions (functions/src/boxAudit.ts mirrors this file)
 * and scripts all run the same rules.
 *
 * Allowance per household:
 *   story    one free book per kid (story-<kid>)
 *   presents one free present per kid (gift-<kid>)
 *   candles  one free candle set
 *   dreidel  one free dreidel per person (kids + adults)
 *   gelt     one Little Bag's worth per person; Little = 1, Big = 3, Party = 12
 *   food     exactly two slots: a kit, cookie cutters, one Big Bag or up to 3 Little Bags
 *   wrap     one included wrap: free paper, or pre-wrap for any number of presents
 * A line is free when unitCents is 0; paid lines charge unitCents × quantity.
 */

export type AuditSection = 'story' | 'presents' | 'candles' | 'dreidel' | 'gelt' | 'food' | 'wrap';

export type AuditDirection = 'over' | 'under';

export type AuditProblemCode =
  /** More free units than the allowance. */
  | 'over-allowance'
  /** A free item that isn't an included option for its slot. */
  | 'not-included-item'
  /** A free line outside the included slots (add-on or extra unit at $0). */
  | 'free-add-on'
  /** A paid item sitting in an included slot with nothing free there. */
  | 'paid-in-included-slot'
  /** Fewer than two food slots filled. */
  | 'food-slot-missing'
  /** Less gelt than the household's allowance. */
  | 'gelt-short'
  /** Wrapping paper charged while it's the only wrap. */
  | 'wrap-charged';

export type AuditProblem = {
  code: AuditProblemCode;
  section: AuditSection | 'other';
  direction: AuditDirection;
  detail: string;
  slotId?: string;
  itemId?: string;
  childKey?: string;
  /** Allowed by an earlier rule (kept as-is), reported but not a fix. */
  grandfathered?: boolean;
};

export type SectionCount = { allowed: number; filled: number };

export type IncludedAudit = {
  ok: boolean;
  kids: number;
  people: number;
  sections: Record<AuditSection, SectionCount>;
  problems: AuditProblem[];
};

export type AuditCatalogRow = { id: string; name?: string; category?: string };

export type AuditHousehold = {
  /** Keys used in story-<key> / gift-<key> slots (child ids, guest-0, gift-child-0…). */
  kidKeys: string[];
  /** Grown-ups in the household; 2 when unknown. */
  adults?: number;
};

export type AuditOptions = {
  /** Present ids picked for pre-wrap. */
  wrapSelectedItemIds?: string[];
};

export type GeltBag = 'little' | 'big' | 'party';

/** Little Bags' worth of chocolate in each bag (26g / 80g / 320g, rounded to the exchange). */
export const GELT_LITTLE_EQUIVALENT: Record<GeltBag, number> = { little: 1, big: 3, party: 12 };

export const FOOD_SLOTS_INCLUDED = 2;
export const FOOD_SLOT_MAX_LITTLE_BAGS = 3;

const DEFAULT_ADULTS = 2;
const FOOD_SLOT_IDS = new Set(['latke-mix', 'sufganiyot-mix', 'latke-kit', 'sufganiyot-kit', 'food', 'applesauce']);
const DREIDEL_SLOT_IDS = new Set(['wood-dreidel', 'blank-dreidel', 'airdry-dreidel', 'keepsake-dreidel']);
const WRAP_SLOT_IDS = new Set(['wrapping-paper', 'wrapping', 'pre-wrap']);
const CASH_DONATION_SLOT = 'cash-donation';

/** Slot id without the ::x extra suffix or the per-kid key. */
export function auditSlotBase(slotId: string): string {
  const withoutExtra = slotId.replace(/::x$/i, '');
  const match = withoutExtra.match(/^(story|gift|wood-dreidel|blank-dreidel|airdry-dreidel)-/);
  return match ? match[1] : withoutExtra;
}

/** A free line in one of the two included food slots (its gelt is extra to the gelt allowance). */
export function isIncludedFoodSlotLine(li: Pick<BoxLineItem, 'slotId'> & { unitCents?: number }): boolean {
  return !/::x$/i.test(li.slotId) && (li.unitCents ?? 0) === 0 && FOOD_SLOT_IDS.has(auditSlotBase(li.slotId));
}

/** Kid key from a per-kid slot (`story-abc` → `abc`), else the line's childId. */
export function auditKidKey(li: Pick<BoxLineItem, 'slotId' | 'childId'>): string | undefined {
  const m = li.slotId.replace(/::x$/i, '').match(/^(?:story|gift)-(.+)$/);
  return m?.[1] ?? li.childId ?? undefined;
}

/** Bag size from the id, else the name without its "(5 big, 20 little)" coin counts. */
export function geltBagOf(itemId: string, name = ''): GeltBag | null {
  const size = (s: string): GeltBag | null => {
    if (!/gelt/.test(s)) return null;
    if (/party/.test(s)) return 'party';
    if (/little|small/.test(s)) return 'little';
    if (/big|medium/.test(s)) return 'big';
    return null;
  };
  if (itemId === 'gelt') return 'big';
  return size(itemId.toLowerCase()) ?? size(name.replace(/\([^)]*\)/g, '').toLowerCase());
}

/** Little Bags' worth of gelt each person gets free. */
export function geltAllowance(people: number): number {
  return Math.max(0, people);
}

function isFreeLine(li: BoxLineItem): boolean {
  return (li.unitCents ?? 0) === 0 && (li.quantity ?? 0) > 0;
}

function isExtraUnitLine(li: BoxLineItem): boolean {
  return /::x$/i.test(li.slotId);
}

function skipLine(li: BoxLineItem): boolean {
  return li.program === 'pilot' || li.slotId === CASH_DONATION_SLOT || (li.quantity ?? 0) <= 0;
}

function hay(li: BoxLineItem, row?: AuditCatalogRow): string {
  return `${li.itemId} ${row?.name ?? li.label ?? ''}`.toLowerCase();
}

function isCandleItem(h: string): boolean {
  return /candle/.test(h);
}

function isIncludedDreidel(h: string): boolean {
  return /dreidel/.test(h) && !/brass|slipcast|stuffie|cookie|book/.test(h);
}

function isIncludedPresent(h: string, row?: AuditCatalogRow): boolean {
  if (row?.category === 'Book' || /^book-/.test(h)) return true;
  if (/stuffie|plush/.test(h)) return true;
  if (isIncludedDreidel(h)) return true;
  if (/toddler.?play.?menorah|lego.?menorah|air.?dry.*menorah|clay.?menorah/.test(h)) return true;
  if (/roll.?your.?own|diy|make.?your.?own/.test(h) && isCandleItem(h)) return true;
  return false;
}

type FoodContent = { valid: boolean; littleBags?: number; bigBags?: number };

function foodContent(li: BoxLineItem, row?: AuditCatalogRow): FoodContent {
  const h = hay(li, row);
  const bag = geltBagOf(li.itemId, row?.name);
  if (bag === 'little') return { valid: li.quantity <= FOOD_SLOT_MAX_LITTLE_BAGS, littleBags: li.quantity };
  if (bag === 'big') return { valid: li.quantity <= 1, bigBags: li.quantity };
  if (bag === 'party') return { valid: false };
  if (/stuffie|plush/.test(h)) return { valid: false };
  if (/latke.?kit|latke.?mix|sufgan.*(kit|mix)|cookie.?cutter/.test(h)) return { valid: li.quantity <= 1 };
  if (/^latke-mix$|^sufganiyot-mix$/.test(li.itemId)) return { valid: li.quantity <= 1 };
  return { valid: false };
}

export function auditIncluded(
  lineItems: BoxLineItem[],
  catalog: AuditCatalogRow[],
  household: AuditHousehold,
  opts: AuditOptions = {}
): IncludedAudit {
  const rows = new Map(catalog.map((r) => [r.id, r]));
  const kidKeys = [...new Set(household.kidKeys)];
  const kids = kidKeys.length;
  const people = kids + (household.adults != null && household.adults >= 0 ? household.adults : DEFAULT_ADULTS);
  const problems: AuditProblem[] = [];

  const freeBooksByKid = new Map<string, number>();
  const freeGiftsByKid = new Map<string, number>();
  const paidSlots = new Map<string, BoxLineItem>();
  const freeBaseSlots = new Set<string>();
  let candles = 0;
  let dreidels = 0;
  let geltUnits = 0;
  let geltDonated = 0;
  let geltBigOnly = true;
  let geltPartyOnly = true;
  let geltLines = 0;
  let foodFilled = 0;
  let freePaper = 0;
  let paidPaper = false;

  for (const li of lineItems) {
    if (skipLine(li)) continue;
    const row = rows.get(li.itemId);
    const h = hay(li, row);
    const base = auditSlotBase(li.slotId);
    const kid = auditKidKey(li);
    const slotKey = base === 'story' || base === 'gift' ? `${base}-${kid ?? '?'}` : base;

    if (!isFreeLine(li)) {
      if (!isExtraUnitLine(li)) paidSlots.set(slotKey, li);
      if (WRAP_SLOT_IDS.has(base)) paidPaper = true;
      continue;
    }

    if (isExtraUnitLine(li)) {
      problems.push({
        code: 'free-add-on',
        section: 'other',
        direction: 'over',
        slotId: li.slotId,
        itemId: li.itemId,
        detail: `Extra unit of ${li.itemId} is $0`,
      });
      continue;
    }

    freeBaseSlots.add(slotKey);

    if (base === 'story') {
      const key = kid ?? '?';
      freeBooksByKid.set(key, (freeBooksByKid.get(key) ?? 0) + li.quantity);
      if (row?.category !== 'Book' && !/^book-/.test(li.itemId)) {
        problems.push({
          code: 'not-included-item',
          section: 'story',
          direction: 'over',
          slotId: li.slotId,
          itemId: li.itemId,
          childKey: key,
          detail: `${li.itemId} is free in a book slot`,
        });
      }
      continue;
    }

    if (base === 'gift') {
      const key = kid ?? '?';
      freeGiftsByKid.set(key, (freeGiftsByKid.get(key) ?? 0) + li.quantity);
      if (!isIncludedPresent(h, row)) {
        problems.push({
          code: 'not-included-item',
          section: 'presents',
          direction: 'over',
          slotId: li.slotId,
          itemId: li.itemId,
          childKey: key,
          detail: `${li.itemId} isn't an included present`,
        });
      }
      continue;
    }

    if (FOOD_SLOT_IDS.has(base)) {
      const content = foodContent(li, row);
      if (content.valid) {
        foodFilled += 1;
      } else {
        problems.push({
          code: 'not-included-item',
          section: 'food',
          direction: 'over',
          slotId: li.slotId,
          itemId: li.itemId,
          detail: `${li.quantity}× ${li.itemId} isn't an included food-slot option`,
        });
      }
      continue;
    }

    const bag = geltBagOf(li.itemId, row?.name);
    if (bag) {
      geltLines += 1;
      geltUnits += GELT_LITTLE_EQUIVALENT[bag] * li.quantity;
      geltDonated += GELT_LITTLE_EQUIVALENT[bag] * Math.max(0, (li.includedQty ?? 0) - li.quantity);
      if (!(bag === 'big' && li.quantity === 1)) geltBigOnly = false;
      if (!(bag === 'party' && li.quantity === 1)) geltPartyOnly = false;
      continue;
    }

    if (base === 'candles') {
      candles += li.quantity;
      if (!isCandleItem(h)) {
        problems.push({
          code: 'not-included-item',
          section: 'candles',
          direction: 'over',
          slotId: li.slotId,
          itemId: li.itemId,
          detail: `${li.itemId} is free in the candles slot`,
        });
      }
      continue;
    }

    if (DREIDEL_SLOT_IDS.has(base)) {
      dreidels += li.quantity;
      if (!isIncludedDreidel(h)) {
        problems.push({
          code: 'not-included-item',
          section: 'dreidel',
          direction: 'over',
          slotId: li.slotId,
          itemId: li.itemId,
          detail: `${li.itemId} isn't an included dreidel`,
        });
      }
      continue;
    }

    if (WRAP_SLOT_IDS.has(base)) {
      freePaper += li.quantity;
      continue;
    }

    problems.push({
      code: 'free-add-on',
      section: 'other',
      direction: 'over',
      slotId: li.slotId,
      itemId: li.itemId,
      detail: `${li.quantity}× ${li.itemId} is $0 outside an included slot`,
    });
  }

  const perKid = (
    section: 'story' | 'presents',
    byKid: Map<string, number>,
    noun: string
  ): number => {
    let filled = 0;
    for (const [key, n] of byKid) {
      filled += Math.min(n, 1);
      if (n > 1) {
        problems.push({
          code: 'over-allowance',
          section,
          direction: 'over',
          childKey: key,
          detail: `${n} free ${noun}s for one kid (allowed 1)`,
        });
      }
    }
    const total = [...byKid.values()].reduce((a, b) => a + b, 0);
    if (total > kids && ![...byKid.values()].some((n) => n > 1)) {
      problems.push({
        code: 'over-allowance',
        section,
        direction: 'over',
        detail: `${total} free ${noun}s for ${kids} kid${kids === 1 ? '' : 's'}`,
      });
    }
    return Math.min(filled, kids);
  };

  const booksFilled = perKid('story', freeBooksByKid, 'book');
  const giftsFilled = perKid('presents', freeGiftsByKid, 'present');

  for (const [slotKey, li] of paidSlots) {
    if (freeBaseSlots.has(slotKey)) continue;
    const base = auditSlotBase(li.slotId);
    const section: AuditSection | null =
      base === 'story'
        ? 'story'
        : base === 'gift'
          ? 'presents'
          : base === 'candles'
            ? 'candles'
            : base === 'wood-dreidel'
              ? 'dreidel'
              : base.startsWith('gelt')
                ? 'gelt'
                : base === 'latke-mix' || base === 'sufganiyot-mix'
                  ? 'food'
                  : null;
    if (!section) continue;
    const kid = auditKidKey(li);
    if ((section === 'story' || section === 'presents') && (!kid || !kidKeys.includes(kid))) continue;
    problems.push({
      code: 'paid-in-included-slot',
      section,
      direction: 'under',
      slotId: li.slotId,
      itemId: li.itemId,
      childKey: kid,
      detail: `${li.itemId} charged ${li.unitCents}¢ in an included ${section} slot`,
    });
  }

  if (candles > 1) {
    problems.push({ code: 'over-allowance', section: 'candles', direction: 'over', detail: `${candles} free candle sets (allowed 1)` });
  }

  if (dreidels > people) {
    problems.push({
      code: 'over-allowance',
      section: 'dreidel',
      direction: 'over',
      detail: `${dreidels} free dreidels for ${people} people`,
    });
  }

  const geltAllowed = geltAllowance(people);
  if (geltUnits > geltAllowed) {
    const legacyParty = geltLines === 1 && geltPartyOnly && kids >= 5;
    const legacyBig = geltLines === 1 && geltBigOnly && kids <= 1;
    problems.push({
      code: 'over-allowance',
      section: 'gelt',
      direction: 'over',
      detail: `${geltUnits} Little Bags' worth of gelt for ${people} people`,
      ...(legacyParty || legacyBig ? { grandfathered: true } : {}),
    });
  } else if (geltLines > 0 && geltUnits + geltDonated < geltAllowed) {
    problems.push({
      code: 'gelt-short',
      section: 'gelt',
      direction: 'under',
      detail: `${geltUnits} Little Bags' worth of gelt for ${people} people`,
    });
  }

  if (foodFilled > FOOD_SLOTS_INCLUDED) {
    problems.push({
      code: 'over-allowance',
      section: 'food',
      direction: 'over',
      detail: `${foodFilled} free food slots (allowed ${FOOD_SLOTS_INCLUDED})`,
    });
  } else if (foodFilled < FOOD_SLOTS_INCLUDED) {
    problems.push({
      code: 'food-slot-missing',
      section: 'food',
      direction: 'under',
      detail: `${foodFilled} of ${FOOD_SLOTS_INCLUDED} food slots filled`,
    });
  }

  const preWrap = (opts.wrapSelectedItemIds ?? []).length > 0;
  if (freePaper > 1 || (freePaper > 0 && preWrap)) {
    problems.push({
      code: 'over-allowance',
      section: 'wrap',
      direction: 'over',
      detail: preWrap ? 'Free paper on top of pre-wrap' : `${freePaper} free wrapping paper`,
    });
  }
  if (paidPaper && freePaper === 0 && !preWrap) {
    problems.push({ code: 'wrap-charged', section: 'wrap', direction: 'under', detail: 'Wrapping paper charged with no pre-wrap' });
  }

  const sections: Record<AuditSection, SectionCount> = {
    story: { allowed: kids, filled: booksFilled },
    presents: { allowed: kids, filled: giftsFilled },
    candles: { allowed: 1, filled: Math.min(candles, 1) },
    dreidel: { allowed: people, filled: Math.min(dreidels, people) },
    gelt: { allowed: geltAllowed, filled: Math.min(geltUnits, geltAllowed) },
    food: { allowed: FOOD_SLOTS_INCLUDED, filled: Math.min(foodFilled, FOOD_SLOTS_INCLUDED) },
    wrap: { allowed: 1, filled: freePaper > 0 || preWrap ? 1 : 0 },
  };

  return {
    ok: !problems.some((p) => !p.grandfathered && p.code !== 'gelt-short'),
    kids,
    people,
    sections,
    problems,
  };
}

/** My Box sections that show "X of Y included". Gelt and wrap sit inside other sections. */
export type IncludedSlotSection = 'story' | 'presents' | 'candles' | 'dreidel' | 'food';

export const INCLUDED_SLOT_SECTIONS: readonly IncludedSlotSection[] = ['story', 'presents', 'candles', 'dreidel', 'food'];

/** "1 of 2 included", or null when the section has no included slots for this household. */
export function includedCountLabel(count: SectionCount | undefined): string | null {
  if (!count || count.allowed <= 0) return null;
  return `${Math.min(count.filled, count.allowed)} of ${count.allowed} included`;
}

/** Free dreidels in dreidel slots (not gelt that was swapped into one). */
export function freeDreidelUnits(lineItems: BoxLineItem[]): number {
  return lineItems.reduce((n, li) => {
    if (skipLine(li) || !isFreeLine(li) || isExtraUnitLine(li)) return n;
    if (!DREIDEL_SLOT_IDS.has(auditSlotBase(li.slotId)) || geltBagOf(li.itemId, li.label ?? '')) return n;
    return n + li.quantity;
  }, 0);
}

/**
 * Lines after topping free dreidels up to one per person with `woodItem`: its free line grows,
 * or a new one is added (a brass or clay dreidel in the slot never multiplies). Unchanged when
 * the box already has enough.
 */
export function topUpDreidelLines(
  lineItems: BoxLineItem[],
  people: number,
  woodItem: { id: string; name: string }
): BoxLineItem[] {
  const missing = people - freeDreidelUnits(lineItems);
  if (missing <= 0) return lineItems;
  const wood = lineItems.find(
    (li) =>
      li.itemId === woodItem.id &&
      DREIDEL_SLOT_IDS.has(auditSlotBase(li.slotId)) &&
      !skipLine(li) &&
      isFreeLine(li) &&
      !isExtraUnitLine(li)
  );
  if (wood) {
    const quantity = wood.quantity + missing;
    return lineItems.map((li) =>
      li === wood ? { ...li, quantity, includedQty: Math.max(li.includedQty ?? 0, quantity) } : li
    );
  }
  const slotId = lineItems.some((li) => li.slotId === 'wood-dreidel') ? 'wood-dreidel-household' : 'wood-dreidel';
  return [
    ...lineItems,
    { slotId, itemId: woodItem.id, quantity: missing, includedQty: missing, unitCents: 0, label: woodItem.name },
  ];
}
