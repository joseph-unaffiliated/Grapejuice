import * as Sentry from '@sentry/node';
import type * as express from 'express';
import * as https from 'firebase-functions/v2/https';
import * as scheduler from 'firebase-functions/v2/scheduler';

/** Public client key for Sentry project grapejuice-functions (org unaffiliated-4g). */
const SENTRY_DSN =
  'https://7e9d48cda21605204f53ce39d7c49d5a@o4512205993476096.ingest.us.sentry.io/4512206028603392';

/** Only deployed functions report; local builds, tests, deploy discovery and the emulator stay silent. */
const enabled = Boolean(process.env.K_SERVICE) && process.env.FUNCTIONS_EMULATOR !== 'true';

Sentry.init({
  dsn: SENTRY_DSN,
  enabled,
  environment: process.env.GCLOUD_PROJECT ?? 'local',
  serverName: process.env.K_SERVICE,
  // Handlers carry children's names, emails and addresses; send stack traces only.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    databaseQueryData: false,
    queues: false,
    stackFrameVariables: false,
    genAI: { inputs: false, outputs: false },
  },
});

/** HttpsError codes the client is meant to handle (bad input, auth, state) — not bugs. */
const EXPECTED_HTTPS_CODES = new Set<string>([
  'cancelled',
  'invalid-argument',
  'not-found',
  'already-exists',
  'permission-denied',
  'resource-exhausted',
  'failed-precondition',
  'aborted',
  'out-of-range',
  'unauthenticated',
]);

export function reportError(err: unknown, message?: string): void {
  if (!enabled) return;
  if (err instanceof https.HttpsError && EXPECTED_HTTPS_CODES.has(err.code)) return;
  Sentry.withScope((scope) => {
    if (process.env.K_SERVICE) scope.setTag('function', process.env.K_SERVICE);
    if (message) scope.setContext('log', { message });
    if (err instanceof Error) Sentry.captureException(err);
    else Sentry.captureMessage(message ?? String(err), 'error');
  });
}

/** Cloud Functions throttles CPU once a handler returns, so send queued events first. */
async function flush(): Promise<void> {
  if (enabled) await Sentry.flush(2000);
}

async function captured<R>(run: () => R | Promise<R>): Promise<R> {
  try {
    return await run();
  } catch (err) {
    reportError(err);
    throw err;
  } finally {
    await flush();
  }
}

type CallHandler<T, R> = (
  request: https.CallableRequest<T>,
  response?: https.CallableResponse<unknown>,
) => R | Promise<R>;

export function onCall<T = any, R = any>(
  handler: CallHandler<T, R>,
): https.CallableFunction<T, Promise<R>>;
export function onCall<T = any, R = any>(
  opts: https.CallableOptions<T>,
  handler: CallHandler<T, R>,
): https.CallableFunction<T, Promise<R>>;
export function onCall<T = any, R = any>(
  optsOrHandler: https.CallableOptions<T> | CallHandler<T, R>,
  maybeHandler?: CallHandler<T, R>,
): https.CallableFunction<T, Promise<R>> {
  if (typeof optsOrHandler === 'function') {
    const handler = optsOrHandler;
    return https.onCall<T, Promise<R>>((req, res) => captured(() => handler(req, res)));
  }
  const handler = maybeHandler as CallHandler<T, R>;
  return https.onCall<T, Promise<R>>(optsOrHandler, (req, res) => captured(() => handler(req, res)));
}

type RequestHandler = (request: https.Request, response: express.Response) => void | Promise<void>;

export function onRequest(handler: RequestHandler): https.HttpsFunction;
export function onRequest(opts: https.HttpsOptions, handler: RequestHandler): https.HttpsFunction;
export function onRequest(
  optsOrHandler: https.HttpsOptions | RequestHandler,
  maybeHandler?: RequestHandler,
): https.HttpsFunction {
  if (typeof optsOrHandler === 'function') {
    const handler = optsOrHandler;
    return https.onRequest((req, res) => captured(() => handler(req, res)));
  }
  const handler = maybeHandler as RequestHandler;
  return https.onRequest(optsOrHandler, (req, res) => captured(() => handler(req, res)));
}

type ScheduleHandler = (event: scheduler.ScheduledEvent) => void | Promise<void>;

export function onSchedule(
  schedule: string | scheduler.ScheduleOptions,
  handler: ScheduleHandler,
): scheduler.ScheduleFunction {
  const wrapped: ScheduleHandler = (event) => captured(() => handler(event));
  return typeof schedule === 'string'
    ? scheduler.onSchedule(schedule, wrapped)
    : scheduler.onSchedule(schedule, wrapped);
}

/** For triggers without a wrapper above (e.g. v1 auth.user().onCreate). */
export function withSentry<A extends unknown[], R>(
  handler: (...args: A) => R | Promise<R>,
): (...args: A) => Promise<R> {
  return (...args: A) => captured(() => handler(...args));
}

export { HttpsError } from 'firebase-functions/v2/https';
