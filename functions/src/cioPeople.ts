import { emailHash } from './guestSessions';

/**
 * Customer.io App API people search (POST /v1/customers). The inventory emails use it to find
 * the address behind a signed-out visitor's Retention lead (guestSessions.lastLeadEmailHash) and
 * to skip anyone unsubscribed. Returns hashes → addresses; callers never log the addresses.
 */

const BASE_URL = 'https://api.customer.io/v1';
const PAGE = 1000;
const MAX_PAGES = 50;

type CioFilter = Record<string, unknown>;
type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export async function searchPeopleEmails(apiKey: string, filter: CioFilter, fetchImpl: FetchLike = fetch): Promise<string[]> {
  const emails: string[] = [];
  let start: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${BASE_URL}/customers?limit=${PAGE}${start ? `&start=${encodeURIComponent(start)}` : ''}`;
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter }),
    });
    if (!res.ok) throw new Error(`Customer.io people search ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { identifiers?: Array<{ email?: unknown }>; next?: unknown };
    const ids = Array.isArray(data.identifiers) ? data.identifiers : [];
    for (const id of ids) {
      if (typeof id?.email === 'string' && id.email.includes('@')) emails.push(id.email.trim().toLowerCase());
    }
    start = typeof data.next === 'string' && data.next ? data.next : null;
    if (!start || !ids.length) break;
  }
  return emails;
}

const exists = (field: string) => ({ attribute: { field, operator: 'exists' } });
const isTrue = (field: string) => ({ attribute: { field, operator: 'eq', value: 'true' } });

/** Retention leads (grapejuice_lead) keyed by emailHash. */
export async function leadEmailsByHash(apiKey: string, fetchImpl?: FetchLike): Promise<Map<string, string>> {
  const emails = await searchPeopleEmails(apiKey, { and: [exists('grapejuice_lead')] }, fetchImpl);
  return new Map(emails.map((e) => [emailHash(e), e]));
}

/** Hashes of everyone unsubscribed in any of the given workspaces. */
export async function unsubscribedHashes(apiKeys: string[], fetchImpl?: FetchLike): Promise<Set<string>> {
  const out = new Set<string>();
  for (const key of apiKeys) {
    const emails = await searchPeopleEmails(key, { and: [isTrue('unsubscribed')] }, fetchImpl);
    for (const e of emails) out.add(emailHash(e));
  }
  return out;
}
