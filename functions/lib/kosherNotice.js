"use strict";
/**
 * Kosher food note. Nothing sends until the piece is approved and a Customer.io template id is set.
 * This module only decides who would get which version and renders the preview.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.KOSHER_FOOD_SWAPS = void 0;
exports.mentionsKeepingKosher = mentionsKeepingKosher;
exports.edibleFoodLines = edibleFoodLines;
exports.kosherNoticeVersion = kosherNoticeVersion;
exports.renderKosherNotice = renderKosherNotice;
const emailLayout_1 = require("./emailLayout");
const FOOD_FACT = 'The food in this box is vegan, and it is not OU-certified kosher.';
/** Included food-slot swaps. Gelt and the other kit are not a fix. Cookie cutters and removing the line are. */
exports.KOSHER_FOOD_SWAPS = [
    {
        name: 'The other kit',
        imageUrl: '',
        note: 'Vegan, and not OU-certified. This does not leave the non-OU food behind.',
    },
    {
        name: 'Cookie cutters',
        imageUrl: '',
        note: 'This leaves the non-OU food behind. The box price does not change.',
    },
    {
        name: 'A big bag of gelt',
        imageUrl: '',
        note: 'Vegan, and not OU-certified. This does not leave the non-OU food behind.',
    },
    {
        name: 'Three little bags of gelt',
        imageUrl: '',
        note: 'Vegan, and not OU-certified. This does not leave the non-OU food behind.',
    },
];
function withoutNegatedKosher(text) {
    return text
        .replace(/\bkosher-style\b/gi, '')
        .replace(/\b(?:not|non|isn't|isnt|aren't|arent)\b(?:\s+\w+){0,3}\s+kosher\b/gi, '');
}
/** Same reading as dietNotes: “not kosher” and “kosher-style” do not count. */
function mentionsKeepingKosher(text) {
    const cleaned = withoutNegatedKosher((text !== null && text !== void 0 ? text : '').replace(/\s+/g, ' ').trim());
    return /\bkosher\b/i.test(cleaned);
}
function edibleFoodLines(lines) {
    var _a, _b, _c, _d, _e;
    const out = [];
    for (const line of lines) {
        const slot = String((_a = line.slotId) !== null && _a !== void 0 ? _a : '').replace(/::x$/i, '');
        const item = String((_b = line.itemId) !== null && _b !== void 0 ? _b : '');
        const label = String((_d = (_c = line.label) !== null && _c !== void 0 ? _c : line.name) !== null && _d !== void 0 ? _d : '').trim();
        const hay = `${slot} ${item} ${label}`.toLowerCase();
        if (/stuffie|plush|\bbook\b/.test(hay))
            continue;
        const food = /sufgan/.test(hay) ||
            slot === 'latke-mix' ||
            slot === 'latke-kit' ||
            slot === 'applesauce' ||
            /latke|applesauce/.test(hay) ||
            slot === 'gelt' ||
            slot.startsWith('gelt-') ||
            /\bgelt\b/.test(hay);
        if (!food)
            continue;
        const name = label || (/sufgan/.test(hay) ? 'Sufganiyot kit' : /\bgelt\b/.test(hay) ? 'Chocolate gelt' : 'Latke kit');
        out.push({ name, imageUrl: (_e = line.imageUrl) !== null && _e !== void 0 ? _e : '' });
    }
    return out;
}
/**
 * Who gets the note.
 * A kosher household note or a Rav message qualifies even when the food is already out.
 * A practice score of 80 or higher qualifies only while an edible line is still in the box.
 * An untouched 50 does not. A high Hanukkah score by itself does not.
 */
function kosherNoticeVersion(input) {
    const saidKosher = mentionsKeepingKosher(input.householdNote) || mentionsKeepingKosher(input.ravText);
    const highPractice = input.practiceTouched === true &&
        typeof input.practiceScore === 'number' &&
        input.practiceScore >= 80;
    if (saidKosher)
        return input.edibleNames.length ? 'with_food' : 'already_out';
    if (highPractice && input.edibleNames.length)
        return 'with_food';
    return null;
}
function renderKosherNotice(input) {
    var _a;
    const subject = 'A note about the food in your box';
    if (input.version === 'already_out') {
        return {
            subject,
            html: (0, emailLayout_1.grapejuiceEmailHtml)({
                campaign: 'kosher_notice',
                preheader: FOOD_FACT,
                title: 'About the food',
                paragraphs: [
                    FOOD_FACT,
                    'Yours is already out of the box.',
                ],
                ctaLabel: 'Open my box',
                ctaUrl: input.boxUrl,
            }),
        };
    }
    const foods = input.foods.map((food) => ({
        name: food.name,
        imageUrl: food.imageUrl,
        note: 'Vegan, and not OU-certified.',
    }));
    const swaps = ((_a = input.swaps) !== null && _a !== void 0 ? _a : exports.KOSHER_FOOD_SWAPS).filter((swap) => swap.imageUrl || swap.name);
    return {
        subject,
        html: (0, emailLayout_1.grapejuiceEmailHtml)({
            campaign: 'kosher_notice',
            preheader: FOOD_FACT,
            title: 'About the food',
            paragraphs: [
                FOOD_FACT,
                'These are the edible lines in your box. Next to them, the swaps included in the food slot. Cookie cutters, or taking the line out, leave the non-OU food behind. The box price does not change.',
            ],
            thumbs: [...foods, ...swaps],
            ctaLabel: 'Open my box',
            ctaUrl: input.boxUrl,
        }),
    };
}
//# sourceMappingURL=kosherNotice.js.map