"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INCLUDED_SLOT_SECTIONS = exports.FOOD_SLOT_CLAIM_IDS = exports.FOOD_SLOT_MAX_LITTLE_BAGS = exports.FOOD_SLOTS_INCLUDED = exports.GELT_LITTLE_EQUIVALENT = void 0;
exports.auditSlotBase = auditSlotBase;
exports.foodSlotQuantity = foodSlotQuantity;
exports.nextVacantFoodSlotId = nextVacantFoodSlotId;
exports.isFoodSlotLine = isFoodSlotLine;
exports.isIncludedFoodSlotLine = isIncludedFoodSlotLine;
exports.auditKidKey = auditKidKey;
exports.geltBagOf = geltBagOf;
exports.geltAllowance = geltAllowance;
exports.auditIncluded = auditIncluded;
exports.auditProblemKey = auditProblemKey;
exports.overProblems = overProblems;
exports.healIncludedInCustomerFavor = healIncludedInCustomerFavor;
exports.includedCountLabel = includedCountLabel;
exports.freeDreidelUnits = freeDreidelUnits;
exports.topUpDreidelLines = topUpDreidelLines;
/** Little Bags' worth of chocolate in each bag (26g / 80g / 320g, rounded to the exchange). */
exports.GELT_LITTLE_EQUIVALENT = { little: 1, big: 3, party: 12 };
exports.FOOD_SLOTS_INCLUDED = 2;
exports.FOOD_SLOT_MAX_LITTLE_BAGS = 3;
const DEFAULT_ADULTS = 2;
const FOOD_SLOT_IDS = new Set(['latke-mix', 'sufganiyot-mix', 'latke-kit', 'sufganiyot-kit', 'food', 'applesauce']);
/** Claim order when adding into an empty included food slot (never catalog catch-alls like `decor`). */
exports.FOOD_SLOT_CLAIM_IDS = ['latke-mix', 'sufganiyot-mix', 'food'];
const DREIDEL_SLOT_IDS = new Set(['wood-dreidel', 'blank-dreidel', 'airdry-dreidel', 'keepsake-dreidel']);
const WRAP_SLOT_IDS = new Set(['wrapping-paper', 'wrapping', 'pre-wrap']);
const CASH_DONATION_SLOT = 'cash-donation';
/** Slot id without the ::x extra suffix or the per-kid key. */
function auditSlotBase(slotId) {
    const withoutExtra = slotId.replace(/::x$/i, '');
    const match = withoutExtra.match(/^(story|gift|wood-dreidel|blank-dreidel|airdry-dreidel)-/);
    return match ? match[1] : withoutExtra;
}
/** Units of `item` one food slot holds: three Little Bags, otherwise one. */
function foodSlotQuantity(item) {
    var _a;
    return geltBagOf(item.id, (_a = item.name) !== null && _a !== void 0 ? _a : '') === 'little' ? exports.FOOD_SLOT_MAX_LITTLE_BAGS : 1;
}
/**
 * Next unused included food slot id, or null when two free food-slot lines already fill the
 * allowance (even if a preferred id like `sufganiyot-mix` is unused because a second kit sits
 * on `latke-kit`).
 */
function nextVacantFoodSlotId(existing) {
    const filled = existing.filter((li) => { var _a, _b; return isFoodSlotLine(li) && ((_a = li.unitCents) !== null && _a !== void 0 ? _a : 0) === 0 && ((_b = li.quantity) !== null && _b !== void 0 ? _b : 0) > 0; }).length;
    if (filled >= exports.FOOD_SLOTS_INCLUDED)
        return null;
    const used = new Set(existing.map((li) => li.slotId));
    for (const id of exports.FOOD_SLOT_CLAIM_IDS) {
        if (!used.has(id))
            return id;
    }
    return null;
}
/** A line in one of the two food slots, whatever it holds (not a paid `::x` extra). */
function isFoodSlotLine(li) {
    return !/::x$/i.test(li.slotId) && FOOD_SLOT_IDS.has(auditSlotBase(li.slotId));
}
/** A free line in one of the two included food slots (its gelt is extra to the gelt allowance). */
function isIncludedFoodSlotLine(li) {
    var _a;
    return ((_a = li.unitCents) !== null && _a !== void 0 ? _a : 0) === 0 && isFoodSlotLine(li);
}
/** Kid key from a per-kid slot (`story-abc` → `abc`), else the line's childId. */
function auditKidKey(li) {
    var _a, _b;
    const m = li.slotId.replace(/::x$/i, '').match(/^(?:story|gift)-(.+)$/);
    return (_b = (_a = m === null || m === void 0 ? void 0 : m[1]) !== null && _a !== void 0 ? _a : li.childId) !== null && _b !== void 0 ? _b : undefined;
}
/** Bag size from the id, else the name without its "(5 big, 20 little)" coin counts. */
function geltBagOf(itemId, name = '') {
    var _a;
    const size = (s) => {
        if (!/gelt/.test(s))
            return null;
        if (/party/.test(s))
            return 'party';
        if (/little|small/.test(s))
            return 'little';
        if (/big|medium/.test(s))
            return 'big';
        return null;
    };
    if (itemId === 'gelt')
        return 'big';
    return (_a = size(itemId.toLowerCase())) !== null && _a !== void 0 ? _a : size(name.replace(/\([^)]*\)/g, '').toLowerCase());
}
/** Little Bags' worth of gelt each person gets free. */
function geltAllowance(people) {
    return Math.max(0, people);
}
function isFreeLine(li) {
    var _a, _b;
    return ((_a = li.unitCents) !== null && _a !== void 0 ? _a : 0) === 0 && ((_b = li.quantity) !== null && _b !== void 0 ? _b : 0) > 0;
}
function isExtraUnitLine(li) {
    return /::x$/i.test(li.slotId);
}
function skipLine(li) {
    var _a;
    return li.program === 'pilot' || li.slotId === CASH_DONATION_SLOT || ((_a = li.quantity) !== null && _a !== void 0 ? _a : 0) <= 0;
}
function hay(li, row) {
    var _a, _b;
    return `${li.itemId} ${(_b = (_a = row === null || row === void 0 ? void 0 : row.name) !== null && _a !== void 0 ? _a : li.label) !== null && _b !== void 0 ? _b : ''}`.toLowerCase();
}
function isCandleItem(h) {
    return /candle/.test(h);
}
function isIncludedDreidel(h) {
    return /dreidel/.test(h) && !/brass|slipcast|stuffie|cookie|book/.test(h);
}
function isIncludedPresent(h, row) {
    if ((row === null || row === void 0 ? void 0 : row.category) === 'Book' || /^book-/.test(h))
        return true;
    if (/stuffie|plush/.test(h))
        return true;
    if (isIncludedDreidel(h))
        return true;
    if (/toddler.?play.?menorah|lego.?menorah|air.?dry.*menorah|clay.?menorah/.test(h))
        return true;
    if (/roll.?your.?own|diy|make.?your.?own/.test(h) && isCandleItem(h))
        return true;
    return false;
}
function foodContent(li, row) {
    const h = hay(li, row);
    const bag = geltBagOf(li.itemId, row === null || row === void 0 ? void 0 : row.name);
    if (bag === 'little')
        return { valid: li.quantity <= exports.FOOD_SLOT_MAX_LITTLE_BAGS, littleBags: li.quantity };
    if (bag === 'big')
        return { valid: li.quantity <= 1, bigBags: li.quantity };
    if (bag === 'party')
        return { valid: false };
    if (/stuffie|plush/.test(h))
        return { valid: false };
    if (/latke.?kit|latke.?mix|sufgan.*(kit|mix)|cookie.?cutter/.test(h))
        return { valid: li.quantity <= 1 };
    if (/^latke-mix$|^sufganiyot-mix$/.test(li.itemId))
        return { valid: li.quantity <= 1 };
    return { valid: false };
}
function auditIncluded(lineItems, catalog, household, opts = {}) {
    var _a, _b, _c, _d;
    const rows = new Map(catalog.map((r) => [r.id, r]));
    const kidKeys = [...new Set(household.kidKeys)];
    const kids = kidKeys.length;
    const people = kids + (household.adults != null && household.adults >= 0 ? household.adults : DEFAULT_ADULTS);
    const problems = [];
    const freeBooksByKid = new Map();
    const freeGiftsByKid = new Map();
    const paidSlots = new Map();
    const freeBaseSlots = new Set();
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
        if (skipLine(li))
            continue;
        const row = rows.get(li.itemId);
        const h = hay(li, row);
        const base = auditSlotBase(li.slotId);
        const kid = auditKidKey(li);
        const slotKey = base === 'story' || base === 'gift' ? `${base}-${kid !== null && kid !== void 0 ? kid : '?'}` : base;
        if (!isFreeLine(li)) {
            if (!isExtraUnitLine(li))
                paidSlots.set(slotKey, li);
            if (WRAP_SLOT_IDS.has(base))
                paidPaper = true;
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
            const key = kid !== null && kid !== void 0 ? kid : '?';
            freeBooksByKid.set(key, ((_a = freeBooksByKid.get(key)) !== null && _a !== void 0 ? _a : 0) + li.quantity);
            if ((row === null || row === void 0 ? void 0 : row.category) !== 'Book' && !/^book-/.test(li.itemId)) {
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
            const key = kid !== null && kid !== void 0 ? kid : '?';
            freeGiftsByKid.set(key, ((_b = freeGiftsByKid.get(key)) !== null && _b !== void 0 ? _b : 0) + li.quantity);
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
            }
            else {
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
        const bag = geltBagOf(li.itemId, row === null || row === void 0 ? void 0 : row.name);
        if (bag) {
            geltLines += 1;
            geltUnits += exports.GELT_LITTLE_EQUIVALENT[bag] * li.quantity;
            geltDonated += exports.GELT_LITTLE_EQUIVALENT[bag] * Math.max(0, ((_c = li.includedQty) !== null && _c !== void 0 ? _c : 0) - li.quantity);
            if (!(bag === 'big' && li.quantity === 1))
                geltBigOnly = false;
            if (!(bag === 'party' && li.quantity === 1))
                geltPartyOnly = false;
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
    const perKid = (section, byKid, noun) => {
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
        if (freeBaseSlots.has(slotKey))
            continue;
        const base = auditSlotBase(li.slotId);
        const section = base === 'story'
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
        if (!section)
            continue;
        const kid = auditKidKey(li);
        if ((section === 'story' || section === 'presents') && (!kid || !kidKeys.includes(kid)))
            continue;
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
        problems.push(Object.assign({ code: 'over-allowance', section: 'gelt', direction: 'over', detail: `${geltUnits} Little Bags' worth of gelt for ${people} people` }, (legacyParty || legacyBig ? { grandfathered: true } : {})));
    }
    else if (geltLines > 0 && geltUnits + geltDonated < geltAllowed) {
        problems.push({
            code: 'gelt-short',
            section: 'gelt',
            direction: 'under',
            detail: `${geltUnits} Little Bags' worth of gelt for ${people} people`,
        });
    }
    if (foodFilled > exports.FOOD_SLOTS_INCLUDED) {
        problems.push({
            code: 'over-allowance',
            section: 'food',
            direction: 'over',
            detail: `${foodFilled} free food slots (allowed ${exports.FOOD_SLOTS_INCLUDED})`,
        });
    }
    else if (foodFilled < exports.FOOD_SLOTS_INCLUDED) {
        problems.push({
            code: 'food-slot-missing',
            section: 'food',
            direction: 'under',
            detail: `${foodFilled} of ${exports.FOOD_SLOTS_INCLUDED} food slots filled`,
        });
    }
    const preWrap = ((_d = opts.wrapSelectedItemIds) !== null && _d !== void 0 ? _d : []).length > 0;
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
    const sections = {
        story: { allowed: kids, filled: booksFilled },
        presents: { allowed: kids, filled: giftsFilled },
        candles: { allowed: 1, filled: Math.min(candles, 1) },
        dreidel: { allowed: people, filled: Math.min(dreidels, people) },
        gelt: { allowed: geltAllowed, filled: Math.min(geltUnits, geltAllowed) },
        food: { allowed: exports.FOOD_SLOTS_INCLUDED, filled: Math.min(foodFilled, exports.FOOD_SLOTS_INCLUDED) },
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
/** Identity of a problem across two audits of the same household. */
function auditProblemKey(p) {
    var _a, _b, _c;
    return [p.code, p.section, (_a = p.slotId) !== null && _a !== void 0 ? _a : '', (_b = p.itemId) !== null && _b !== void 0 ? _b : '', (_c = p.childKey) !== null && _c !== void 0 ? _c : ''].join('|');
}
/** Problems that give away more than the rules allow (grandfathered ones excluded). */
function overProblems(audit) {
    return audit.problems.filter((p) => p.direction === 'over' && !p.grandfathered);
}
/**
 * Customer-favor fixes: a charged line that is a valid included item in its own empty slot
 * becomes free; wrapping paper charged as the only wrap becomes free; and a free food-slot
 * option parked outside the food slots (e.g. cookie cutters on catalog `decor`) is rehomed
 * into a vacant food slot. Each fix is kept only when the audit then drops that problem
 * without any new over-allowance or not-included problem. Missing gelt or food slots are
 * never filled by inventing new items (the customer may have donated them).
 */
function healIncludedInCustomerFavor(lineItems, catalog, household, opts = {}) {
    let lines = lineItems;
    let audit = auditIncluded(lines, catalog, household, opts);
    const healed = [];
    const rows = new Map(catalog.map((r) => [r.id, r]));
    const free = (li) => {
        var _a;
        return (Object.assign(Object.assign({}, li), { unitCents: 0, includedQty: Math.max((_a = li.includedQty) !== null && _a !== void 0 ? _a : 0, li.quantity) }));
    };
    const accept = (candidate, problem) => {
        const after = auditIncluded(candidate, catalog, household, opts);
        const key = auditProblemKey(problem);
        const overBefore = new Set(overProblems(audit).map(auditProblemKey));
        const fixed = !after.problems.some((p) => auditProblemKey(p) === key);
        const noNewOver = overProblems(after).every((p) => overBefore.has(auditProblemKey(p)));
        if (!fixed || !noNewOver)
            return false;
        lines = candidate;
        audit = after;
        healed.push(problem);
        return true;
    };
    for (const problem of audit.problems) {
        if (problem.code !== 'paid-in-included-slot' && problem.code !== 'wrap-charged')
            continue;
        const targets = problem.code === 'wrap-charged'
            ? lines.filter((li) => WRAP_SLOT_IDS.has(auditSlotBase(li.slotId)) && !isExtraUnitLine(li) && !isFreeLine(li))
            : lines.filter((li) => li.slotId === problem.slotId && li.itemId === problem.itemId && !isFreeLine(li));
        if (targets.length !== 1)
            continue;
        const target = targets[0];
        accept(lines.map((li) => (li === target ? free(li) : li)), problem);
    }
    // Cookie cutters (or another food-slot option) flagged as free-add-on while a food slot is
    // empty — move them into the vacant slot. Never steal household gelt from gelt-* slots.
    for (;;) {
        const missing = audit.problems.find((p) => p.code === 'food-slot-missing' && !p.grandfathered);
        if (!missing)
            break;
        const vacant = nextVacantFoodSlotId(lines);
        if (!vacant)
            break;
        const freeAddOn = audit.problems.find((p) => {
            var _a, _b;
            return p.code === 'free-add-on' &&
                !p.grandfathered &&
                p.itemId &&
                foodContent((_a = lines.find((li) => li.slotId === p.slotId && li.itemId === p.itemId)) !== null && _a !== void 0 ? _a : {
                    slotId: (_b = p.slotId) !== null && _b !== void 0 ? _b : '',
                    itemId: p.itemId,
                    quantity: 1,
                    unitCents: 0,
                }, rows.get(p.itemId)).valid;
        });
        if (!(freeAddOn === null || freeAddOn === void 0 ? void 0 : freeAddOn.slotId) || !freeAddOn.itemId)
            break;
        const parked = lines.find((li) => li.slotId === freeAddOn.slotId && li.itemId === freeAddOn.itemId);
        if (!parked)
            break;
        const candidate = lines.map((li) => (li === parked ? Object.assign(Object.assign({}, li), { slotId: vacant }) : li));
        if (!accept(candidate, missing))
            break;
    }
    return { lineItems: lines, healed, audit };
}
exports.INCLUDED_SLOT_SECTIONS = ['story', 'presents', 'candles', 'dreidel', 'food'];
/** "1 of 2 included", or null when the section has no included slots for this household. */
function includedCountLabel(count) {
    if (!count || count.allowed <= 0)
        return null;
    return `${Math.min(count.filled, count.allowed)} of ${count.allowed} included`;
}
/** Free dreidels in dreidel slots (not gelt that was swapped into one). */
function freeDreidelUnits(lineItems) {
    return lineItems.reduce((n, li) => {
        var _a;
        if (skipLine(li) || !isFreeLine(li) || isExtraUnitLine(li))
            return n;
        if (!DREIDEL_SLOT_IDS.has(auditSlotBase(li.slotId)) || geltBagOf(li.itemId, (_a = li.label) !== null && _a !== void 0 ? _a : ''))
            return n;
        return n + li.quantity;
    }, 0);
}
/**
 * Lines after topping free dreidels up to one per person with `woodItem`: its free line grows,
 * or a new one is added (a brass or clay dreidel in the slot never multiplies). Unchanged when
 * the box already has enough.
 */
function topUpDreidelLines(lineItems, people, woodItem) {
    const missing = people - freeDreidelUnits(lineItems);
    if (missing <= 0)
        return lineItems;
    const wood = lineItems.find((li) => li.itemId === woodItem.id &&
        DREIDEL_SLOT_IDS.has(auditSlotBase(li.slotId)) &&
        !skipLine(li) &&
        isFreeLine(li) &&
        !isExtraUnitLine(li));
    if (wood) {
        const quantity = wood.quantity + missing;
        return lineItems.map((li) => { var _a; return li === wood ? Object.assign(Object.assign({}, li), { quantity, includedQty: Math.max((_a = li.includedQty) !== null && _a !== void 0 ? _a : 0, quantity) }) : li; });
    }
    const slotId = lineItems.some((li) => li.slotId === 'wood-dreidel') ? 'wood-dreidel-household' : 'wood-dreidel';
    return [
        ...lineItems,
        { slotId, itemId: woodItem.id, quantity: missing, includedQty: missing, unitCents: 0, label: woodItem.name },
    ];
}
//# sourceMappingURL=boxAudit.js.map