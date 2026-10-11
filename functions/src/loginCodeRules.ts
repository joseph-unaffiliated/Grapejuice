/**
 * Sign-in code rules, free of Firebase imports so they can be unit tested.
 *
 * A code is six digits, lives 10 minutes, and allows five wrong guesses before it is
 * locked. Only a salted hash of the code is stored (loginCodes/{emailHash}); the
 * document is replaced whenever a new code is requested, so there is at most one live
 * code per email.
 */
import { createHash, randomInt } from 'crypto';

export const LOGIN_CODE_TTL_MS = 10 * 60 * 1000;
export const LOGIN_CODE_MAX_ATTEMPTS = 5;
export const LOGIN_CODE_LENGTH = 6;

export type LoginCodeStatus = 'ok' | 'invalid' | 'expired' | 'used' | 'locked' | 'mismatch';

export type LoginCodeDoc = {
  codeHash: string;
  uid: string;
  expiresAt: number;
  attempts: number;
  usedAt?: number | null;
  createdAt?: number;
  purpose?: string;
};

type TimestampLike = { toMillis(): number };

function millis(v: unknown): number {
  if (typeof v === 'number') return v;
  return v && typeof (v as TimestampLike).toMillis === 'function' ? (v as TimestampLike).toMillis() : 0;
}

/** Cryptographically random six digits, left-padded, as a string. */
export function generateLoginCode(): string {
  return String(randomInt(0, 10 ** LOGIN_CODE_LENGTH)).padStart(LOGIN_CODE_LENGTH, '0');
}

/** Digits only; "412 839", "412-839" and "412839" are the same code. */
export function normalizeLoginCode(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const digits = String(raw).replace(/\D/g, '');
  return digits.length === LOGIN_CODE_LENGTH ? digits : null;
}

/** "412839" shown as "412 839" in the email. */
export function spacedLoginCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

/** The hash is salted with the email hash so the same code for two people never collides. */
export function hashLoginCode(code: string, emailHash: string): string {
  return createHash('sha256').update(`${emailHash}:${code}`).digest('hex');
}

/**
 * Check one guess against the stored document. Returns the status and the document
 * to write back: a wrong guess bumps `attempts`, a right one sets `usedAt`. Nothing is
 * written for expired, used or locked codes; the caller treats those as failures.
 */
export function checkLoginCode(
  doc: Record<string, unknown> | undefined,
  guessHash: string,
  now: number
): { status: LoginCodeStatus; next?: Partial<LoginCodeDoc> } {
  if (!doc || typeof doc.codeHash !== 'string' || typeof doc.uid !== 'string') return { status: 'invalid' };
  if (doc.usedAt) return { status: 'used' };
  const expires = millis(doc.expiresAt);
  if (!expires || expires < now) return { status: 'expired' };
  const attempts = Number(doc.attempts) || 0;
  if (attempts >= LOGIN_CODE_MAX_ATTEMPTS) return { status: 'locked' };
  if (doc.codeHash !== guessHash) {
    return { status: 'mismatch', next: { attempts: attempts + 1 } };
  }
  return { status: 'ok', next: { usedAt: now } };
}

/** What the client is told. Wrong guesses and unknown emails look the same, so nothing leaks. */
export function clientStatusFor(status: LoginCodeStatus): 'ok' | 'invalid' | 'expired' | 'locked' {
  if (status === 'ok') return 'ok';
  if (status === 'expired' || status === 'used') return 'expired';
  if (status === 'locked') return 'locked';
  return 'invalid';
}
