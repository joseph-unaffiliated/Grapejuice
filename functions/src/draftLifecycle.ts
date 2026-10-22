/**
 * Daily (and Sunday evening) pass of decideNext.
 * Sends only stages whose piece has been approved. Until then it records what it would have done.
 */
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import * as logger from './logger';
import { onSchedule } from './sentry';
import { getCustomerioAppApiKey, sendEmail } from './email';
import { leadEmailsByHash, unsubscribedHashes } from './cioPeople';
import { appOrigin } from './guestSessions';
import { boxThumbFields, lineItemsEmailItems, soldOutBookItem } from './emailItems';
import { applyDecision, decideNext, type DecideInput, type DecideResult } from './program/decideNext';
import { enabledStageSet, LIFECYCLE_DOC, stageIsEnabled } from './program/config';
import { loadProgramPeople, type ProgramPerson } from './program/loadPeople';
import { OFFER_CODES, PROGRAM_PIECES } from './program/pieces';
import { simulateProgram } from './program/simulate';
import { programClockTicks } from './program/ticks';

const PILOT_INVITE_CAP = 80;

const TEMPLATE_BY_STAGE: Record<string, string> = {
  pilot_invite: 'program-pilot-invite',
  pilot_d3: 'program-pilot-d3',
  pilot_d7: 'program-pilot-d7',
  d1: 'program-d1',
  d4: 'program-d4',
  d8: 'program-d8',
  abandoner: 'program-abandoner',
  wave2: 'program-wave2',
  lock_t1: 'program-lock-t1',
  lock_t7: 'lock-reminder',
  lock_t3: 'lock-reminder',
  survey: 'program-survey',
  s6: 'program-s6',
};

function approvedDecision(input: DecideInput, enabled: Set<string>): DecideResult {
  let state = input;
  for (let i = 0; i < 8; i += 1) {
    const result = decideNext(state);
    if (result.action === 'none') return result;
    if (result.action === 'skip') {
      if (enabled.has(result.stage)) return result;
      state = applyDecision(state, result);
      continue;
    }
    if (stageIsEnabled(enabled, result.stage, result.variant)) return result;
    state = applyDecision(state, { action: 'skip', stage: result.stage, reason: 'not_approved' });
  }
  return { action: 'none', reason: 'not_approved' };
}

async function seedCodes(db: Firestore): Promise<number> {
  let created = 0;
  for (const code of OFFER_CODES) {
    const ref = db.doc(`discountCodes/${code.code}`);
    const snap = await ref.get();
    if (snap.exists) {
      if (code.endsAt && snap.data()?.endsAt == null) {
        await ref.set({ endsAt: code.endsAt, updatedAt: new Date().toISOString() }, { merge: true });
      }
      continue;
    }
    await ref.set({
      code: code.code,
      percentOff: code.percentOff,
      amountOffCents: null,
      freeShipping: code.freeShipping === true,
      startsAt: code.startsAt,
      endsAt: code.endsAt,
      maxRedemptions: null,
      onePerAccount: true,
      active: code.active,
      note: code.note,
      createdAt: new Date().toISOString(),
      createdByEmail: 'program',
      updatedAt: new Date().toISOString(),
    });
    created += 1;
  }
  return created;
}

async function seedApprovals(db: Firestore): Promise<void> {
  for (const piece of PROGRAM_PIECES) {
    const ref = db.doc(`programApprovals/${piece.id}`);
    const snap = await ref.get();
    if (snap.exists) continue;
    await ref.set({
      ...piece,
      status: 'pending',
      seededAt: new Date().toISOString(),
    });
  }
}

const BOX_THUMB_STAGES = new Set(['d1', 'abandoner', 'wave2', 'lock_t1']);

async function emailData(
  db: Firestore,
  person: ProgramPerson,
  result: Extract<DecideResult, { action: 'send' }>
): Promise<Record<string, unknown> | null> {
  const origin = appOrigin();
  const code = result.stage === 'pilot_d7' ? 'TENOFF' : person.track === 'coupon' && !result.stage.startsWith('pilot_') ? 'FIFTEENOFF' : '';
  const path = person.inviteToken && result.stage.startsWith('pilot_') ? `/pilot/${person.inviteToken}` : '/box';
  const url = `${origin}${path}?utm_source=lifecycle&utm_medium=email&utm_campaign=${result.stage}${code ? `&code=${code}` : ''}`;
  const data: Record<string, unknown> = {
    stage: result.stage,
    variant: result.variant,
    cta_url: url,
    offer_code: code,
    pre_facelift: person.preFacelift,
    reached_payment: person.reachedPayment,
  };
  if (BOX_THUMB_STAGES.has(result.stage) && !result.variant.includes('s6')) {
    Object.assign(data, boxThumbFields(await lineItemsEmailItems(db, person.boxLines, url)));
  }
  if (result.stage === 'd8') {
    const book = person.draftKey ? await soldOutBookItem(db, person.draftKey, url) : null;
    if (!book) return null;
    data.sold_out_name = book.name;
    data.sold_out_image_url = book.image_url;
  }
  return data;
}

async function persist(db: Firestore, person: ProgramPerson, result: DecideResult, sent: boolean): Promise<void> {
  if (result.action === 'none') return;
  const ref = db.doc(`messageLog/${person.personKey}`);
  const entry =
    result.action === 'skip'
      ? { stage: result.stage, at: person.now, marketing: false, skipped: true, reason: result.reason }
      : {
          stage: result.stage,
          at: person.now,
          marketing: result.marketing && sent,
          skipped: !sent,
          reason: result.reason,
          variant: result.variant,
          ...(result.merged.length ? { merged: result.merged.join(',') } : {}),
        };
  const extra =
    result.action === 'send'
      ? result.merged.map((stage) => ({ stage, at: person.now, marketing: false, skipped: !sent, reason: 'merged' }))
      : [];
  await ref.set(
    {
      email: person.email,
      track: person.track,
      segment: person.segment,
      householdId: person.householdId,
      sends: FieldValue.arrayUnion(entry, ...extra),
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
  if (result.action === 'send' && sent && person.inviteToken) {
    const stamp =
      result.stage === 'pilot_invite' ? 'emailedAt' : result.stage === 'pilot_d3' ? 'followUpAt' : result.stage === 'pilot_d7' ? 'd7At' : null;
    if (stamp) {
      await db.doc(`pilotInvites/${person.inviteToken}`).set({ [stamp]: new Date().toISOString() }, { merge: true });
    }
  }
}

export async function runDraftLifecycle(db: Firestore, now = new Date()): Promise<Record<string, number>> {
  const counts: Record<string, number> = { people: 0, wouldSend: 0, sent: 0, skipped: 0, held: 0, failed: 0 };
  const enabled = await enabledStageSet(db);
  counts.codes = await seedCodes(db);
  await seedApprovals(db);
  let leadEmails: Map<string, string> | undefined;
  let unsubscribed: Set<string> | undefined;
  const apiKey = getCustomerioAppApiKey();
  if (apiKey) {
    try {
      [leadEmails, unsubscribed] = await Promise.all([leadEmailsByHash(apiKey), unsubscribedHashes([apiKey])]);
    } catch (err) {
      logger.warn('draftLifecycle: customer.io lookup failed', { err: String(err).slice(0, 200) });
    }
  }
  const people = await loadProgramPeople(db, now, { leadEmails, unsubscribed });
  counts.people = people.length;
  let invites = 0;
  for (const person of people) {
    const input: DecideInput = { ...person, now: now.toISOString(), allowPilotInvite: invites < PILOT_INVITE_CAP };
    const result = approvedDecision(input, enabled);
    if (result.action === 'none') {
      counts.held += 1;
      continue;
    }
    if (result.action === 'skip') {
      counts.skipped += 1;
      await persist(db, { ...person, now: now.toISOString() }, result, false);
      continue;
    }
    counts.wouldSend += 1;
    const template = result.variant.includes('s6')
      ? TEMPLATE_BY_STAGE.s6
      : result.variant.includes('wave2')
        ? TEMPLATE_BY_STAGE.wave2
        : TEMPLATE_BY_STAGE[result.stage];
    let sent = false;
    if (template) {
      try {
        const data = await emailData(db, person, result);
        if (!data) {
          counts.wouldSend -= 1;
          counts.skipped += 1;
          await persist(db, { ...person, now: now.toISOString() }, { action: 'skip', stage: result.stage, reason: 'no_sold_out_book' }, false);
          continue;
        }
        const status = await sendEmail({ to: person.email, template, data });
        sent = status === 'sent';
      } catch (err) {
        counts.failed += 1;
        logger.error('draftLifecycle: send failed', { stage: result.stage, err: String(err).slice(0, 240) });
      }
    }
    if (!sent) {
      counts.held += 1;
      continue;
    }
    counts.sent += 1;
    if (result.stage === 'pilot_invite') invites += 1;
    await persist(db, { ...person, now: now.toISOString() }, result, true);
  }
  const histogram = simulateProgram(
    people.map((p) => ({ ...p, sends: p.sends.filter((s) => !s.skipped) })),
    programClockTicks()
  );
  await db.doc('programJobs/draftLifecycle').set({
    at: now.toISOString(),
    counts,
    enabledStages: [...enabled],
    histogram,
    ok: true,
  });
  await db.doc(LIFECYCLE_DOC).set({ lastRunAt: now.toISOString() }, { merge: true });
  if (histogram.overDaily > 0 || histogram.overWeekly > 0) {
    await db.collection('programAlerts').add({
      at: now.toISOString(),
      kind: 'simulation_cap',
      overDaily: histogram.overDaily,
      overWeekly: histogram.overWeekly,
      open: true,
    });
  }
  return counts;
}

export async function runCheckoutAbandoner(db: Firestore, now = new Date()): Promise<{ considered: number; sent: number }> {
  const enabled = await enabledStageSet(db);
  if (!enabled.has('abandoner')) {
    await db.doc('programJobs/abandoner').set({ at: now.toISOString(), ok: true, skipped: 'not_approved' });
    return { considered: 0, sent: 0 };
  }
  const people = await loadProgramPeople(db, now);
  let considered = 0;
  let sent = 0;
  for (const person of people) {
    if (!person.liveAbandonerDue) continue;
    considered += 1;
    const result = approvedDecision({ ...person, now: now.toISOString() }, enabled);
    if (result.action !== 'send' || result.stage !== 'abandoner') continue;
    try {
      const data = await emailData(db, person, result);
      if (!data) continue;
      const status = await sendEmail({ to: person.email, template: 'program-abandoner', data });
      if (status !== 'sent') continue;
      sent += 1;
      await persist(db, { ...person, now: now.toISOString() }, result, true);
    } catch (err) {
      logger.error('abandoner: send failed', { err: String(err).slice(0, 240) });
    }
  }
  await db.doc('programJobs/abandoner').set({ at: now.toISOString(), ok: true, considered, sent });
  return { considered, sent };
}

const schedule = {
  memory: '1GiB' as const,
  timeoutSeconds: 540,
  timeZone: 'America/New_York',
};

export const scheduledDraftLifecycle = onSchedule({ ...schedule, schedule: '30 10 * * *' }, async () => {
  try {
    const counts = await runDraftLifecycle(getFirestore());
    logger.info('draftLifecycle', counts);
  } catch (err) {
    logger.error('draftLifecycle failed', err instanceof Error ? err : new Error(String(err)));
    await getFirestore().doc('programJobs/draftLifecycle').set({ at: new Date().toISOString(), ok: false, error: String(err).slice(0, 400) });
    await getFirestore().collection('programAlerts').add({ at: new Date().toISOString(), kind: 'job_error', job: 'draftLifecycle', open: true });
  }
});

export const scheduledDraftLifecycleSunday = onSchedule({ ...schedule, schedule: '0 19 * * 0' }, async () => {
  try {
    await runDraftLifecycle(getFirestore());
  } catch (err) {
    logger.error('draftLifecycle sunday failed', err instanceof Error ? err : new Error(String(err)));
  }
});

export const scheduledCheckoutAbandoner = onSchedule(
  { ...schedule, schedule: 'every 30 minutes' },
  async () => {
    try {
      await runCheckoutAbandoner(getFirestore());
    } catch (err) {
      logger.error('abandoner failed', err instanceof Error ? err : new Error(String(err)));
      await getFirestore().doc('programJobs/abandoner').set({ at: new Date().toISOString(), ok: false, error: String(err).slice(0, 400) });
    }
  }
);
