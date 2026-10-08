import { Platform } from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { app, db, functions } from '../../lib/firebase';
import {
  useGuestSessionStore,
  type GuestOnboardingStep,
  type GuestStepsReached,
} from '../../stores/guestSessionStore';
import {
  useGiftIntentStore,
  type GiftIntentDraft,
  type GiftIntentKind,
  type GiftIntentStatus,
} from '../../stores/giftIntentStore';
import { readAttributionSnapshot } from '../../stores/entryContextStore';
import type { BoxLineItem, FamiliarityLevel } from '../../types/pilot';
import type { ChildDraft } from '../../components/family/familyDraft';
import { remapLegacyCatalogIds, retireLegacyBoxLines } from '../box/legacyCatalogIds';

/**
 * Server-side copy of a signed-out visitor's in-progress box (guest box recovery).
 * Shape is validated by functions/src/guestSessions.ts — keep `v` and the top-level keys in sync.
 */
export const GUEST_SESSION_SCHEMA_VERSION = 1 as const;

export type GuestSnapshotGuest = {
  buildBoxPath: boolean;
  onboardingStep: GuestOnboardingStep | null;
  /** Absent on snapshots saved before Oct 8, 2026. */
  stepsReached?: GuestStepsReached;
  childDrafts: ChildDraft[];
  childInterests: string[];
  familiarityScore: number;
  familiarityLevel: FamiliarityLevel;
  /** Absent on snapshots saved before this field was added. */
  practiceFrequencyScore?: number;
  lineItems: BoxLineItem[];
  wrapSelectedItemIds: string[];
  wishlistItemIds: string[];
  ravNotes: string;
  onboardingComplete: boolean;
  boxRevealComplete: boolean;
  hiddenHolidays: string[];
  interests: string[];
};

export type GuestSnapshotGift = {
  status: GiftIntentStatus;
  kind: GiftIntentKind | null;
  draft: GiftIntentDraft | null;
};

export type GuestSnapshotEntry = {
  utm: Record<string, string | undefined> | null;
  fbclid: string | null;
  referrer: string | null;
  landingPath: string | null;
};

export type GuestSessionSnapshot = {
  v: typeof GUEST_SESSION_SCHEMA_VERSION;
  guest: GuestSnapshotGuest;
  gift: GuestSnapshotGift | null;
  entry: GuestSnapshotEntry | null;
  path: string;
};

function guestFromStore(): GuestSnapshotGuest {
  const s = useGuestSessionStore.getState();
  return {
    buildBoxPath: s.buildBoxPath,
    onboardingStep: s.onboardingStep,
    stepsReached: s.stepsReached,
    childDrafts: s.childDrafts,
    childInterests: s.childInterests,
    familiarityScore: s.familiarityScore,
    familiarityLevel: s.familiarityLevel,
    practiceFrequencyScore: s.practiceFrequencyScore,
    lineItems: s.lineItems,
    wrapSelectedItemIds: s.wrapSelectedItemIds,
    wishlistItemIds: s.wishlistItemIds,
    ravNotes: s.ravNotes,
    onboardingComplete: s.onboardingComplete,
    boxRevealComplete: s.boxRevealComplete,
    hiddenHolidays: s.hiddenHolidays,
    interests: s.interests,
  };
}

function giftFromStore(): GuestSnapshotGift | null {
  const g = useGiftIntentStore.getState();
  if (g.status !== 'incomplete' || !g.draft) return null;
  return { status: g.status, kind: g.kind, draft: g.draft };
}

export function entryFromWindow(): GuestSnapshotEntry | null {
  const attribution = readAttributionSnapshot();
  const first = attribution?.firstTouch ?? null;
  const last = attribution?.lastTouch ?? null;
  const campaign = (t: typeof first) => Boolean(t?.utm || t?.fbclid);
  const touch = campaign(first) ? first : campaign(last) ? last : first ?? last;
  if (!touch) return null;
  return {
    utm: touch.utm ? { ...touch.utm } : null,
    fbclid: touch.fbclid,
    referrer: touch.referrer,
    landingPath: touch.landingPath,
  };
}

/**
 * Anything worth saving? Empty storefront browsing is not. Opening the box builder is, so the
 * Funnel tab sees visitors who leave on the first screen.
 */
export function hasMeaningfulGuestData(guest: GuestSnapshotGuest, gift: GuestSnapshotGift | null): boolean {
  return (
    Object.keys(guest.stepsReached ?? {}).length > 0 ||
    guest.childDrafts.length > 0 ||
    guest.lineItems.length > 0 ||
    guest.wishlistItemIds.length > 0 ||
    guest.onboardingStep !== null ||
    guest.boxRevealComplete ||
    !!gift
  );
}

/** Current guest + gift state as a snapshot, or null when there is nothing worth saving. */
export function buildGuestSnapshot(): GuestSessionSnapshot | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const guest = guestFromStore();
  const gift = giftFromStore();
  if (!hasMeaningfulGuestData(guest, gift)) return null;
  return {
    v: GUEST_SESSION_SCHEMA_VERSION,
    guest,
    gift,
    entry: entryFromWindow(),
    path: window.location.pathname.slice(0, 200),
  };
}

/**
 * Put a saved snapshot back into the stores, running the same legacy-id migrations the
 * stores apply on rehydrate so an old box still resolves to current catalog ids.
 */
export function applyGuestSnapshot(snapshot: GuestSessionSnapshot): void {
  const guest = snapshot.guest;
  const retired = retireLegacyBoxLines(guest.lineItems ?? []);
  useGuestSessionStore.setState({
    exploreStarted: true,
    buildBoxPath: guest.buildBoxPath ?? false,
    onboardingStep: guest.onboardingStep ?? null,
    stepsReached: { ...useGuestSessionStore.getState().stepsReached, ...guest.stepsReached },
    childDrafts: guest.childDrafts ?? [],
    childInterests: guest.childInterests ?? [],
    familiarityScore: typeof guest.familiarityScore === 'number' ? guest.familiarityScore : 50,
    familiarityLevel: guest.familiarityLevel ?? 'moderate',
    practiceFrequencyScore: typeof guest.practiceFrequencyScore === 'number' ? guest.practiceFrequencyScore : 50,
    lineItems: retired.lineItems,
    wrapSelectedItemIds: remapLegacyCatalogIds(guest.wrapSelectedItemIds ?? []),
    wishlistItemIds: remapLegacyCatalogIds(guest.wishlistItemIds ?? []),
    ravNotes: guest.ravNotes ?? '',
    onboardingComplete: guest.onboardingComplete ?? false,
    boxRevealComplete: guest.boxRevealComplete ?? false,
    openMyBoxAfterReveal: false,
    hiddenHolidays: guest.hiddenHolidays ?? [],
    interests: guest.interests ?? [],
  });
  if (snapshot.gift?.draft && snapshot.gift.kind) {
    useGiftIntentStore.getState().markIncomplete(snapshot.gift.kind, snapshot.gift.draft);
  }
}

// ---------------------------------------------------------------------------------------------
// Remote calls

type SaveResult = { ok: true; skipped?: 'rate_limited' | 'empty' };

export async function saveGuestSessionRemote(visitorId: string, snapshot: GuestSessionSnapshot): Promise<SaveResult> {
  const callable = httpsCallable<{ visitorId: string; snapshot: GuestSessionSnapshot }, SaveResult>(
    functions,
    'saveGuestSession'
  );
  const { data } = await callable({ visitorId, snapshot });
  return data;
}

function beaconUrl(): string | null {
  const projectId = app.options.projectId;
  if (!projectId) return null;
  return `https://us-central1-${projectId}.cloudfunctions.net/saveGuestSessionBeacon`;
}

/** Last-edit flush at pagehide. text/plain keeps it a "simple" request (no CORS preflight). */
export function beaconGuestSession(visitorId: string, snapshotJson: string): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return false;
  const url = beaconUrl();
  if (!url) return false;
  try {
    const body = `{"visitorId":${JSON.stringify(visitorId)},"snapshot":${snapshotJson}}`;
    return navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }));
  } catch {
    return false;
  }
}

export async function markGuestSessionConvertedRemote(visitorId: string): Promise<void> {
  const callable = httpsCallable<{ visitorId: string }, { ok: true; found: boolean }>(
    functions,
    'markGuestSessionConverted'
  );
  await callable({ visitorId });
}

export type ResumeGuestSessionResult =
  | { status: 'ok'; visitorId: string; snapshot: GuestSessionSnapshot; converted: boolean; hasBox: boolean }
  | { status: 'invalid' | 'expired' | 'gone' };

export async function resumeGuestSessionRemote(token: string): Promise<ResumeGuestSessionResult> {
  const callable = httpsCallable<{ token: string }, ResumeGuestSessionResult>(functions, 'resumeGuestSession');
  const { data } = await callable({ token });
  return data;
}

// ---------------------------------------------------------------------------------------------
// Kill switch: config/features.guestSessionSync (public-read `config` collection). Missing = on.

let featureFlagInflight: Promise<boolean> | null = null;

export function guestSessionSyncEnabled(): Promise<boolean> {
  if (featureFlagInflight) return featureFlagInflight;
  featureFlagInflight = (async () => {
    if (!db) return true;
    try {
      const snap = await getDoc(doc(db, 'config', 'features'));
      return snap.data()?.guestSessionSync !== false;
    } catch {
      return true;
    }
  })();
  return featureFlagInflight;
}
