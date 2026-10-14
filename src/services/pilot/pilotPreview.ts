import { catalogService } from '../firestore/catalog';
import type { PilotInviteView, PilotItem } from './pilotApi';

/**
 * `/pilot/preview-<state>` renders a sample invite without the server, for design checks.
 * States: ready, nobox, draft, joined, checkout, signin, wrong, closed, unavailable.
 */
export function isPilotPreviewToken(token: string): boolean {
  return token.startsWith('preview-');
}

const ITEMS: PilotItem[] = [
  ['toddler-play-menorah', 'Toddler play menorah', 1500],
  ['crispy-the-latke-stuffie', 'Crispy the Latke stuffie', 1000],
  ['airdry-clay-dreidel', 'Air-dry clay dreidel', 300],
  ['party-bag-of-gelt', 'Party bag of gelt', 1800],
  ['shamash-the-menorah-stuffie', 'Shamash the Menorah stuffie', 1000],
  ['dreidel-cookie-cutters', 'Dreidel cookie cutters', 400],
  ['gimmel-the-dreidel-stuffie', 'Gimmel the Dreidel stuffie', 1000],
  ['airdry-clay-menorah', 'Air-dry clay menorah', 300],
  ['jelly-the-sufganiyah-stuffie', 'Jelly the Sufganiyah stuffie', 1000],
].map(([id, name, cents]) => ({
  id: id as string,
  name: name as string,
  memberPriceCents: cents as number,
  imageUrl: null,
  inBox: id === 'airdry-clay-dreidel',
}));

const dates = { lockAt: '2026-11-08T04:59:00.000Z', arrivesBy: '2026-11-21', surveyDueLabel: 'January 15, 2027' };
const boxItems = [
  { itemId: 'book-dino-hanukkah', name: 'Dino-Hanukkah', imageUrl: null, quantity: 1 },
  { itemId: 'beeswax-candles', name: 'Beeswax candles', imageUrl: null, quantity: 1 },
  { itemId: 'airdry-clay-dreidel', name: 'Air-dry clay dreidel', imageUrl: null, quantity: 2 },
];
const orderBox = { kind: 'order' as const, items: boxItems, address: '12 Elm St, Brooklyn, NY 11201', cardOnFile: true };
const picks = ITEMS.filter((i) => ['toddler-play-menorah', 'crispy-the-latke-stuffie', 'party-bag-of-gelt'].includes(i.id)).map((i) => ({
  itemId: i.id,
  name: i.name,
  deferredChargeCents: i.memberPriceCents,
  imageUrl: null,
}));

export function pilotPreviewView(token: string): PilotInviteView {
  const firstName = 'Rachel';
  switch (token.slice('preview-'.length)) {
    case 'nobox':
      return { state: 'ready', firstName, dates, box: { kind: 'none', items: [], address: null, cardOnFile: false }, items: ITEMS, pickCount: 3 };
    case 'draft':
      return { state: 'ready', firstName, dates, box: { ...orderBox, kind: 'draft', address: null, cardOnFile: false }, items: ITEMS, pickCount: 3 };
    case 'joined':
      return { state: 'joined', firstName, dates, box: orderBox, enrollment: { status: 'enrolled', picks, totalCents: 4300 } };
    case 'checkout':
      return { state: 'joined', firstName, dates, box: orderBox, enrollment: { status: 'awaiting_checkout', picks, totalCents: 4300 } };
    case 'signin':
      return { state: 'sign_in', firstName, maskedEmail: 'ra•••@gmail.com', dates };
    case 'wrong':
      return { state: 'wrong_account', firstName, maskedEmail: 'ra•••@gmail.com' };
    case 'closed':
      return { state: 'closed', firstName };
    case 'unavailable':
      return { state: 'unavailable' };
    default:
      return { state: 'ready', firstName, dates, box: orderBox, items: ITEMS, pickCount: 3 };
  }
}

/** `view` with real catalog photos, so previews look like a live invite. Unchanged if the catalog can't load. */
export async function withPreviewImages(view: PilotInviteView): Promise<PilotInviteView> {
  const ids = [...ITEMS.map((i) => i.id), ...boxItems.map((i) => i.itemId)];
  const catalog = await catalogService.getMany(ids).catch(() => []);
  const photo = new Map(catalog.map((c) => [c.id, c.imageThumbUrls?.[0] ?? c.imageUrl ?? null]));
  const fill = <T extends { imageUrl: string | null }>(row: T, id: string): T => ({ ...row, imageUrl: photo.get(id) ?? row.imageUrl });
  const v = { ...view } as PilotInviteView & Record<string, unknown>;
  if ('items' in view) v.items = view.items.map((i) => fill(i, i.id));
  if ('box' in view) v.box = { ...view.box, items: view.box.items.map((i) => fill(i, i.itemId)) };
  if ('enrollment' in view) v.enrollment = { ...view.enrollment, picks: view.enrollment.picks.map((p) => fill(p, p.itemId)) };
  return v;
}
