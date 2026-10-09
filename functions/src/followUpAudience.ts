import { createHash } from 'crypto';
import { isTest } from './testAccounts';

/**
 * Customer-list side of the Meta follow-up audience (scripts/meta-followup-list-audience.mjs).
 * The website audience only holds browsers that fired BoxFollowUp in the last 30 days; this list
 * adds account holders who built a box but never added a card, plus static lead lists.
 * Keep imports to crypto and pure local modules so plain-Node scripts can load it.
 */

export const FOLLOW_UP_HOLIDAY_ID = 'hanukkah-2026';
/** Order statuses that mean the household already paid (or committed a card). */
export const PAID_ORDER_STATUSES = ['committed', 'confirmed', 'shipped', 'delivered'];
export const AUDIENCE_SCHEMA = ['EMAIL', 'PHONE', 'FN', 'LN'] as const;

export type FollowUpHousehold = {
  draftLineItems: unknown;
  cardOnFileAt?: unknown;
  stripeDefaultPaymentMethodId?: unknown;
  orderStatuses: unknown[];
  email: string | null;
};

export type FollowUpSkipReason = 'no_box' | 'card_on_file' | 'paid_order' | 'no_email' | 'test';

function boxItemCount(lineItems: unknown): number {
  if (!Array.isArray(lineItems)) return 0;
  return lineItems.reduce<number>((sum, line) => {
    const qty = line && typeof line === 'object' ? (line as { quantity?: unknown }).quantity : 0;
    return sum + (typeof qty === 'number' && qty > 0 ? qty : 0);
  }, 0);
}

export function followUpSkipReason(h: FollowUpHousehold): FollowUpSkipReason | null {
  if (boxItemCount(h.draftLineItems) === 0) return 'no_box';
  if (h.cardOnFileAt || h.stripeDefaultPaymentMethodId) return 'card_on_file';
  if (h.orderStatuses.some((s) => typeof s === 'string' && PAID_ORDER_STATUSES.includes(s))) return 'paid_order';
  if (!normalizeEmail(h.email)) return 'no_email';
  if (isTest(h.email)) return 'test';
  return null;
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

/** Digits with country code; bare 10-digit numbers are taken as US. */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length === 10) return `1${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

export function normalizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().toLowerCase().replace(/[^\p{L}]/gu, '');
  return name || null;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export type AudiencePerson = { email?: unknown; phone?: unknown; firstName?: unknown; lastName?: unknown };

/** One AUDIENCE_SCHEMA row of SHA-256 hashes ('' for missing keys), or null with neither email nor phone. */
export function hashedAudienceRow(p: AudiencePerson): string[] | null {
  const email = normalizeEmail(p.email);
  const phone = normalizePhone(p.phone);
  if (!email && !phone) return null;
  const hash = (v: string | null) => (v ? sha256(v) : '');
  return [hash(email), hash(phone), hash(normalizeName(p.firstName)), hash(normalizeName(p.lastName))];
}

/** Drops rows whose email hash (or, without an email, phone hash) was already seen. */
export function dedupeAudienceRows(rows: string[][]): { rows: string[][]; duplicates: number } {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const row of rows) {
    const key = row[0] ? `e:${row[0]}` : `p:${row[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return { rows: out, duplicates: rows.length - out.length };
}
