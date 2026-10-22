import { etWeekday } from './time';

/** The clocks the jobs actually use: 10:30am ET daily, and 7pm ET on Sundays. */
export function programClockTicks(from = '2026-10-22', to = '2026-11-07'): string[] {
  const ticks: string[] = [];
  const [y, m, d] = from.split('-').map(Number);
  const cursor = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  const end = to;
  while (cursor.toISOString().slice(0, 10) <= end) {
    const morning = new Date(cursor);
    morning.setUTCHours(14, 30, 0, 0);
    // After Nov 1 the same UTC hour is 9:30am EST, still inside the send window.
    if (cursor.toISOString().slice(0, 10) >= '2026-11-02') morning.setUTCHours(15, 30, 0, 0);
    ticks.push(morning.toISOString());
    if (etWeekday(morning.toISOString()) === 0) {
      const evening = new Date(morning);
      evening.setUTCHours(cursor.toISOString().slice(0, 10) >= '2026-11-02' ? 23 : 23, 0, 0, 0);
      ticks.push(evening.toISOString());
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return ticks;
}
