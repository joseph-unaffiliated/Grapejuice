import type { CatalogAvailability, CatalogBoxOnlyReason, CatalogItem } from '../../types/pilot';
import { formatCatalogDollars } from '../box/buildDefaultBox';
import { resolveCatalogDisplayPrices } from '../box/pricing';

export function boxOnlyFilterLabel(): string {
  return 'Only with a box';
}

/** Gold secondary line under the box price on tiles. */
export function boxOnlyAvailabilityLine(): string {
  return 'only available with a box';
}

/**
 * Hero price for box-only tiles: member / box price, or "Included".
 */
export function boxOnlyHeroPrice(item: CatalogItem): string {
  const { memberCents } = resolveCatalogDisplayPrices(item);
  if (memberCents <= 0) return 'Included';
  return formatCatalogDollars(memberCents);
}

/** PDP secondary line for box-only items. */
export function boxOnlyMemberLine(item: CatalogItem): string {
  const { memberCents } = resolveCatalogDisplayPrices(item);
  if (memberCents <= 0) return 'Included when in a box';
  return `${formatCatalogDollars(memberCents)} when in a box`;
}

export function limitedRemainingLabel(remaining: number, locked: boolean): string {
  if (locked) {
    return remaining === 1 ? 'Only 1 left' : `Only ${remaining} left`;
  }
  return remaining === 1
    ? 'Only 1 left before boxes lock'
    : `Only ${remaining} left before boxes lock`;
}

export function boxOnlyPdpHero(reason: CatalogBoxOnlyReason): string {
  if (reason === 'book') return 'Only available with a Hanukkah box';
  if (reason === 'cap_exhausted') return 'Sold out for direct purchase';
  return 'Only available with a Hanukkah box';
}

export function boxOnlyPdpSubcopy(
  reason: CatalogBoxOnlyReason,
  lockLabel?: string | null
): string | null {
  if (reason === 'book') {
    return 'Story picks come with the box — start a box to choose yours.';
  }
  if (reason === 'cap_exhausted') {
    const when = lockLabel ? ` after boxes lock on ${lockLabel}` : ' after boxes lock';
    return `More may open for direct sale${when}.`;
  }
  if (reason === 'post_lock_flag' || reason === 'post_lock_no_release') {
    return 'This item is reserved for Hanukkah boxes.';
  }
  return 'Add it through a Hanukkah box — it isn’t sold on its own.';
}

export function isBuyNowAvailability(a: CatalogAvailability | undefined): boolean {
  return a?.status === 'direct' || a?.status === 'limited';
}

export function isBoxOnlyAvailability(a: CatalogAvailability | undefined): boolean {
  return a?.status === 'box_only';
}
