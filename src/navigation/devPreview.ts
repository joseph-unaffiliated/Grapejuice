import { Platform } from 'react-native';
import type { AuthStackParamList, MainStackParamList } from './types';
import type { OnboardingPreviewStep } from '../stores/devPreviewStore';
import { useDevPreviewStore } from '../stores/devPreviewStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { useAuthFlowStore } from '../stores/authFlowStore';
import { catalogService } from '../services/firestore/catalog';
import { buildDefaultLineItems } from '../services/box/buildDefaultBox';
import type { ChildDraft } from '../screens/onboarding/ChildrenScreen';
import { DEFAULT_GIFT_CHILDREN, type GiftGiveFormValues } from '../screens/gift/giftGiveTypes';

const DEFAULT_CATALOG_ITEM_ID = 'graphic-novel-hanukkah';

const SAMPLE_CHILDREN: ChildDraft[] = [
  { name: 'Sam', ageGroup: '6-8', birthdate: '2018-06-01' },
];

function setGuestExplore() {
  const guest = useGuestSessionStore.getState();
  guest.startExplore();
}

function setGuestFresh() {
  useGuestSessionStore.getState().reset();
  useAuthFlowStore.getState().clearPending();
}

async function seedGuestBoxStarted() {
  const guest = useGuestSessionStore.getState();
  guest.startBuildBox();
  guest.setChildDrafts(SAMPLE_CHILDREN);
  guest.setFamiliarityScore(50);
  guest.completeOnboarding();
  const catalog = await catalogService.getAll();
  const profiles = SAMPLE_CHILDREN.map((c, i) => ({
    id: `preview-${i}`,
    name: c.name,
    ageGroup: c.ageGroup,
    birthdate: c.birthdate,
  }));
  guest.setLineItems(buildDefaultLineItems(catalog, profiles));
  guest.completeBoxReveal();
}

async function seedGuestReveal() {
  const guest = useGuestSessionStore.getState();
  guest.startBuildBox();
  guest.setChildDrafts(SAMPLE_CHILDREN);
  guest.setFamiliarityScore(50);
  guest.completeOnboarding();
  const catalog = await catalogService.getAll();
  const profiles = SAMPLE_CHILDREN.map((c, i) => ({
    id: `preview-${i}`,
    name: c.name,
    ageGroup: c.ageGroup,
    birthdate: c.birthdate,
  }));
  guest.setLineItems(buildDefaultLineItems(catalog, profiles));
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
    case 'home-started':
      void seedGuestBoxStarted().then(() => setMainNav('MainTabs', undefined, 'Home'));
      break;
    case 'my-box':
      void seedGuestBoxStarted().then(() => setMainNav('MyBox'));
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
    case 'catalog':
      void seedGuestBoxStarted().then(() =>
        setMainNav('CatalogProduct', {
          itemId: search.get('itemId') ?? DEFAULT_CATALOG_ITEM_ID,
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
