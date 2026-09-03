/**
 * The browser location as the JS bundle first evaluated it — before React
 * Navigation's default web route (`StorefrontHome` → `/store`) can rewrite it.
 *
 * Link effects that read `window.location` at mount time lose inbound landings:
 * the first state sync changes the address bar, and a remount (Fast Refresh,
 * a gate flip) then looks like a `/store` deep link.
 */
export type BootLocation = {
  pathname: string;
  search: string;
};

let boot: BootLocation | null | undefined;

export function getBootLocation(): BootLocation | null {
  if (boot !== undefined) return boot;
  if (typeof window === 'undefined') {
    boot = null;
    return null;
  }
  boot = {
    pathname: window.location.pathname,
    search: window.location.search,
  };
  return boot;
}

/** Capture immediately on import, before NavigationContainer's first sync. */
getBootLocation();

/**
 * Keep the inbound landing path in the address bar until the landing screen
 * mounts (or we decide there isn't one). Without this, the default
 * StorefrontHome state rewrites `/interfaith` → `/store` and a refresh of
 * that rewritten URL is a store deep link.
 */
let preserveInboundLandingUrl = true;

export function shouldPreserveInboundLandingUrl(): boolean {
  return preserveInboundLandingUrl;
}

export function consumeInboundLandingUrlPreserve(): void {
  preserveInboundLandingUrl = false;
}
