import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { getVisitorId } from '../guest/visitorId';
import { entryFromWindow } from '../guest/guestSessionSync';

/** Mirrors CHECKOUT_FUNNEL_STEPS / CHECKOUT_ERROR_STAGES in functions/src/checkoutFunnel.ts. */
export type CheckoutFunnelStep = 'view' | 'payment' | 'card' | 'purchased';
export type CheckoutErrorStage = 'address' | 'setup' | 'card' | 'commit' | 'load';

const RECORDED_KEY = 'gj.checkoutFunnelRecorded';
const RECORDED_MAX = 100;
const recordedThisLoad = new Set<string>();
const errorsThisLoad = new Set<string>();

function readRecorded(): string[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(RECORDED_KEY) : null;
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

function writeRecorded(list: string[]): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(RECORDED_KEY, JSON.stringify(list.slice(-RECORDED_MAX)));
  } catch {
    // Storage blocked — the in-memory guard still covers this page load.
  }
}

function claimRecord(key: string): boolean {
  if (recordedThisLoad.has(key)) return false;
  recordedThisLoad.add(key);
  const list = readRecorded();
  if (list.includes(key)) return false;
  writeRecorded([...list, key]);
  return true;
}

function releaseRecord(key: string): void {
  recordedThisLoad.delete(key);
  writeRecorded(readRecorded().filter((k) => k !== key));
}

type CheckoutStepPayload = {
  visitorId: string;
  step?: CheckoutFunnelStep;
  commitAttempt?: boolean;
  error?: { stage: CheckoutErrorStage; message: string };
  householdId?: string;
  entry: unknown;
};

function send(payload: Omit<CheckoutStepPayload, 'visitorId' | 'entry'>): boolean {
  const visitorId = getVisitorId();
  if (!functions || !visitorId) return false;
  const callable = httpsCallable<CheckoutStepPayload, { ok: boolean }>(functions, 'recordCheckoutStep');
  void callable({ visitorId, ...payload, entry: entryFromWindow() }).catch(() => undefined);
  return true;
}

/**
 * First time this visitor reaches a checkout step, for stuck-checkout analysis.
 * Web only (needs the visitor id); never throws.
 */
export function recordCheckoutStep(step: CheckoutFunnelStep, householdId?: string | null): void {
  const visitorId = getVisitorId();
  if (!functions || !visitorId) return;
  const key = `${visitorId}:${step}`;
  if (!claimRecord(key)) return;
  const callable = httpsCallable<CheckoutStepPayload, { ok: boolean }>(functions, 'recordCheckoutStep');
  void callable({
    visitorId,
    step,
    ...(householdId ? { householdId } : {}),
    entry: entryFromWindow(),
  }).catch(() => releaseRecord(key));
}

/** Every press of the final commit button (server counts them). */
export function recordCheckoutCommitAttempt(householdId?: string | null): void {
  send({ commitAttempt: true, ...(householdId ? { householdId } : {}) });
}

/** An error that may have left the shopper stuck. Once per stage+message per page load. */
export function recordCheckoutError(stage: CheckoutErrorStage, message: string, householdId?: string | null): void {
  const clean = (message || 'Unknown error').slice(0, 200);
  const key = `${stage}:${clean}`;
  if (errorsThisLoad.has(key)) return;
  errorsThisLoad.add(key);
  send({ error: { stage, message: clean }, ...(householdId ? { householdId } : {}) });
}
