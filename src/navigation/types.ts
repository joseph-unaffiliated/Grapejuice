import type { NavigatorScreenParams } from '@react-navigation/native';
import type { BoxLineItem } from '../types/pilot';
import type { GiftChildDraft, GiftGiveFormValues, GiftPath } from '../screens/gift/giftGiveTypes';

export type AuthStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  SignInEmail: { email?: string } | undefined;
  SignUp: undefined;
  SignUpEmail: undefined;
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
  StorefrontFavorites: undefined;
  StorefrontCategory: { category: string; q?: string };
  StorefrontOurStory: undefined;
  StorefrontPassover: undefined;
  CatalogProduct: { slug: string };
  BoxDiscountEligibility: undefined;
  Checkout: undefined;
  MarketplaceCheckout: undefined;
  OrderConfirmation: { orderId: string };
  Orders: undefined;
  Reflection: undefined;
  AboutHanukkah: undefined;
  History: undefined;
  /** Campaign landing — modular gift entry (`/gift`). */
  GiftLanding: { preferredGiftPath?: GiftPath } | undefined;
  /**
   * Dynamic campaign landing (code seeds + CMS-only) by id.
   * Prefer this over the legacy per-audience screens below.
   */
  DynamicLanding: { landingId: string };
  /** @deprecated Prefer DynamicLanding — kept for back-compat deep links in flight. */
  CulturalLanding: undefined;
  /** @deprecated Prefer DynamicLanding */
  InterfaithLanding: undefined;
  /** @deprecated Prefer DynamicLanding */
  ConvenienceLanding: undefined;
  /** @deprecated Prefer DynamicLanding */
  LastMinuteLanding: undefined;
  /** @deprecated Prefer DynamicLanding */
  ForYourHomeLanding: undefined;
  GiftGive:
    | {
        initialGiftPath?: GiftPath;
        /** Restored after auth (credit-only path). */
        form?: GiftGiveFormValues;
        childDrafts?: GiftChildDraft[];
        /** After signup, open Stripe payment immediately (credit-only). */
        autoStartPayment?: boolean;
      }
    | undefined;
  GiftGiverCustomize: {
    form: GiftGiveFormValues;
    childDrafts: GiftChildDraft[];
    /** Optional — restored after auth so swaps survive remount. */
    lineItems?: BoxLineItem[];
  };
  GiftSentConfirmation: {
    recipientEmail: string;
    customize: boolean;
    giverName?: string;
    amountCents?: number;
    claimUrl?: string;
  };
  GiftClaim: { token?: string };
  MyGifts: undefined;
  GiftBox: { giftInviteId: string };
  GiftBoxCheckout: { giftInviteId: string };
  GiftRecipientReveal: {
    giftInviteId: string;
    giverName: string;
    message?: string;
    giftCreditCents: number;
    hasGiverDraft: boolean;
  };
  /** Ops: list Hanukkah catalog items (admin allowlist). */
  AdminCatalog: undefined;
  /** Ops: create or edit a catalog item. Omit itemId to create. */
  AdminCatalogItem: { itemId?: string };
  /** Ops: list marketing landings (admin allowlist). */
  AdminLandings: undefined;
  /** Ops: edit one marketing landing's sections / copy. */
  AdminLandingEditor: { audienceId: string };
  /** Dev: large grape mark + wobble knobs (`?preview=grape-wobble`). */
  GrapeWobblePreview: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Onboarding: undefined;
  Main: NavigatorScreenParams<MainStackParamList> | undefined;
};
