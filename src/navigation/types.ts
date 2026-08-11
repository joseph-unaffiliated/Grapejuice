import type { NavigatorScreenParams } from '@react-navigation/native';
import type { GiftChildDraft, GiftGiveFormValues } from '../screens/gift/giftGiveTypes';

export type AuthStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  SignInEmail: undefined;
  SignUp: undefined;
};

export type MainTabsParamList = {
  Home: undefined;
  Rav:
    | {
        /** Auto-sends as the user's first message (SearchPill / Ask Rav). */
        initialMessage?: string;
        /**
         * Seeds Rav's opening bubble only — does not send.
         * Composer stays empty/focused so the user can ask a follow-up (e.g. PDP category blurb).
         */
        openingAssistantMessage?: string;
        /** Start a fresh thread (Home search, sidebar New chat). */
        newChat?: boolean;
        /** welcome = empty Rav home; recent = thread list; thread = open by id. */
        view?: 'welcome' | 'recent' | 'thread';
        threadId?: string;
      }
    | undefined;
  Account: undefined;
  Box: undefined;
};

export type MainStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabsParamList> | undefined;
  MyBox: undefined;
  /** Empty cart before a Hanukkah box exists (header cart icon). */
  StorefrontCart: undefined;
  Guide: undefined;
  KidGuide: undefined;
  Profiles: undefined;
  AlaCarteStore: undefined;
  /** C&B-style retail experiment — no global sidebar. */
  StorefrontHome: undefined;
  StorefrontCategory: { category: string; q?: string };
  StorefrontOurStory: undefined;
  StorefrontPassover: undefined;
  CatalogProduct: { slug: string };
  BoxDiscountEligibility: undefined;
  Checkout: undefined;
  OrderConfirmation: { orderId: string };
  Reflection: undefined;
  AboutHanukkah: undefined;
  History: undefined;
  GiftGive: undefined;
  GiftGiverCustomize: {
    form: GiftGiveFormValues;
    childDrafts: GiftChildDraft[];
  };
  GiftClaim: { token?: string };
  GiftRecipientReveal: {
    giverName: string;
    message?: string;
    giftCreditCents: number;
    hasGiverDraft: boolean;
  };
  /** Ops: list Hanukkah catalog items (admin allowlist). */
  AdminCatalog: undefined;
  /** Ops: create or edit a catalog item. Omit itemId to create. */
  AdminCatalogItem: { itemId?: string };
  /** Dev: large grape mark + wobble knobs (`?preview=grape-wobble`). */
  GrapeWobblePreview: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Onboarding: undefined;
  Main: NavigatorScreenParams<MainStackParamList> | undefined;
};
