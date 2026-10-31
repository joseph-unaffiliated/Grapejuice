/**
 * Kosher food note. Nothing sends until the piece is approved and a Customer.io template id is set.
 * This module only decides who would get which version and renders the preview.
 */

import { grapejuiceEmailHtml, type EmailThumb } from './emailLayout';

export type KosherNoticeVersion = 'with_food' | 'already_out';

export type KosherFoodLine = { name: string; imageUrl: string };

const FOOD_FACT = 'The food in this box is vegan, and it is not OU-certified kosher.';

/** Included food-slot swaps. Gelt and the other kit are not a fix. Cookie cutters and removing the line are. */
export const KOSHER_FOOD_SWAPS: EmailThumb[] = [
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

function withoutNegatedKosher(text: string): string {
  return text
    .replace(/\bkosher-style\b/gi, '')
    .replace(/\b(?:not|non|isn't|isnt|aren't|arent)\b(?:\s+\w+){0,3}\s+kosher\b/gi, '');
}

/** Same reading as dietNotes: “not kosher” and “kosher-style” do not count. */
export function mentionsKeepingKosher(text: string | null | undefined): boolean {
  const cleaned = withoutNegatedKosher((text ?? '').replace(/\s+/g, ' ').trim());
  return /\bkosher\b/i.test(cleaned);
}

export function edibleFoodLines(
  lines: Array<{ slotId?: string; itemId?: string; label?: string; name?: string; imageUrl?: string }>
): KosherFoodLine[] {
  const out: KosherFoodLine[] = [];
  for (const line of lines) {
    const slot = String(line.slotId ?? '').replace(/::x$/i, '');
    const item = String(line.itemId ?? '');
    const label = String(line.label ?? line.name ?? '').trim();
    const hay = `${slot} ${item} ${label}`.toLowerCase();
    if (/stuffie|plush|\bbook\b/.test(hay)) continue;
    const food =
      /sufgan/.test(hay) ||
      slot === 'latke-mix' ||
      slot === 'latke-kit' ||
      slot === 'applesauce' ||
      /latke|applesauce/.test(hay) ||
      slot === 'gelt' ||
      slot.startsWith('gelt-') ||
      /\bgelt\b/.test(hay);
    if (!food) continue;
    const name = label || (/sufgan/.test(hay) ? 'Sufganiyot kit' : /\bgelt\b/.test(hay) ? 'Chocolate gelt' : 'Latke kit');
    out.push({ name, imageUrl: line.imageUrl ?? '' });
  }
  return out;
}

/**
 * Who gets the note.
 * A kosher household note or a Rav message qualifies even when the food is already out.
 * A practice score of 80 or higher qualifies only while an edible line is still in the box.
 * An untouched 50 does not. A high Hanukkah score by itself does not.
 */
export function kosherNoticeVersion(input: {
  householdNote?: string | null;
  ravText?: string | null;
  practiceScore?: number | null;
  practiceTouched?: boolean;
  edibleNames: string[];
}): KosherNoticeVersion | null {
  const saidKosher = mentionsKeepingKosher(input.householdNote) || mentionsKeepingKosher(input.ravText);
  const highPractice =
    input.practiceTouched === true &&
    typeof input.practiceScore === 'number' &&
    input.practiceScore >= 80;
  if (saidKosher) return input.edibleNames.length ? 'with_food' : 'already_out';
  if (highPractice && input.edibleNames.length) return 'with_food';
  return null;
}

export function renderKosherNotice(input: {
  version: KosherNoticeVersion;
  foods: KosherFoodLine[];
  boxUrl: string;
  swaps?: EmailThumb[];
}): { subject: string; html: string } {
  const subject = 'A note about the food in your box';
  if (input.version === 'already_out') {
    return {
      subject,
      html: grapejuiceEmailHtml({
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
  const foods: EmailThumb[] = input.foods.map((food) => ({
    name: food.name,
    imageUrl: food.imageUrl,
    note: 'Vegan, and not OU-certified.',
  }));
  const swaps = (input.swaps ?? KOSHER_FOOD_SWAPS).filter((swap) => swap.imageUrl || swap.name);
  return {
    subject,
    html: grapejuiceEmailHtml({
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
