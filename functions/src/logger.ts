import * as base from 'firebase-functions/logger';
import { reportError } from './sentry';

export const { debug, info, warn, log, write } = base;

/**
 * Same as firebase-functions/logger.error, plus a Sentry event. Only the message
 * string and any Error are sent — structured args can hold emails and addresses.
 */
export function error(...args: unknown[]): void {
  base.error(...args);
  const message = args.find((a): a is string => typeof a === 'string');
  const err = args.find((a): a is Error => a instanceof Error);
  reportError(err ?? new Error(message ?? 'logger.error'), message);
}
