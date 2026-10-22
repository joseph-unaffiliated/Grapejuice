import { applyDecision, decideNext, type DecideInput, type DecideResult } from './decideNext';
import { etDate } from './time';

export type TouchHistogram = {
  people: number;
  byTouches: Record<string, number>;
  maxTouches: number;
  overDaily: number;
  overWeekly: number;
  skips: number;
  sends: number;
};

/** Walk every person through `ticks` (ISO timestamps). Mutates nothing on the inputs. */
export function simulateProgram(people: DecideInput[], ticks: string[], pilotInviteCap = 90): TouchHistogram {
  const byTouches: Record<string, number> = {};
  let maxTouches = 0;
  let overDaily = 0;
  let overWeekly = 0;
  let skips = 0;
  let sends = 0;

  for (const start of people) {
    let state: DecideInput = { ...start, sends: [...start.sends] };
    const dayCount = new Map<string, number>();
    let invitesToday = 0;
    let lastDay = '';
    for (const now of ticks) {
      const day = etDate(now);
      if (day !== lastDay) {
        invitesToday = 0;
        lastDay = day;
      }
      state = { ...state, now, allowPilotInvite: invitesToday < pilotInviteCap };
      const result: DecideResult = decideNext(state);
      if (result.action === 'skip') skips += 1;
      if (result.action === 'send') {
        sends += 1;
        if (result.stage === 'pilot_invite') invitesToday += 1;
        if (result.marketing) {
          dayCount.set(day, (dayCount.get(day) ?? 0) + 1);
        }
      }
      state = applyDecision(state, result);
    }
    const touches = state.sends.filter((s) => !s.skipped && s.stage !== 'swap').length;
    maxTouches = Math.max(maxTouches, touches);
    const key = String(touches);
    byTouches[key] = (byTouches[key] ?? 0) + 1;
    for (const n of dayCount.values()) if (n > 1) overDaily += 1;
    if (weeklyOverflow(state, ticks)) overWeekly += 1;
  }

  return { people: people.length, byTouches, maxTouches, overDaily, overWeekly, skips, sends };
}

function weeklyOverflow(state: DecideInput, ticks: string[]): boolean {
  const days = state.sends.filter((s) => s.marketing && !s.skipped).map((s) => etDate(s.at));
  const uniq = [...new Set(ticks.map(etDate))];
  for (const day of uniq) {
    const inWindow = days.filter((d) => d <= day && d >= addCalendar(day, -6));
    if (inWindow.length > 4) return true;
  }
  return false;
}

function addCalendar(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10);
}
