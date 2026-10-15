import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useAuthStore } from '../../stores/authStore';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { clearBoxDraftCache } from '../../hooks/useBoxDraft';
import type { MainStackParamList } from '../../navigation/types';
import { clearPersistedPilotToken, persistPilotToken, readPersistedPilotToken } from '../../navigation/pilotLink';
import { enrollPilot, getPilotInvite, type PilotDates, type PilotInviteView, type PilotItem } from '../../services/pilot/pilotApi';
import { formatPilotDollars, pilotAgreementText } from '../../services/pilot/pilotAgreement';
import { isPilotPreviewToken, pilotPreviewView, withPreviewImages } from '../../services/pilot/pilotPreview';
import { replaceBrowserPath } from '../../navigation/webBrowserHistory';
import { usePilotPayment } from './usePilotPayment';

type Route = RouteProp<MainStackParamList, 'PilotInvite'>;

const PENDING_JOIN_KEY = 'gj.pilot.pendingJoin';

type PendingJoin = { token: string; picks: string[]; typedName: string; agreed: boolean; quoteConsent: boolean };

function savePendingJoin(p: PendingJoin): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(PENDING_JOIN_KEY, JSON.stringify(p));
  } catch {
    // private mode
  }
}

function clearPendingJoin(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(PENDING_JOIN_KEY);
  } catch {
    // private mode
  }
}

/** The join form saved before a card check sent the family to their bank and back. */
function readRedirectedJoin(token: string): PendingJoin | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get('redirect_status') !== 'succeeded' || !params.get('setup_intent')) return null;
  try {
    const p = JSON.parse(window.sessionStorage.getItem(PENDING_JOIN_KEY) ?? 'null') as PendingJoin | null;
    return p && p.token === token ? p : null;
  } catch {
    return null;
  }
}

function pageUrl(): string {
  return typeof window === 'undefined' ? '' : `${window.location.origin}${window.location.pathname}`;
}

export const SUPPORT_EMAIL = 'hello@grapejuice.co';

/** "Nov 7". Date-only strings are calendar days; timestamps are read in Eastern time. */
export function shortDate(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: dateOnly ? 'UTC' : 'America/New_York' });
}

function errText(err: unknown): string {
  const msg = (err as { message?: string })?.message;
  return msg ? msg.replace(/^FirebaseError:\s*/, '') : 'Something went wrong. Try again.';
}

export const pilotCopy = {
  kicker: 'Pilot Participants',
  title: 'Join the pilot and claim 3 free gifts for your box',
  intro: (firstName: string) =>
    `Hi ${firstName || 'there'}, thank you for being one of our first Grapejuice families. We’re inviting a small group of families to help shape what comes next. Pick three things to add to your box, on us. After Hanukkah, tell us how it went: what worked, what didn’t, what you’d change. Honest is better than nice.`,
  steps: (dates: PilotDates): Array<[string, string]> => [
    ['Pick three items.', `They’re free and ship inside your Hanukkah box, arriving by ${shortDate(dates.arrivesBy, 'Nov 21')}.`],
    ['Celebrate.', 'Use what you like, skip what you don’t.'],
    ['Tell us how it went.', 'We’ll email you a short survey on Dec 13. It’s due Jan 15.'],
  ],
  stepsFine: (totalLabel: string | null) =>
    `If the survey isn’t in by Jan 15, we’ll charge your card for the three items${totalLabel ? ` (${totalLabel})` : ''}. Some families may be invited to a paid follow-up conversation afterward.`,
  needBox: 'You’ll need a Hanukkah box to join, since your picks ship inside it.',
  needBoxFine: 'Then come back to this link to pick your three.',
  boxNote: 'Review the items already in your box.',
  boxCount: (count: number) => `${count} ${count === 1 ? 'thing' : 'things'} already in your box`,
  payHint: 'Your picks ship with your box. Add where it goes and the card it’s charged to.',
  cardFine: (lock: string, boxTotal: string | null) =>
    `Nothing is charged today. You can keep changing your box until ${lock}, when it locks and is charged for what’s in it${boxTotal ? ` (${boxTotal} right now)` : ''}. Your three picks are free. We’d only charge this card for them if the survey isn’t in by Jan 15.`,
  agreementPending: [
    'I’m joining Grapejuice Pilot Participants. I’ll get the three items I pick free.',
    `I agree to complete the post-Hanukkah survey by January 15, 2027. If I don’t, I authorize Grapejuice to charge my card on file for those three items plus applicable tax, once, after that date.`,
    'Grapejuice may invite me to a paid follow-up conversation; that’s optional and not guaranteed.',
  ].join('\n'),
  agreementPendingNote: 'Your picks and their value fill in once you choose three.',
  agreeLabel: 'I agree to the participant agreement',
  quoteConsent: 'Grapejuice may quote my feedback using my first name only. (optional)',
  questions: [
    [
      'When is my card charged?',
      'Your box is charged on Nov 7. The three picks are free, and we’d only charge for them if the survey isn’t in by Jan 15.',
    ],
    ['How long is the survey?', 'Short, and it works on your phone.'],
    [
      'Can I still change my box after I join?',
      'Yes. Add, swap or remove anything until your box locks on Nov 7, like always. Only your three free picks stay put once you join.',
    ],
    ['Who sees my answers?', 'Our small team. We only quote you if you said we could, and by first name only.'],
    ['Will there be any follow up after the survey?', 'Maybe. We’ll invite a few families to a paid follow-up conversation. It’s optional.'],
  ] as Array<[string, string]>,
  joinedTitle: (firstName: string) => `You’re in, ${firstName || 'friend'}.`,
  joinedCheckout: 'Your picks are in your box. Check out to finish, and they’ll ship with it.',
  joinedEmailed: (lock: string) =>
    `We’ve emailed you a copy. You can keep changing the rest of your box until ${lock}. Your three picks stay in it.`,
  joinedDates: (dates: PilotDates): Array<[string, string]> => [
    [shortDate(dates.lockAt, 'Nov 7'), 'box locks and is charged'],
    [shortDate(dates.arrivesBy, 'Nov 21'), 'box arrives'],
    ['Dec 13', 'survey arrives'],
    ['Jan 15', 'survey due'],
  ],
  unavailable: { title: 'This invitation isn’t available.', body: `Questions? ${SUPPORT_EMAIL}` },
  loadFailed: 'We couldn’t open this invitation',
  closed: { title: 'Sign-up has closed', body: 'Sign-up closed on Nov 7, when boxes locked. Thank you for your interest.' },
  wrongAccount: (maskedEmail: string) => `This invitation is for ${maskedEmail}. Sign in with that email to continue.`,
  signIn: (maskedEmail: string) => `This invitation is for ${maskedEmail}. Sign in with that email to pick your three.`,
};

/** "You're in" replaces the form in place, so whatever holds the page keeps the form's scroll. */
function scrollPageToTop(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.requestAnimationFrame(() => {
    window.scrollTo(0, 0);
    let el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2) as HTMLElement | null;
    for (; el; el = el.parentElement) if (el.scrollTop > 0) el.scrollTop = 0;
  });
}

/** Everything the invite page does, shared by the desktop and phone layouts. */
export function usePilotInvite() {
  const route = useRoute<Route>();
  const token = route.params?.token || readPersistedPilotToken() || '';
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const logout = useAuthStore((s) => s.logout);

  const [view, setView] = useState<PilotInviteView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [resume] = useState(() => readRedirectedJoin(token));
  const [picks, setPicks] = useState<string[]>(resume?.picks ?? []);
  const [typedName, setTypedName] = useState(resume?.typedName ?? '');
  const [agreed, setAgreed] = useState(resume?.agreed ?? false);
  const [quoteConsent, setQuoteConsent] = useState(resume?.quoteConsent ?? false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (token) persistPilotToken(token);
  }, [token]);

  useEffect(() => {
    if (resume && typeof window !== 'undefined') replaceBrowserPath(window.location.pathname);
  }, [resume]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoadError(null);
    if (isPilotPreviewToken(token)) {
      const sample = pilotPreviewView(token);
      setView(sample);
      void withPreviewImages(sample).then((v) => {
        if (!cancelled) setView(v);
      });
      return () => {
        cancelled = true;
      };
    }
    void getPilotInvite(token)
      .then((v) => {
        if (!cancelled) setView(v);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errText(err));
      });
    return () => {
      cancelled = true;
    };
  }, [token, uid, nonce]);

  const joinedView = view?.state === 'joined';
  useEffect(() => {
    if (joinedView) scrollPageToTop();
  }, [joinedView]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const signIn = useCallback(() => {
    persistPilotToken(token);
    useAuthFlowStore.getState().startAuthFromGuest('PilotInvite', 'signin');
  }, [token]);
  const switchAccount = useCallback(async () => {
    persistPilotToken(token);
    await logout();
    useAuthFlowStore.getState().startAuthFromGuest('PilotInvite', 'signin');
  }, [token, logout]);

  const items = view?.state === 'ready' ? view.items : [];
  const pickCount = view?.state === 'ready' ? view.pickCount : 3;
  const chosen = useMemo(
    () => picks.map((id) => items.find((i) => i.id === id)).filter((i): i is PilotItem => !!i),
    [picks, items]
  );
  const full = chosen.length >= pickCount;
  const agreementPicks = chosen.map((i) => ({ name: i.name, deferredChargeCents: i.memberPriceCents }));
  const agreement = full ? pilotAgreementText(agreementPicks) : null;
  const totalLabel = full ? formatPilotDollars(agreementPicks.reduce((s, p) => s + p.deferredChargeCents, 0)) : null;

  const preview = isPilotPreviewToken(token);
  /** Shipping and card are collected here when the box isn't ordered yet. */
  const collectsPayment = view?.state === 'ready' && view.box.kind === 'draft';
  const pay = usePilotPayment({ enabled: collectsPayment && !preview });
  const cardReady = !pay.enabled || !pay.needsCard || pay.cardComplete;
  const canJoin = full && !!typedName.trim() && agreed && cardReady && !joining;
  const joinHint = !full
    ? 'Pick three items to join.'
    : !cardReady
      ? 'Add your card to join.'
      : !typedName.trim() || !agreed
        ? 'Type your name and agree to join.'
        : null;

  const toggle = (id: string) => {
    setJoinError(null);
    setPicks((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : prev.length >= pickCount ? prev : [...prev, id]));
  };

  /** Save the card (unless the bank redirect already did), enroll, then place the box order. */
  const runJoin = async (cardAlreadySaved: boolean) => {
    if (!agreement || view?.state !== 'ready') return;
    if (preview) {
      const joinedPicks = chosen.map((i) => ({ itemId: i.id, name: i.name, deferredChargeCents: i.memberPriceCents, imageUrl: i.imageUrl }));
      setView({
        state: 'joined',
        firstName: view.firstName,
        dates: view.dates,
        box: view.box,
        enrollment: { status: 'enrolled', picks: joinedPicks, totalCents: joinedPicks.reduce((s, p) => s + p.deferredChargeCents, 0) },
      });
      clearPersistedPilotToken();
      return;
    }
    setJoining(true);
    setJoinError(null);
    try {
      if (pay.enabled) {
        if (!(await pay.validateShipping())) {
          setJoinError('Check your shipping address.');
          return;
        }
        if (cardAlreadySaved) {
          if (!(await pay.waitForCard({}))) {
            setJoinError('We couldn’t confirm your card yet. Try again in a moment.');
            return;
          }
        } else {
          savePendingJoin({ token, picks, typedName, agreed, quoteConsent });
          const cardProblem = await pay.saveCard(pageUrl());
          if (cardProblem) {
            setJoinError(cardProblem);
            return;
          }
        }
      }
      await enrollPilot({
        token,
        itemIds: chosen.map((i) => i.id),
        typedName: typedName.trim(),
        agreed: true,
        quoteConsent,
        agreementText: agreement,
      });
      if (pay.enabled) await pay.commitBox();
      clearPendingJoin();
      clearBoxDraftCache();
      reload();
    } catch (err) {
      setJoinError(errText(err));
      reload();
    } finally {
      setJoining(false);
    }
  };

  const join = async () => {
    if (canJoin) await runJoin(false);
  };

  const resumed = useRef(false);
  useEffect(() => {
    if (!resume || resumed.current || view?.state !== 'ready' || !full) return;
    resumed.current = true;
    void runJoin(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume, view, full]);

  return {
    token,
    view,
    loadError,
    reload,
    signIn,
    switchAccount,
    items,
    pickCount,
    picks,
    chosen,
    full,
    toggle,
    agreement,
    totalLabel,
    typedName,
    setTypedName,
    agreed,
    setAgreed,
    quoteConsent,
    setQuoteConsent,
    canJoin,
    joinHint,
    joining,
    joinError,
    join,
    pay,
    collectsPayment,
    preview,
  };
}

export type PilotInviteState = ReturnType<typeof usePilotInvite>;
