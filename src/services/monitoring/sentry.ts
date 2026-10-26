import * as Sentry from '@sentry/react-native';
import { Platform } from 'react-native';

/** Public client key (project react-native in org unaffiliated-4g); safe to ship in the bundle. */
const SENTRY_DSN =
  'https://3163708495a2acd80f822d503aaec010@o4512205993476096.ingest.us.sentry.io/4512206006255616';

function isLocalWeb(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

export function initSentry(): void {
  Sentry.init({
    dsn: SENTRY_DSN,
    enabled: !__DEV__ && !isLocalWeb(),
    environment: __DEV__ ? 'development' : 'production',
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    // Third-party noise we can't act on: in-app browser bridges (Instagram / Facebook),
    // IndexedDB teardown, Retention's API, OneTrust / Clarity internals, browser extensions.
    ignoreErrors: [
      /Error invoking postMessage/,
      /window\.webkit\.messageHandlers/,
      /The database connection is closing/,
      /Connection to Indexed Database server lost/,
      /Database deleted by request of the user/,
      /The element has no supported sources/,
      /ResizeObserver loop completed with undelivered notifications/,
      /execute-api\.us-west-2\.amazonaws\.com/,
      /reading 'sequence'/,
      /evaluating 'e\.Domain'/,
      /reading 'html'\)?$/,
      /runtime\.sendMessage\(\)/,
    ],
    denyUrls: [/^iabjs:\/\//, /clarity\.ms/, /cookielaw\.org/, /onetrust\.com/, /^(chrome|moz|safari(-web)?)-extension:\/\//],
  });
}

export { Sentry };
