/** Over-allowance boxes approved as-is, matched by email and problem section/item/code. */
export type BoxAuditException = { email: string; section?: string; itemId?: string; code?: string; note: string };

export const BOX_AUDIT_EXCEPTIONS: BoxAuditException[] = [
  { email: 'awhitelaw1@gmail.com', section: 'candles', note: '3 candle sets included (approved 2026-10-14)' },
  { email: 'crosenfeld1992@gmail.com', itemId: 'beeswax-candles', note: 'Free Beeswax add-on (approved 2026-10-14)' },
  { email: 'leahfstern@gmail.com', itemId: 'beeswax-candles', note: 'Free Beeswax add-on (approved 2026-10-14)' },
  { email: 'annielcaprio@gmail.com', itemId: 'beeswax-candles', note: 'Free Beeswax add-on (approved 2026-10-14)' },
  { email: 'annielcaprio@gmail.com', section: 'dreidel', note: '5 dreidels (approved 2026-10-14)' },
  { email: 'tali.brownstein@gmail.com', section: 'food', code: 'over-allowance', note: 'Free Sufganiyot Kit (approved 2026-10-14)' },
  { email: 'brit@studio-thirteen.design', section: 'gelt', code: 'over-allowance', note: 'Party Bag (approved 2026-10-14, committed)' },
  { email: 'ntenzer3@gmail.com', itemId: 'lego-menorah', note: 'Two Lego Menorahs (approved 2026-10-14)' },
  { email: 's.p.straub@gmail.com', itemId: 'lego-menorah', note: 'Lego family menorah (approved 2026-10-14)' },
];
