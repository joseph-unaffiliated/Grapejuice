/** Tax on an unclaimed autoship is waived. Shipping is $0. Add-ons still owed are not. */
export const AUTO_SHIP_TAX_CENTS = 0;

export type UnclaimedGiftShipReason = 'ships' | 'no_address' | 'owes_addons';

export function unclaimedGiftShipDecision(input: {
  addressComplete: boolean;
  upgradeCents: number;
}): { ship: boolean; taxWaived: boolean; reason: UnclaimedGiftShipReason } {
  if (!input.addressComplete) return { ship: false, taxWaived: false, reason: 'no_address' };
  if (input.upgradeCents > 0) return { ship: false, taxWaived: false, reason: 'owes_addons' };
  return { ship: true, taxWaived: true, reason: 'ships' };
}
