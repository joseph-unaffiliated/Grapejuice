import { Platform } from 'react-native';
import type { AuthStackParamList, MainStackParamList } from './types';
import type { OnboardingPreviewStep } from '../stores/devPreviewStore';
import { useDevPreviewStore } from '../stores/devPreviewStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { useAuthFlowStore } from '../stores/authFlowStore';
import { catalogService } from '../services/firestore/catalog';
import { buildDefaultLineItems } from '../services/box/buildDefaultBox';
import { ageGroupForNumericAge } from '../services/box/boxRules';
import type { ChildDraft } from '../screens/onboarding/ChildrenScreen';
import { DEFAULT_GIFT_CHILDREN, type GiftGiveFormValues } from '../screens/gift/giftGiveTypes';

const DEFAULT_CATALOG_ITEM_ID = 'graphic-novel-hanukkah';

const SAMPLE_CHILDREN: ChildDraft[] = [
  // Know-nothing smoke: 1 kid, band 3–5 → representative age 5 (gift/book planners).
  { name: 'Sam', ageGroup: '3-5', birthdate: '2021-06-01' },
];

/** Know-nothing smoke: ages 4 + 2 via plannerAge (bands alone map to 5 and 1). */
const SAMPLE_CHILDREN_2KIDS: ChildDraft[] = [
  { name: 'Sam', ageGroup: '3-5', plannerAge: 4, birthdate: '2022-06-01' },
  { name: 'Riley', ageGroup: '0-2', plannerAge: 2, birthdate: '2024-06-01' },
];

const PREVIEW_KID_NAMES = ['Sam', 'Riley', 'Jordan', 'Alex', 'Casey', 'Quinn'];

/** Approximate birthdate so UI age roughly matches plannerAge (fixed relative to 2026). */
function birthdateForPlannerAge(age: number): string {
  const year = 2026 - Math.max(0, Math.floor(age));
  return `${year}-06-01`;
}

/**
 * `?kids=4,2` → drafts with explicit planner ages (and matching ageGroup bands for UI).
 * Returns null when the param is missing or empty.
 */
function childrenFromKidsParam(search: URLSearchParams): ChildDraft[] | null {
  const raw = search.get('kids');
  if (!raw?.trim()) return null;
  const ages = raw
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 18);
  if (!ages.length) return null;
  return ages.map((age, i) => ({
    name: PREVIEW_KID_NAMES[i] ?? `Kid ${i + 1}`,
    ageGroup: ageGroupForNumericAge(age),
    plannerAge: age,
    birthdate: birthdateForPlannerAge(age),
  }));
}

function setGuestExplore() {
  const guest = useGuestSessionStore.getState();
  guest.startExplore();
}

function setGuestFresh() {
  useGuestSessionStore.getState().reset();
  useAuthFlowStore.getState().clearPending();
}

function profilesFromDrafts(children: ChildDraft[]) {
  // IDs must match useBoxDraft.draftsToProfiles (`guest-${i}`) or attribution
  // falls back to "your kid" because lineItem.childId won't resolve.
  return children.map((c, i) => ({
    id: `guest-${i}`,
    name: c.name,
    ageGroup: c.ageGroup,
    birthdate: c.birthdate,
    plannerAge: c.plannerAge,
  }));
}

async function seedGuestBoxStarted(children: ChildDraft[] = SAMPLE_CHILDREN) {
  const guest = useGuestSessionStore.getState();
  guest.startBuildBox();
  guest.setChildDrafts(children);
  // Drop prior preview/session lines before the catalog await so My Box never
  // briefly (or stuck) shows a stale 1× gelt draft while kids already updated.
  guest.setLineItems([]);
  guest.setFamiliarityScore(0);
  guest.completeOnboarding();
  const catalog = await catalogService.getAll();
  guest.setLineItems(buildDefaultLineItems(catalog, profilesFromDrafts(children)));
  guest.completeBoxReveal();
  // Preview navigation owns the My Box route — don't also fire GuestBoxRevealHandler.
  guest.consumeOpenMyBoxAfterReveal();
}

async function seedGuestReveal(children: ChildDraft[] = SAMPLE_CHILDREN) {
  const guest = useGuestSessionStore.getState();
  guest.startBuildBox();
  guest.setChildDrafts(children);
  guest.setLineItems([]);
  guest.setFamiliarityScore(0);
  guest.completeOnboarding();
  const catalog = await catalogService.getAll();
  guest.setLineItems(buildDefaultLineItems(catalog, profilesFromDrafts(children)));
}

function setMainNav(
  screen: keyof MainStackParamList,
  params?: MainStackParamList[keyof MainStackParamList],
  tab?: 'Home' | 'Rav' | 'Account',
  tabParams?: Record<string, unknown>
) {
  useDevPreviewStore.setState({
    forceGate: 'main',
    pendingMainNav: {
      screen,
      params: params as never,
      tab,
      tabParams: tabParams as never,
    },
  });
}

/** Force main gate immediately so async seed previews don't flash Onboarding. */
function prepareMainPreview() {
  useDevPreviewStore.setState({ forceGate: 'main' });
  // Avoid Onboarding gate while catalog seed runs (buildBoxPath would otherwise win).
  const guest = useGuestSessionStore.getState();
  if (!guest.exploreStarted && !guest.boxRevealComplete) {
    guest.startExplore();
  }
}

function setAuth(route: keyof AuthStackParamList) {
  setGuestFresh();
  useDevPreviewStore.setState({
    forceGate: 'auth',
    authInitialRoute: route,
  });
}

function setOnboarding(step: OnboardingPreviewStep) {
  setGuestFresh();
  useGuestSessionStore.getState().startBuildBox();
  useDevPreviewStore.setState({
    forceGate: 'onboarding',
    onboardingInitialStep: step,
  });
}

export function clearDevPreview(): void {
  useDevPreviewStore.getState().reset();
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const url = new URL(window.location.href);
    if (url.searchParams.has('preview')) {
      url.searchParams.delete('preview');
      url.searchParams.delete('itemId');
      url.searchParams.delete('orderId');
      url.searchParams.delete('message');
      url.searchParams.delete('kids');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
  }
}

/** Web-only `?preview=` routes for Figma / design review. See docs/FIGMA_DESIGN_INVENTORY.md */
export function applyDevPreview(key: string, search: URLSearchParams): void {
  switch (key) {
    case 'welcome':
      setAuth('Welcome');
      break;
    case 'sign-in':
      setAuth('SignIn');
      break;
    case 'sign-in-email':
      setAuth('SignInEmail');
      break;
    case 'sign-up':
      setAuth('SignUp');
      break;
    case 'onboarding-intro':
      setOnboarding('hanukkah-intro');
      break;
    case 'onboarding-practices':
      setOnboarding('practices');
      break;
    case 'onboarding-box-intro':
      setOnboarding('box-intro');
      break;
    case 'onboarding-household':
      setOnboarding('children');
      break;
    case 'onboarding-familiarity':
      setOnboarding('familiarity');
      break;
    case 'onboarding-rav':
      setOnboarding('rav-question');
      break;
    case 'onboarding-building':
      setOnboarding('building');
      if (search.get('hold') === '1') {
        useDevPreviewStore.setState({ onboardingBuildingHold: true });
      }
      break;
    case 'onboarding-reveal':
      setGuestFresh();
      useGuestSessionStore.getState().startBuildBox();
      useDevPreviewStore.setState({
        forceGate: 'onboarding',
        onboardingInitialStep: 'reveal',
      });
      void seedGuestReveal();
      break;
    case 'home':
      setGuestExplore();
      setMainNav('MainTabs', undefined, 'Home');
      break;
    case 'storefront':
    case 'store':
      setGuestExplore();
      setMainNav('StorefrontHome');
      break;
    case 'storefront-category':
    case 'store-category':
      setGuestExplore();
      setMainNav('StorefrontCategory', {
        category: search.get('category') ?? 'menorahs',
      });
      break;
    case 'home-started':
      prepareMainPreview();
      void seedGuestBoxStarted(childrenFromKidsParam(search) ?? SAMPLE_CHILDREN).then(() =>
        setMainNav('MainTabs', undefined, 'Home')
      );
      break;
    case 'my-box':
      prepareMainPreview();
      void seedGuestBoxStarted(childrenFromKidsParam(search) ?? SAMPLE_CHILDREN).then(() =>
        setMainNav('MyBox')
      );
      break;
    case 'my-box-2kids':
      // Know-nothing: ages 4 + 2 (plannerAge) → airdry + stuffie; gelt small×4; list $90.
      prepareMainPreview();
      void seedGuestBoxStarted(SAMPLE_CHILDREN_2KIDS).then(() => setMainNav('MyBox'));
      break;
    case 'rav':
      setGuestExplore();
      setMainNav('MainTabs', undefined, 'Rav');
      break;
    case 'grape-wobble':
      setGuestExplore();
      setMainNav('GrapeWobblePreview');
      break;
    case 'rav-chat':
      setGuestExplore();
      setMainNav('MainTabs', undefined, 'Rav', {
        initialMessage: search.get('message') ?? 'Help me make a Hanukkah plan',
      });
      break;
    case 'account':
      setGuestExplore();
      setMainNav('MainTabs', undefined, 'Account');
      break;
    case 'account-signed-in':
      setGuestExplore();
      setMainNav('MainTabs', undefined, 'Account');
      break;
    case 'catalog':
      void seedGuestBoxStarted().then(() =>
        setMainNav('CatalogProduct', {
          slug: search.get('itemId') ?? search.get('slug') ?? DEFAULT_CATALOG_ITEM_ID,
        })
      );
      break;
    case 'checkout':
      void seedGuestBoxStarted().then(() => setMainNav('Checkout'));
      break;
    case 'debrief':
      void seedGuestBoxStarted().then(() => setMainNav('Reflection'));
      break;
    case 'order':
      void seedGuestBoxStarted().then(() =>
        setMainNav('OrderConfirmation', {
          orderId: search.get('orderId') ?? 'preview-order',
        })
      );
      break;
    case 'gift-give':
      setGuestExplore();
      setMainNav('GiftGive');
      break;
    case 'gift-giver-customize': {
      const form: GiftGiveFormValues = {
        recipientEmail: 'parent@example.com',
        giverName: 'Grandma',
        message: 'Happy Hanukkah!',
        giftPath: 'customize',
      };
      setGuestExplore();
      setMainNav('GiftGiverCustomize', { form, childDrafts: DEFAULT_GIFT_CHILDREN });
      break;
    }
    case 'gift-claim':
      setGuestExplore();
      setMainNav('GiftClaim', { token: search.get('token') ?? 'preview-gift-token' });
      break;
    case 'gift-reveal':
      setGuestExplore();
      setMainNav('GiftRecipientReveal', {
        giverName: search.get('giver') ?? 'Grandma',
        message: search.get('message') ?? 'Happy Hanukkah!',
        giftCreditCents: 5000,
        hasGiverDraft: true,
      });
      break;
    default:
      useDevPreviewStore.getState().reset();
  }
}

export function readDevPreviewFromWindow(): { key: string; search: URLSearchParams } | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const search = new URLSearchParams(window.location.search);
  const key = search.get('preview');
  if (!key) return null;
  return { key, search };
}

export function devPreviewBaseUrl(): string {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return 'http://localhost:8081';
  }
  return `${window.location.protocol}//${window.location.host}`;
}

export function devPreviewUrl(preview: string, params?: Record<string, string>): string {
  const base = devPreviewBaseUrl();
  const search = new URLSearchParams({ preview, ...params });
  return `${base}/?${search.toString()}`;
}
