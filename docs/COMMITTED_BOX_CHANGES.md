# Changes to committed boxes

Every change made to a committed (secured) Hanukkah box after the customer committed it, so
each family can be told personally. Add a row whenever a script, job or manual edit changes a
committed order's items or totals. Backups of the order before each change are in
`backups/<repair folder>/`.

| Date | Customer | Order | What changed | Price effect | Why | Told them? |
|---|---|---|---|---|---|---|
| 2026-10-14 | Jenni (jenniandlulu@aol.com) | `households/xIYrJ28gHgauVQ7o60lY/orders/RhmAB8udBNaqUv53V2YW` | Lego Menorah: 3 free → 1 included + 2 paid ($15 each). Air-dry Clay Menorah (same kid): 2 free + 1 paid → 1 included + 2 paid ($3 each). | Subtotal $279.95 → $312.95, tax $21.00 → $23.47, total $300.95 → $336.42 (+$35.47) | A bug let extra units be added at $0; the extras became paid add-ons (approved Oct 14). | No |
| 2026-10-14 | Amy (awhitelaw1@gmail.com) | `households/zqv5Xht9K6M3YfD6zAoE/orders/Hv2TXHIofh2SGcVx3Ylk` | Beeswax Candles ×3: all 3 marked included (they were already $0). | None ($86.00 total unchanged) | Approved exception: keeps 3 candle sets free. | No |

## Draft changes worth a note

Uncommitted drafts changed by a script, logged here because the customer may notice.

| Date | Customer | Draft | What changed | Price effect | Why | Told them? |
|---|---|---|---|---|---|---|
| 2026-10-15 | frosty.windowpanes@gmail.com | `households/UNIFPanrFUupUM73NPk4/boxDrafts/hanukkah-2026` | Draw Your Own Dreidel 2 → 1 (2 donated), as they had set it. | None (all $0) | A load-time repair had refilled the dreidels they lowered; restored their choice (approved Oct 15). | No |
| 2026-10-15 | perks057@gmail.com | `households/zVFngNCgop3q3EruwylW/boxDrafts/hanukkah-2026` | Airdry Clay Dreidel 3 → 1 (2 donated), as they had set it. | None (all $0) | Same repair bug; restored their choice (approved Oct 15). | No |

Committed boxes reported by the Oct 15 audit but **not changed** (your call pending):
choconaut, smussmacher15, misssarcasm35, m.deitsch, brit, jestillman. See the Oct 15 audit
report (`npx tsx scripts/box-audit.ts`). Record your call on Admin → Boxes → Box problems
(expand the row). Ready-to-send emails for the two committed edits above (and the draft
restores) are in [`COMMITTED_BOX_CHANGE_EMAILS.md`](./COMMITTED_BOX_CHANGE_EMAILS.md).
