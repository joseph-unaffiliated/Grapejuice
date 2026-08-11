/**
 * Client-built co-pilot context for Rav (non-PII).
 * Screens publish focused surface; askRav sends surface + userMemory with each call.
 */

export type RavFocusedEntityType = 'product' | 'category' | 'box' | 'order' | 'content' | 'home';

export type RavFocusedEntity = {
  type: RavFocusedEntityType;
  id: string;
  label?: string;
};

export type RavSurfaceContext = {
  /** Leaf React Navigation route name */
  route: string;
  focusedEntity?: RavFocusedEntity;
  /** How Rav is presented relative to the page */
  overlay: 'drawer' | 'tab' | 'none';
};

export type RavBrowseMemoryEntry = {
  itemId: string;
  name: string;
  viewedAt: string;
};

export type RavWishlistMemoryEntry = {
  itemId: string;
  name?: string;
};

export type RavOrderMemorySummary = {
  id: string;
  status: string;
  createdAt?: string;
  /** Product labels only — never address / payment */
  itemLabels: string[];
};

export type RavUserMemoryContext = {
  browseRecent: RavBrowseMemoryEntry[];
  wishlist: RavWishlistMemoryEntry[];
  ordersSummary: RavOrderMemorySummary[];
};

export type RavCopilotClientContext = {
  surface?: RavSurfaceContext;
  userMemory?: RavUserMemoryContext;
};
