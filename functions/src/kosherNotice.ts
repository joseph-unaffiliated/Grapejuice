/**
 * Kosher food note. Sends once, from the hourly job, while food is still in the box.
 * sendEmail skips it while the Customer.io template id is 0, and nothing is marked sent.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { grapejuiceEmailHtml } from './emailLayout';
import { sendEmail } from './email';
import { isTest } from './testAccounts';

export type KosherNoticeVersion = 'with_food';

export type KosherFoodLine = { name: string; imageUrl: string };

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

function withoutNegatedDiet(text: string): string {
  return text
    .replace(/\bnon[-\s]?vegan\b/gi, '')
    .replace(/\b(?:not|isn't|isnt|aren't|arent)\b(?:\s+\w+){0,4}\s+vegan\b/gi, '')
    .replace(/\b(?:not|isn't|isnt|aren't|arent)\b(?:\s+\w+){0,4}\s+(?:gluten[-\s]?free|celiac|coeliac)\b/gi, '')
    .replace(/\b(?:not|isn't|isnt|aren't|arent)\b(?:\s+\w+){0,3}\s+gluten\b/gi, '');
}

/** A household note that mentions vegan, celiac, or gluten-free. “Not vegan” does not count. */
export function mentionsVeganOrGlutenFree(text: string | null | undefined): boolean {
  const cleaned = withoutNegatedDiet((text ?? '').replace(/\s+/g, ' ').trim());
  if (/\bvegan\b/i.test(cleaned)) return true;
  return (
    /\b(?:gluten[-\s]?free|no gluten|without gluten|zero gluten|celiac|coeliac|gluten[-\s]?(?:allergy|intoleran\w*)|allergic to gluten)\b/i.test(
      cleaned
    ) || /\b(?:can't|cannot|cant|don't|do not|won't|wont|avoid)\s+(?:have\s+|eat\s+|do\s+)?gluten\b/i.test(cleaned)
  );
}

/** Latke mix or sufganiyot mix still in the box. Gelt, books, and stuffies do not count. */
export function hasLatkeOrSufganiyotKit(
  lines: Array<{ slotId?: string; itemId?: string; label?: string; name?: string }>
): boolean {
  return lines.some((line) => {
    const slot = String(line.slotId ?? '').replace(/::x$/i, '');
    const item = String(line.itemId ?? '');
    const label = String(line.label ?? line.name ?? '');
    const hay = `${slot} ${item} ${label}`.toLowerCase();
    if (/stuffie|plush|\bbook\b/.test(hay)) return false;
    if (/sufgan/.test(hay)) return true;
    if (slot === 'latke-mix' || slot === 'latke-kit') return true;
    return /latke[-\s]?(kit|mix)/.test(hay);
  });
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
      /\blatke\b/.test(hay) ||
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
 * Who gets the note. Only while latke mix, sufganiyot mix, or gelt is still in the box.
 * A kosher household note, a Rav message, or a touched practice score of 80 or higher qualifies.
 * A vegan, celiac, or gluten-free note qualifies only when a latke or sufganiyot kit is still in the box.
 * An untouched 50 does not. A high Hanukkah score by itself does not.
 */
export function kosherNoticeVersion(input: {
  householdNote?: string | null;
  ravText?: string | null;
  practiceScore?: number | null;
  practiceTouched?: boolean;
  edibleNames: string[];
  hasMixKit?: boolean;
}): KosherNoticeVersion | null {
  if (!input.edibleNames.length) return null;
  const saidKosher = mentionsKeepingKosher(input.householdNote) || mentionsKeepingKosher(input.ravText);
  const highPractice =
    input.practiceTouched === true &&
    typeof input.practiceScore === 'number' &&
    input.practiceScore >= 80;
  const dietNote = mentionsVeganOrGlutenFree(input.householdNote) && input.hasMixKit === true;
  if (saidKosher || highPractice || dietNote) return 'with_food';
  return null;
}

export function renderKosherNotice(input: {
  foods: KosherFoodLine[];
  boxUrl: string;
}): { subject: string; html: string } {
  return {
    subject: 'A note about the food items in your box',
    html: grapejuiceEmailHtml({
      campaign: 'kosher_notice',
      preheader: "You can ignore this if you don't have dietary restrictions",
      title: 'Review the food items in your box',
      paragraphs: [
        "You can ignore this if it's not relevant to you, but we just wanted to ensure you were aware that (a) none of the food items in this box are certified kosher and (b) the latke and sufganiyot mixes have flour and call for egg.",
        'All items are dairy-free (pareve), including the gelt, and the mixes can be made vegan with an egg-substitute (not provided).',
        'Make any swaps or changes between now and Nov. 7.',
      ],
      thumbsTitle: 'Food items in your box',
      thumbs: input.foods.map((food) => ({ name: food.name, imageUrl: food.imageUrl })),
      ctaLabel: 'Review my box',
      ctaUrl: input.boxUrl,
    }),
  };
}

type DraftLine = { slotId?: string; itemId?: string; label?: string; name?: string; imageUrl?: string };

/** One note per person. Already-sent accounts are skipped. A failed send is retried next hour. */
export async function runKosherNotices(db: Firestore, now = new Date()): Promise<{ sent: number }> {
  const [users, drafts, chats] = await Promise.all([
    db.collection('users').select('email', 'ravNotes', 'lastBoxAnswers', 'householdId', 'kosherNoticeSentAt').get(),
    db.collectionGroup('boxDrafts').get(),
    db.collectionGroup('aiChats').select('messages').get(),
  ]);

  const ravByUid = new Map<string, string>();
  for (const doc of chats.docs) {
    const uid = doc.ref.parent.parent?.id;
    if (!uid || doc.ref.parent.id !== 'aiChats' || ravByUid.has(uid)) continue;
    const msgs = doc.data().messages;
    if (!Array.isArray(msgs)) continue;
    const text = msgs
      .filter((m) => m && (m as { role?: string }).role !== 'assistant')
      .map((m) => String((m as { content?: unknown }).content ?? ''))
      .join('\n');
    if (mentionsKeepingKosher(text)) ravByUid.set(uid, text);
  }

  const draftByHousehold = new Map<string, DraftLine[]>();
  for (const doc of drafts.docs) {
    const hh = doc.ref.parent.parent;
    if (doc.id !== 'hanukkah-2026' || hh?.parent.id !== 'households') continue;
    const lines = doc.data().lineItems;
    draftByHousehold.set(hh.id, Array.isArray(lines) ? lines : []);
  }

  const pending: Array<{ ref: FirebaseFirestore.DocumentReference; email: string; lines: DraftLine[] }> = [];
  const itemIds = new Set<string>();
  for (const user of users.docs) {
    const data = user.data();
    if (typeof data.kosherNoticeSentAt === 'string') continue;
    const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
    if (!email || isTest(email)) continue;
    const answers = (data.lastBoxAnswers ?? {}) as { practiceFrequencyScore?: unknown; ravNotes?: unknown };
    const practice = typeof answers.practiceFrequencyScore === 'number' ? answers.practiceFrequencyScore : null;
    const hid = typeof data.householdId === 'string' ? data.householdId : '';
    const lines = draftByHousehold.get(hid) ?? [];
    const foods = edibleFoodLines(lines);
    const householdNote = [data.ravNotes, answers.ravNotes].filter((n): n is string => typeof n === 'string').join('\n');
    const version = kosherNoticeVersion({
      householdNote,
      ravText: ravByUid.get(user.id) ?? '',
      practiceScore: practice,
      practiceTouched: practice != null && practice !== 50,
      edibleNames: foods.map((food) => food.name),
      hasMixKit: hasLatkeOrSufganiyotKit(lines),
    });
    if (!version) continue;
    for (const line of lines) {
      if (line?.itemId && edibleFoodLines([line]).length) itemIds.add(line.itemId);
    }
    pending.push({ ref: user.ref, email, lines });
  }

  const imageById = new Map<string, string>();
  if (itemIds.size) {
    const snaps = await db.getAll(...[...itemIds].map((id) => db.doc(`catalog/hanukkah/items/${id}`)));
    for (const snap of snaps) {
      const image = snap.data()?.imageUrl;
      if (typeof image === 'string' && image) imageById.set(snap.id, image);
    }
  }

  let sent = 0;
  for (const person of pending) {
    const foods = person.lines.flatMap((line) => {
      const [food] = edibleFoodLines([line]);
      if (!food) return [];
      const fromCatalog = line.itemId ? imageById.get(line.itemId) ?? '' : '';
      return [{ name: food.name, imageUrl: line.imageUrl || fromCatalog }];
    });
    const rendered = renderKosherNotice({ foods, boxUrl: 'https://grapejuice.co/box' });
    const result = await sendEmail({
      to: person.email,
      template: 'kosher-notice',
      data: { subject: rendered.subject, html: rendered.html },
    });
    if (result !== 'sent') continue;
    await person.ref.set({ kosherNoticeSentAt: now.toISOString() }, { merge: true });
    sent += 1;
  }
  return { sent };
}
