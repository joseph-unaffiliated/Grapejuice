/** Session-only unlock for convert-to-credit if server viewedAt lags. */
const viewedThisSession = new Set<string>();

export function noteReceivedGiftViewedThisSession(giftInviteId: string) {
  const id = giftInviteId.trim();
  if (id) viewedThisSession.add(id);
}

export function wasReceivedGiftViewedThisSession(giftInviteId: string): boolean {
  return viewedThisSession.has(giftInviteId.trim());
}
