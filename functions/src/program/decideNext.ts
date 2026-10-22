/**
 * One person, one message. Pure: no Firestore, no clock other than `input.now`.
 * Every sender in the conversion program is a stage here.
 */
import { addDays, daysBetween, etDate, inPilotWindow, inQuietHours } from './time';

export const PROGRAM_START = '2026-10-21';
export const PROGRAM_END = '2026-11-07';
export const WAVE1_START = '2026-10-22';
export const WAVE1_END = '2026-10-28';
export const WAVE2_START = '2026-11-04';
export const WAVE2_END = '2026-11-07';
/** Phone layout went live Oct 11 2026 ~1pm ET. */
export const FACELIFT_CUTOFF = '2026-10-11T17:00:00.000Z';

export const DAILY_CAP = 1;
export const WEEKLY_CAP = 4;
export const PILOT_LIFETIME_CAP = 5;
export const COUPON_LIFETIME_CAP = 6;
export const SURVEY_CAP = 3;
export const STALE_DAYS = 2;
export const ACTIVITY_HOLD_MS = 48 * 60 * 60 * 1000;
export const ABANDONER_HOLD_MS = 72 * 60 * 60 * 1000;

export type ProgramStage =
  | 'swap'
  | 'lock_t7'
  | 'lock_t3'
  | 'lock_t1'
  | 'abandoner'
  | 'pilot_invite'
  | 'pilot_d3'
  | 'pilot_d7'
  | 'd1'
  | 'd4'
  | 'd8'
  | 'wave2'
  | 'low_stock'
  | 'survey';

export type Track = 'pilot' | 'coupon';

export type ProgramSend = {
  stage: ProgramStage;
  at: string;
  /** Counts toward the daily and weekly caps. Merged stages and skips do not. */
  marketing: boolean;
  skipped?: boolean;
};

export type DecideInput = {
  now: string;
  lockAt: string;
  stopped: boolean;
  track: Track;
  preFacelift: boolean;
  reachedPayment: boolean;
  /** When this person's program clock started (draft old enough, or launch day). */
  anchorAt: string;
  draftTouchedAt: string | null;
  enrolled: boolean;
  pilotEmailedAt: string | null;
  pilotFollowUpAt: string | null;
  pilotD7At: string | null;
  sends: ProgramSend[];
  swapDue: boolean;
  lowStockDue: boolean;
  /** Reached payment 2–24h ago and has not been nudged for it. */
  liveAbandonerDue: boolean;
  /** Post-lock debrief sequence. The caller leaves this false through Nov 7. */
  surveyDue: boolean;
  /** Job sets this false once today's pilot-invite batch is full. */
  allowPilotInvite?: boolean;
};

export type DecideResult =
  | { action: 'none'; reason: string }
  | { action: 'skip'; stage: ProgramStage; reason: string }
  | {
      action: 'send';
      stage: ProgramStage;
      reason: string;
      merged: ProgramStage[];
      variant: string;
      marketing: boolean;
    };

type Due = { stage: ProgramStage; due: string };

/** Stages that were already due before launch become due on launch day, not stale on day one. */
function floorDue(due: string): string {
  return due < '2026-10-22' ? '2026-10-22' : due;
}

const LOCKS: Array<{ stage: ProgramStage; daysBefore: number }> = [
  { stage: 'lock_t1', daysBefore: 1 },
  { stage: 'lock_t3', daysBefore: 3 },
  { stage: 'lock_t7', daysBefore: 7 },
];

function handled(input: DecideInput, stage: ProgramStage): ProgramSend | null {
  const fromLog = input.sends.find((s) => s.stage === stage);
  if (fromLog) return fromLog;
  if (stage === 'pilot_invite' && input.pilotEmailedAt) {
    return { stage, at: input.pilotEmailedAt, marketing: true };
  }
  if (stage === 'pilot_d3' && input.pilotFollowUpAt) {
    return { stage, at: input.pilotFollowUpAt, marketing: true };
  }
  if (stage === 'pilot_d7' && input.pilotD7At) {
    return { stage, at: input.pilotD7At, marketing: true };
  }
  return null;
}

function isLock(stage: ProgramStage): boolean {
  return stage === 'lock_t7' || stage === 'lock_t3' || stage === 'lock_t1';
}

function countsDaily(s: ProgramSend): boolean {
  return s.marketing && !s.skipped;
}

export function marketingToday(sends: ProgramSend[], now: string): number {
  const day = etDate(now);
  return sends.filter((s) => countsDaily(s) && etDate(s.at) === day).length;
}

export function marketingInLast7Days(sends: ProgramSend[], now: string): number {
  const today = etDate(now);
  return sends.filter((s) => countsDaily(s) && daysBetween(etDate(s.at), today) <= 6 && daysBetween(etDate(s.at), today) >= 0).length;
}

export function lifetimeProgramSends(sends: ProgramSend[]): number {
  return sends.filter((s) => countsDaily(s) && !isLock(s.stage) && s.stage !== 'survey' && s.stage !== 'swap').length;
}

function activityHold(input: DecideInput): boolean {
  if (!input.draftTouchedAt) return false;
  const touched = Date.parse(input.draftTouchedAt);
  if (!Number.isFinite(touched)) return false;
  return Date.parse(input.now) - touched < ACTIVITY_HOLD_MS;
}

function abandonerHold(input: DecideInput): boolean {
  const sent = handled(input, 'abandoner');
  if (!sent || sent.skipped) return false;
  return Date.parse(input.now) - Date.parse(sent.at) < ABANDONER_HOLD_MS;
}

function dueList(input: DecideInput): Due[] {
  const lockDate = etDate(input.lockAt);
  const anchor = etDate(input.anchorAt);
  const out: Due[] = [];
  for (const lock of LOCKS) {
    if (!handled(input, lock.stage)) out.push({ stage: lock.stage, due: floorDue(addDays(lockDate, -lock.daysBefore)) });
  }
  if (input.track === 'pilot' && !input.enrolled) {
    if (!handled(input, 'pilot_invite')) out.push({ stage: 'pilot_invite', due: floorDue(anchor) });
    const invite = handled(input, 'pilot_invite');
    if (invite && !handled(input, 'pilot_d3')) {
      const base = invite.skipped ? anchor : etDate(invite.at);
      out.push({ stage: 'pilot_d3', due: floorDue(addDays(base, 3)) });
    }
    const d3 = handled(input, 'pilot_d3');
    if (d3 && !handled(input, 'pilot_d7')) {
      const inviteAt = invite ? (invite.skipped ? anchor : etDate(invite.at)) : anchor;
      const base = d3.skipped ? addDays(inviteAt, 3) : etDate(d3.at);
      out.push({ stage: 'pilot_d7', due: floorDue(addDays(base, 4)) });
    }
  }
  if (input.track === 'coupon') {
    if (!handled(input, 'd1')) out.push({ stage: 'd1', due: floorDue(anchor) });
    const d1 = handled(input, 'd1');
    const codeLive = etDate(input.now) <= '2026-11-04';
    if (d1 && !handled(input, 'd4') && codeLive) {
      out.push({ stage: 'd4', due: floorDue(addDays(d1.skipped ? anchor : etDate(d1.at), 3)) });
    }
    const d4 = handled(input, 'd4');
    if ((d4 || (d1 && !codeLive)) && !handled(input, 'd8')) {
      const d4Due = addDays(d1 ? (d1.skipped ? anchor : etDate(d1.at)) : anchor, 3);
      const base = d4 ? (d4.skipped ? d4Due : etDate(d4.at)) : d4Due;
      out.push({ stage: 'd8', due: floorDue(addDays(base, 4)) });
    }
    if (!handled(input, 'wave2')) out.push({ stage: 'wave2', due: WAVE2_START });
  }
  return out;
}

function variantFor(stage: ProgramStage, input: DecideInput, merged: ProgramStage[]): string {
  const bits: string[] = [stage, ...merged];
  if (input.preFacelift && (stage === 'd1' || stage === 'pilot_invite')) bits.push('s6');
  if (input.reachedPayment && (stage === 'd1' || stage === 'd4' || stage === 'pilot_invite' || stage === 'abandoner')) {
    bits.push('was_at_payment');
  }
  return bits.join('+');
}

function send(stage: ProgramStage, reason: string, input: DecideInput, merged: ProgramStage[] = [], marketing = true): DecideResult {
  return { action: 'send', stage, reason, merged, variant: variantFor(stage, input, merged), marketing };
}

const DRIP_HELD = new Set<ProgramStage>(['pilot_invite', 'pilot_d3', 'pilot_d7', 'd1', 'd4', 'd8', 'wave2', 'low_stock']);

export function decideNext(input: DecideInput): DecideResult {
  if (input.stopped) return { action: 'none', reason: 'stopped' };
  const today = etDate(input.now);

  if (input.swapDue && !input.sends.some((s) => s.stage === 'swap' && !s.skipped && etDate(s.at) === today)) {
    return send('swap', 'operational_swap', input, [], false);
  }

  if (today > PROGRAM_END) {
    if (!input.surveyDue) return { action: 'none', reason: 'program_over' };
    const surveys = input.sends.filter((s) => s.stage === 'survey' && !s.skipped);
    const last = surveys[surveys.length - 1];
    if (surveys.length >= SURVEY_CAP) return { action: 'none', reason: 'survey_cap' };
    if (last && daysBetween(etDate(last.at), today) < 5) return { action: 'none', reason: 'survey_wait' };
    if (!inQuietHours(input.now)) return { action: 'none', reason: 'quiet_hours' };
    return send('survey', 'pilot_survey', input, [], false);
  }

  const dues = dueList(input).sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
  const ready = dues.filter((d) => daysBetween(d.due, today) >= 0 && daysBetween(d.due, today) <= STALE_DAYS);
  const lock = LOCKS.map((l) => ready.find((d) => d.stage === l.stage)).find(Boolean);
  // A date-fixed lock email is not postponed so we can skip an old drip step.
  // The stale step is skipped on the next day, when the lock is no longer due.
  if (!lock) {
    const stale = dues.find((d) => daysBetween(d.due, today) > STALE_DAYS);
    if (stale) return { action: 'skip', stage: stale.stage, reason: `stale_${stale.stage}` };
  }
  const pilot = ready.find((d) => d.stage === 'pilot_invite' || d.stage === 'pilot_d3' || d.stage === 'pilot_d7');
  const drip = ready.find((d) => d.stage === 'd1' || d.stage === 'd4' || d.stage === 'd8' || d.stage === 'wave2');

  let chosen: ProgramStage | null = null;
  let reason = '';
  if (lock) {
    chosen = lock.stage;
    reason = lock.stage;
  } else if (input.liveAbandonerDue && !handled(input, 'abandoner')) {
    chosen = 'abandoner';
    reason = 'live_abandoner';
  } else if (pilot) {
    chosen = pilot.stage;
    reason = pilot.stage;
  } else if (drip) {
    chosen = drip.stage;
    reason = drip.stage;
  } else if (input.lowStockDue && !handled(input, 'low_stock')) {
    chosen = 'low_stock';
    reason = 'low_stock';
  } else if (input.surveyDue) {
    const surveys = input.sends.filter((s) => s.stage === 'survey' && !s.skipped);
    const last = surveys[surveys.length - 1];
    if (surveys.length < SURVEY_CAP && (!last || daysBetween(etDate(last.at), today) >= 5)) {
      chosen = 'survey';
      reason = 'pilot_survey';
    }
  }

  if (!chosen) return { action: 'none', reason: 'nothing_due' };

  if (chosen !== 'survey' && !inQuietHours(input.now)) return { action: 'none', reason: 'quiet_hours' };
  if (chosen === 'survey' && !inQuietHours(input.now)) return { action: 'none', reason: 'quiet_hours' };

  if ((chosen === 'pilot_invite' || chosen === 'pilot_d3' || chosen === 'pilot_d7') && !inPilotWindow(input.now)) {
    return { action: 'none', reason: 'outside_pilot_window' };
  }
  if (chosen === 'pilot_invite' && input.allowPilotInvite === false) {
    return { action: 'none', reason: 'pilot_batch_full' };
  }

  if (activityHold(input) && DRIP_HELD.has(chosen)) return { action: 'none', reason: 'activity_hold' };
  if (abandonerHold(input) && (chosen === 'd1' || chosen === 'd4' || chosen === 'd8' || chosen === 'wave2')) {
    return { action: 'none', reason: 'abandoner_hold' };
  }

  const marketing = chosen !== 'survey';
  if (marketing) {
    if (marketingToday(input.sends, input.now) >= DAILY_CAP) return { action: 'none', reason: 'daily_cap' };
    if (marketingInLast7Days(input.sends, input.now) >= WEEKLY_CAP) return { action: 'none', reason: 'weekly_cap' };
    const cap = input.track === 'pilot' ? PILOT_LIFETIME_CAP : COUPON_LIFETIME_CAP;
    if (!isLock(chosen) && lifetimeProgramSends(input.sends) >= cap) return { action: 'none', reason: 'lifetime_cap' };
  }

  const merged: ProgramStage[] = [];
  if (
    chosen === 'lock_t3' &&
    input.track === 'coupon' &&
    !handled(input, 'wave2') &&
    today >= WAVE2_START &&
    today <= WAVE2_END
  ) {
    merged.push('wave2');
  }

  return send(chosen, reason, input, merged, marketing);
}

export function applyDecision(input: DecideInput, result: DecideResult): DecideInput {
  if (result.action === 'none') return input;
  const extra: ProgramSend[] =
    result.action === 'skip'
      ? [{ stage: result.stage, at: input.now, marketing: false, skipped: true }]
      : [
          { stage: result.stage, at: input.now, marketing: result.marketing },
          ...result.merged.map((stage) => ({ stage, at: input.now, marketing: false })),
        ];
  return { ...input, sends: [...input.sends, ...extra] };
}
